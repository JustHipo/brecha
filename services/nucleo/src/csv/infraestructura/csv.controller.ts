import { Body, Controller, Get, HttpCode, Inject, Param, Post, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import type { Reloj } from '../../compartido/dominio/puertos';
import { RELOJ } from '../../compartido/infraestructura/tokens';
import { ErrorDto } from '../../postulaciones/infraestructura/http/respuestas.dto';
import { CasosCsvInyectables } from './casos-csv.provider';
import { TIPOS_CSV, type TipoCsv } from '../aplicacion/formato';

const err = (status: number, d: string) => ApiResponse({ status, description: d, type: ErrorDto });
const MAX_CSV = 5 * 1024 * 1024;

export class ImportarCsvDto {
  @ApiProperty({
    description: 'El contenido del archivo CSV (UTF-8, coma, con encabezado)',
    maxLength: MAX_CSV,
  })
  @IsString()
  @MaxLength(MAX_CSV)
  csv!: string;
  @ApiPropertyOptional({ enum: TIPOS_CSV, description: 'Si no viene, se reconoce por el encabezado' })
  @IsOptional()
  @IsIn(TIPOS_CSV)
  tipo?: TipoCsv;
}

export class FilaImportadaDto {
  @ApiProperty({ description: 'Línea del archivo (el encabezado es la 1)' }) fila!: number;
  @ApiProperty({ enum: ['creada', 'ya_estaba', 'actualizada', 'error'], enumName: 'ResultadoDeFila' })
  resultado!: string;
  @ApiProperty({ description: 'URL del aviso o nombre del contacto' }) clave!: string;
  @ApiPropertyOptional() id?: string;
  @ApiProperty({ type: [String] }) advertencias!: string[];
  @ApiPropertyOptional() codigo?: string;
  @ApiPropertyOptional({ description: 'Columna del CSV' }) campo?: string;
  @ApiPropertyOptional() mensaje?: string;
}

export class ResultadoCsvDto {
  @ApiProperty({ enum: TIPOS_CSV, enumName: 'TipoCsv' }) tipo!: string;
  @ApiProperty() creadas!: number;
  @ApiProperty() yaEstaban!: number;
  @ApiProperty() actualizadas!: number;
  @ApiProperty() errores!: number;
  @ApiProperty() conAdvertencias!: number;
  @ApiProperty({ type: [String], description: 'Del archivo entero' }) advertencias!: string[];
  @ApiProperty({ type: [FilaImportadaDto] }) filas!: FilaImportadaDto[];
}

function enviarCsv(res: Response, nombre: string, contenido: string): string {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  return contenido;
}

function tipoValido(tipo: string): TipoCsv {
  return tipo as TipoCsv; // el caso de uso responde VALIDACION si no lo es
}

/** Importar y exportar CSV de postulaciones y contactos (docs/diseno/csv.md). */
@ApiTags('csv')
@ApiBearerAuth()
@Controller('csv')
export class CsvController {
  constructor(
    @Inject(CasosCsvInyectables) private readonly casos: CasosCsvInyectables,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  @Post('importar')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'importarCsv',
    summary: 'Importa postulaciones o contactos; idempotente; informa cada fila sin cortar',
  })
  @ApiOkResponse({ type: ResultadoCsvDto })
  @err(400, 'VALIDACION (archivo ilegible o encabezado sin las columnas obligatorias)')
  importar(@Body() dto: ImportarCsvDto) {
    return this.casos.csv.importar.ejecutar(dto);
  }

  @Get('exportar/:tipo')
  @ApiOperation({
    operationId: 'exportarCsv',
    summary: 'Todas las postulaciones o contactos, en el formato de importar',
  })
  @ApiParam({ name: 'tipo', enum: TIPOS_CSV })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'Archivo CSV (UTF-8 con BOM)', schema: { type: 'string' } })
  @err(400, 'VALIDACION')
  async exportar(@Param('tipo') tipo: string, @Res({ passthrough: true }) res: Response) {
    const csv = await this.casos.csv.exportar.ejecutar(tipoValido(tipo));
    return enviarCsv(res, `brecha-${tipo}-${this.reloj.hoy()}.csv`, csv);
  }

  @Get('plantillas/:tipo')
  @ApiOperation({ operationId: 'plantillaCsv', summary: 'Encabezado y dos filas de ejemplo inventadas' })
  @ApiParam({ name: 'tipo', enum: TIPOS_CSV })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'Archivo CSV (UTF-8 con BOM)', schema: { type: 'string' } })
  @err(400, 'VALIDACION')
  plantilla(@Param('tipo') tipo: string, @Res({ passthrough: true }) res: Response) {
    return enviarCsv(res, `plantilla-${tipo}.csv`, this.casos.csv.plantilla.ejecutar(tipoValido(tipo)));
  }
}
