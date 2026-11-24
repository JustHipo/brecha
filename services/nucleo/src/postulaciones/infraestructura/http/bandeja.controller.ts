import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
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
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SoloTokens, type PedidoConAcceso } from '../../../acceso/decoradores';
import { ESTADOS, type EstadoPostulacion } from '../../dominio/estado';
import { PLATAFORMAS } from '../../dominio/objetos-valor/valores';
import { FUENTES_DE_SENAL, type FuenteDeSenal } from '../../dominio/partes';
import { CasosDeUso } from '../casos';
import { AvisoEntradaDto } from './dto';
import { DetallePostulacionDto, ErrorDto, PasoDto, SenalDto } from './respuestas.dto';

export class PasoPedidoDto {
  @ApiProperty({ minLength: 3, maxLength: 120 })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  descripcion!: string;
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) detalle?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) plazo?: string;
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) enlace?: string;
  @ApiPropertyOptional({ description: 'Id de un paso pendiente que este correo solo recuerda (R19)' })
  @IsOptional()
  @IsString()
  mismoQue?: string;
}

export class PasoCumplidoDto {
  @ApiProperty() @IsString() id!: string;
  @ApiProperty({ minimum: 0, maximum: 1 }) @IsNumber() @Min(0) @Max(1) confianza!: number;
}

export class SenalRecibidaEntradaDto {
  @ApiPropertyOptional({ description: 'Sin postulación, la señal va a la bandeja' })
  @IsOptional()
  @IsString()
  postulacionId?: string;
  @ApiPropertyOptional({ type: [String], description: 'Varias postulaciones: una señal en cada una' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  postulacionIds?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Sin postulación: las propuestas sin certeza' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  candidatas?: string[];
  @ApiPropertyOptional({ type: PasoPedidoDto, description: 'Lo que el correo pide hacer' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PasoPedidoDto)
  paso?: PasoPedidoDto;
  @ApiPropertyOptional({
    type: [PasoCumplidoDto],
    description: 'Pasos pendientes que este correo da por hechos',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PasoCumplidoDto)
  pasosCumplidos?: PasoCumplidoDto[];
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
  @ApiProperty({ type: [String] }) candidatas!: string[];
  @ApiPropertyOptional({ type: PasoPedidoDto }) pasoPropuesto?: PasoPedidoDto;
  @ApiProperty({ enum: ['pendiente', 'asociada', 'descartada'], enumName: 'EstadoDePendiente' })
  estado!: string;
  @ApiPropertyOptional() postulacionId?: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) resueltaEn!: string | null;
  @ApiProperty({ format: 'date-time' }) creadaEn!: string;
}

export class SenalEnPostulacionDto {
  @ApiProperty() postulacionId!: string;
  @ApiProperty({ type: String, nullable: true }) senalId!: string | null;
  @ApiProperty() aplicada!: boolean;
  @ApiProperty({ description: 'Ya estaba registrada en esa postulación' }) repetida!: boolean;
}

export class ResultadoRecepcionDto {
  @ApiProperty({ enum: ['postulacion', 'bandeja'] }) destino!: string;
  @ApiPropertyOptional({ type: SenalDto, description: 'La primera señal nueva' }) senal?: SenalDto;
  @ApiPropertyOptional({ type: DetallePostulacionDto }) postulacion?: DetallePostulacionDto;
  @ApiPropertyOptional({ type: [SenalEnPostulacionDto] }) senales?: SenalEnPostulacionDto[];
  @ApiPropertyOptional({ type: PasoDto, nullable: true }) paso?: PasoDto | null;
  @ApiPropertyOptional({ enum: ['creado', 'recordado', 'ya_estaba'], nullable: true }) accion?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Pasos que este correo cerró' }) cerrados?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Pasos que quedaron con la sugerencia de cierre' })
  sugeridos?: string[];
  @ApiPropertyOptional({ type: SenalPendienteDto }) pendiente?: SenalPendienteDto;
}

class AsociarDto {
  @ApiPropertyOptional() @IsOptional() @IsString() postulacionId?: string;
  @ApiPropertyOptional({ type: [String], description: 'A varias postulaciones a la vez' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  postulacionIds?: string[];
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
  recibir(@Body() dto: SenalRecibidaEntradaDto, @Req() req: Request & PedidoConAcceso) {
    const { recibidaEn, ...resto } = dto;
    return this.casos.recibirSenal.ejecutar({
      ...resto,
      registradoPor: req.acceso?.tipo === 'mcp' ? 'ia' : 'vigia',
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
    return this.casos.asociarSenal.ejecutar({
      senalId,
      ...(dto.postulacionId ? { postulacionId: dto.postulacionId } : {}),
      ...(dto.postulacionIds ? { postulacionIds: dto.postulacionIds } : {}),
    });
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
