import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ErrorDeDominio } from '../../../compartido/dominio/error-de-dominio';
import { PRIORIDADES } from '../../../compartido/dominio/evento-de-dominio';
import { ESTADOS } from '../../dominio/estado';
import { MODALIDADES, MONEDAS, PLATAFORMAS, TIPOS_DE_CANAL } from '../../dominio/objetos-valor/valores';
import { FUENTES_DE_SENAL, TIPOS_DE_ENTREVISTA } from '../../dominio/partes';
import type { VistaDetalle } from '../../aplicacion/vistas';
import type { CasosDeRed } from '../../../red/aplicacion/casos-de-red';
import { FILTROS_DE_RED } from '../../../red/aplicacion/casos-de-red';
import { TIPOS_DE_INTERACCION } from '../../../red/dominio/contacto-de-red';
import type { CasosDeUso } from '../casos';

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
      },
) {
  const etiquetas = p.etiquetas?.length ? ` · #${p.etiquetas.join(' #')}` : '';
  return `${p.empresa} · ${p.titulo} · ${p.estado} · prioridad ${p.prioridad}${etiquetas} · id ${p.id}`;
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
export function crearServidorMcp(casos: CasosDeUso, red?: CasosDeRed): McpServer {
  const s = new McpServer(
    { name: 'brecha', version: '1.0.0' },
    {
      instructions:
        'Brecha sigue postulaciones de empleo. Los estados válidos y sus saltos los decide el núcleo: usa ver_postulacion para ver transicionesPosibles. ' +
        'Para pasar a postulado hacen falta fechaPostulacion y canal; rechazado y descartado piden motivo. Registrar una señal nunca cambia el estado por sí sola. ' +
        'Tu red de LinkedIn (contactos, solicitudes y mensajes) se lleva con listar_red, registrar_contacto_red, registrar_interaccion_red y editar_contacto_red: ' +
        'LinkedIn no tiene API, así que la revisas desde el navegador de la persona y registras aquí, ligando cada contacto a sus postulaciones.',
    },
  );
  const lectura = { readOnlyHint: true, openWorldHint: false };

  s.registerTool(
    'listar_postulaciones',
    {
      title: 'Listar postulaciones',
      description:
        'Lista postulaciones con filtros opcionales. Devuelve id, empresa, título, estado, prioridad, etiquetas y versión.',
      inputSchema: {
        estados: z.array(estado).optional(),
        plataformas: z.array(z.enum(PLATAFORMAS)).optional(),
        prioridades: z.array(z.enum(PRIORIDADES)).optional(),
        etiquetas: z
          .array(z.string())
          .optional()
          .describe('Debe tener todas (se comparan en minúsculas y sin tildes)'),
        q: z.string().optional().describe('Texto en título o empresa'),
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
      description: 'Detalle con historial, señales, discrepancias y transicionesPosibles.',
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
      description: 'Crea una postulación desde un aviso. YA_EXISTE si ya sigues ese aviso.',
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
      },
    },
    (a) =>
      correr(async () => {
        const d = await casos.cambiarEstado.ejecutar({ ...a, origen: 'ia' });
        const aviso = d.discrepanciasAbiertas
          ? ` · ⚠ ${d.discrepanciasAbiertas} discrepancia(s) abierta(s)`
          : '';
        return ok(`Movida: ${linea(d)}${aviso}`, d);
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
    'registrar_senal',
    {
      title: 'Registrar señal',
      description:
        'Registra evidencia de una fuente (por ejemplo, un correo que leíste con tu propio MCP de correo). Sin id de postulación, queda en la bandeja para que la persona la asocie. Una señal registrada por ti no cambia el estado: queda como sugerencia. Usa referenciaExterna (Message-ID) para no duplicar.',
      inputSchema: {
        id: z.string().optional().describe('Postulación; sin ella, va a la bandeja'),
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
        'Lleva una señal de la bandeja a una postulación (con la misma referencia, no se duplica).',
      inputSchema: { senalId: z.string(), postulacionId: z.string() },
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

  if (red) registrarRed(s, red);
  return s;
}

/** Tu red de LinkedIn (no tiene API): la IA la lee desde tu navegador y la registra aquí. */
function registrarRed(s: McpServer, red: CasosDeRed): void {
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
        'Si el perfil (linkedin.com/in/…) ya está, actualiza nombre, titular y empresa. postulacionId lo liga a esa postulación.',
      inputSchema: {
        nombre: z.string(),
        perfilUrl: z.string(),
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
        'Resume el mensaje en una línea; no copies textos largos ni datos sensibles.',
      inputSchema: {
        id: z.string().optional(),
        perfilUrl: z.string().optional(),
        nombre: z.string().optional(),
        tipo: z.enum(TIPOS_DE_INTERACCION),
        resumen: z.string(),
        ocurridaEn: z.string().datetime({ offset: true }).optional(),
        referenciaExterna: z.string().optional(),
      },
    },
    (a) =>
      correr(async () => {
        const { ocurridaEn, ...resto } = a;
        const r = await red.registrarInteraccion.ejecutar({
          ...resto,
          ...(ocurridaEn ? { ocurridaEn: new Date(ocurridaEn) } : {}),
          origen: 'ia',
        });
        return ok(r.agregada ? 'Interacción registrada' : 'Ya estaba registrada', r);
      }),
  );

  s.registerTool(
    'editar_contacto_red',
    {
      title: 'Editar un contacto de tu red',
      description:
        'Notas, fecha de seguimiento (AAAA-MM-DD o null), titular, empresa; vincular o desvincular una postulación por id.',
      inputSchema: {
        id: z.string(),
        nombre: z.string().optional(),
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
