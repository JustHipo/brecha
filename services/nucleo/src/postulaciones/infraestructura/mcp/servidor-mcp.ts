import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ErrorDeDominio } from '../../../compartido/dominio/error-de-dominio';
import { PRIORIDADES } from '../../../compartido/dominio/evento-de-dominio';
import { ESTADOS } from '../../dominio/estado';
import { MODALIDADES, MONEDAS, PLATAFORMAS, TIPOS_DE_CANAL } from '../../dominio/objetos-valor/valores';
import { FUENTES_DE_SENAL, RESULTADOS_DE_ENTREVISTA, TIPOS_DE_ENTREVISTA } from '../../dominio/partes';
import type { VistaDetalle, VistaPaso } from '../../aplicacion/vistas';
import { ESTADOS_DE_PASO, FUENTES_DE_PASO } from '../../dominio/paso';
import type { CasosDeRed } from '../../../red/aplicacion/casos-de-red';
import { FILTROS_DE_RED } from '../../../red/aplicacion/casos-de-red';
import { TIPOS_DE_INTERACCION } from '../../../red/dominio/contacto-de-red';
import type { CasosDeUso } from '../casos';
import type { CasosCsv } from '../../../csv/aplicacion/casos-csv';
import { TIPOS_CSV } from '../../../csv/aplicacion/formato';
import type { CasosDeArriendos } from '../../../arriendos/aplicacion/casos';
import {
  INSTRUCCIONES_ARRIENDOS,
  registrarHerramientasDeArriendos,
} from '../../../arriendos/infraestructura/mcp-arriendos';
import type { CasosDePerfil } from '../../aplicacion/casos-de-perfil';
import type { RevisionDePerfil } from '../../dominio/perfil-empleo';
import { INSTRUCCIONES_PERFIL, registrarHerramientasDePerfil } from './mcp-perfil';

const LIMITE_EXPORTAR = 50_000;
const estado = z.enum(ESTADOS);
const canal = z.object({ tipo: z.enum(TIPOS_DE_CANAL), valor: z.string() });
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'AAAA-MM-DD');

function ok(texto: string, datos?: unknown): CallToolResult {
  return {
    content: [
      { type: 'text', text: datos === undefined ? texto : `${texto}\n\n${JSON.stringify(datos, null, 2)}` },
    ],
  };
}

function linea(
  p:
    | VistaDetalle
    | {
        empresa: string;
        titulo: string;
        estado: string;
        prioridad: string;
        id: string;
        etiquetas?: string[];
        perfil?: RevisionDePerfil | null;
      },
) {
  const etiquetas = p.etiquetas?.length ? ` · #${p.etiquetas.join(' #')}` : '';
  const dura = p.perfil?.choques.find((c) => c.dura);
  const choque = dura ? ` · choca con tu perfil: ${dura.texto}` : '';
  return `${p.empresa} · ${p.titulo} · ${p.estado} · prioridad ${p.prioridad}${etiquetas}${choque} · id ${p.id}`;
}

/** Corre un caso de uso y convierte los errores al mismo `codigo` que REST (ADR 0012). */
async function correr(f: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof ErrorDeDominio) {
      const err = { codigo: e.codigo, mensaje: e.message, ...(e.campo ? { campo: e.campo } : {}) };
      return { isError: true, content: [{ type: 'text', text: JSON.stringify(err) }] };
    }
    return {
      isError: true,
      content: [
        { type: 'text', text: JSON.stringify({ codigo: 'ERROR_INTERNO', mensaje: 'Error interno' }) },
      ],
    };
  }
}

/** Adaptador de entrada 2: MCP (PLAN §12.2). Las escrituras quedan con origen `ia`. */
export function crearServidorMcp(
  casos: CasosDeUso,
  red?: CasosDeRed,
  csv?: CasosCsv,
  arriendos?: CasosDeArriendos,
  perfil?: CasosDePerfil,
): McpServer {
  const s = new McpServer(
    { name: 'brecha', version: '1.0.0' },
    {
      instructions:
        'Brecha sigue postulaciones de empleo. Los estados válidos y sus saltos los decide el núcleo: usa ver_postulacion para ver transicionesPosibles. ' +
        'Para pasar a postulado hacen falta fechaPostulacion y canal; rechazado y descartado piden motivo. Registrar una señal nunca cambia el estado por sí sola. ' +
        'Tu red de LinkedIn (contactos, solicitudes y mensajes) se lleva con listar_red, registrar_contacto_red, registrar_interaccion_red y editar_contacto_red: ' +
        'LinkedIn no tiene API, así que la revisas desde el navegador de la persona y registras aquí, ligando cada contacto a sus postulaciones. ' +
        'Liga a una persona a una postulación solo si trabaja hoy en esa empresa: si su cargo actual dice otra empresa o te cuenta que ya no está ahí, ' +
        'desvincúlala de esa postulación (editar_contacto_red con desvincular), corrige su empresa y anótalo en sus notas. ' +
        'Pasos pendientes: cuando un correo, un mensaje de LinkedIn o un portal le pida algo a la persona (un test, mandar el CV, un formulario, agendar), regístralo: ' +
        'con registrar_interaccion_red y su campo paso si vino por LinkedIn, o con registrar_paso si lo viste en un portal (también lo que ya hizo, con estado hecho). ' +
        'Antes de registrar, mira los pasos de la postulación (ver_postulacion o listar_pasos) para no duplicar. Para ubicar la postulación desde la página de un aviso usa listar_postulaciones con url. ' +
        'Cuando la persona diga que completó algo, márcalo con resolver_paso. Los pasos se registran aunque la postulación esté cerrada.' +
        (perfil ? ` ${INSTRUCCIONES_PERFIL}` : '') +
        (arriendos ? ` ${INSTRUCCIONES_ARRIENDOS}` : ''),
    },
  );
  if (arriendos) registrarHerramientasDeArriendos(s, arriendos);
  if (perfil) registrarHerramientasDePerfil(s, perfil, arriendos);
  const lectura = { readOnlyHint: true, openWorldHint: false };

  s.registerTool(
    'listar_postulaciones',
    {
      title: 'Listar postulaciones',
      description:
        'Lista postulaciones con filtros opcionales. Devuelve id, empresa, título, estado, prioridad, etiquetas, versión ' +
        'y los choques con el perfil de búsqueda (perfil.cumpleDuras falso = choca con una regla dura; no cambies su estado por eso).',
      inputSchema: {
        estados: z.array(estado).optional(),
        plataformas: z.array(z.enum(PLATAFORMAS)).optional(),
        prioridades: z.array(z.enum(PRIORIDADES)).optional(),
        etiquetas: z
          .array(z.string())
          .optional()
          .describe('Debe tener todas (se comparan en minúsculas y sin tildes)'),
        q: z.string().optional().describe('Texto en título o empresa'),
        url: z
          .string()
          .optional()
          .describe(
            'URL del aviso o solo su número (3916453): ubica la postulación desde la página de un portal',
          ),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      },
      annotations: lectura,
    },
    (a) =>
      correr(async () => {
        const r = await casos.listar.ejecutar(a);
        return ok(
          `${r.total} postulaciones (mostrando ${r.items.length}):\n${r.items.map(linea).join('\n')}`,
          r,
        );
      }),
  );

  s.registerTool(
    'listar_etiquetas',
    {
      title: 'Listar etiquetas',
      description: 'Etiquetas en uso con cuántas postulaciones tiene cada una, de la más usada a la menos.',
      inputSchema: {},
      annotations: lectura,
    },
    () =>
      correr(async () => {
        const r = await casos.etiquetas.ejecutar();
        return ok(r.length ? r.map((x) => `#${x.etiqueta} (${x.total})`).join('\n') : 'Sin etiquetas', r);
      }),
  );

  s.registerTool(
    'ver_postulacion',
    {
      title: 'Ver postulación',
      description:
        'Detalle con historial, señales, discrepancias, transicionesPosibles y pasos (el proceso: lo pedido y lo hecho).',
      inputSchema: { id: z.string() },
      annotations: lectura,
    },
    ({ id }) =>
      correr(async () => {
        const d = await casos.ver.ejecutar(id);
        return ok(linea(d), d);
      }),
  );

  s.registerTool(
    'crear_postulacion',
    {
      title: 'Crear postulación',
      description:
        'Crea una postulación desde un aviso. YA_EXISTE si ya sigues ese aviso. Si vienes de buscar ofertas, ' +
        'antes leíste el perfil (ver_perfil, foco empleo): no crees una que choca con una regla dura sin decírselo a la persona. ' +
        'Trae modalidad, ubicación y sueldo publicado si el aviso los dice: con eso se revisa el perfil. La respuesta trae los choques.',
      inputSchema: {
        titulo: z.string(),
        empresa: z.string(),
        url: z.string(),
        plataforma: z.enum(PLATAFORMAS),
        modalidad: z.enum(MODALIDADES).optional(),
        ubicacion: z.string().optional(),
        cierre: fecha.optional(),
        estado: z.enum(['sin_decidir', 'por_postular', 'postulado']).optional(),
        fechaPostulacion: fecha.optional(),
        canal: canal.optional(),
        stack: z.array(z.string()).optional().describe('Herramientas que pide el aviso'),
        requisitos: z.string().optional().describe('Requisitos en texto libre'),
        sueldoPublicado: z.string().optional().describe('Sueldo tal como lo publica el aviso'),
        etiquetas: z.array(z.string()).optional(),
        prioridad: z.enum(PRIORIDADES).optional().describe('Sin ella, la calcula el núcleo'),
      },
    },
    (a) =>
      correr(async () => {
        const { estado: e, fechaPostulacion, canal: c, etiquetas, prioridad, ...aviso } = a;
        const d = await casos.crear.ejecutar({
          aviso,
          ...(e ? { estado: e } : {}),
          ...(fechaPostulacion ? { fechaPostulacion } : {}),
          ...(c ? { canal: c } : {}),
          ...(etiquetas ? { etiquetas } : {}),
          ...(prioridad ? { prioridad } : {}),
          origen: 'ia',
        });
        return ok(`Creada: ${linea(d)}`, d);
      }),
  );

  s.registerTool(
    'cambiar_estado',
    {
      title: 'Cambiar estado',
      description:
        'Mueve una postulación (origen ia). Si el salto no es válido devuelve TRANSICION_INVALIDA. Si contradice la última señal, el cambio se guarda y se abre una discrepancia.',
      inputSchema: {
        id: z.string(),
        a: estado,
        motivo: z.string().optional().describe('Obligatorio para rechazado y descartado'),
        fechaPostulacion: fecha.optional().describe('Obligatoria para postulado si no la tiene'),
        canal: canal.optional().describe('Obligatorio para postulado si no lo tiene'),
        version: z.number().int().optional().describe('Si la pasas y cambió, devuelve CONFLICTO'),
        descartarPasos: z
          .boolean()
          .optional()
          .describe('Al cerrarla, descarta sus pasos pendientes (solo si la persona lo pide)'),
      },
    },
    (a) =>
      correr(async () => {
        const d = await casos.cambiarEstado.ejecutar({ ...a, origen: 'ia' });
        const aviso = d.discrepanciasAbiertas
          ? ` · ⚠ ${d.discrepanciasAbiertas} discrepancia(s) abierta(s)`
          : '';
        const pasos = d.pasosPendientes.length
          ? ` · quedan ${d.pasosPendientes.length} paso(s) pendiente(s): ${d.pasosPendientes.map((x) => x.descripcion).join('; ')}`
          : '';
        return ok(`Movida: ${linea(d)}${aviso}${pasos}`, d);
      }),
  );

  s.registerTool(
    'editar_postulacion',
    {
      title: 'Editar postulación',
      description:
        'Edita canal, sueldo pretendido, cierre, etiquetas (reemplaza la lista), prioridad fijada, stack, requisitos o sueldo publicado (null borra o vuelve a la calculada). Pide la versión actual.',
      inputSchema: {
        id: z.string(),
        version: z.number().int(),
        canal: canal.optional(),
        sueldoPretendido: z
          .object({
            monto: z.number().positive(),
            moneda: z.enum(MONEDAS),
            periodo: z.enum(['mes', 'anio', 'hora']).optional(),
            base: z.enum(['bruto', 'liquido']).optional(),
          })
          .nullable()
          .optional(),
        cierre: fecha.nullable().optional(),
        etiquetas: z.array(z.string()).optional().describe('La lista completa: reemplaza la anterior'),
        prioridad: z.enum(PRIORIDADES).nullable().optional().describe('null vuelve a la calculada'),
        stack: z.array(z.string()).optional(),
        requisitos: z.string().nullable().optional(),
        sueldoPublicado: z.string().nullable().optional(),
      },
    },
    (a) => correr(async () => ok('Editada', await casos.editar.ejecutar(a))),
  );

  s.registerTool(
    'agregar_nota',
    {
      title: 'Agregar nota',
      description: 'Las notas no se editan ni se borran.',
      inputSchema: { id: z.string(), texto: z.string() },
    },
    (a) => correr(async () => ok('Nota agregada', await casos.agregarNota.ejecutar(a))),
  );

  s.registerTool(
    'agregar_contacto',
    {
      title: 'Agregar contacto',
      description: 'Hace falta email o LinkedIn. No se puede en un estado terminal.',
      inputSchema: {
        id: z.string(),
        nombre: z.string(),
        rol: z.string().optional(),
        email: z.string().optional(),
        linkedin: z.string().optional(),
      },
    },
    (a) => correr(async () => ok('Contacto agregado', await casos.agregarContacto.ejecutar(a))),
  );

  s.registerTool(
    'agendar_entrevista',
    {
      title: 'Agendar entrevista',
      description: 'Solo desde postulado, en_proceso o entrevista; si no está en entrevista, la mueve.',
      inputSchema: {
        id: z.string(),
        fecha: z.string().describe('Fecha y hora ISO 8601'),
        tipo: z.enum(TIPOS_DE_ENTREVISTA),
        con: z.string().optional(),
      },
    },
    (a) =>
      correr(async () =>
        ok('Entrevista agendada', await casos.agendarEntrevista.ejecutar({ ...a, origen: 'ia' })),
      ),
  );

  s.registerTool(
    'registrar_resultado_entrevista',
    {
      title: 'Registrar resultado de entrevista',
      description:
        'Cuando la persona cuente cómo le fue: avanza (pasó a la etapa siguiente), no_avanza, cancelada, o pendiente para reabrir. ' +
        'El entrevistaId sale de ver_postulacion (entrevistas). No cambia el estado de la postulación: si el proceso terminó, usa cambiar_estado.',
      inputSchema: {
        id: z.string().describe('Postulación'),
        entrevistaId: z.string(),
        resultado: z.enum(RESULTADOS_DE_ENTREVISTA),
      },
    },
    (a) =>
      correr(async () => ok('Resultado registrado', await casos.registrarResultadoEntrevista.ejecutar(a))),
  );

  s.registerTool(
    'registrar_senal',
    {
      title: 'Registrar señal',
      description:
        'Registra evidencia de una fuente (por ejemplo, un correo que leíste con tu propio MCP de correo). Sin id de postulación, queda en la bandeja para que la persona la asocie. Una señal registrada por ti no cambia el estado: queda como sugerencia. Usa referenciaExterna (Message-ID) para no duplicar. ' +
        'Si el correo pide algo, pásalo en paso; si da por hecho un paso pendiente, en pasosCumplidos.',
      inputSchema: {
        id: z.string().optional().describe('Postulación; sin ella, va a la bandeja'),
        postulacionIds: z.array(z.string()).optional().describe('Si el correo toca varias postulaciones'),
        candidatas: z.array(z.string()).optional().describe('Sin postulación: las que crees probables'),
        paso: z
          .object({
            descripcion: z.string().describe('Corta, lo que se ve en la tarjeta'),
            detalle: z.string().optional(),
            plazo: fecha.optional(),
            enlace: z.string().optional(),
            mismoQue: z.string().optional().describe('Id de un paso pendiente que el correo solo recuerda'),
          })
          .optional(),
        pasosCumplidos: z.array(z.object({ id: z.string(), confianza: z.number().min(0).max(1) })).optional(),
        fuente: z.enum(FUENTES_DE_SENAL),
        resumen: z.string(),
        estadoSugerido: estado.optional(),
        confianza: z.number().min(0).max(1),
        plataforma: z.enum(PLATAFORMAS).optional(),
        recibidaEn: z.string().optional().describe('ISO 8601'),
        referenciaExterna: z.string().optional(),
        empresaDetectada: z.string().optional(),
        cargoDetectado: z.string().optional(),
      },
    },
    (a) =>
      correr(async () => {
        const { recibidaEn, id, ...resto } = a;
        const r = await casos.recibirSenal.ejecutar({
          ...resto,
          registradoPor: 'ia',
          ...(id ? { postulacionId: id } : {}),
          ...(recibidaEn ? { recibidaEn: new Date(recibidaEn) } : {}),
        });
        if (r.destino === 'bandeja')
          return ok(
            'Señal en la bandeja: la persona la asocia desde la consola o con asociar_senal',
            r.pendiente,
          );
        const aviso = r.postulacion.discrepanciasAbiertas
          ? ` · ⚠ abrió o mantiene ${r.postulacion.discrepanciasAbiertas} discrepancia(s)`
          : '';
        return ok(`Señal registrada (${r.senal.aplicada ? 'aplicada' : 'como sugerencia'})${aviso}`, r);
      }),
  );

  s.registerTool(
    'listar_bandeja',
    {
      title: 'Listar bandeja',
      description: 'Señales que llegaron sin postulación.',
      inputSchema: {},
      annotations: lectura,
    },
    () =>
      correr(async () => {
        const r = await casos.bandeja.ejecutar();
        return ok(`${r.length} señales en la bandeja`, r);
      }),
  );

  s.registerTool(
    'asociar_senal',
    {
      title: 'Asociar señal',
      description:
        'Lleva una señal de la bandeja a una o varias postulaciones (con la misma referencia, no se duplica). Si el correo pidió algo, el paso se crea ligado a todas.',
      inputSchema: {
        senalId: z.string(),
        postulacionId: z.string().optional(),
        postulacionIds: z.array(z.string()).optional(),
      },
    },
    (a) => correr(async () => ok('Señal asociada', await casos.asociarSenal.ejecutar(a))),
  );

  s.registerTool(
    'aplicar_senal',
    {
      title: 'Aplicar señal',
      description: 'Mueve la postulación al estado que sugiere la señal.',
      inputSchema: { id: z.string(), senalId: z.string() },
    },
    (a) => correr(async () => ok('Señal aplicada', await casos.aplicarSenal.ejecutar(a))),
  );

  s.registerTool(
    'listar_discrepancias',
    {
      title: 'Listar discrepancias',
      description: 'Discrepancias abiertas de todas las postulaciones.',
      inputSchema: {},
      annotations: lectura,
    },
    () =>
      correr(async () => {
        const x = await casos.exportar.ejecutar();
        const abiertas = x.postulaciones.flatMap((p) =>
          p.discrepancias
            .filter((d) => d.estado === 'abierta')
            .map((d) => ({
              postulacionId: p.id,
              empresa: p.empresa,
              titulo: p.titulo,
              estadoPostulacion: p.estado,
              ...d,
            })),
        );
        return ok(`${abiertas.length} discrepancias abiertas`, abiertas);
      }),
  );

  s.registerTool(
    'resolver_discrepancia',
    {
      title: 'Resolver discrepancia',
      description:
        'confirmar mantiene el movimiento; corregir mueve al estado `a` (con motivo, fecha o canal si la regla los pide).',
      inputSchema: {
        id: z.string(),
        discrepanciaId: z.string(),
        decision: z.enum(['confirmar', 'corregir']),
        a: estado.optional(),
        motivo: z.string().optional(),
        fechaPostulacion: fecha.optional(),
        canal: canal.optional(),
      },
    },
    (a) =>
      correr(async () =>
        ok('Discrepancia resuelta', await casos.resolverDiscrepancia.ejecutar({ ...a, origen: 'ia' })),
      ),
  );

  registrarPasos(s, casos);

  s.registerTool(
    'resumen',
    {
      title: 'Resumen',
      description: 'Qué cambió desde una fecha (por defecto, los últimos 7 días), ordenado por prioridad.',
      inputSchema: { desde: z.string().optional().describe('ISO 8601') },
      annotations: lectura,
    },
    ({ desde }) =>
      correr(async () => {
        const r = await casos.resumen.ejecutar(desde);
        return ok(
          `${r.length} novedades:\n${r.map((e) => `[${e.prioridad}] ${e.empresa}: ${e.descripcion}`).join('\n')}`,
          r,
        );
      }),
  );

  s.registerTool(
    'exportar',
    {
      title: 'Exportar',
      description:
        'Todo el estado en JSON (postulaciones, señales, discrepancias y conteos) para armar o actualizar un artifact. Si pasa de unos 50 KB, pide un estado a la vez.',
      inputSchema: { estado: estado.optional() },
      annotations: lectura,
    },
    ({ estado: e }) =>
      correr(async () => {
        const x = await casos.exportar.ejecutar();
        const datos = e ? { ...x, postulaciones: x.postulaciones.filter((p) => p.estado === e) } : x;
        const json = JSON.stringify(datos);
        if (json.length > LIMITE_EXPORTAR) {
          return ok(
            `El export pesa ${Math.round(json.length / 1024)} KB. Pídelo por estado (parámetro estado) para no perder detalle. Conteos:`,
            datos.conteos,
          );
        }
        return ok(`Export de ${datos.postulaciones.length} postulaciones`, datos);
      }),
  );

  s.registerResource(
    'postulacion',
    new ResourceTemplate('brecha://postulaciones/{id}', { list: undefined }),
    { title: 'Postulación', mimeType: 'application/json' },
    async (uri, { id }) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(await casos.ver.ejecutar(String(id))),
        },
      ],
    }),
  );

  s.registerResource(
    'resumen',
    'brecha://resumen',
    { title: 'Resumen de la semana', mimeType: 'application/json' },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await casos.resumen.ejecutar()) },
      ],
    }),
  );

  if (red) registrarRed(s, red, casos);
  if (csv) {
    s.registerTool(
      'importar_csv',
      {
        title: 'Importar un CSV de postulaciones o contactos',
        description:
          'Importa el contenido de un CSV (UTF-8, coma, con encabezado) con el formato de Brecha; el tipo se reconoce por el encabezado. ' +
          'Idempotente: una postulación con la misma URL o un contacto con el mismo perfil «ya estaba». Cada fila mala se informa con su línea y columna sin cortar las demás. ' +
          'Postulaciones: titulo,empresa,url,plataforma,modalidad,ubicacion,cierre,estado,prioridad,fecha_postulacion,canal_tipo,canal_valor,correo_postulacion,sueldo_publicado,stack,requisitos,etiquetas,notas,motivo. ' +
          'Contactos: nombre,perfil_url,titular,empresa,correo,url_postulacion,motivo,mensaje_sugerido. Importa primero las postulaciones y después los contactos.',
        inputSchema: {
          csv: z.string().describe('El contenido completo del archivo'),
          tipo: z.enum(TIPOS_CSV).optional(),
        },
      },
      (a) =>
        correr(async () => {
          const r = await csv.importar.ejecutar(a);
          const malas = r.filas.filter((f) => f.resultado === 'error' || f.advertencias.length);
          const detalle = malas
            .map((f) =>
              f.resultado === 'error'
                ? `línea ${f.fila} · error en ${f.campo ?? 'la fila'}: ${f.mensaje}`
                : `línea ${f.fila} · ${f.advertencias.join('; ')}`,
            )
            .join('\n');
          return ok(
            `${r.tipo}: ${r.creadas} creadas, ${r.yaEstaban} ya estaban, ${r.actualizadas} actualizadas, ${r.errores} con error, ${r.conAdvertencias} con advertencia.` +
              (r.advertencias.length ? `\n${r.advertencias.join('\n')}` : '') +
              (detalle ? `\n${detalle}` : ''),
            { ...r, filas: malas },
          );
        }),
    );

    s.registerTool(
      'exportar_csv',
      {
        title: 'Exportar postulaciones o contactos a CSV',
        description:
          'Todas las postulaciones o todos los contactos en el mismo formato que importar_csv, para que otra persona los importe en su Brecha.',
        inputSchema: { tipo: z.enum(TIPOS_CSV) },
        annotations: lectura,
      },
      ({ tipo }) =>
        correr(async () => ({ content: [{ type: 'text', text: await csv.exportar.ejecutar(tipo) }] })),
    );
  }

  return s;
}

/** Tu red de LinkedIn (no tiene API): la IA la lee desde tu navegador y la registra aquí. */
function registrarRed(s: McpServer, red: CasosDeRed, casos: CasosDeUso): void {
  const lectura = { readOnlyHint: true, openWorldHint: false };
  const fila = (c: {
    nombre: string;
    empresa: string | null;
    conexion: string;
    pendiente: string | null;
    id: string;
  }) =>
    `${c.nombre}${c.empresa ? ` · ${c.empresa}` : ''} · ${c.conexion}${c.pendiente ? ` · ${c.pendiente}` : ''} · id ${c.id}`;

  s.registerTool(
    'listar_red',
    {
      title: 'Listar tu red de LinkedIn',
      description:
        'Contactos con lo pendiente primero. filtro: responder (te toca a ti), esperando (le toca a la otra persona), ' +
        'solicitudes (enviadas o recibidas sin respuesta), seguimiento (fecha de seguimiento vencida) o todos.',
      inputSchema: {
        filtro: z.enum(FILTROS_DE_RED).optional(),
        texto: z.string().optional(),
        postulacionId: z.string().optional(),
      },
      annotations: lectura,
    },
    (a) =>
      correr(async () => {
        const r = await red.listar.ejecutar(a);
        return ok(
          `${r.items.length} contactos (de ${r.resumen.total}; ${r.resumen.porResponder} por responder, ` +
            `${r.resumen.esperando} esperando respuesta)\n${r.items.map(fila).join('\n')}`,
          r.resumen,
        );
      }),
  );

  s.registerTool(
    'ver_contacto_red',
    {
      title: 'Ver un contacto de tu red',
      description: 'Con todas sus interacciones y las postulaciones ligadas.',
      inputSchema: { id: z.string() },
      annotations: lectura,
    },
    ({ id }) => correr(async () => ok('Contacto', await red.ver.ejecutar(id))),
  );

  s.registerTool(
    'registrar_contacto_red',
    {
      title: 'Registrar o actualizar un contacto de LinkedIn',
      description:
        'Si el perfil (linkedin.com/in/…) ya está, actualiza nombre, titular y empresa. Sin perfil, el contacto se reconoce por nombre y empresa. postulacionId lo liga a esa postulación.',
      inputSchema: {
        nombre: z.string(),
        perfilUrl: z.string().optional().describe('linkedin.com/in/…; omítelo si la persona no tiene'),
        titular: z.string().optional(),
        empresa: z.string().optional(),
        postulacionId: z.string().optional(),
      },
    },
    (a) =>
      correr(async () => {
        const r = await red.registrarContacto.ejecutar(a);
        return ok(r.nuevo ? 'Contacto creado' : 'Contacto actualizado', r);
      }),
  );

  s.registerTool(
    'registrar_interaccion_red',
    {
      title: 'Registrar una solicitud, un mensaje o una nota',
      description:
        'Por id o por perfilUrl (con nombre crea el contacto si no existe). No se repite: la misma referenciaExterna, ' +
        'o el mismo tipo y resumen el mismo día, se ignoran. Las solicitudes cambian el estado de la conexión. ' +
        'Resume el mensaje en una línea; no copies textos largos ni datos sensibles. ' +
        'conversacion_cerrada: la otra persona se despidió y no hace falta contestar; saca al contacto de ' +
        '«por responder» hasta el próximo mensaje. Úsala solo si la persona lo dice.',
      inputSchema: {
        id: z.string().optional(),
        perfilUrl: z.string().optional(),
        nombre: z.string().optional(),
        tipo: z.enum(TIPOS_DE_INTERACCION),
        resumen: z.string(),
        ocurridaEn: z.string().datetime({ offset: true }).optional(),
        referenciaExterna: z.string().optional(),
        paso: z
          .object({
            descripcion: z.string().describe('Corta: «Contestar a Daniel con tu CV»'),
            detalle: z.string().optional().describe('Qué pide exactamente y cómo'),
            plazo: fecha.optional(),
            postulacionIds: z
              .array(z.string())
              .optional()
              .describe('Si no, las postulaciones ligadas al contacto'),
          })
          .optional()
          .describe('Si el mensaje te pide hacer algo: queda como paso pendiente en sus postulaciones'),
      },
    },
    (a) =>
      correr(async () => {
        const { ocurridaEn, paso, ...resto } = a;
        const r = await red.registrarInteraccion.ejecutar({
          ...resto,
          ...(ocurridaEn ? { ocurridaEn: new Date(ocurridaEn) } : {}),
          origen: 'ia',
        });
        const texto = r.agregada ? 'Interacción registrada' : 'Ya estaba registrada';
        if (!paso) return ok(texto, r);
        const { postulacionIds, ...pedido } = paso;
        const ids = postulacionIds?.length ? postulacionIds : r.postulacionIds;
        if (!ids.length) {
          return ok(
            `${texto}. El paso NO se registró: el contacto no está ligado a ninguna postulación. ` +
              'Búscala con listar_postulaciones (q con la empresa) y vuelve a llamar con paso.postulacionIds.',
            r,
          );
        }
        const p = await casos.registrarPaso.ejecutar({
          ...pedido,
          postulacionIds: ids,
          fuente: 'linkedin',
          registradoPor: 'ia',
          contactoRedId: r.id,
          ...(a.referenciaExterna ? { referenciaExterna: `${a.referenciaExterna}#paso` } : {}),
          ...(ocurridaEn ? { pedidoEn: new Date(ocurridaEn) } : {}),
        });
        return ok(`${texto} · paso ${p.yaEstaba ? 'ya estaba' : 'registrado'}: ${p.descripcion}`, {
          contacto: r,
          paso: p,
        });
      }),
  );

  s.registerTool(
    'editar_contacto_red',
    {
      title: 'Editar un contacto de tu red',
      description:
        'Notas, fecha de seguimiento (AAAA-MM-DD o null), titular, empresa; vincular o desvincular una postulación por id. ' +
        'Si la persona ya no trabaja en la empresa de una postulación ligada, desvincúlala de esa postulación.',
      inputSchema: {
        id: z.string(),
        nombre: z.string().optional(),
        perfilUrl: z.string().optional().describe('Completa el perfil de LinkedIn si no lo tenía'),
        titular: z.string().nullable().optional(),
        empresa: z.string().nullable().optional(),
        notas: z.string().nullable().optional(),
        seguimiento: z.string().nullable().optional(),
        vincular: z.string().optional(),
        desvincular: z.string().optional(),
      },
    },
    (a) => correr(async () => ok('Contacto editado', await red.editar.ejecutar(a))),
  );
}

/** Pasos pendientes (docs/diseno/pasos.md §8): lo que cada postulación te pide hacer. */
function registrarPasos(s: McpServer, casos: CasosDeUso): void {
  const lectura = { readOnlyHint: true, openWorldHint: false };
  const fila = (p: VistaPaso) =>
    `${p.estado} · ${p.descripcion}${p.plazo ? ` · plazo ${p.plazo}` : ''} · ` +
    `${p.postulaciones.map((x) => `${x.empresa} (${x.estado})`).join(', ')} · id ${p.id}`;

  s.registerTool(
    'listar_pasos',
    {
      title: 'Listar pasos pendientes',
      description:
        'Lo que tus postulaciones te piden hacer. Por defecto, solo los pendientes (por plazo). estado: pendiente, hecho o descartado.',
      inputSchema: {
        estado: z.enum(ESTADOS_DE_PASO).optional(),
        postulacionId: z.string().optional(),
        todos: z.boolean().optional().describe('true: todos los estados'),
      },
      annotations: lectura,
    },
    ({ estado: e, postulacionId, todos }) =>
      correr(async () => {
        const r = await casos.listarPasos.ejecutar({
          ...(todos ? {} : { estado: e ?? 'pendiente' }),
          ...(postulacionId ? { postulacionId } : {}),
        });
        return ok(`${r.length} pasos\n${r.map(fila).join('\n')}`, r);
      }),
  );

  s.registerTool(
    'registrar_paso',
    {
      title: 'Registrar un paso',
      description:
        'Algo que una o más postulaciones piden hacer (un test, un formulario, mandar documentos), visto en un portal, un correo o un mensaje. ' +
        'Texto libre. estado hecho para anotar lo que la persona ya hizo, así la ficha muestra el proceso completo. ' +
        'Funciona aunque la postulación esté cerrada. Usa referenciaExterna para no duplicar (el mismo pedido dos veces devuelve el que estaba).',
      inputSchema: {
        postulacionIds: z.array(z.string()).min(1),
        descripcion: z.string().describe('Corta, de 3 a 120 caracteres: lo que se ve en la tarjeta'),
        detalle: z.string().optional().describe('Qué piden exactamente y cómo'),
        plazo: fecha.optional(),
        enlace: z.string().optional(),
        estado: z.enum(['pendiente', 'hecho']).optional(),
        fuente: z.enum(FUENTES_DE_PASO).optional().describe('Por dónde llegó el pedido (por defecto portal)'),
        contactoRedId: z.string().optional(),
        referenciaExterna: z.string().optional(),
        pedidoEn: z.string().optional().describe('ISO 8601: cuándo lo pidieron'),
      },
    },
    (a) =>
      correr(async () => {
        const { pedidoEn, ...resto } = a;
        const p = await casos.registrarPaso.ejecutar({
          ...resto,
          fuente: a.fuente ?? 'portal',
          registradoPor: 'ia',
          ...(pedidoEn ? { pedidoEn: new Date(pedidoEn) } : {}),
        });
        return ok(p.yaEstaba ? `Ya estaba: ${fila(p)}` : `Registrado: ${fila(p)}`, p);
      }),
  );

  s.registerTool(
    'resolver_paso',
    {
      title: 'Marcar un paso como hecho, descartarlo o reabrirlo',
      description:
        'Cuando la persona diga que completó algo («ya mandé el CV»), márcalo hecho. Queda registrado que lo cerró la IA.',
      inputSchema: {
        id: z.string(),
        estado: z.enum(ESTADOS_DE_PASO).describe('hecho, descartado, o pendiente para reabrir'),
        nota: z.string().optional(),
        version: z.number().int().optional().describe('Si la pasas y cambió, devuelve CONFLICTO'),
      },
    },
    (a) => correr(async () => ok('Paso actualizado', await casos.resolverPaso.ejecutar({ ...a, por: 'ia' }))),
  );

  s.registerTool(
    'editar_paso',
    {
      title: 'Editar un paso',
      description:
        'Cambia la descripción, el detalle, el plazo, el enlace o las postulaciones (null borra). Pide la versión actual.',
      inputSchema: {
        id: z.string(),
        version: z.number().int(),
        descripcion: z.string().optional(),
        detalle: z.string().nullable().optional(),
        plazo: fecha.nullable().optional(),
        enlace: z.string().nullable().optional(),
        postulacionIds: z.array(z.string()).min(1).optional(),
      },
    },
    (a) => correr(async () => ok('Paso editado', await casos.editarPaso.ejecutar(a))),
  );
}
