import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { CRITERIOS } from '../dominio/busqueda';
import { TIPOS_DE_CANAL } from '../dominio/canal';
import { ESTADOS } from '../dominio/estado';
import {
  FUENTES_DE_SENAL,
  MONEDAS,
  ROLES_DE_CONTACTO,
  TIPOS_DE_INTERACCION,
  TIPOS_DE_PROPIEDAD,
} from '../dominio/valores';

/*
 * DTOs de Arriendos. Las entradas se validan a fondo en el dominio (mismos mensajes para REST y MCP); aquí solo
 * se declaran para el contrato OpenAPI y para que `forbidNonWhitelisted` deje pasar cada campo conocido.
 */

const opcional = (o: Parameters<typeof ApiPropertyOptional>[0] = {}) =>
  ApiPropertyOptional({ nullable: true, ...o });
const nulo = (type: unknown, o: Parameters<typeof ApiProperty>[0] = {}) =>
  ApiProperty({ nullable: true, type: type as never, ...o } as Parameters<typeof ApiProperty>[0]);

// ── Entradas ──

export class PrecioDto {
  @ApiProperty() @Allow() monto!: number;
  @ApiProperty({ enum: MONEDAS, enumName: 'MonedaArriendo' }) @Allow() moneda!: string;
}

export class RequisitosDto {
  @opcional({ type: Number, description: 'Renta líquida mínima en veces el arriendo' }) @Allow() rentaVeces?:
    number | null;
  @opcional({ type: Boolean }) @Allow() aval?: boolean | null;
  @opcional({ type: Number }) @Allow() mesesGarantia?: number | null;
  @opcional({ type: Number, description: 'Comisión de corretaje en meses' }) @Allow() comisionMeses?:
    number | null;
  @opcional({ type: [String] }) @Allow() documentos?: string[] | null;
}

export class DatosPropiedadEntradaDto {
  @opcional({ enum: TIPOS_DE_PROPIEDAD, enumName: 'TipoDePropiedad' }) @Allow() tipo?: string;
  @opcional({ type: String }) @Allow() titulo?: string | null;
  @opcional({ type: String }) @Allow() direccion?: string | null;
  @opcional({ type: String }) @Allow() comuna?: string | null;
  @opcional({ type: PrecioDto }) @Allow() precio?: PrecioDto | null;
  @opcional({ type: Number }) @Allow() gastosComunes?: number | null;
  @opcional({ type: Number }) @Allow() m2Utiles?: number | null;
  @opcional({ type: Number }) @Allow() m2Totales?: number | null;
  @opcional({ type: Number }) @Allow() dormitorios?: number | null;
  @opcional({ type: Number }) @Allow() banos?: number | null;
  @opcional({ type: Number }) @Allow() estacionamientos?: number | null;
  @opcional({ type: Boolean }) @Allow() bodega?: boolean | null;
  @opcional({ type: Boolean }) @Allow() amoblado?: boolean | null;
  @opcional({ type: Boolean }) @Allow() mascotas?: boolean | null;
  @opcional({ type: String, description: 'AAAA-MM-DD' }) @Allow() disponibleDesde?: string | null;
  @opcional({ type: String }) @Allow() descripcion?: string | null;
  @opcional({ type: RequisitosDto }) @Allow() requisitos?: RequisitosDto | null;
}

export class PublicacionEntradaDto {
  @ApiPropertyOptional({ description: 'Id del canal; sin él se reconoce por la URL' })
  @Allow()
  canalId?: string;
  @ApiPropertyOptional() @Allow() url?: string;
  @opcional({ type: PrecioDto }) @Allow() precio?: PrecioDto | null;
}

export class ContactoPropiedadEntradaDto {
  @ApiProperty() @Allow() nombre!: string;
  @ApiPropertyOptional({ enum: ROLES_DE_CONTACTO, enumName: 'RolDeContacto' }) @Allow() rol?: string;
  @ApiPropertyOptional() @Allow() telefono?: string;
  @ApiPropertyOptional() @Allow() correo?: string;
  @ApiPropertyOptional() @Allow() whatsapp?: string;
  @ApiPropertyOptional({ description: 'Formulario o link donde postulaste' }) @Allow() enlace?: string;
  @ApiPropertyOptional() @Allow() linkedin?: string;
  @ApiPropertyOptional({ description: 'Por dónde hablan (id de un canal)' }) @Allow() canalId?: string;
}

export class CrearPropiedadDto extends DatosPropiedadEntradaDto {
  @ApiPropertyOptional({ enum: ESTADOS, enumName: 'EstadoPropiedad' }) @Allow() estado?: string;
  @ApiPropertyOptional({ type: PublicacionEntradaDto }) @Allow() publicacion?: PublicacionEntradaDto;
  @ApiPropertyOptional({ type: [ContactoPropiedadEntradaDto] })
  @Allow()
  contactos?: ContactoPropiedadEntradaDto[];
  @ApiPropertyOptional() @Allow() nota?: string;
  @ApiPropertyOptional({ description: 'Une la publicación a esta propiedad en vez de crear otra' })
  @Allow()
  unirA?: string;
}

export class EditarPropiedadDto extends DatosPropiedadEntradaDto {
  @ApiPropertyOptional({ description: 'Versión leída (control optimista)' }) @Allow() version?: number;
}

export class CambiarEstadoPropiedadDto {
  @ApiProperty({ enum: ESTADOS, enumName: 'EstadoPropiedad' }) @IsIn(ESTADOS) a!: string;
  @ApiPropertyOptional() @Allow() motivo?: string;
  @ApiPropertyOptional({ description: 'Fecha y hora ISO de la visita (para visita_agendada)' })
  @Allow()
  fechaVisita?: string;
  @ApiPropertyOptional({ type: [String] }) @Allow() documentos?: string[];
  @ApiPropertyOptional() @Allow() version?: number;
}

export class InteraccionArriendoEntradaDto {
  @ApiPropertyOptional() @Allow() contactoId?: string;
  @ApiPropertyOptional({ type: ContactoPropiedadEntradaDto }) @Allow() contacto?: ContactoPropiedadEntradaDto;
  @ApiProperty({ enum: TIPOS_DE_INTERACCION, enumName: 'TipoDeInteraccionArriendo' }) @Allow() tipo!: string;
  @ApiProperty() @Allow() resumen!: string;
  @ApiPropertyOptional({ format: 'date-time' }) @Allow() ocurridaEn?: string;
  @ApiPropertyOptional() @Allow() canalId?: string;
  @ApiPropertyOptional() @Allow() referenciaExterna?: string;
}

export class VisitaEntradaDto {
  @ApiProperty({ format: 'date-time' }) @Allow() fecha!: string;
  @ApiPropertyOptional() @Allow() notas?: string;
}

export class EstadoVisitaDto {
  @ApiProperty({ enum: ['agendada', 'hecha', 'cancelada'] }) @Allow() estado!: string;
}

export class TextoDto {
  @ApiProperty() @IsString() @MaxLength(5000) texto!: string;
}

export class UnirDto {
  @ApiProperty({ description: 'La propiedad duplicada que se suma a esta y desaparece' })
  @IsString()
  origenId!: string;
}

export class UbicacionEntradaDto {
  @ApiProperty() @IsNumber() lat!: number;
  @ApiProperty() @IsNumber() lon!: number;
}

export class SenalArriendoEntradaDto {
  @ApiPropertyOptional() @Allow() propiedadId?: string;
  @ApiPropertyOptional({ description: 'URL de la publicación: ubica la propiedad si ya la sigues' })
  @Allow()
  url?: string;
  @ApiProperty({ enum: FUENTES_DE_SENAL, enumName: 'FuenteDeSenalArriendo' }) @Allow() fuente!: string;
  @ApiProperty() @Allow() resumen!: string;
  @ApiPropertyOptional({ enum: ESTADOS, enumName: 'EstadoPropiedad' }) @Allow() estadoSugerido?: string;
  @ApiPropertyOptional() @Allow() confianza?: number;
  @ApiPropertyOptional() @Allow() canalId?: string;
  @ApiPropertyOptional() @Allow() referenciaExterna?: string;
  @ApiPropertyOptional() @Allow() remitente?: string;
  @ApiPropertyOptional() @Allow() asunto?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @Allow() recibidaEn?: string;
  @ApiPropertyOptional() @Allow() direccion?: string;
  @ApiPropertyOptional() @Allow() comuna?: string;
  @ApiPropertyOptional({ type: ContactoPropiedadEntradaDto })
  @Allow()
  contacto?: Partial<ContactoPropiedadEntradaDto>;
}

export class AsociarSenalArriendoDto {
  @ApiProperty() @IsString() propiedadId!: string;
}

export class CanalArriendoEntradaDto {
  @ApiPropertyOptional({ description: 'minúsculas y guiones; si falta sale del nombre' })
  @Allow()
  id?: string;
  @ApiProperty() @Allow() nombre!: string;
  @ApiPropertyOptional({ enum: TIPOS_DE_CANAL, enumName: 'TipoDeCanalArriendo' }) @Allow() tipo?: string;
  @ApiPropertyOptional({ type: [String] }) @Allow() dominios?: string[];
}

export class EditarCanalArriendoDto {
  @ApiPropertyOptional() @Allow() nombre?: string;
  @ApiPropertyOptional({ enum: TIPOS_DE_CANAL, enumName: 'TipoDeCanalArriendo' }) @Allow() tipo?: string;
  @ApiPropertyOptional({ type: [String] }) @Allow() dominios?: string[];
  @ApiPropertyOptional() @Allow() activo?: boolean;
}

export class ReglaEntradaDto {
  @ApiPropertyOptional({ description: 'Solo al reemplazar la lista: conserva la regla con ese id' })
  @Allow()
  id?: string;
  @ApiPropertyOptional({
    description: 'La regla en tus palabras; con criterio y sin texto, se describe sola',
  })
  @Allow()
  texto?: string;
  @ApiPropertyOptional({
    enum: CRITERIOS,
    enumName: 'CriterioDeBusqueda',
    description: 'Lo que el código revisa en el calce; sin él, la regla la aplica tu IA',
  })
  @Allow()
  criterio?: string;
  @ApiPropertyOptional({
    description: 'Monto máximo, mínimo, lista de opciones, sí/no o fecha; nada en renta_exigida y aval',
    oneOf: [
      { type: 'number' },
      { type: 'boolean' },
      { type: 'string' },
      { type: 'array', items: { type: 'string' } },
    ],
  })
  @Allow()
  valor?: number | boolean | string | string[];
  @ApiPropertyOptional({ description: 'true = dura (por defecto)' }) @Allow() dura?: boolean;
  @ApiPropertyOptional({ description: 'Solo blandas: 1 es la más importante' }) @Allow() prioridad?: number;
  @ApiPropertyOptional({ type: [String], description: 'Etiquetas libres (minúsculas y sin tildes)' })
  @Allow()
  etiquetas?: string[];
}

export class CambioDeReglaDto extends ReglaEntradaDto {
  @ApiProperty({ description: 'La regla que cambia; solo cambia lo que mandas' }) @Allow() declare id: string;
}

export class PersonaDto {
  @opcional({ type: Number }) @Allow() rentaLiquida?: number | null;
  @opcional({ type: Boolean }) @Allow() tieneAval?: boolean | null;
  @opcional({ type: Boolean }) @Allow() tieneMascota?: boolean | null;
}

export class CambiarBusquedaDto {
  @ApiPropertyOptional({ type: [ReglaEntradaDto], description: 'Reemplaza todas las reglas' })
  @IsOptional()
  @IsArray()
  reglas?: ReglaEntradaDto[];
  @ApiPropertyOptional({ type: [ReglaEntradaDto], description: 'Reglas nuevas' })
  @IsOptional()
  @IsArray()
  agregar?: ReglaEntradaDto[];
  @ApiPropertyOptional({ type: [CambioDeReglaDto], description: 'Cambios a reglas existentes, por id' })
  @IsOptional()
  @IsArray()
  cambiar?: CambioDeReglaDto[];
  @ApiPropertyOptional({ type: [String], description: 'Id de las reglas que se quitan' })
  @IsOptional()
  @IsArray()
  quitar?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Id de las blandas en el orden nuevo (P1 primero)' })
  @IsOptional()
  @IsArray()
  ordenar?: string[];
  @ApiPropertyOptional({ type: PersonaDto }) @Allow() persona?: PersonaDto;
  @ApiProperty({ description: 'Por qué cambia (queda en el historial)' }) @Allow() motivo!: string;
}

export class UfEntradaDto {
  @ApiProperty() @IsNumber() valor!: number;
  @ApiProperty({ description: 'AAAA-MM-DD' }) @IsString() fecha!: string;
}

// ── Salidas ──

export class PrecioSalidaDto {
  @ApiProperty() monto!: number;
  @ApiProperty({ enum: MONEDAS, enumName: 'MonedaArriendo' }) moneda!: string;
}

export class UbicacionDto {
  @ApiProperty() lat!: number;
  @ApiProperty() lon!: number;
  @ApiProperty({ enum: ['geocodificada', 'manual', 'comuna'] }) origen!: string;
}

export class BrechaDto {
  @ApiProperty() reglaId!: string;
  @ApiProperty({ enum: CRITERIOS, enumName: 'CriterioDeBusqueda' }) criterio!: string;
  @ApiProperty() dura!: boolean;
  @ApiPropertyOptional() prioridad?: number;
  @ApiProperty() texto!: string;
}

export class SinDatoDto {
  @ApiProperty() reglaId!: string;
  @ApiProperty({ enum: CRITERIOS, enumName: 'CriterioDeBusqueda' }) criterio!: string;
  @ApiProperty() texto!: string;
}

export class CalceDto {
  @nulo(Number, { description: '0 a 100' }) puntaje!: number | null;
  @ApiProperty() cumpleDuras!: boolean;
  @ApiProperty({ type: [BrechaDto] }) brechas!: BrechaDto[];
  @ApiProperty({ type: [SinDatoDto] }) sinDato!: SinDatoDto[];
}

export class PropiedadDto {
  @ApiProperty() id!: string;
  @ApiProperty() titulo!: string;
  @ApiProperty({ enum: TIPOS_DE_PROPIEDAD, enumName: 'TipoDePropiedad' }) tipo!: string;
  @ApiProperty({ enum: ESTADOS, enumName: 'EstadoPropiedad' }) estado!: string;
  @ApiProperty({ enum: ESTADOS, enumName: 'EstadoPropiedad', isArray: true }) transicionesPosibles!: string[];
  @nulo(String) comuna!: string | null;
  @nulo(String) direccion!: string | null;
  @nulo(UbicacionDto) ubicacion!: UbicacionDto | null;
  @nulo(PrecioSalidaDto) precio!: PrecioSalidaDto | null;
  @nulo(Number) precioPesos!: number | null;
  @nulo(Number) gastosComunes!: number | null;
  @nulo(Number) dormitorios!: number | null;
  @nulo(Number) banos!: number | null;
  @nulo(Number) m2!: number | null;
  @ApiProperty({ type: CalceDto }) calce!: CalceDto;
  @nulo(String, { enum: ['responder', 'esperando'] }) pendiente!: string | null;
  @ApiProperty({ type: [String] }) canales!: string[];
  @ApiProperty() cantidadContactos!: number;
  @nulo(String, { format: 'date-time' }) proximaVisita!: string | null;
  @ApiProperty() discrepanciasAbiertas!: number;
  @ApiProperty() senalesSinAplicar!: number;
  @nulo(String) motivoCierre!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) actualizadaEn!: string;
}

export class RequisitosSalidaDto {
  @ApiPropertyOptional() rentaVeces?: number;
  @ApiPropertyOptional() aval?: boolean;
  @ApiPropertyOptional() mesesGarantia?: number;
  @ApiPropertyOptional() comisionMeses?: number;
  @ApiPropertyOptional({ type: [String] }) documentos?: string[];
}

export class PublicacionDto {
  @ApiProperty() id!: string;
  @ApiProperty() canalId!: string;
  @ApiPropertyOptional() url?: string;
  @ApiPropertyOptional({ type: PrecioSalidaDto }) precio?: PrecioSalidaDto;
  @ApiProperty({ format: 'date-time' }) vistaEn!: string;
}

export class InteraccionArriendoDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: TIPOS_DE_INTERACCION, enumName: 'TipoDeInteraccionArriendo' }) tipo!: string;
  @ApiProperty() resumen!: string;
  @ApiProperty({ format: 'date-time' }) ocurridaEn!: string;
  @ApiPropertyOptional() canalId?: string;
  @ApiProperty() origen!: string;
}

export class ContactoPropiedadDto {
  @ApiProperty() id!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty({ enum: ROLES_DE_CONTACTO, enumName: 'RolDeContacto' }) rol!: string;
  @ApiPropertyOptional() telefono?: string;
  @ApiPropertyOptional() correo?: string;
  @ApiPropertyOptional() whatsapp?: string;
  @ApiPropertyOptional() enlace?: string;
  @ApiPropertyOptional() linkedin?: string;
  @ApiPropertyOptional() canalId?: string;
  @ApiProperty({ type: [InteraccionArriendoDto] }) interacciones!: InteraccionArriendoDto[];
}

export class VisitaDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date-time' }) fecha!: string;
  @ApiProperty({ enum: ['agendada', 'hecha', 'cancelada'] }) estado!: string;
  @ApiPropertyOptional() notas?: string;
}

export class NotaArriendoDto {
  @ApiProperty() id!: string;
  @ApiProperty() texto!: string;
  @ApiProperty({ format: 'date-time' }) creadaEn!: string;
}

export class CambioPropiedadDto {
  @nulo(String) de!: string | null;
  @ApiProperty() a!: string;
  @ApiPropertyOptional() motivo?: string;
  @ApiProperty() origen!: string;
  @ApiProperty({ format: 'date-time' }) ocurridoEn!: string;
}

export class SenalDePropiedadDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: FUENTES_DE_SENAL, enumName: 'FuenteDeSenalArriendo' }) fuente!: string;
  @ApiPropertyOptional() canalId?: string;
  @ApiProperty() resumen!: string;
  @ApiPropertyOptional({ enum: ESTADOS, enumName: 'EstadoPropiedad' }) estadoSugerido?: string;
  @ApiProperty() confianza!: number;
  @ApiPropertyOptional() remitente?: string;
  @ApiPropertyOptional() asunto?: string;
  @ApiProperty({ format: 'date-time' }) recibidaEn!: string;
  @ApiProperty() aplicada!: boolean;
}

export class DiscrepanciaArriendoDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['contra_senal', 'visita_sin_registro'] }) regla!: string;
  @ApiProperty() detalle!: string;
  @ApiProperty({ enum: ['abierta', 'resuelta'] }) estado!: string;
  @ApiProperty({ format: 'date-time' }) detectadaEn!: string;
}

export class PropiedadDetalleDto extends PropiedadDto {
  @ApiPropertyOptional() m2Utiles?: number;
  @ApiPropertyOptional() m2Totales?: number;
  @ApiPropertyOptional() estacionamientos?: number;
  @ApiPropertyOptional() bodega?: boolean;
  @ApiPropertyOptional() amoblado?: boolean;
  @ApiPropertyOptional() mascotas?: boolean;
  @ApiPropertyOptional() disponibleDesde?: string;
  @ApiPropertyOptional() descripcion?: string;
  @ApiProperty({ type: RequisitosSalidaDto }) requisitos!: RequisitosSalidaDto;
  @ApiProperty({ type: [PublicacionDto] }) publicaciones!: PublicacionDto[];
  @ApiProperty({ type: [ContactoPropiedadDto] }) contactos!: ContactoPropiedadDto[];
  @ApiProperty({ type: [VisitaDto] }) visitas!: VisitaDto[];
  @ApiProperty({ type: [String] }) documentosEnviados!: string[];
  @ApiProperty({ type: [NotaArriendoDto], description: 'De la más nueva a la más antigua' })
  notas!: NotaArriendoDto[];
  @ApiProperty({ type: [CambioPropiedadDto], description: 'Del más nuevo al más antiguo' })
  cambios!: CambioPropiedadDto[];
  @ApiProperty({ type: [SenalDePropiedadDto], description: 'De la más nueva a la más antigua' })
  senales!: SenalDePropiedadDto[];
  @ApiProperty({ type: [DiscrepanciaArriendoDto] }) discrepancias!: DiscrepanciaArriendoDto[];
  @ApiProperty({ format: 'date-time' }) creadaEn!: string;
}

export class ResumenArriendosDto {
  @ApiProperty() total!: number;
  @ApiProperty() abiertas!: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } }) porEstado!: Record<
    string,
    number
  >;
  @ApiProperty() porResponder!: number;
  @ApiProperty() bandeja!: number;
  @ApiProperty() discrepancias!: number;
}

export class ListaPropiedadesDto {
  @ApiProperty({ type: [PropiedadDto] }) items!: PropiedadDto[];
  @ApiProperty({ type: ResumenArriendosDto }) resumen!: ResumenArriendosDto;
}

export class PropiedadCreadaDto {
  @ApiProperty({ type: PropiedadDetalleDto }) propiedad!: PropiedadDetalleDto;
  @ApiProperty({ type: [PropiedadDto], description: 'Mismas dirección o pin cercano: ¿es la misma?' })
  posiblesDuplicados!: PropiedadDto[];
  @ApiProperty({ description: 'true si se unió a una existente (unirA)' }) unida!: boolean;
}

export class DuplicadosDto {
  @nulo(PropiedadDto) seguro!: PropiedadDto | null;
  @ApiProperty({ type: [PropiedadDto] }) candidatos!: PropiedadDto[];
}

export class ContactoRegistradoDto {
  @ApiProperty() contactoId!: string;
  @ApiProperty({ type: PropiedadDetalleDto }) propiedad!: PropiedadDetalleDto;
}

export class InteraccionRegistradaDto {
  @ApiProperty() registrada!: boolean;
  @ApiProperty({ type: PropiedadDetalleDto }) propiedad!: PropiedadDetalleDto;
}

export class ResultadoSenalArriendoDto {
  @ApiProperty({ enum: ['propiedad', 'bandeja', 'repetida'] }) destino!: string;
  @ApiPropertyOptional() propiedadId?: string;
  @ApiPropertyOptional() aplicada?: boolean;
  @ApiPropertyOptional() senalId?: string;
}

export class ContactoDetectadoDto {
  @ApiPropertyOptional() nombre?: string;
  @ApiPropertyOptional() telefono?: string;
  @ApiPropertyOptional() correo?: string;
}

export class SenalArriendoPendienteDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['pendiente', 'asociada', 'descartada'] }) estado!: string;
  @ApiProperty({ enum: FUENTES_DE_SENAL, enumName: 'FuenteDeSenalArriendo' }) fuente!: string;
  @ApiPropertyOptional() canalId?: string;
  @ApiProperty() resumen!: string;
  @ApiPropertyOptional({ enum: ESTADOS, enumName: 'EstadoPropiedad' }) estadoSugerido?: string;
  @ApiProperty() confianza!: number;
  @ApiPropertyOptional() remitente?: string;
  @ApiPropertyOptional() asunto?: string;
  @ApiProperty({ format: 'date-time' }) recibidaEn!: string;
  @ApiPropertyOptional() urlDetectada?: string;
  @ApiPropertyOptional() direccionDetectada?: string;
  @ApiPropertyOptional() comunaDetectada?: string;
  @ApiPropertyOptional({ type: ContactoDetectadoDto }) contactoDetectado?: ContactoDetectadoDto;
  @ApiProperty({ format: 'date-time' }) creadaEn!: string;
}

export class CanalArriendoDto {
  @ApiProperty() id!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty({ enum: TIPOS_DE_CANAL, enumName: 'TipoDeCanalArriendo' }) tipo!: string;
  @ApiProperty({ type: [String] }) dominios!: string[];
  @ApiProperty() activo!: boolean;
  @ApiProperty() predefinido!: boolean;
}

export class ReglaDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'La regla en tus palabras' }) texto!: string;
  @ApiPropertyOptional({ enum: CRITERIOS, enumName: 'CriterioDeBusqueda' }) criterio?: string;
  @ApiPropertyOptional({
    oneOf: [
      { type: 'number' },
      { type: 'boolean' },
      { type: 'string' },
      { type: 'array', items: { type: 'string' } },
    ],
  })
  valor?: number | boolean | string | string[];
  @ApiProperty() dura!: boolean;
  @ApiPropertyOptional() prioridad?: number;
  @ApiProperty({ type: [String] }) etiquetas!: string[];
  @ApiProperty({ description: '«Dura · Arriendo más gastos comunes hasta $650.000 #plata»' })
  descripcion!: string;
}

export class PersonaSalidaDto {
  @ApiPropertyOptional() rentaLiquida?: number;
  @ApiPropertyOptional() tieneAval?: boolean;
  @ApiPropertyOptional() tieneMascota?: boolean;
}

export class CambioDeBusquedaDto {
  @ApiProperty({ format: 'date-time' }) ocurridoEn!: string;
  @ApiProperty() origen!: string;
  @ApiProperty() motivo!: string;
  @ApiProperty({ type: [String] }) resumen!: string[];
}

export class UfDto {
  @ApiProperty() valor!: number;
  @ApiProperty() fecha!: string;
}

export class BusquedaDto {
  @ApiProperty({ type: [ReglaDto] }) reglas!: ReglaDto[];
  @ApiProperty({ type: PersonaSalidaDto }) persona!: PersonaSalidaDto;
  @ApiProperty({ type: [CambioDeBusquedaDto], description: 'Del más nuevo al más antiguo (30)' })
  historial!: CambioDeBusquedaDto[];
  @ApiProperty({ enum: CRITERIOS, enumName: 'CriterioDeBusqueda', isArray: true })
  criteriosSugeridos!: string[];
  @ApiProperty({
    enum: CRITERIOS,
    enumName: 'CriterioDeBusqueda',
    isArray: true,
    description: 'Todos los criterios',
  })
  criterios!: string[];
  @nulo(UfDto) uf!: UfDto | null;
  @ApiProperty({ description: 'Ubicar direcciones con Nominatim (OpenStreetMap)' }) geocodificar!: boolean;
  @nulo(String, { format: 'date-time' }) actualizadaEn!: string | null;
}

export class MapaArriendosDto {
  @ApiProperty({ type: [PropiedadDto] }) ubicadas!: PropiedadDto[];
  @ApiProperty({ type: [PropiedadDto] }) sinUbicar!: PropiedadDto[];
}

export class GeocodificarDto {
  @ApiProperty() @IsBoolean() activo!: boolean;
}

export class UbicarPendientesDto {
  @ApiProperty() pendientes!: number;
}
