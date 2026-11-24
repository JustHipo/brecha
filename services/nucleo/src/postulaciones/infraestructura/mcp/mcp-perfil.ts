import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { CasosDeArriendos } from '../../../arriendos/aplicacion/casos';
import { ErrorDeDominio } from '../../../compartido/dominio/error-de-dominio';
import { ReglaInvalida } from '../../../compartido/dominio/perfil';
import type { CasosDePerfil } from '../../aplicacion/casos-de-perfil';

/**
 * Protocolo del perfil de búsqueda para la IA (docs/diseno/perfil.md §4, PB-D2). Va en las instrucciones del
 * servidor MCP y se repite en la descripción de las herramientas que buscan o crean.
 */
export const INSTRUCCIONES_PERFIL =
  'Perfil de búsqueda: cada foco (empleo y arriendos) tiene reglas duras (descartan), blandas con prioridad (ordenan; P1 pesa más) y etiquetas. ' +
  'Antes de buscar, proponer o agregar ofertas de empleo o propiedades, lee el perfil de ese foco con ver_perfil y respétalo: no propongas lo que choca con una dura. ' +
  'Si la persona te pide buscar con un requisito que el perfil no dice o que choca con una regla (por ejemplo «busca también presencial en Concepción»), ' +
  'pregúntale si lo agrega al perfil o es solo para esta búsqueda; si dice que sí, cámbialo con editar_perfil y pon en el motivo lo que dijo. ' +
  'Nunca cambies el perfil sin preguntarle. Un choque con el perfil es un aviso: no cambies por eso el estado de una postulación ya enviada.';

const FOCOS = ['empleo', 'arriendos'] as const;
const foco = z.enum(FOCOS).describe('empleo (postulaciones) o arriendos (propiedades)');

const VALOR =
  'Solo con criterio. Empleo: titulo → { incluir: string[], excluir: string[] }; modalidad_por_region → ' +
  '{ valparaiso, santiago, otra: ("remoto"|"hibrido"|"presencial")[], noIndicaEsPresencialEn: plataformas[] }; ' +
  'sueldo_publicado → { minimo?: número } (sin mínimo, la renta pretendida). Arriendos: monto en pesos ' +
  '(presupuesto_total, gastos_comunes), mínimo (dormitorios, banos, m2), lista (comuna, tipo), sí/no (mascota, ' +
  'estacionamiento, amoblado), fecha AAAA-MM-DD (disponible_desde) o nada (renta_exigida, aval)';

const regla = {
  texto: z.string().optional().describe('La regla en palabras de la persona. Obligatorio si no hay criterio'),
  criterio: z
    .string()
    .optional()
    .describe('Solo si el código lo sabe revisar (mira criterios en ver_perfil); si no, deja solo el texto'),
  valor: z.unknown().optional().describe(VALOR),
  dura: z.boolean().optional().describe('true por defecto: descarta'),
  prioridad: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Solo blandas: 1 es la más importante; corre a las demás'),
  etiquetas: z
    .array(z.string())
    .optional()
    .describe('Etiquetas libres para agrupar (rol, ubicacion, sueldo…)'),
};

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

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

interface ReglaVista {
  id: string;
  texto: string;
  criterio?: string;
  valor?: unknown;
  dura: boolean;
  prioridad?: number;
  etiquetas: readonly string[];
  descripcion: string;
}

function lineas(reglas: readonly ReglaVista[]): string {
  if (!reglas.length) return '(sin reglas todavía)';
  return reglas
    .map((r) => `- ${r.descripcion} (id ${r.id}${r.criterio ? `; la revisa el código: ${r.criterio}` : ''})`)
    .join('\n');
}

const sinDescripcion = (rs: readonly ReglaVista[]) => rs.map(({ descripcion: _d, ...r }) => r);

const RECORDATORIO =
  'Las duras descartan; las blandas ordenan (P1 pesa más). Si la persona pide algo que esto no dice o que choca, ' +
  'pregúntale si lo agrega al perfil o es solo esta vez.';

const lectura = { readOnlyHint: true, openWorldHint: false };

/** `ver_perfil` y `editar_perfil` para los dos focos (PB-D13). Lo que cambian queda con origen `ia`. */
export function registrarHerramientasDePerfil(
  s: McpServer,
  perfil: CasosDePerfil,
  arriendos?: CasosDeArriendos,
): void {
  s.registerTool(
    'ver_perfil',
    {
      title: 'Ver el perfil de búsqueda',
      description:
        'Reglas duras y blandas (con prioridad y etiquetas), datos de la persona e historial de un foco. ' +
        'Léelo antes de buscar, proponer o agregar ofertas de empleo o propiedades, y respétalo.',
      inputSchema: { foco },
      annotations: lectura,
    },
    (a) =>
      correr(async () => {
        if (a.foco === 'arriendos') {
          if (!arriendos) throw new ReglaInvalida('foco', 'Esta instancia no tiene el foco Arriendos');
          const b = await arriendos.verBusqueda();
          const p = b.persona;
          const datos = [
            p.rentaLiquida !== undefined ? `renta líquida ${pesos(p.rentaLiquida)}` : '',
            p.tieneAval !== undefined ? (p.tieneAval ? 'tiene aval' : 'no tiene aval') : '',
            p.tieneMascota !== undefined ? (p.tieneMascota ? 'tiene mascota' : 'sin mascota') : '',
          ].filter(Boolean);
          return ok(
            `Perfil de búsqueda de Arriendos\nReglas:\n${lineas(b.reglas)}\n` +
              `Datos: ${datos.join(' · ') || '(sin datos)'}\n${RECORDATORIO}`,
            {
              reglas: sinDescripcion(b.reglas),
              datos: p,
              uf: b.uf,
              criterios: b.criterios,
              ultimosCambios: b.historial.slice(0, 5),
            },
          );
        }
        const v = await perfil.ver();
        const d = v.datos;
        const datos = [
          d.rentaPretendida !== undefined ? `renta pretendida ${pesos(d.rentaPretendida)} líquidos` : '',
          d.disponibleDesde ? `disponible desde ${d.disponibleDesde}` : '',
          d.notas ? `notas: ${d.notas}` : '',
        ].filter(Boolean);
        return ok(
          `Perfil de búsqueda de Empleo\nReglas:\n${lineas(v.reglas)}\n` +
            `Datos: ${datos.join(' · ') || '(sin datos)'}\n${RECORDATORIO}`,
          {
            reglas: sinDescripcion(v.reglas),
            datos: d,
            criterios: v.criterios,
            ultimosCambios: v.historial.slice(0, 5),
          },
        );
      }),
  );

  s.registerTool(
    'editar_perfil',
    {
      title: 'Cambiar el perfil de búsqueda',
      description:
        'Agrega, cambia, quita u ordena reglas, o cambia los datos de la persona, siempre con motivo (queda en el historial). ' +
        'Úsala solo después de preguntarle a la persona y que diga que sí: nunca por tu cuenta.',
      inputSchema: {
        foco,
        agregar: z.array(z.object(regla)).optional().describe('Reglas nuevas'),
        cambiar: z
          .array(z.object({ id: z.string(), ...regla }))
          .optional()
          .describe('Por id (ver_perfil); solo cambia lo que mandas'),
        quitar: z.array(z.string()).optional().describe('Id de las reglas que se quitan'),
        ordenar: z.array(z.string()).optional().describe('Id de las blandas en el orden nuevo, P1 primero'),
        datos: z
          .object({
            rentaPretendida: z.number().nullable().optional().describe('Empleo: pesos líquidos'),
            disponibleDesde: z.string().nullable().optional().describe('Empleo: AAAA-MM-DD'),
            notas: z.string().nullable().optional().describe('Empleo: texto libre'),
            rentaLiquida: z.number().nullable().optional().describe('Arriendos: tu renta líquida'),
            tieneAval: z.boolean().nullable().optional().describe('Arriendos'),
            tieneMascota: z.boolean().nullable().optional().describe('Arriendos'),
          })
          .optional()
          .describe('null borra un dato'),
        motivo: z.string().describe('Por qué cambia, con lo que dijo la persona; queda en el historial'),
      },
    },
    (a) =>
      correr(async () => {
        const { foco: f, datos, ...cambios } = a;
        const empleo = ['rentaPretendida', 'disponibleDesde', 'notas'] as const;
        const deArriendo = ['rentaLiquida', 'tieneAval', 'tieneMascota'] as const;
        const ajenos = (f === 'empleo' ? deArriendo : empleo).filter((k) => datos && k in datos);
        if (ajenos.length)
          throw new ReglaInvalida('datos', `${ajenos.join(', ')} no es un dato del foco ${f}`);
        if (f === 'arriendos') {
          if (!arriendos) throw new ReglaInvalida('foco', 'Esta instancia no tiene el foco Arriendos');
          const b = await arriendos.cambiarBusqueda(
            { ...cambios, ...(datos ? { persona: datos } : {}) },
            'ia',
          );
          return ok(`Perfil de Arriendos actualizado:\n${lineas(b.reglas)}`);
        }
        const v = await perfil.cambiar({ ...cambios, ...(datos ? { datos } : {}) }, 'ia');
        return ok(`Perfil de Empleo actualizado:\n${lineas(v.reglas)}`);
      }),
  );
}
