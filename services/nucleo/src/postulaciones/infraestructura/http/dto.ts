import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ESTADOS, type EstadoPostulacion } from '../../dominio/estado';
import {
  BASES,
  MODALIDADES,
  MONEDAS,
  PERIODOS,
  PLATAFORMAS,
  TIPOS_DE_CANAL,
} from '../../dominio/objetos-valor/valores';
import { FUENTES_DE_SENAL, RESULTADOS_DE_ENTREVISTA, TIPOS_DE_ENTREVISTA } from '../../dominio/partes';

// Las reglas del negocio las valida el dominio; aquí solo la forma (backend.md §6.2).
// Cada campo opcional lleva @IsOptional() (NESTJS-ARGOS-02).

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ORIGENES_HTTP = ['tablero', 'formulario'] as const;
const lista = ({ value }: { value: unknown }) =>
  value === undefined
    ? undefined
    : (Array.isArray(value) ? value : String(value).split(',')).map((v) => String(v).trim()).filter(Boolean);

export class AvisoEntradaDto {
  @ApiProperty({ maxLength: 300 }) @IsString() @MaxLength(300) titulo!: string;
  @ApiProperty({ maxLength: 200 }) @IsString() @MaxLength(200) empresa!: string;
  @ApiProperty({ format: 'uri' }) @IsString() @MaxLength(2000) url!: string;
  @ApiProperty({ enum: PLATAFORMAS, enumName: 'Plataforma' }) @IsIn(PLATAFORMAS) plataforma!: string;
  @ApiPropertyOptional({ enum: MODALIDADES, enumName: 'Modalidad' })
  @IsOptional()
  @IsIn(MODALIDADES)
  modalidad?: string;
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200) ubicacion?: string;
  @ApiPropertyOptional({ format: 'date', nullable: true }) @IsOptional() @Matches(FECHA) cierre?:
    string | null;
}

export class CanalEntradaDto {
  @ApiProperty({ enum: TIPOS_DE_CANAL, enumName: 'TipoDeCanal' }) @IsIn(TIPOS_DE_CANAL) tipo!: string;
  @ApiProperty({ maxLength: 500 }) @IsString() @MaxLength(500) valor!: string;
}

export class DineroEntradaDto {
  @ApiProperty({ minimum: 0, exclusiveMinimum: true }) @IsNumber() monto!: number;
  @ApiProperty({ enum: MONEDAS, enumName: 'Moneda' }) @IsIn(MONEDAS) moneda!: string;
  @ApiPropertyOptional({ enum: PERIODOS, enumName: 'Periodo' })
  @IsOptional()
  @IsIn(PERIODOS)
  periodo?: string;
  @ApiPropertyOptional({ enum: BASES, enumName: 'BaseSueldo' }) @IsOptional() @IsIn(BASES) base?: string;
}

export class CrearPostulacionDto {
  @ApiProperty({ type: AvisoEntradaDto })
  @ValidateNested()
  @Type(() => AvisoEntradaDto)
  @IsObject()
  aviso!: AvisoEntradaDto;
  @ApiPropertyOptional({
    enum: ['sin_decidir', 'por_postular', 'postulado'],
    description: 'Por defecto sin_decidir',
  })
  @IsOptional()
  @IsIn(['sin_decidir', 'por_postular', 'postulado'])
  estado?: EstadoPostulacion;
  @ApiPropertyOptional({ type: DineroEntradaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DineroEntradaDto)
  sueldoPretendido?: DineroEntradaDto;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @Matches(FECHA) fechaPostulacion?: string;
  @ApiPropertyOptional({ type: CanalEntradaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CanalEntradaDto)
  canal?: CanalEntradaDto;
}

export class TransicionDto {
  @ApiProperty({ enum: ESTADOS, enumName: 'EstadoPostulacion' }) @IsIn(ESTADOS) a!: EstadoPostulacion;
  @ApiPropertyOptional({ maxLength: 1000 }) @IsOptional() @IsString() @MaxLength(1000) motivo?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @Matches(FECHA) fechaPostulacion?: string;
  @ApiPropertyOptional({ type: CanalEntradaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CanalEntradaDto)
  canal?: CanalEntradaDto;
  @ApiPropertyOptional({
    enum: ORIGENES_HTTP,
    description: 'Por defecto formulario; con token mcp siempre es ia',
  })
  @IsOptional()
  @IsIn(ORIGENES_HTTP)
  origen?: (typeof ORIGENES_HTTP)[number];
  @ApiProperty({ description: 'Versión que tenías (bloqueo optimista)' }) @IsInt() @Min(0) version!: number;
}

export class EditarPostulacionDto {
  @ApiProperty() @IsInt() @Min(0) version!: number;
  @ApiPropertyOptional({ type: CanalEntradaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CanalEntradaDto)
  canal?: CanalEntradaDto;
  @ApiPropertyOptional({ type: DineroEntradaDto, nullable: true, description: 'null lo borra' })
  @IsOptional()
  @ValidateNested()
  @Type(() => DineroEntradaDto)
  sueldoPretendido?: DineroEntradaDto | null;
  @ApiPropertyOptional({ format: 'date', nullable: true, description: 'Cierre del aviso; null lo borra' })
  @IsOptional()
  @Matches(FECHA)
  cierre?: string | null;
}

export class NotaDto {
  @ApiProperty({ minLength: 1, maxLength: 5000 }) @IsString() @MaxLength(5000) texto!: string;
}

export class ContactoEntradaDto {
  @ApiProperty({ maxLength: 200 }) @IsString() @MaxLength(200) nombre!: string;
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200) rol?: string;
  @ApiPropertyOptional({ maxLength: 320 }) @IsOptional() @IsString() @MaxLength(320) email?: string;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) linkedin?: string;
}

export class EntrevistaEntradaDto {
  @ApiProperty({ format: 'date-time' }) @IsDateString() fecha!: string;
  @ApiProperty({ enum: TIPOS_DE_ENTREVISTA, enumName: 'TipoDeEntrevista' })
  @IsIn(TIPOS_DE_ENTREVISTA)
  tipo!: (typeof TIPOS_DE_ENTREVISTA)[number];
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200) con?: string;
}

export class ResultadoEntrevistaDto {
  @ApiProperty({ enum: RESULTADOS_DE_ENTREVISTA, enumName: 'ResultadoDeEntrevista' })
  @IsIn(RESULTADOS_DE_ENTREVISTA)
  resultado!: (typeof RESULTADOS_DE_ENTREVISTA)[number];
}

export class SenalEntradaDto {
  @ApiProperty({ enum: FUENTES_DE_SENAL, enumName: 'FuenteDeSenal' })
  @IsIn(FUENTES_DE_SENAL)
  fuente!: (typeof FUENTES_DE_SENAL)[number];
  @ApiPropertyOptional({ enum: PLATAFORMAS, enumName: 'Plataforma' })
  @IsOptional()
  @IsIn(PLATAFORMAS)
  plataforma?: (typeof PLATAFORMAS)[number];
  @ApiProperty({ maxLength: 1000 }) @IsString() @MaxLength(1000) resumen!: string;
  @ApiPropertyOptional({ enum: ESTADOS, enumName: 'EstadoPostulacion' })
  @IsOptional()
  @IsIn(ESTADOS)
  estadoSugerido?: EstadoPostulacion;
  @ApiProperty({ minimum: 0, maximum: 1 }) @IsNumber() @Min(0) @Max(1) confianza!: number;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() recibidaEn?: string;
  @ApiPropertyOptional({ maxLength: 500, description: 'Id del correo o del portal, para no duplicar' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  referenciaExterna?: string;
}

export class AplicarSenalDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) version?: number;
}

export class ResolverDiscrepanciaDto {
  @ApiProperty({ enum: ['confirmar', 'corregir'] }) @IsIn(['confirmar', 'corregir']) decision!:
    'confirmar' | 'corregir';
  @ApiPropertyOptional({ enum: ESTADOS, enumName: 'EstadoPostulacion', description: 'Destino al corregir' })
  @IsOptional()
  @IsIn(ESTADOS)
  a?: EstadoPostulacion;
  @ApiPropertyOptional({ maxLength: 1000 }) @IsOptional() @IsString() @MaxLength(1000) motivo?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @Matches(FECHA) fechaPostulacion?: string;
  @ApiPropertyOptional({ type: CanalEntradaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CanalEntradaDto)
  canal?: CanalEntradaDto;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) version?: number;
}

export class ListarQueryDto {
  @ApiPropertyOptional({ description: 'Uno o varios separados por coma', example: 'postulado,entrevista' })
  @IsOptional()
  @Transform(lista)
  @IsString({ each: true })
  estado?: string[];
  @ApiPropertyOptional({ description: 'Una o varias separadas por coma' })
  @IsOptional()
  @Transform(lista)
  @IsString({ each: true })
  plataforma?: string[];
  @ApiPropertyOptional({ description: 'alta, media o baja; varias separadas por coma' })
  @IsOptional()
  @Transform(lista)
  @IsString({ each: true })
  prioridad?: string[];
  @ApiPropertyOptional({ description: 'Texto en título o empresa' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;
  @ApiPropertyOptional({ default: 0, minimum: 0 }) @IsOptional() @Type(() => Number) @IsInt() offset?: number;
}

export class ResumenQueryDto {
  @ApiPropertyOptional({ format: 'date-time', description: 'Por defecto, hace 7 días' })
  @IsOptional()
  @IsDateString()
  desde?: string;
}
