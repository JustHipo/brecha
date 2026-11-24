import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
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
import { IsDateString, IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { ErrorDto } from '../../postulaciones/infraestructura/http/respuestas.dto';
import { FILTROS_DE_RED, type FiltroDeRed } from '../aplicacion/casos-de-red';
import { ESTADOS_DE_CONEXION, ORIGENES_DE_RED, TIPOS_DE_INTERACCION } from '../dominio/contacto-de-red';
import { CasosDeRedInyectables } from './casos-de-red.provider';

const err = (status: number, d: string) => ApiResponse({ status, description: d, type: ErrorDto });

// ── Entradas ────────────────────────────────────────────────────────────────

export class ContactoRedEntradaDto {
  @ApiProperty({ maxLength: 200 }) @IsString() @MaxLength(200) nombre!: string;
  @ApiProperty({ maxLength: 500, description: 'linkedin.com/in/…' })
  @IsString()
  @MaxLength(500)
  perfilUrl!: string;
  @ApiPropertyOptional({ maxLength: 300 }) @IsOptional() @IsString() @MaxLength(300) titular?: string;
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200) empresa?: string;
  @ApiPropertyOptional({ description: 'Liga el contacto a esta postulación' })
  @IsOptional()
  @IsString()
  postulacionId?: string;
}

export class InteraccionEntradaDto {
  @ApiProperty({ enum: TIPOS_DE_INTERACCION, enumName: 'TipoDeInteraccion' })
  @IsIn(TIPOS_DE_INTERACCION)
  tipo!: string;
  @ApiProperty({ maxLength: 1000 }) @IsString() @MaxLength(1000) resumen!: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() ocurridaEn?: string;
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  referenciaExterna?: string;
}

export class EditarContactoRedDto {
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200) nombre?: string;
  @ApiPropertyOptional({ maxLength: 300, nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(300)
  titular?: string | null;
  @ApiPropertyOptional({ maxLength: 200, nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  empresa?: string | null;
  @ApiPropertyOptional({ maxLength: 5000, nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(5000)
  notas?: string | null;
  @ApiPropertyOptional({ description: 'AAAA-MM-DD, o null para quitarlo', nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  seguimiento?: string | null;
  @ApiPropertyOptional({ description: 'Id de una postulación para ligar' })
  @IsOptional()
  @IsString()
  vincular?: string;
  @ApiPropertyOptional({ description: 'Id de una postulación para desligar' })
  @IsOptional()
  @IsString()
  desvincular?: string;
}

// ── Respuestas ──────────────────────────────────────────────────────────────

export class InteraccionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: TIPOS_DE_INTERACCION, enumName: 'TipoDeInteraccion' }) tipo!: string;
  @ApiProperty() resumen!: string;
  @ApiProperty({ format: 'date-time' }) ocurridaEn!: string;
  @ApiProperty({ enum: ORIGENES_DE_RED, enumName: 'OrigenDeRed' }) origen!: string;
}

export class ContactoRedDto {
  @ApiProperty() id!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty() perfilUrl!: string;
  @ApiProperty({ nullable: true, type: String }) titular!: string | null;
  @ApiProperty({ nullable: true, type: String }) empresa!: string | null;
  @ApiProperty({ enum: ESTADOS_DE_CONEXION, enumName: 'EstadoDeConexion' }) conexion!: string;
  @ApiProperty({
    enum: ['responder', 'esperando'],
    enumName: 'PendienteDeRed',
    nullable: true,
    description: 'responder: te toca a ti; esperando: le toca a la otra persona',
  })
  pendiente!: string | null;
  @ApiProperty({ type: InteraccionDto, nullable: true }) ultimaInteraccion!: InteraccionDto | null;
  @ApiProperty({ nullable: true, type: Number }) diasDesdeUltima!: number | null;
  @ApiProperty({ nullable: true, type: String }) seguimiento!: string | null;
  @ApiProperty() seguimientoVencido!: boolean;
  @ApiProperty({ type: [String] }) postulacionIds!: string[];
  @ApiProperty({ nullable: true, type: String }) notas!: string | null;
  @ApiProperty({ format: 'date-time' }) actualizadoEn!: string;
}

export class ContactoRedDetalleDto extends ContactoRedDto {
  @ApiProperty({ type: [InteraccionDto], description: 'De la más nueva a la más antigua' })
  interacciones!: InteraccionDto[];
}

export class ContactoRedRegistradoDto extends ContactoRedDetalleDto {
  @ApiPropertyOptional() nuevo?: boolean;
  @ApiPropertyOptional() agregada?: boolean;
}

export class ResumenDeRedDto {
  @ApiProperty() total!: number;
  @ApiProperty() conectados!: number;
  @ApiProperty() porResponder!: number;
  @ApiProperty() esperando!: number;
  @ApiProperty() solicitudesEnviadas!: number;
  @ApiProperty() seguimientosVencidos!: number;
}

export class ListaDeRedDto {
  @ApiProperty({ type: [ContactoRedDto] }) items!: ContactoRedDto[];
  @ApiProperty({ type: ResumenDeRedDto }) resumen!: ResumenDeRedDto;
}

/** Tu red de LinkedIn (REST para la consola; la IA usa las herramientas MCP equivalentes). */
@ApiTags('red')
@ApiBearerAuth()
@Controller('red')
export class RedController {
  constructor(@Inject(CasosDeRedInyectables) private readonly casos: CasosDeRedInyectables) {}

  @Get()
  @ApiOperation({ operationId: 'listarRed', summary: 'Contactos con lo que está pendiente primero' })
  @ApiOkResponse({ type: ListaDeRedDto })
  @err(400, 'VALIDACION')
  listar(
    @Query('filtro') filtro?: string,
    @Query('texto') texto?: string,
    @Query('postulacionId') postulacionId?: string,
  ) {
    if (filtro !== undefined && !(FILTROS_DE_RED as readonly string[]).includes(filtro)) {
      return this.casos.validacion('filtro', `Filtro desconocido: usa ${FILTROS_DE_RED.join(', ')}`);
    }
    return this.casos.red.listar.ejecutar({
      ...(filtro ? { filtro: filtro as FiltroDeRed } : {}),
      ...(texto ? { texto } : {}),
      ...(postulacionId ? { postulacionId } : {}),
    });
  }

  @Post()
  @ApiOperation({
    operationId: 'registrarContactoRed',
    summary: 'Crea el contacto o actualiza el del mismo perfil',
  })
  @ApiCreatedResponse({ type: ContactoRedRegistradoDto })
  @err(400, 'VALIDACION')
  @err(404, 'NO_ENCONTRADO')
  registrar(@Body() dto: ContactoRedEntradaDto) {
    return this.casos.red.registrarContacto.ejecutar(dto);
  }

  @Get(':id')
  @ApiOperation({ operationId: 'verContactoRed' })
  @ApiOkResponse({ type: ContactoRedDetalleDto })
  @err(404, 'NO_ENCONTRADO')
  ver(@Param('id') id: string) {
    return this.casos.red.ver.ejecutar(id);
  }

  @Patch(':id')
  @ApiOperation({
    operationId: 'editarContactoRed',
    summary: 'Datos, notas, seguimiento y postulaciones ligadas',
  })
  @ApiOkResponse({ type: ContactoRedDetalleDto })
  @err(400, 'VALIDACION')
  @err(404, 'NO_ENCONTRADO')
  editar(@Param('id') id: string, @Body() dto: EditarContactoRedDto) {
    return this.casos.red.editar.ejecutar({ id, ...dto });
  }

  @Post(':id/interacciones')
  @ApiOperation({
    operationId: 'registrarInteraccionRed',
    summary: 'Solicitud, mensaje o nota (no se repite)',
  })
  @ApiCreatedResponse({ type: ContactoRedRegistradoDto })
  @err(400, 'VALIDACION')
  @err(404, 'NO_ENCONTRADO')
  interaccion(@Param('id') id: string, @Body() dto: InteraccionEntradaDto) {
    const { ocurridaEn, ...resto } = dto;
    return this.casos.red.registrarInteraccion.ejecutar({
      id,
      ...resto,
      ...(ocurridaEn ? { ocurridaEn: new Date(ocurridaEn) } : {}),
      origen: 'consola',
    });
  }
}
