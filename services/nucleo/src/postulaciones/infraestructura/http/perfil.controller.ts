import { Body, Controller, Get, Inject, Put, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Allow, IsArray, IsOptional } from 'class-validator';
import type { Request } from 'express';
import type { PedidoConAcceso } from '../../../acceso/decoradores';
import { CasosDePerfil } from '../../aplicacion/casos-de-perfil';
import { CRITERIOS_EMPLEO } from '../../dominio/perfil-empleo';
import { ErrorDto } from './respuestas.dto';

type Pedido = Request & PedidoConAcceso;

const VALOR = {
  description:
    'Según el criterio. titulo: { incluir: string[], excluir: string[] }. modalidad_por_region: ' +
    '{ valparaiso, santiago, otra: ("remoto" | "hibrido" | "presencial")[], noIndicaEsPresencialEn: Plataforma[] }. ' +
    'sueldo_publicado: { minimo?: number } (sin mínimo, tu renta pretendida)',
  type: 'object',
  additionalProperties: true,
} as const;

export class ReglaDePerfilEntradaDto {
  @ApiPropertyOptional({ description: 'Solo al reemplazar la lista: conserva la regla con ese id' })
  @Allow()
  id?: string;
  @ApiPropertyOptional({
    description: 'La regla en tus palabras; con criterio y sin texto, se describe sola',
  })
  @Allow()
  texto?: string;
  @ApiPropertyOptional({
    enum: CRITERIOS_EMPLEO,
    enumName: 'CriterioDeEmpleo',
    description: 'Lo que el código revisa en cada postulación; sin él, la regla la aplica tu IA',
  })
  @Allow()
  criterio?: string;
  @ApiPropertyOptional(VALOR) @Allow() valor?: Record<string, unknown>;
  @ApiPropertyOptional({ description: 'true = dura (por defecto)' }) @Allow() dura?: boolean;
  @ApiPropertyOptional({ description: 'Solo blandas: 1 es la más importante' }) @Allow() prioridad?: number;
  @ApiPropertyOptional({ type: [String], description: 'Etiquetas libres (minúsculas y sin tildes)' })
  @Allow()
  etiquetas?: string[];
}

export class CambioDeReglaDePerfilDto extends ReglaDePerfilEntradaDto {
  @ApiProperty({ description: 'La regla que cambia; solo cambia lo que mandas' }) @Allow() declare id: string;
}

export class DatosDePerfilDto {
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Pesos líquidos' })
  @Allow()
  rentaPretendida?: number | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date' }) @Allow() disponibleDesde?:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @Allow() notas?: string | null;
}

export class CambiarPerfilDto {
  @ApiPropertyOptional({ type: [ReglaDePerfilEntradaDto], description: 'Reemplaza todas las reglas' })
  @IsOptional()
  @IsArray()
  reglas?: ReglaDePerfilEntradaDto[];
  @ApiPropertyOptional({ type: [ReglaDePerfilEntradaDto], description: 'Reglas nuevas' })
  @IsOptional()
  @IsArray()
  agregar?: ReglaDePerfilEntradaDto[];
  @ApiPropertyOptional({
    type: [CambioDeReglaDePerfilDto],
    description: 'Cambios a reglas existentes, por id',
  })
  @IsOptional()
  @IsArray()
  cambiar?: CambioDeReglaDePerfilDto[];
  @ApiPropertyOptional({ type: [String], description: 'Id de las reglas que se quitan' })
  @IsOptional()
  @IsArray()
  quitar?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Id de las blandas en el orden nuevo (P1 primero)' })
  @IsOptional()
  @IsArray()
  ordenar?: string[];
  @ApiPropertyOptional({ type: DatosDePerfilDto }) @Allow() datos?: DatosDePerfilDto;
  @ApiProperty({ description: 'Por qué cambia (queda en el historial)' }) @Allow() motivo!: string;
}

export class ReglaDePerfilDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'La regla en tus palabras' }) texto!: string;
  @ApiPropertyOptional({ enum: CRITERIOS_EMPLEO, enumName: 'CriterioDeEmpleo' }) criterio?: string;
  @ApiPropertyOptional(VALOR) valor?: Record<string, unknown>;
  @ApiProperty() dura!: boolean;
  @ApiPropertyOptional() prioridad?: number;
  @ApiProperty({ type: [String] }) etiquetas!: string[];
  @ApiProperty({ description: '«Dura · Santiago solo híbrido o remoto #ubicacion»' }) descripcion!: string;
  @ApiProperty({ description: 'El código la revisa en cada postulación' }) porCodigo!: boolean;
}

export class DatosDePerfilSalidaDto {
  @ApiPropertyOptional() rentaPretendida?: number;
  @ApiPropertyOptional({ format: 'date' }) disponibleDesde?: string;
  @ApiPropertyOptional() notas?: string;
}

export class CambioDePerfilDto {
  @ApiProperty({ format: 'date-time' }) ocurridoEn!: string;
  @ApiProperty() origen!: string;
  @ApiProperty() motivo!: string;
  @ApiProperty({ type: [String] }) resumen!: string[];
}

export class EtiquetaDePerfilDto {
  @ApiProperty() etiqueta!: string;
  @ApiProperty() total!: number;
}

export class PerfilEmpleoDto {
  @ApiProperty({ type: [ReglaDePerfilDto], description: 'Duras primero; después las blandas por prioridad' })
  reglas!: ReglaDePerfilDto[];
  @ApiProperty({ type: DatosDePerfilSalidaDto }) datos!: DatosDePerfilSalidaDto;
  @ApiProperty({ type: [CambioDePerfilDto], description: 'Del más nuevo al más antiguo (30)' })
  historial!: CambioDePerfilDto[];
  @ApiProperty({ enum: CRITERIOS_EMPLEO, enumName: 'CriterioDeEmpleo', isArray: true }) criterios!: string[];
  @ApiProperty({ type: [EtiquetaDePerfilDto] }) etiquetas!: EtiquetaDePerfilDto[];
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) actualizadaEn!: string | null;
}

/** El perfil de búsqueda de Empleo (docs/diseno/perfil.md §3.3). */
@ApiTags('perfil')
@ApiBearerAuth()
@Controller('perfil')
export class PerfilController {
  constructor(@Inject(CasosDePerfil) private readonly casos: CasosDePerfil) {}

  @Get()
  @ApiOperation({
    operationId: 'verPerfilEmpleo',
    summary: 'Tus reglas de búsqueda de empleo, datos e historial',
  })
  @ApiOkResponse({ type: PerfilEmpleoDto })
  ver() {
    return this.casos.ver();
  }

  @Put()
  @ApiOperation({
    operationId: 'cambiarPerfilEmpleo',
    summary: 'Cambia reglas (de a una o todas) o tus datos, con motivo',
  })
  @ApiOkResponse({ type: PerfilEmpleoDto })
  @ApiResponse({ status: 400, type: ErrorDto })
  @ApiResponse({ status: 404, type: ErrorDto, description: 'Una regla con ese id no existe' })
  cambiar(@Body() dto: CambiarPerfilDto, @Req() req: Pedido) {
    const origen =
      req.acceso?.tipo === 'mcp' ? 'ia' : req.acceso?.tipo === 'servicio' ? 'importacion' : 'consola';
    return this.casos.cambiar(dto, origen);
  }
}
