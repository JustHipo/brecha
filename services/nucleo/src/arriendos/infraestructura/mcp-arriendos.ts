import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ErrorDeDominio } from '../../compartido/dominio/error-de-dominio';
import type { CasosDeArriendos, VistaPropiedad } from '../aplicacion/casos';
import type { CasosDeFotos, FotosAgregadas, VistaFoto } from '../aplicacion/fotos';
import { LIMITES_DE_FOTOS } from '../dominio/foto';
import { TIPOS_DE_CANAL } from '../dominio/canal';
import { ESTADOS } from '../dominio/estado';
import {
  FUENTES_DE_SENAL,
  MONEDAS,
  ROLES_DE_CONTACTO,
  TIPOS_DE_INTERACCION,
  TIPOS_DE_PROPIEDAD,
} from '../dominio/valores';

/**
 * Protocolo para la IA (docs/diseno/arriendos.md §5.4, P4 de Juan). Va en las instrucciones del servidor MCP.
 */
export const INSTRUCCIONES_ARRIENDOS =
  'Brecha también sigue la búsqueda de arriendo (foco Arriendos). Antes de buscar o agregar propiedades, lee su perfil con ver_perfil (foco arriendos). ' +
  'Antes de crear, usa buscar_duplicado_propiedad (misma URL o dirección): ' +
  'si ya existe, agrega la publicación nueva con agregar_publicacion o une con unir_propiedades. Si la persona te pide algo que choca con una regla ' +
  '(por ejemplo casas cuando la regla dice departamento), pregúntale antes si cambia el perfil; si dice que sí, usa editar_perfil con el motivo. ' +
  'Registra con quién y por dónde hablan (registrar_contacto_propiedad, registrar_interaccion_arriendo con el canal: portal, WhatsApp, correo, teléfono). ' +
  'Si un portal o canal no existe, créalo con registrar_canal. Brecha no automatiza portales ni WhatsApp: lo revisas desde el navegador de la persona o ella te lo cuenta. ' +
  'Fotos: cuando agregues una propiedad desde un aviso, pasa en fotos las URL de sus imágenes (la primera queda de portada): Brecha las descarga y las guarda en el equipo, ' +
  'porque los avisos se caen. Después se agregan con agregar_fotos (URL o rutas de archivos del equipo), se ven con listar_fotos, se quitan con quitar_foto y la portada se cambia con elegir_portada.';

const precio = z.object({ monto: z.number().positive(), moneda: z.enum(MONEDAS) });
const contacto = z.object({
  nombre: z.string(),
  rol: z.enum(ROLES_DE_CONTACTO).optional(),
  telefono: z.string().optional(),
  correo: z.string().optional(),
  whatsapp: z.string().optional(),
  enlace: z.string().optional().describe('Formulario o link donde postulaste'),
  linkedin: z.string().optional(),
  canalId: z.string().optional().describe('Por dónde hablan: id de un canal (listar_canales)'),
});
const datos = {
  tipo: z.enum(TIPOS_DE_PROPIEDAD).optional(),
  titulo: z.string().optional().describe('Si falta: «Departamento 2D en Ñuñoa»'),
  direccion: z.string().nullable().optional(),
  comuna: z.string().nullable().optional(),
  precio: precio.nullable().optional(),
  gastosComunes: z.number().nullable().optional(),
  m2Utiles: z.number().nullable().optional(),
  m2Totales: z.number().nullable().optional(),
  dormitorios: z.number().int().nullable().optional(),
  banos: z.number().int().nullable().optional(),
  estacionamientos: z.number().int().nullable().optional(),
  bodega: z.boolean().nullable().optional(),
  amoblado: z.boolean().nullable().optional(),
  mascotas: z.boolean().nullable().optional().describe('true si acepta mascotas'),
  disponibleDesde: z.string().nullable().optional().describe('AAAA-MM-DD'),
  descripcion: z.string().nullable().optional(),
  requisitos: z
    .object({
      rentaVeces: z.number().optional().describe('Renta líquida mínima en veces el arriendo'),
      aval: z.boolean().optional(),
      mesesGarantia: z.number().optional(),
      comisionMeses: z.number().optional(),
      documentos: z.array(z.string()).optional(),
    })
    .nullable()
    .optional(),
};
function ok(texto: string, d?: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: d === undefined ? texto : `${texto}\n\n${JSON.stringify(d, null, 2)}` }],
  };
}

async function correr(f: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await f();
  } catch (e) {
    const cuerpo =
      e instanceof ErrorDeDominio
        ? { codigo: e.codigo, mensaje: e.message, ...(e.campo ? { campo: e.campo } : {}) }
        : { codigo: 'ERROR_INTERNO', mensaje: 'Error interno' };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify(cuerpo) }] };
  }
}

const pesos = (n: number | null) => (n === null ? 's/precio' : `$${Math.round(n).toLocaleString('es-CL')}`);

function fila(v: VistaPropiedad): string {
  const calce = v.calce.puntaje === null ? 'calce s/d' : `calce ${v.calce.puntaje}`;
  const brecha = v.calce.brechas[0] ? ` · ${v.calce.brechas[0].texto}` : '';
  const pend = v.pendiente === 'responder' ? ' · te toca responder' : '';
  const fotos = v.cantidadFotos ? ` · ${v.cantidadFotos} foto${v.cantidadFotos === 1 ? '' : 's'}` : '';
  return `${v.titulo} · ${v.estado} · ${pesos(v.precioPesos)} · ${calce}${brecha}${pend}${fotos} · id ${v.id}`;
}

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024)).toLocaleString('es-CL')} KB`;

function filaFoto(f: VistaFoto): string {
  const de = f.urlOrigen ?? f.nombreOrigen;
  return `${f.orden + 1}. ${f.portada ? 'portada · ' : ''}id ${f.id} · ${f.tipo.replace('image/', '')} · ${kb(f.bytes)}${de ? ` · de ${de}` : ''}`;
}

function textoFotos(r: FotosAgregadas): string {
  const n = (e: string) => r.resultados.filter((x) => x.estado === e).length;
  const lineas = r.resultados.map((x) =>
    x.estado === 'error'
      ? `✗ ${x.fuente}: ${x.mensaje}`
      : `${x.estado === 'agregada' ? '✓' : '='} ${x.fuente}${x.estado === 'ya_estaba' ? ' (ya estaba)' : ''} · id ${x.foto!.id}`,
  );
  return `Fotos: ${n('agregada')} agregadas, ${n('ya_estaba')} ya estaban, ${n('error')} con error. Tiene ${r.fotos.length}.\n${lineas.join('\n')}`;
}

const listaDeFotos = z
  .array(z.string())
  .min(1)
  .max(LIMITES_DE_FOTOS.porLlamada)
  .describe(
    'URL http(s) de las imágenes (Brecha las descarga) o rutas de archivos de este equipo (/Users/…, C:\\Users\\…, ~/…). jpg, png o webp de hasta 10 MB',
  );

const lectura = { readOnlyHint: true, openWorldHint: false };

/** Las herramientas MCP de Arriendos. Lo que hacen queda con origen `ia`. */
export function registrarHerramientasDeArriendos(
  s: McpServer,
  c: CasosDeArriendos,
  fotos?: CasosDeFotos,
): void {
  s.registerTool(
    'listar_propiedades',
    {
      title: 'Listar propiedades de arriendo',
      description: 'Con calce y brecha principal; lo que te toca responder primero.',
      inputSchema: {
        estado: z.enum(ESTADOS).optional(),
        texto: z.string().optional(),
        canal: z.string().optional(),
        abiertas: z.boolean().optional().describe('Solo las que sigues buscando'),
        pendiente: z.enum(['responder', 'esperando']).optional(),
      },
      annotations: lectura,
    },
    (a) =>
      correr(async () => {
        const r = await c.listar(a);
        return ok(
          `${r.items.length} propiedades (de ${r.resumen.total}; ${r.resumen.porResponder} por responder, ${r.resumen.bandeja} en la Bandeja)\n` +
            r.items.map(fila).join('\n'),
          r.resumen,
        );
      }),
  );

  s.registerTool(
    'ver_propiedad',
    {
      title: 'Ver una propiedad',
      description:
        'Todo: datos, calce y brechas, publicaciones, contactos con sus conversaciones, visitas, señales y transicionesPosibles.',
      inputSchema: { id: z.string() },
      annotations: lectura,
    },
    ({ id }) => correr(async () => ok('Propiedad', await c.ver(id))),
  );

  s.registerTool(
    'buscar_duplicado_propiedad',
    {
      title: 'Buscar si ya sigues una propiedad',
      description:
        'Úsala antes de crear. seguro: la misma URL. candidatos: misma dirección o pin a menos de 30 m.',
      inputSchema: {
        url: z.string().optional(),
        direccion: z.string().optional(),
        comuna: z.string().optional(),
        dormitorios: z.number().int().optional(),
      },
      annotations: lectura,
    },
    (a) =>
      correr(async () => {
        const r = await c.buscarDuplicados(a);
        const texto = r.seguro
          ? `Ya la sigues: ${fila(r.seguro)}`
          : r.candidatos.length
            ? `Posibles duplicados:\n${r.candidatos.map(fila).join('\n')}`
            : 'No la sigues todavía.';
        return ok(texto);
      }),
  );

  s.registerTool(
    'crear_propiedad',
    {
      title: 'Agregar una propiedad de arriendo',
      description:
        'Con su publicación (canal y URL), contactos y una nota. La misma URL que otra devuelve YA_EXISTE con su id; ' +
        'con unirA suma la publicación a esa propiedad. La respuesta trae posiblesDuplicados por dirección.',
      inputSchema: {
        ...datos,
        estado: z
          .enum(ESTADOS)
          .optional()
          .describe('vista por defecto (para importar avisos viejos en otro estado)'),
        publicacion: z
          .object({ canalId: z.string().optional(), url: z.string().optional(), precio: precio.optional() })
          .optional(),
        contactos: z.array(contacto).optional(),
        nota: z.string().optional(),
        unirA: z.string().optional(),
        ...(fotos
          ? { fotos: listaDeFotos.optional().describe('Fotos del aviso; la primera queda de portada') }
          : {}),
      },
    },
    ({ fotos: fuentes, ...a }: { fotos?: string[] } & Record<string, unknown>) =>
      correr(async () => {
        const r = await c.crear(a as Parameters<CasosDeArriendos['crear']>[0], 'ia');
        const dup = r.posiblesDuplicados.length
          ? `\n¿Es la misma que alguna de estas? (unir_propiedades)\n${r.posiblesDuplicados.map(fila).join('\n')}`
          : '';
        const conFotos =
          fotos && fuentes?.length ? `\n${textoFotos(await fotos.agregar(r.propiedad.id, fuentes))}` : '';
        const p = conFotos ? await c.ver(r.propiedad.id) : r.propiedad;
        return ok(`${r.unida ? 'Publicación unida a' : 'Creada'}: ${fila(p)}${dup}${conFotos}`);
      }),
  );

  s.registerTool(
    'editar_propiedad',
    {
      title: 'Editar los datos de una propiedad',
      description: 'Cambia solo lo que mandas; null borra un dato.',
      inputSchema: { id: z.string(), ...datos },
    },
    ({ id, ...resto }) => correr(async () => ok(`Actualizada: ${fila(await c.editar(id, resto))}`)),
  );

  s.registerTool(
    'cambiar_estado_propiedad',
    {
      title: 'Mover una propiedad de estado',
      description:
        'Mira transicionesPosibles en ver_propiedad. rechazada, descartada y no_disponible piden motivo; visita_agendada pide fechaVisita (ISO); ' +
        'en_evaluacion acepta los documentos enviados.',
      inputSchema: {
        id: z.string(),
        a: z.enum(ESTADOS),
        motivo: z.string().optional(),
        fechaVisita: z.string().optional(),
        documentos: z.array(z.string()).optional(),
      },
    },
    ({ id, ...e }) => correr(async () => ok(`Ahora: ${fila(await c.cambiarEstado(id, e, 'ia'))}`)),
  );

  s.registerTool(
    'agregar_publicacion',
    {
      title: 'Sumar otra publicación a una propiedad',
      description: 'La misma propiedad en otro portal o canal.',
      inputSchema: {
        id: z.string(),
        canalId: z.string().optional(),
        url: z.string().optional(),
        precio: precio.optional(),
      },
    },
    ({ id, ...e }) =>
      correr(async () => ok(`Publicación sumada: ${fila(await c.agregarPublicacion(id, e))}`)),
  );

  s.registerTool(
    'unir_propiedades',
    {
      title: 'Unir dos propiedades duplicadas',
      description: 'origenId se suma a destinoId (publicaciones, contactos, notas, señales) y desaparece.',
      inputSchema: { destinoId: z.string(), origenId: z.string() },
    },
    ({ destinoId, origenId }) => correr(async () => ok(`Unidas: ${fila(await c.unir(destinoId, origenId))}`)),
  );

  s.registerTool(
    'registrar_contacto_propiedad',
    {
      title: 'Agregar o completar un contacto de una propiedad',
      description:
        'Corredor, dueño, conserje… Se reconoce por teléfono, correo o nombre y se completa sin borrar.',
      inputSchema: { id: z.string(), contacto },
    },
    ({ id, contacto: datosContacto }) =>
      correr(async () => {
        const r = await c.registrarContacto(id, datosContacto);
        return ok(`Contacto ${r.contactoId} en ${r.propiedad.titulo}`);
      }),
  );

  s.registerTool(
    'registrar_interaccion_arriendo',
    {
      title: 'Registrar un mensaje, llamada o nota con un contacto',
      description:
        'Con contactoId o los datos del contacto. Di el canal (whatsapp, correo, telefono, el portal). Idempotente por referenciaExterna. ' +
        'El primer mensaje enviado pasa la propiedad a contactada.',
      inputSchema: {
        id: z.string(),
        contactoId: z.string().optional(),
        contacto: contacto.optional(),
        tipo: z.enum(TIPOS_DE_INTERACCION),
        resumen: z.string(),
        ocurridaEn: z.string().optional().describe('ISO; por defecto ahora'),
        canalId: z.string().optional(),
        referenciaExterna: z.string().optional(),
      },
    },
    ({ id, ...e }) =>
      correr(async () => {
        const r = await c.registrarInteraccion(id, e, 'ia');
        return ok(`${r.registrada ? 'Registrada' : 'Ya estaba'}: ${fila(r.propiedad)}`);
      }),
  );

  s.registerTool(
    'agendar_visita',
    {
      title: 'Agendar una visita',
      description: 'Si la propiedad está en vista o contactada, pasa a visita_agendada.',
      inputSchema: {
        id: z.string(),
        fecha: z.string().describe('ISO con hora'),
        notas: z.string().optional(),
      },
    },
    ({ id, ...e }) => correr(async () => ok(`Visita agendada: ${fila(await c.agendarVisita(id, e))}`)),
  );

  s.registerTool(
    'agregar_nota_propiedad',
    { title: 'Agregar una nota a una propiedad', inputSchema: { id: z.string(), texto: z.string() } },
    ({ id, texto }) => correr(async () => ok(`Nota agregada a ${(await c.agregarNota(id, texto)).titulo}`)),
  );

  s.registerTool(
    'registrar_senal_arriendo',
    {
      title: 'Registrar evidencia de un arriendo',
      description:
        'Un correo, un mensaje o lo que viste en un portal. Con propiedadId o la url de la publicación va a esa propiedad; si no, a la Bandeja de Arriendos. ' +
        'Desde la IA nunca cambia el estado sola: queda como sugerencia.',
      inputSchema: {
        propiedadId: z.string().optional(),
        url: z.string().optional(),
        fuente: z.enum(FUENTES_DE_SENAL).optional().describe('ia por defecto'),
        resumen: z.string(),
        estadoSugerido: z.enum(ESTADOS).optional(),
        confianza: z.number().min(0).max(1).optional(),
        canalId: z.string().optional(),
        referenciaExterna: z.string().optional(),
        direccion: z.string().optional(),
        comuna: z.string().optional(),
      },
    },
    (a) =>
      correr(async () => {
        const r = await c.registrarSenal({ ...a, fuente: a.fuente ?? 'ia' });
        return ok(
          r.destino === 'bandeja'
            ? 'Quedó en la Bandeja de Arriendos'
            : r.destino === 'repetida'
              ? 'Esa señal ya estaba'
              : `Registrada en la propiedad ${r.propiedadId}${r.aplicada ? ' (cambió el estado)' : ''}`,
          r,
        );
      }),
  );

  s.registerTool(
    'listar_bandeja_arriendos',
    {
      title: 'Señales de arriendo sin propiedad',
      description:
        'Lo que llegó sin saber de qué propiedad es. Asócialas con asociar_senal_arriendo o crea la propiedad.',
      inputSchema: {},
      annotations: lectura,
    },
    () =>
      correr(async () => {
        const b = await c.listarBandeja();
        return ok(`${b.length} señales en la Bandeja de Arriendos`, b);
      }),
  );

  s.registerTool(
    'asociar_senal_arriendo',
    {
      title: 'Llevar una señal de la Bandeja a una propiedad',
      inputSchema: { senalId: z.string(), propiedadId: z.string() },
    },
    ({ senalId, propiedadId }) =>
      correr(async () => ok(`Asociada: ${fila(await c.asociarSenal(senalId, propiedadId))}`)),
  );

  s.registerTool(
    'listar_canales',
    {
      title: 'Canales de arriendo',
      description:
        'Portales, WhatsApp, correo, teléfono y corredoras, con su id para usarlo en publicaciones y contactos.',
      inputSchema: {},
      annotations: lectura,
    },
    () =>
      correr(async () => {
        const cs = await c.listarCanales();
        return ok(
          cs.map((x) => `${x.id} · ${x.nombre} · ${x.tipo}${x.activo ? '' : ' (inactivo)'}`).join('\n'),
        );
      }),
  );

  s.registerTool(
    'registrar_canal',
    {
      title: 'Agregar un portal o canal',
      description:
        'Un portal, corredora o medio nuevo, con sus dominios web para reconocer sus URLs y correos. Si el id existe, lo actualiza.',
      inputSchema: {
        id: z.string().optional(),
        nombre: z.string(),
        tipo: z.enum(TIPOS_DE_CANAL).optional(),
        dominios: z.array(z.string()).optional(),
      },
    },
    (a) =>
      correr(async () => {
        const r = await c.registrarCanal(a);
        return ok(`Canal ${r.id} · ${r.nombre}`);
      }),
  );

  registrarHerramientasDeSeguimiento(s, c);
  if (fotos) registrarHerramientasDeFotos(s, fotos);
}

/** Lo que la consola hace y faltaba por MCP: señales, discrepancias, visitas, contactos, ubicación, canales y UF. */
function registrarHerramientasDeSeguimiento(s: McpServer, c: CasosDeArriendos): void {
  s.registerTool(
    'aplicar_senal_arriendo',
    {
      title: 'Aplicar una señal a una propiedad',
      description:
        'Mueve la propiedad al estado que sugiere la señal. Las señales están en ver_propiedad; úsala cuando la persona confirme la sugerencia.',
      inputSchema: { id: z.string(), senalId: z.string() },
    },
    ({ id, senalId }) =>
      correr(async () => ok(`Señal aplicada: ${fila(await c.aplicarSenal(id, senalId, 'ia'))}`)),
  );

  s.registerTool(
    'resolver_discrepancia_propiedad',
    {
      title: 'Cerrar una discrepancia de una propiedad',
      description:
        'Cuando la persona revisó el aviso (un estado que no calza con la evidencia o una visita sin registro) y está bien así. Las discrepancias están en ver_propiedad.',
      inputSchema: { id: z.string(), discrepanciaId: z.string() },
    },
    ({ id, discrepanciaId }) =>
      correr(async () =>
        ok(`Discrepancia resuelta: ${fila(await c.resolverDiscrepancia(id, discrepanciaId))}`),
      ),
  );

  s.registerTool(
    'cambiar_visita',
    {
      title: 'Marcar una visita como hecha o cancelada',
      description: 'El visitaId sale de ver_propiedad (visitas). agendada la reabre.',
      inputSchema: {
        id: z.string(),
        visitaId: z.string(),
        estado: z.enum(['agendada', 'hecha', 'cancelada']),
      },
    },
    ({ id, visitaId, estado }) =>
      correr(async () => ok(`Visita ${estado}: ${fila(await c.cambiarVisita(id, visitaId, estado))}`)),
  );

  s.registerTool(
    'quitar_contacto_propiedad',
    {
      title: 'Quitar un contacto de una propiedad',
      description: 'Solo si la persona lo pide (por ejemplo, un contacto que no era de esta propiedad).',
      inputSchema: { id: z.string(), contactoId: z.string() },
      annotations: { destructiveHint: true, openWorldHint: false },
    },
    ({ id, contactoId }) =>
      correr(async () => ok(`Contacto quitado: ${fila(await c.quitarContacto(id, contactoId))}`)),
  );

  s.registerTool(
    'borrar_propiedad',
    {
      title: 'Borrar una propiedad',
      description:
        'La borra con sus fotos, sin vuelta atrás. Úsala solo si la persona lo pide de forma explícita; ' +
        'para lo que ya no interesa, usa cambiar_estado_propiedad a descartada, y para duplicados, unir_propiedades.',
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: true, openWorldHint: false },
    },
    ({ id }) =>
      correr(async () => {
        const p = await c.ver(id);
        await c.borrar(id);
        return ok(`Borrada: ${p.titulo}`);
      }),
  );

  s.registerTool(
    'fijar_ubicacion_propiedad',
    {
      title: 'Poner la propiedad en el mapa',
      description:
        'Latitud y longitud (por ejemplo, las del aviso). Queda fija: la ubicación automática no la mueve.',
      inputSchema: {
        id: z.string(),
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
      },
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    ({ id, lat, lon }) => correr(async () => ok(`Ubicada: ${fila(await c.fijarUbicacion(id, lat, lon))}`)),
  );

  s.registerTool(
    'descartar_senal_arriendo',
    {
      title: 'Descartar una señal de la Bandeja de Arriendos',
      description: 'Cuando no es de ninguna propiedad que te interese.',
      inputSchema: { senalId: z.string() },
    },
    ({ senalId }) =>
      correr(async () => {
        await c.descartarSenal(senalId);
        return ok('Señal descartada');
      }),
  );

  s.registerTool(
    'editar_canal',
    {
      title: 'Editar un canal de arriendo',
      description:
        'Nombre, tipo, dominios web o activo (false lo oculta sin borrarlo). El id sale de listar_canales.',
      inputSchema: {
        id: z.string(),
        nombre: z.string().optional(),
        tipo: z.enum(TIPOS_DE_CANAL).optional(),
        dominios: z.array(z.string()).optional(),
        activo: z.boolean().optional(),
      },
    },
    ({ id, ...e }) =>
      correr(async () => {
        const r = await c.editarCanal(id, e);
        return ok(`Canal ${r.id} · ${r.nombre}${r.activo ? '' : ' (inactivo)'}`);
      }),
  );

  s.registerTool(
    'fijar_uf',
    {
      title: 'Guardar el valor de la UF',
      description: 'Para comparar en pesos los arriendos publicados en UF. Usa el valor oficial del día.',
      inputSchema: {
        valor: z.number().min(1000).max(1_000_000).describe('Pesos por UF, por ejemplo 39500.12'),
        fecha: z.string().describe('AAAA-MM-DD del valor'),
      },
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    ({ valor, fecha }) =>
      correr(async () => {
        await c.fijarUf(valor, fecha);
        return ok(`UF guardada: $${valor.toLocaleString('es-CL')} al ${fecha}`);
      }),
  );
}

/** Fotos de las propiedades (docs/diseno/fotos-propiedades.md §5). */
function registrarHerramientasDeFotos(s: McpServer, f: CasosDeFotos): void {
  s.registerTool(
    'agregar_fotos',
    {
      title: 'Agregar fotos a una propiedad',
      description:
        'Por URL (Brecha descarga la imagen y la guarda en el equipo: los avisos se caen) o por ruta de un archivo del equipo. ' +
        'Cada una por separado: si una falla, las demás entran igual y la respuesta dice por qué. La misma imagen dos veces no se repite. ' +
        `Hasta ${LIMITES_DE_FOTOS.porLlamada} por vez y ${LIMITES_DE_FOTOS.porPropiedad} por propiedad. Solo URL de internet pública (no locales ni privadas).`,
      inputSchema: {
        id: z.string().describe('Id de la propiedad'),
        fotos: listaDeFotos,
        portada: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Posición en fotos (desde 0) de la que va de portada; si no, queda la que estaba'),
      },
      annotations: { openWorldHint: true },
    },
    ({ id, fotos, portada }) =>
      correr(async () => {
        const r = await f.agregar(id, fotos, portada);
        const todasFallaron = r.resultados.every((x) => x.estado === 'error');
        const res = ok(textoFotos(r));
        return todasFallaron ? { ...res, isError: true } : res;
      }),
  );

  s.registerTool(
    'listar_fotos',
    {
      title: 'Ver las fotos de una propiedad',
      description: 'En orden; la primera es la portada. Con su id para quitar_foto o elegir_portada.',
      inputSchema: { id: z.string() },
      annotations: lectura,
    },
    ({ id }) =>
      correr(async () => {
        const lista = await f.listar(id);
        return ok(
          lista.length ? `${lista.length} fotos\n${lista.map(filaFoto).join('\n')}` : 'No tiene fotos.',
        );
      }),
  );

  s.registerTool(
    'quitar_foto',
    {
      title: 'Quitar una foto',
      description: 'Borra la foto y su archivo. Si era la portada, la siguiente pasa a serlo.',
      inputSchema: { id: z.string(), fotoId: z.string() },
      annotations: { destructiveHint: true, openWorldHint: false },
    },
    ({ id, fotoId }) =>
      correr(async () => {
        const lista = await f.quitar(id, fotoId);
        return ok(
          `Quitada. Quedan ${lista.length}${lista.length ? `\n${lista.map(filaFoto).join('\n')}` : '.'}`,
        );
      }),
  );

  s.registerTool(
    'elegir_portada',
    {
      title: 'Elegir la foto de portada',
      description: 'La pasa al frente; las demás quedan en su orden.',
      inputSchema: { id: z.string(), fotoId: z.string() },
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    ({ id, fotoId }) =>
      correr(async () => {
        const lista = await f.elegirPortada(id, fotoId);
        return ok(`Portada elegida\n${lista.map(filaFoto).join('\n')}`);
      }),
  );
}
