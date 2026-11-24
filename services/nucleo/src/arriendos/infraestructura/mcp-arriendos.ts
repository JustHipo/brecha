import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ErrorDeDominio } from '../../compartido/dominio/error-de-dominio';
import type { CasosDeArriendos, VistaPropiedad } from '../aplicacion/casos';
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
  'Si un portal o canal no existe, créalo con registrar_canal. Brecha no automatiza portales ni WhatsApp: lo revisas desde el navegador de la persona o ella te lo cuenta.';

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
  return `${v.titulo} · ${v.estado} · ${pesos(v.precioPesos)} · ${calce}${brecha}${pend} · id ${v.id}`;
}

const lectura = { readOnlyHint: true, openWorldHint: false };

/** Las herramientas MCP de Arriendos. Lo que hacen queda con origen `ia`. */
export function registrarHerramientasDeArriendos(s: McpServer, c: CasosDeArriendos): void {
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
      },
    },
    (a) =>
      correr(async () => {
        const r = await c.crear(a, 'ia');
        const dup = r.posiblesDuplicados.length
          ? `\n¿Es la misma que alguna de estas? (unir_propiedades)\n${r.posiblesDuplicados.map(fila).join('\n')}`
          : '';
        return ok(`${r.unida ? 'Publicación unida a' : 'Creada'}: ${fila(r.propiedad)}${dup}`);
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
}
