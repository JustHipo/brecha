// Tipos del contrato del núcleo. `api.d.ts` se genera: no se edita a mano.
import type { components, operations, paths } from './api';

export type { components, operations, paths };

type Esquemas = components['schemas'];
export type Resumen = Esquemas['ResumenPostulacionDto'];
export type Detalle = Esquemas['DetallePostulacionDto'];
export type Tablero = Esquemas['TableroDto'];
export type ColumnaTablero = Esquemas['ColumnaTableroDto'];
export type ListaPostulaciones = Esquemas['ListaPostulacionesDto'];
export type ErrorApi = Esquemas['ErrorDto'];
export type CodigoError = Esquemas['ErrorDto']['codigo'];
export type EstadoPostulacion = Esquemas['ResumenPostulacionDto']['estado'];
export type Plataforma = Esquemas['ResumenPostulacionDto']['plataforma'];
export type Prioridad = Esquemas['ResumenPostulacionDto']['prioridad'];
export type Senal = Esquemas['SenalDto'];
export type Discrepancia = Esquemas['DiscrepanciaDto'];
export type CambioDeEstado = Esquemas['CambioDeEstadoDto'];
export type Evento = Esquemas['EventoDto'];
export type CrearPostulacion = Esquemas['CrearPostulacionDto'];
export type Transicion = Esquemas['TransicionDto'];
export type EditarPostulacion = Esquemas['EditarPostulacionDto'];
export type SenalEntrada = Esquemas['SenalEntradaDto'];
export type ResolverDiscrepancia = Esquemas['ResolverDiscrepanciaDto'];
export type EntrevistaEntrada = Esquemas['EntrevistaEntradaDto'];
export type ContactoEntrada = Esquemas['ContactoEntradaDto'];
