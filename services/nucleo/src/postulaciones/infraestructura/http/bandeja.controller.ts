import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SoloTokens } from '../../../acceso/decoradores';
import { ESTADOS, type EstadoPostulacion } from '../../dominio/estado';
import { PLATAFORMAS } from '../../dominio/objetos-valor/valores';
import { FUENTES_DE_SENAL, type FuenteDeSenal } from '../../dominio/partes';
import { CasosDeUso } from '../casos';
import { AvisoEntradaDto } from './dto';
import { DetallePostulacionDto, ErrorDto, SenalDto } from './respuestas.dto';

export class SenalRecibidaEntradaDto {
  @ApiPropertyOptional({ description: 'Sin postulación, la señal va a la bandeja' })
  @IsOptional()
  @IsString()
  postulacionId?: string;
  @ApiProperty({ enum: FUENTES_DE_SENAL, enumName: 'FuenteDeSenal' })
  @IsIn(FUENTES_DE_SENAL)
  fuente!: FuenteDeSenal;
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
  @ApiPropertyOptional({ maxLength: 500, description: 'Message-ID u otra id de la fuente: no se duplica' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  referenciaExterna?: string;
  @ApiPropertyOptional({ maxLength: 320 }) @IsOptional() @IsString() @MaxLength(320) remitente?: string;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) asunto?: string;
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  empresaDetectada?: string;
  @ApiPropertyOptional({ maxLength: 300 }) @IsOptional() @IsString() @MaxLength(300) cargoDetectado?: string;
}

export class SenalPendienteDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: FUENTES_DE_SENAL, enumName: 'FuenteDeSenal' }) fuente!: string;
  @ApiProperty({ enum: PLATAFORMAS, enumName: 'Plataforma' }) plataforma!: string;
  @ApiProperty() resumen!: string;
  @ApiPropertyOptional({ enum: ESTADOS, enumName: 'EstadoPostulacion' }) estadoSugerido?: string;
  @ApiProperty() confianza!: number;
  @ApiProperty({ format: 'date-time' }) recibidaEn!: string;
  @ApiPropertyOptional() referenciaExterna?: string;
  @ApiPropertyOptional() remitente?: string;
  @ApiPropertyOptional() asunto?: string;
  @ApiPropertyOptional() empresaDetectada?: string;
  @ApiPropertyOptional() cargoDetectado?: string;
  @ApiProperty({ enum: ['pendiente', 'asociada', 'descartada'], enumName: 'EstadoDePendiente' })
  estado!: string;
  @ApiPropertyOptional() postulacionId?: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) resueltaEn!: string | null;
  @ApiProperty({ format: 'date-time' }) creadaEn!: string;
}

export class ResultadoRecepcionDto {
  @ApiProperty({ enum: ['postulacion', 'bandeja'] }) destino!: string;
  @ApiPropertyOptional({ type: SenalDto }) senal?: SenalDto;
  @ApiPropertyOptional({ type: DetallePostulacionDto }) postulacion?: DetallePostulacionDto;
  @ApiPropertyOptional({ type: SenalPendienteDto }) pendiente?: SenalPendienteDto;
}

class AsociarDto {
  @ApiProperty() @IsString() postulacionId!: string;
}

class CrearDesdeSenalDto {
  @ApiProperty({ type: AvisoEntradaDto })
  @ValidateNested()
  @Type(() => AvisoEntradaDto)
  @IsObject()
  aviso!: AvisoEntradaDto;
}

class VincularAvisoDto {
  @ApiPropertyOptional({ maxLength: 100 }) @IsOptional() @IsString() @MaxLength(100) avisoId?: string;
  @ApiPropertyOptional({ minimum: 0, maximum: 1 }) @IsOptional() @IsNumber() @Min(0) @Max(1) calce?: number;
}

const err = (status: number, d: string) => ApiResponse({ status, description: d, type: ErrorDto });

/** Señales como comando (backend.md C3) y la Bandeja (docs/diseno/f2.md §5). */
@ApiTags('bandeja')
@ApiBearerAuth()
@Controller()
export class BandejaController {
  constructor(@Inject(CasosDeUso) private readonly casos: CasosDeUso) {}

  @Post('senales')
  @SoloTokens('servicio', 'mcp')
  @ApiOperation({
    operationId: 'recibirSenal',
    summary: 'Registra una señal en su postulación o, sin postulación, en la bandeja',
  })
  @ApiCreatedResponse({ type: ResultadoRecepcionDto })
  @err(400, 'VALIDACION')
  @err(404, 'NO_ENCONTRADO')
  @err(409, 'YA_EXISTE')
  recibir(@Body() dto: SenalRecibidaEntradaDto) {
    const { recibidaEn, ...resto } = dto;
    return this.casos.recibirSenal.ejecutar({
      ...resto,
      ...(recibidaEn ? { recibidaEn: new Date(recibidaEn) } : {}),
    });
  }

  @Get('bandeja')
  @ApiOperation({
    operationId: 'listarBandeja',
    summary: 'Señales que esperan postulación, de la más nueva a la más antigua',
  })
  @ApiOkResponse({ type: [SenalPendienteDto] })
  listar() {
    return this.casos.bandeja.ejecutar();
  }

  @Post('bandeja/:senalId/asociar')
  @HttpCode(200)
  @ApiOperation({ operationId: 'asociarSenal' })
  @ApiOkResponse({ type: DetallePostulacionDto })
  @err(400, 'VALIDACION')
  @err(404, 'NO_ENCONTRADO')
  @err(409, 'YA_EXISTE o CONFLICTO')
  asociar(@Param('senalId') senalId: string, @Body() dto: AsociarDto) {
    return this.casos.asociarSenal.ejecutar({ senalId, postulacionId: dto.postulacionId });
  }

  @Post('bandeja/:senalId/crear')
  @ApiOperation({
    operationId: 'crearDesdeSenal',
    summary: 'Crea la postulación con los datos del aviso y le asocia la señal',
  })
  @ApiCreatedResponse({ type: DetallePostulacionDto })
  @err(400, 'VALIDACION')
  @err(404, 'NO_ENCONTRADO')
  @err(409, 'YA_EXISTE')
  crear(@Param('senalId') senalId: string, @Body() dto: CrearDesdeSenalDto) {
    return this.casos.crearDesdeSenal.ejecutar({ senalId, aviso: dto.aviso });
  }

  @Post('bandeja/:senalId/descartar')
  @HttpCode(200)
  @ApiOperation({ operationId: 'descartarSenal' })
  @ApiOkResponse({ type: SenalPendienteDto })
  @err(400, 'VALIDACION')
  @err(404, 'NO_ENCONTRADO')
  descartar(@Param('senalId') senalId: string) {
    return this.casos.descartarSenal.ejecutar(senalId);
  }

  @Patch('postulaciones/:id/aviso')
  @SoloTokens('servicio')
  @ApiOperation({
    operationId: 'vincularAviso',
    summary: 'El servicio con IA liga el aviso analizado y su calce',
  })
  @ApiOkResponse({ type: DetallePostulacionDto })
  @err(400, 'VALIDACION')
  @err(404, 'NO_ENCONTRADO')
  vincular(@Param('id') id: string, @Body() dto: VincularAvisoDto) {
    return this.casos.vincularAviso.ejecutar({ id, ...dto });
  }
}
