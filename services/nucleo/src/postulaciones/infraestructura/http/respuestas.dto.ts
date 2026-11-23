import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ESTADOS } from '../../dominio/estado';
import {
  BASES,
  MODALIDADES,
  MONEDAS,
  ORIGENES,
  PERIODOS,
  PLATAFORMAS,
  TIPOS_DE_CANAL,
} from '../../dominio/objetos-valor/valores';
import { FUENTES_DE_SENAL, RESULTADOS_DE_ENTREVISTA, TIPOS_DE_ENTREVISTA } from '../../dominio/partes';

// Formas de las respuestas para OpenAPI: de aquí salen los tipos de la consola (ADR 0006).

const PRIORIDADES = ['alta', 'media', 'baja'];
const CODIGOS = [
  'VALIDACION',
  'NO_AUTENTICADO',
  'CLAVE_INVALIDA',
  'NO_ENCONTRADO',
  'YA_EXISTE',
  'CONFLICTO',
  'TRANSICION_INVALIDA',
  'AVISO_CERRADO',
  'ESTADO_TERMINAL',
  'ERROR_INTERNO',
];
const estado = { enum: ESTADOS, enumName: 'EstadoPostulacion' } as const;

export class ErrorDto {
  @ApiProperty({ enum: CODIGOS, enumName: 'CodigoError' }) codigo!: string;
  @ApiProperty() mensaje!: string;
  @ApiPropertyOptional({ description: 'Campo que causó el error' }) campo?: string;
  @ApiPropertyOptional({ description: 'Con YA_EXISTE: la postulación que ya sigue ese aviso' })
  existenteId?: string;
}

export class AvisoDto {
  @ApiProperty() titulo!: string;
  @ApiProperty() empresa!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ enum: PLATAFORMAS, enumName: 'Plataforma' }) plataforma!: string;
  @ApiProperty({ enum: MODALIDADES, enumName: 'Modalidad' }) modalidad!: string;
  @ApiProperty() ubicacion!: string;
  @ApiPropertyOptional({ format: 'date' }) cierre?: string;
  @ApiPropertyOptional() avisoId?: string;
  @ApiPropertyOptional() calce?: number;
}

export class CanalDto {
  @ApiProperty({ enum: TIPOS_DE_CANAL, enumName: 'TipoDeCanal' }) tipo!: string;
  @ApiProperty() valor!: string;
}

export class DineroDto {
  @ApiProperty() monto!: number;
  @ApiProperty({ enum: MONEDAS, enumName: 'Moneda' }) moneda!: string;
  @ApiProperty({ enum: PERIODOS, enumName: 'Periodo' }) periodo!: string;
  @ApiProperty({ enum: BASES, enumName: 'BaseSueldo' }) base!: string;
}

export class ContactoDto {
  @ApiProperty() id!: string;
  @ApiProperty() nombre!: string;
  @ApiPropertyOptional() rol?: string;
  @ApiPropertyOptional() email?: string;
  @ApiPropertyOptional() linkedin?: string;
}

export class EntrevistaDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date-time' }) fecha!: string;
  @ApiProperty({ enum: TIPOS_DE_ENTREVISTA, enumName: 'TipoDeEntrevista' }) tipo!: string;
  @ApiPropertyOptional() con?: string;
  @ApiProperty({ enum: RESULTADOS_DE_ENTREVISTA, enumName: 'ResultadoDeEntrevista' }) resultado!: string;
}

export class NotaSalidaDto {
  @ApiProperty() id!: string;
  @ApiProperty() texto!: string;
  @ApiProperty({ format: 'date-time' }) creadaEn!: string;
}

export class CambioDeEstadoDto {
  @ApiProperty() id!: string;
  @ApiProperty({ ...estado, nullable: true }) de!: string | null;
  @ApiProperty(estado) a!: string;
  @ApiPropertyOptional() motivo?: string;
  @ApiProperty({ enum: ORIGENES, enumName: 'Origen' }) origen!: string;
  @ApiProperty({ format: 'date-time' }) ocurridoEn!: string;
}

export class SenalDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: FUENTES_DE_SENAL, enumName: 'FuenteDeSenal' }) fuente!: string;
  @ApiProperty({ enum: PLATAFORMAS, enumName: 'Plataforma' }) plataforma!: string;
  @ApiProperty() resumen!: string;
  @ApiPropertyOptional(estado) estadoSugerido?: string;
  @ApiProperty({ minimum: 0, maximum: 1 }) confianza!: number;
  @ApiProperty({ format: 'date-time' }) recibidaEn!: string;
  @ApiPropertyOptional() referenciaExterna?: string;
  @ApiProperty() aplicada!: boolean;
}

export class DiscrepanciaDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Id del cambio de estado revisado' }) cambioId!: string;
  @ApiPropertyOptional() senalId?: string;
  @ApiProperty({
    enum: ['senal_de_rechazo', 'senal_de_avance', 'sin_evidencia'],
    enumName: 'ReglaDeDiscrepancia',
  })
  regla!: string;
  @ApiProperty({ enum: ['normal', 'baja'] }) severidad!: string;
  @ApiProperty() detalle!: string;
  @ApiProperty({ enum: ['abierta', 'confirmada', 'corregida'], enumName: 'EstadoDeDiscrepancia' })
  estado!: string;
  @ApiProperty({ format: 'date-time' }) detectadaEn!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) resueltaEn!: string | null;
}

export class ResumenPostulacionDto {
  @ApiProperty() id!: string;
  @ApiProperty() titulo!: string;
  @ApiProperty() empresa!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ enum: PLATAFORMAS, enumName: 'Plataforma' }) plataforma!: string;
  @ApiProperty({ enum: MODALIDADES, enumName: 'Modalidad' }) modalidad!: string;
  @ApiProperty() ubicacion!: string;
  @ApiProperty({ format: 'date', nullable: true }) cierre!: string | null;
  @ApiProperty({ nullable: true, description: 'Días hasta el cierre (negativo si ya cerró)' }) diasAlCierre!:
    number | null;
  @ApiProperty(estado) estado!: string;
  @ApiProperty({ enum: PRIORIDADES, enumName: 'Prioridad' }) prioridad!: string;
  @ApiProperty({ format: 'date', nullable: true }) fechaPostulacion!: string | null;
  @ApiProperty({ description: 'Señales sin aplicar' }) senalesNuevas!: number;
  @ApiProperty() discrepanciasAbiertas!: number;
  @ApiProperty({ ...estado, isArray: true }) transicionesPosibles!: string[];
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) actualizadaEn!: string;
}

export class DetallePostulacionDto extends ResumenPostulacionDto {
  @ApiProperty({ type: AvisoDto }) aviso!: AvisoDto;
  @ApiProperty({ type: CanalDto, nullable: true }) canal!: CanalDto | null;
  @ApiProperty({ type: DineroDto, nullable: true }) sueldoPretendido!: DineroDto | null;
  @ApiProperty({ type: [ContactoDto] }) contactos!: ContactoDto[];
  @ApiProperty({ type: [EntrevistaDto] }) entrevistas!: EntrevistaDto[];
  @ApiProperty({ type: [NotaSalidaDto], description: 'De la más nueva a la más antigua' })
  notas!: NotaSalidaDto[];
  @ApiProperty({ type: [CambioDeEstadoDto], description: 'Del más nuevo al más antiguo' })
  historial!: CambioDeEstadoDto[];
  @ApiProperty({ type: [SenalDto], description: 'De la más nueva a la más antigua' }) senales!: SenalDto[];
  @ApiProperty({ type: [DiscrepanciaDto] }) discrepancias!: DiscrepanciaDto[];
  @ApiProperty({ format: 'date-time' }) creadaEn!: string;
}

export class ListaPostulacionesDto {
  @ApiProperty({ type: [ResumenPostulacionDto] }) items!: ResumenPostulacionDto[];
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
}

export class ColumnaTableroDto {
  @ApiProperty(estado) estado!: string;
  @ApiProperty() total!: number;
  @ApiProperty({ type: [ResumenPostulacionDto] }) items!: ResumenPostulacionDto[];
}

export class TableroDto {
  @ApiProperty({ type: [ColumnaTableroDto] }) columnas!: ColumnaTableroDto[];
}

export class SenalRegistradaDto {
  @ApiProperty({ type: SenalDto }) senal!: SenalDto;
  @ApiProperty({ type: DetallePostulacionDto }) postulacion!: DetallePostulacionDto;
}

export class ElementoResumenDto {
  @ApiProperty() postulacionId!: string;
  @ApiProperty() empresa!: string;
  @ApiProperty() titulo!: string;
  @ApiProperty({ enum: ['cambio', 'senal', 'discrepancia', 'nota'] }) tipo!: string;
  @ApiProperty() descripcion!: string;
  @ApiProperty({ enum: PRIORIDADES, enumName: 'Prioridad' }) prioridad!: string;
  @ApiProperty({ format: 'date-time' }) ocurridoEn!: string;
}

export class EventoDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'postulacion.estado_cambiado' }) tipo!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) ocurridoEn!: string;
  @ApiProperty({ enum: PRIORIDADES, enumName: 'Prioridad' }) prioridad!: string;
  @ApiProperty({ nullable: true }) correlacionId!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Incluye postulacionId' })
  datos!: Record<string, unknown>;
}

export class ErrorDeImportacionDto {
  @ApiProperty() url!: string;
  @ApiProperty() codigo!: string;
  @ApiProperty() mensaje!: string;
  @ApiPropertyOptional() campo?: string;
}

export class ResultadoImportacionDto {
  @ApiProperty() creadas!: number;
  @ApiProperty({ description: 'Ya existían (misma URL de aviso)' }) omitidas!: number;
  @ApiProperty({ type: [ErrorDeImportacionDto] }) errores!: ErrorDeImportacionDto[];
}
