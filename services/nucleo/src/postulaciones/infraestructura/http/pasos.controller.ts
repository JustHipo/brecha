import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
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
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { Request } from 'express';
import type { PedidoConAcceso } from '../../../acceso/decoradores';
import {
  ESTADOS_DE_PASO,
  FUENTES_DE_PASO,
  type CerradorDePaso,
  type EstadoDePaso,
  type FuenteDePaso,
  type RegistradorDePaso,
} from '../../dominio/paso';
import { CasosDeUso } from '../casos';
import { ErrorDto, PasoDto, PasoRegistradoDto } from './respuestas.dto';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
type Pedido = Request & PedidoConAcceso;

export class RegistrarPasoDto {
  @ApiProperty({ type: [String], description: 'Una o más postulaciones, abiertas o cerradas' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  postulacionIds!: string[];
  @ApiProperty({ minLength: 3, maxLength: 120, description: 'Texto libre corto: lo que se ve en la tarjeta' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  descripcion!: string;
  @ApiPropertyOptional({ maxLength: 2000, description: 'Qué piden exactamente y cómo' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  detalle?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @Matches(FECHA) plazo?: string;
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) enlace?: string;
  @ApiPropertyOptional({
    enum: ['pendiente', 'hecho'],
    description: 'hecho: para anotar algo que ya hiciste',
  })
  @IsOptional()
  @IsIn(['pendiente', 'hecho'])
  estado?: 'pendiente' | 'hecho';
  @ApiPropertyOptional({ enum: FUENTES_DE_PASO, enumName: 'FuenteDePaso', default: 'persona' })
  @IsOptional()
  @IsIn(FUENTES_DE_PASO)
  fuente?: FuenteDePaso;
  @ApiPropertyOptional({ description: 'La persona de tu red que lo pidió' })
  @IsOptional()
  @IsString()
  contactoRedId?: string;
  @ApiPropertyOptional({ maxLength: 500, description: 'Correo o mensaje que lo pidió: no se duplica' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  referenciaExterna?: string;
  @ApiPropertyOptional({ format: 'date-time', description: 'Cuándo te lo pidieron' })
  @IsOptional()
  @IsDateString()
  pedidoEn?: string;
  @ApiPropertyOptional({ maxLength: 1000 }) @IsOptional() @IsString() @MaxLength(1000) nota?: string;
}

export class ResolverPasoDto {
  @ApiProperty({ enum: ESTADOS_DE_PASO, enumName: 'EstadoDePaso', description: 'pendiente lo reabre' })
  @IsIn(ESTADOS_DE_PASO)
  estado!: EstadoDePaso;
  @ApiPropertyOptional({ maxLength: 1000 }) @IsOptional() @IsString() @MaxLength(1000) nota?: string;
  @ApiPropertyOptional({ description: 'Versión que tenías; si cambió, CONFLICTO' })
  @IsOptional()
  @IsInt()
  @Min(0)
  version?: number;
}

export class EditarPasoDto {
  @ApiProperty() @IsInt() @Min(0) version!: number;
  @ApiPropertyOptional({ minLength: 3, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  descripcion?: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000, description: 'null lo borra' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  detalle?: string | null;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(FECHA)
  plazo?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  enlace?: string | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  postulacionIds?: string[];
}

export class ListarPasosQueryDto {
  @ApiPropertyOptional({ enum: ESTADOS_DE_PASO, enumName: 'EstadoDePaso' })
  @IsOptional()
  @IsIn(ESTADOS_DE_PASO)
  estado?: EstadoDePaso;
  @ApiPropertyOptional() @IsOptional() @IsString() postulacionId?: string;
}

const err = (status: number, d: string) => ApiResponse({ status, description: d, type: ErrorDto });

/** El token dice quién actúa: la IA por MCP, el lector de correo o la persona en la consola. */
function registradorDe(req: Pedido): RegistradorDePaso {
  if (req.acceso?.tipo === 'mcp') return 'ia';
  if (req.acceso?.tipo === 'servicio') return 'vigia';
  return 'persona';
}
function cerradorDe(req: Pedido): CerradorDePaso {
  if (req.acceso?.tipo === 'mcp') return 'ia';
  if (req.acceso?.tipo === 'servicio') return 'sistema';
  return 'persona';
}

/** Pasos pendientes (docs/diseno/pasos.md §8). Las mismas operaciones que las herramientas MCP. */
@ApiTags('pasos')
@ApiBearerAuth()
@Controller('pasos')
export class PasosController {
  constructor(@Inject(CasosDeUso) private readonly casos: CasosDeUso) {}

  @Get()
  @ApiOperation({
    operationId: 'listarPasos',
    summary: 'Pendientes primero (por plazo) y después los cerrados, del más nuevo al más antiguo',
  })
  @ApiOkResponse({ type: [PasoDto] })
  listar(@Query() q: ListarPasosQueryDto) {
    return this.casos.listarPasos.ejecutar(q);
  }

  @Post()
  @ApiOperation({ operationId: 'registrarPaso', summary: 'Anota un paso pendiente o ya hecho' })
  @ApiCreatedResponse({ type: PasoRegistradoDto })
  @err(400, 'VALIDACION')
  @err(404, 'NO_ENCONTRADO')
  registrar(@Body() dto: RegistrarPasoDto, @Req() req: Pedido) {
    const { pedidoEn, ...resto } = dto;
    return this.casos.registrarPaso.ejecutar({
      ...resto,
      registradoPor: registradorDe(req),
      ...(pedidoEn ? { pedidoEn: new Date(pedidoEn) } : {}),
    });
  }

  @Patch(':id')
  @ApiOperation({ operationId: 'editarPaso' })
  @ApiOkResponse({ type: PasoDto })
  @err(400, 'VALIDACION')
  @err(404, 'NO_ENCONTRADO')
  @err(409, 'CONFLICTO')
  editar(@Param('id') id: string, @Body() dto: EditarPasoDto) {
    return this.casos.editarPaso.ejecutar({ id, ...dto });
  }

  @Post(':id/resolver')
  @HttpCode(200)
  @ApiOperation({ operationId: 'resolverPaso', summary: 'Hecho, descartado o reabrir (pendiente)' })
  @ApiOkResponse({ type: PasoDto })
  @err(400, 'VALIDACION')
  @err(404, 'NO_ENCONTRADO')
  @err(409, 'CONFLICTO')
  resolver(@Param('id') id: string, @Body() dto: ResolverPasoDto, @Req() req: Pedido) {
    return this.casos.resolverPaso.ejecutar({ id, ...dto, por: cerradorDe(req) });
  }
}
