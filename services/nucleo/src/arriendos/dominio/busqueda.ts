import type { Deps } from '../../compartido/dominio/puertos';
import type { DatosDeLaPropiedad } from './propiedad';
import {
  comunaNormalizada,
  DatoInvalido,
  entero,
  fecha,
  numero,
  numeroOpcional,
  siNoOpcional,
  texto,
  TIPOS_DE_PROPIEDAD,
  uno,
  vacio,
  type Origen,
} from './valores';

/**
 * Lo que buscas (docs/diseno/arriendos.md §5.4, P4 y P7): reglas duras (si falla, la propiedad no sirve) y
 * blandas con prioridad (P1 pesa más que P2). Tu IA la lee antes de buscar y te pregunta antes de cambiarla.
 */
export const CRITERIOS = [
  'presupuesto_total',
  'gastos_comunes',
  'comuna',
  'tipo',
  'dormitorios',
  'banos',
  'm2',
  'mascota',
  'estacionamiento',
  'amoblado',
  'renta_exigida',
  'aval',
  'disponible_desde',
] as const;
export type Criterio = (typeof CRITERIOS)[number];

/** Qué valor lleva cada criterio. */
const VALOR: Record<Criterio, 'monto' | 'lista' | 'minimo' | 'siNo' | 'persona' | 'fecha'> = {
  presupuesto_total: 'monto',
  gastos_comunes: 'monto',
  comuna: 'lista',
  tipo: 'lista',
  dormitorios: 'minimo',
  banos: 'minimo',
  m2: 'minimo',
  mascota: 'siNo',
  estacionamiento: 'siNo',
  amoblado: 'siNo',
  renta_exigida: 'persona',
  aval: 'persona',
  disponible_desde: 'fecha',
};

export interface Regla {
  readonly id: string;
  readonly criterio: Criterio;
  /** Monto máximo, mínimo, lista, sí o no, o fecha máxima; nada para las de la persona. */
  readonly valor?: number | string[] | boolean | string;
  readonly dura: boolean;
  /** Solo las blandas: 1 es la más importante. */
  readonly prioridad?: number;
}

export interface Persona {
  readonly rentaLiquida?: number;
  readonly tieneAval?: boolean;
  readonly tieneMascota?: boolean;
}

export interface CambioDeBusqueda {
  readonly ocurridoEn: Date;
  readonly origen: Origen;
  readonly motivo: string;
  /** Las reglas como quedaron, en una línea cada una. */
  readonly resumen: string[];
}

export interface DatosBusqueda {
  reglas: Regla[];
  persona: Persona;
  historial: CambioDeBusqueda[];
  actualizadaEn: Date | null;
}

/**
 * P7 de Juan: presupuesto, gastos comunes, comuna, dormitorios, mascota, estacionamiento, renta exigida, aval y
 * amoblado, todas duras. Las que necesitan un valor las propone la consola para completar; las que dependen de
 * tus datos (renta y aval) vienen puestas desde el inicio.
 */
export const CRITERIOS_SUGERIDOS: readonly Criterio[] = [
  'presupuesto_total',
  'gastos_comunes',
  'comuna',
  'dormitorios',
  'mascota',
  'estacionamiento',
  'renta_exigida',
  'aval',
  'amoblado',
];

export function busquedaVacia(): DatosBusqueda {
  return {
    reglas: [
      { id: 'inicial-renta', criterio: 'renta_exigida', dura: true },
      { id: 'inicial-aval', criterio: 'aval', dura: true },
    ],
    persona: {},
    historial: [],
    actualizadaEn: null,
  };
}

export type EntradaRegla = { criterio: unknown; valor?: unknown; dura?: unknown; prioridad?: unknown };

function reglaValida(e: EntradaRegla, id: string): Regla {
  const criterio = uno('criterio', CRITERIOS, e.criterio);
  const dura = siNoOpcional('dura', e.dura) ?? true;
  const prioridad = dura ? undefined : vacio(e.prioridad) ? 1 : entero('prioridad', e.prioridad, 1, 20);
  const base = { id, criterio, dura, ...(prioridad ? { prioridad } : {}) };
  switch (VALOR[criterio]) {
    case 'monto':
      return { ...base, valor: numero(`valor (${criterio})`, e.valor, 0, 1e10) };
    case 'minimo':
      return { ...base, valor: numero(`valor (${criterio})`, e.valor, 0, 100_000) };
    case 'lista': {
      const lista = Array.isArray(e.valor) ? e.valor : vacio(e.valor) ? [] : [e.valor];
      if (!lista.length) throw new DatoInvalido(`valor (${criterio})`, 'Pon al menos una opción');
      const valores =
        criterio === 'tipo'
          ? lista.map((v) => uno('valor (tipo)', TIPOS_DE_PROPIEDAD, v))
          : lista.map((v) => texto(`valor (${criterio})`, v, 100));
      return { ...base, valor: [...new Set(valores)] };
    }
    case 'siNo': {
      const v = siNoOpcional(`valor (${criterio})`, e.valor);
      return { ...base, valor: v ?? true };
    }
    case 'fecha':
      return { ...base, valor: fecha(`valor (${criterio})`, e.valor) };
    case 'persona':
      return base;
  }
}

export class Busqueda {
  private constructor(private d: DatosBusqueda) {}

  static reconstituir(d: DatosBusqueda): Busqueda {
    return new Busqueda(structuredClone(d));
  }

  datos(): DatosBusqueda {
    return structuredClone(this.d);
  }

  /**
   * Cambia las reglas y los datos de la persona. Siempre con motivo: queda en el historial para que tu IA
   * sepa por qué y cuándo cambió (P4). Con `reglas` reemplaza la lista entera; sin ella, la deja igual.
   */
  cambiar(
    e: { reglas?: unknown; persona?: Partial<Record<keyof Persona, unknown>> | null; motivo: unknown },
    origen: Origen,
    deps: Deps,
  ): void {
    const motivo = texto('motivo', e.motivo, 500);
    if (e.reglas !== undefined) {
      if (!Array.isArray(e.reglas)) throw new DatoInvalido('reglas', 'Las reglas van en una lista');
      if (e.reglas.length > 40) throw new DatoInvalido('reglas', 'Hasta 40 reglas');
      this.d.reglas = (e.reglas as EntradaRegla[]).map((r) => reglaValida(r, deps.ids.nuevo()));
      ordenarBlandas(this.d.reglas);
    }
    if (e.persona) {
      const p = e.persona;
      const persona: Persona = { ...this.d.persona };
      const fijar = <K extends keyof Persona>(k: K, v: Persona[K] | undefined) => {
        if (v === undefined) delete (persona as Record<string, unknown>)[k];
        else (persona as Record<string, unknown>)[k] = v;
      };
      if ('rentaLiquida' in p)
        fijar('rentaLiquida', numeroOpcional('persona.rentaLiquida', p.rentaLiquida, 0, 1e10));
      if ('tieneAval' in p) fijar('tieneAval', siNoOpcional('persona.tieneAval', p.tieneAval));
      if ('tieneMascota' in p) fijar('tieneMascota', siNoOpcional('persona.tieneMascota', p.tieneMascota));
      this.d.persona = persona;
    }
    const ahora = deps.reloj.ahora();
    this.d.historial.push({ ocurridoEn: ahora, origen, motivo, resumen: this.d.reglas.map(describir) });
    if (this.d.historial.length > 200) this.d.historial = this.d.historial.slice(-200);
    this.d.actualizadaEn = ahora;
  }
}

/** Las blandas quedan con prioridades seguidas (1, 2, 3…) respetando el orden pedido. */
function ordenarBlandas(reglas: Regla[]): void {
  const blandas = reglas
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !r.dura)
    .sort((a, b) => (a.r.prioridad ?? 1) - (b.r.prioridad ?? 1) || a.i - b.i);
  blandas.forEach(({ i }, n) => {
    const r = reglas[i]!;
    reglas[i] = { ...r, prioridad: n + 1 };
  });
}

const NOMBRE: Record<Criterio, string> = {
  presupuesto_total: 'Arriendo más gastos comunes',
  gastos_comunes: 'Gastos comunes',
  comuna: 'Comuna',
  tipo: 'Tipo',
  dormitorios: 'Dormitorios',
  banos: 'Baños',
  m2: 'm² útiles',
  mascota: 'Acepta mascota',
  estacionamiento: 'Estacionamiento',
  amoblado: 'Amoblado',
  renta_exigida: 'Renta exigida que cumples',
  aval: 'Aval (si lo piden, lo tienes)',
  disponible_desde: 'Disponible a más tardar',
};

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** «Dura · Arriendo más gastos comunes hasta $650.000», «P1 · Tipo: casa». */
export function describir(r: Regla): string {
  const quien = r.dura ? 'Dura' : `P${r.prioridad ?? 1}`;
  const v = r.valor;
  let que: string;
  switch (VALOR[r.criterio]) {
    case 'monto':
      que = `${NOMBRE[r.criterio]} hasta ${pesos(v as number)}`;
      break;
    case 'minimo':
      que = `${NOMBRE[r.criterio]}: ${v as number} o más`;
      break;
    case 'lista':
      que = `${NOMBRE[r.criterio]}: ${(v as string[]).join(', ')}`;
      break;
    case 'siNo':
      que = `${NOMBRE[r.criterio]}: ${v ? 'sí' : 'no'}`;
      break;
    case 'fecha':
      que = `${NOMBRE[r.criterio]} ${v as string}`;
      break;
    default:
      que = NOMBRE[r.criterio];
  }
  return `${quien} · ${que}`;
}

// ── Calce ──

export interface Brecha {
  readonly reglaId: string;
  readonly criterio: Criterio;
  readonly dura: boolean;
  readonly prioridad?: number;
  /** En palabras, para la consola y la IA: «se pasa $40.000 del presupuesto». */
  readonly texto: string;
}

export interface Calce {
  /** 0 a 100; null si no hay reglas que se puedan revisar. */
  readonly puntaje: number | null;
  readonly cumpleDuras: boolean;
  readonly brechas: Brecha[];
  /** Reglas que no se pudieron revisar porque al aviso le falta el dato. */
  readonly sinDato: { reglaId: string; criterio: Criterio; texto: string }[];
}

type Resultado = { cumple: boolean; texto?: string } | null;

/** Precio en pesos: CLP tal cual, UF por el valor del día; null si es UF y no sabemos la UF. */
export function precioEnPesos(d: Pick<DatosDeLaPropiedad, 'precio'>, uf: number | null): number | null {
  if (!d.precio) return null;
  if (d.precio.moneda === 'CLP') return d.precio.monto;
  return uf ? Math.round(d.precio.monto * uf) : null;
}

function revisar(r: Regla, p: DatosDeLaPropiedad, persona: Persona, uf: number | null): Resultado {
  const v = r.valor;
  switch (r.criterio) {
    case 'presupuesto_total': {
      const precio = precioEnPesos(p, uf);
      if (precio === null) return null;
      const total = precio + (p.gastosComunes ?? 0);
      return total <= (v as number)
        ? { cumple: true }
        : {
            cumple: false,
            texto: `Se pasa ${pesos(total - (v as number))} del presupuesto (${pesos(total)} con gastos comunes)`,
          };
    }
    case 'gastos_comunes':
      if (p.gastosComunes === undefined) return null;
      return p.gastosComunes <= (v as number)
        ? { cumple: true }
        : {
            cumple: false,
            texto: `Gastos comunes de ${pesos(p.gastosComunes)}, ${pesos(p.gastosComunes - (v as number))} más de lo que aceptas`,
          };
    case 'comuna': {
      if (!p.comuna) return null;
      const ok = (v as string[]).some((c) => comunaNormalizada(c) === comunaNormalizada(p.comuna!));
      return ok ? { cumple: true } : { cumple: false, texto: `Está en ${p.comuna}, fuera de tus comunas` };
    }
    case 'tipo':
      return (v as string[]).includes(p.tipo)
        ? { cumple: true }
        : { cumple: false, texto: `Es ${p.tipo}, no ${(v as string[]).join(' ni ')}` };
    case 'dormitorios':
    case 'banos':
    case 'm2': {
      const campo =
        r.criterio === 'm2' ? (p.m2Utiles ?? p.m2Totales) : r.criterio === 'banos' ? p.banos : p.dormitorios;
      if (campo === undefined) return null;
      const nombre = r.criterio === 'm2' ? 'm²' : r.criterio === 'banos' ? 'baños' : 'dormitorios';
      return campo >= (v as number)
        ? { cumple: true }
        : { cumple: false, texto: `Tiene ${campo} ${nombre}; buscas ${v as number} o más` };
    }
    case 'mascota':
      if (v === false) return { cumple: true };
      if (p.mascotas === undefined) return null;
      return p.mascotas ? { cumple: true } : { cumple: false, texto: 'No acepta mascotas' };
    case 'estacionamiento':
      if (p.estacionamientos === undefined) return null;
      if (v === false) return { cumple: true };
      return p.estacionamientos > 0 ? { cumple: true } : { cumple: false, texto: 'No tiene estacionamiento' };
    case 'amoblado':
      if (p.amoblado === undefined) return null;
      return p.amoblado === v
        ? { cumple: true }
        : { cumple: false, texto: p.amoblado ? 'Es amoblado y no lo quieres amoblado' : 'No es amoblado' };
    case 'renta_exigida': {
      const veces = p.requisitos.rentaVeces;
      const precio = precioEnPesos(p, uf);
      if (veces === undefined || precio === null || persona.rentaLiquida === undefined) return null;
      const pedida = veces * precio;
      if (persona.rentaLiquida >= pedida) return { cumple: true };
      const tuyas = (persona.rentaLiquida / precio).toFixed(1).replace('.', ',');
      return {
        cumple: false,
        texto: `Pide renta ${String(veces).replace('.', ',')}x (${pesos(pedida)}) y tienes ${tuyas}x`,
      };
    }
    case 'aval':
      if (p.requisitos.aval === undefined) return null;
      if (!p.requisitos.aval) return { cumple: true };
      if (persona.tieneAval === undefined) return null;
      return persona.tieneAval ? { cumple: true } : { cumple: false, texto: 'Pide aval y no tienes' };
    case 'disponible_desde':
      if (!p.disponibleDesde) return null;
      return p.disponibleDesde <= (v as string)
        ? { cumple: true }
        : {
            cumple: false,
            texto: `Disponible desde ${p.disponibleDesde}, después de tu mudanza (${v as string})`,
          };
  }
}

/** Por qué no se pudo revisar una regla: un dato del aviso o uno tuyo. */
function faltaDato(c: Criterio, p: DatosDeLaPropiedad, persona: Persona): string {
  if (c === 'renta_exigida' && persona.rentaLiquida === undefined && p.requisitos.rentaVeces !== undefined)
    return 'Renta exigida: falta tu renta líquida en Tu búsqueda';
  if (c === 'aval' && p.requisitos.aval === true && persona.tieneAval === undefined)
    return 'Aval: falta decir si tienes aval en Tu búsqueda';
  return `${NOMBRE[c]}: el aviso no lo dice`;
}

/**
 * Calce por código (A-D7): si falla una dura, 0 y esa brecha va primero. Si no, cada blanda pesa 1/prioridad
 * (P1 = 1, P2 = 0,5…) y el puntaje es lo cumplido sobre lo revisable. Las reglas sin dato no cuentan.
 */
export function calcularCalce(p: DatosDeLaPropiedad, b: DatosBusqueda, uf: number | null): Calce {
  const brechas: Brecha[] = [];
  const sinDato: Calce['sinDato'] = [];
  let posible = 0;
  let obtenido = 0;
  let revisadas = 0;
  for (const r of b.reglas) {
    const res = revisar(r, p, b.persona, uf);
    if (res === null) {
      sinDato.push({
        reglaId: r.id,
        criterio: r.criterio,
        texto: faltaDato(r.criterio, p, b.persona),
      });
      continue;
    }
    revisadas++;
    if (!res.cumple)
      brechas.push({
        reglaId: r.id,
        criterio: r.criterio,
        dura: r.dura,
        ...(r.prioridad ? { prioridad: r.prioridad } : {}),
        texto: res.texto ?? NOMBRE[r.criterio],
      });
    if (!r.dura) {
      const peso = 1 / (r.prioridad ?? 1);
      posible += peso;
      if (res.cumple) obtenido += peso;
    }
  }
  brechas.sort((a, b2) => Number(b2.dura) - Number(a.dura) || (a.prioridad ?? 0) - (b2.prioridad ?? 0));
  const cumpleDuras = !brechas.some((x) => x.dura);
  const puntaje =
    revisadas === 0 ? null : !cumpleDuras ? 0 : posible === 0 ? 100 : Math.round((obtenido / posible) * 100);
  return { puntaje, cumpleDuras, brechas, sinDato };
}
