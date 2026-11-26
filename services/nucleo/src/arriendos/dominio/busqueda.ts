import {
  anotarCambio,
  aplicarCambios,
  describirRegla,
  hayCambiosDeReglas,
  reglaGuardada,
  type CambioDePerfil,
  type Catalogo,
  type EntradaCambios,
  type Regla as ReglaDelPerfil,
} from '../../compartido/dominio/perfil';
import type { Deps } from '../../compartido/dominio/puertos';
import type { DatosDeLaPropiedad } from './propiedad';
import {
  comunaNormalizada,
  DatoInvalido,
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

/** Una regla de la búsqueda de arriendo: la regla común del perfil (perfil.md §3.2) con un criterio de Arriendos. */
export type Regla = ReglaDelPerfil<Criterio>;

export interface Persona {
  readonly rentaLiquida?: number;
  readonly tieneAval?: boolean;
  readonly tieneMascota?: boolean;
}

export type CambioDeBusqueda = CambioDePerfil;

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
      {
        id: 'inicial-renta',
        texto: describirValor('renta_exigida', undefined),
        criterio: 'renta_exigida',
        dura: true,
        etiquetas: [],
      },
      {
        id: 'inicial-aval',
        texto: describirValor('aval', undefined),
        criterio: 'aval',
        dura: true,
        etiquetas: [],
      },
    ],
    persona: {},
    historial: [],
    actualizadaEn: null,
  };
}

function valorValido(criterio: Criterio, v: unknown): unknown {
  switch (VALOR[criterio]) {
    case 'monto':
      return numero(`valor (${criterio})`, v, 0, 1e10);
    case 'minimo':
      return numero(`valor (${criterio})`, v, 0, 100_000);
    case 'lista': {
      const lista = Array.isArray(v) ? v : vacio(v) ? [] : String(v).split(',');
      const limpia = lista.map((x) => (typeof x === 'string' ? x.trim() : x)).filter((x) => !vacio(x));
      if (!limpia.length) throw new DatoInvalido(`valor (${criterio})`, 'Pon al menos una opción');
      const valores =
        criterio === 'tipo'
          ? limpia.map((x) => uno('valor (tipo)', TIPOS_DE_PROPIEDAD, x))
          : limpia.map((x) => texto(`valor (${criterio})`, x, 100));
      return [...new Set(valores)];
    }
    case 'siNo':
      return siNoOpcional(`valor (${criterio})`, v) ?? true;
    case 'fecha':
      return fecha(`valor (${criterio})`, v);
    case 'persona':
      return undefined;
  }
}

/** Lo que Arriendos sabe revisar por código (el calce de abajo). */
export const CATALOGO: Catalogo<Criterio> = {
  criterios: CRITERIOS,
  valor: (c, v) => valorValido(c, v),
  describir: (c, v) => describirValor(c, v),
};

export interface EntradaBusqueda extends EntradaCambios {
  persona?: Partial<Record<keyof Persona, unknown>> | null;
  motivo: unknown;
}

export class Busqueda {
  private constructor(private d: DatosBusqueda) {}

  /** Las reglas guardadas antes del perfil reciben su texto y etiquetas vacías (PB-D11). */
  static reconstituir(d: DatosBusqueda): Busqueda {
    const copia = structuredClone(d);
    copia.reglas = copia.reglas.map((r) => reglaGuardada(r, CATALOGO));
    return new Busqueda(copia);
  }

  datos(): DatosBusqueda {
    return structuredClone(this.d);
  }

  /**
   * Cambia las reglas (de a una o la lista entera) y los datos de la persona. Siempre con motivo: queda en el
   * historial para que tu IA sepa por qué y cuándo cambió (P4 de arriendos.md, PB-D2).
   */
  cambiar(e: EntradaBusqueda, origen: Origen, deps: Deps): void {
    const reglas = hayCambiosDeReglas(e) ? aplicarCambios(this.d.reglas, e, CATALOGO, deps) : this.d.reglas;
    let persona = this.d.persona;
    if (e.persona) {
      const p = e.persona;
      const nueva: Record<string, unknown> = { ...this.d.persona };
      const fijar = (k: keyof Persona, v: unknown) => {
        if (v === undefined) Reflect.deleteProperty(nueva, k);
        else nueva[k] = v;
      };
      if ('rentaLiquida' in p)
        fijar('rentaLiquida', numeroOpcional('persona.rentaLiquida', p.rentaLiquida, 0, 1e10));
      if ('tieneAval' in p) fijar('tieneAval', siNoOpcional('persona.tieneAval', p.tieneAval));
      if ('tieneMascota' in p) fijar('tieneMascota', siNoOpcional('persona.tieneMascota', p.tieneMascota));
      persona = nueva as Persona;
    }
    const ahora = deps.reloj.ahora();
    this.d.historial = anotarCambio(this.d.historial, reglas, { motivo: e.motivo, origen }, ahora);
    this.d.reglas = reglas;
    this.d.persona = persona;
    this.d.actualizadaEn = ahora;
  }
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

/** «Arriendo más gastos comunes hasta $650.000», «Tipo: casa». */
export function describirValor(c: Criterio, v: unknown): string {
  switch (VALOR[c]) {
    case 'monto':
      return `${NOMBRE[c]} hasta ${pesos(v as number)}`;
    case 'minimo':
      return `${NOMBRE[c]}: ${v as number} o más`;
    case 'lista':
      return `${NOMBRE[c]}: ${(v as string[]).join(', ')}`;
    case 'siNo':
      return `${NOMBRE[c]}: ${v ? 'sí' : 'no'}`;
    case 'fecha':
      return `${NOMBRE[c]} ${v as string}`;
    default:
      return NOMBRE[c];
  }
}

/** «Dura · Arriendo más gastos comunes hasta $650.000 #plata», «P1 · Tipo: casa». */
export function describir(r: Regla): string {
  return describirRegla(r);
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

function revisar(
  r: Regla & { criterio: Criterio },
  p: DatosDeLaPropiedad,
  persona: Persona,
  uf: number | null,
): Resultado {
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
    // Una regla sin criterio la aplica tu IA leyéndola; el calce no la cuenta.
    if (!r.criterio) continue;
    const res = revisar(r as Regla & { criterio: Criterio }, p, b.persona, uf);
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
