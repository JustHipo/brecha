import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { AccesoService } from './acceso.service';
import { Publico } from './decoradores';

class DesbloquearDto {
  @ApiProperty({ description: 'Clave local' })
  @IsString()
  @MaxLength(500)
  clave!: string;
}

class EstadoAccesoDto {
  @ApiProperty() claveConfigurada!: boolean;
  @ApiProperty({ description: 'true si el pedido trae un token válido' }) desbloqueado!: boolean;
}

class SesionDto {
  @ApiProperty() token!: string;
  @ApiProperty({ format: 'date-time' }) expiraEn!: string;
}

@ApiTags('acceso')
@Controller('acceso')
@Publico()
export class AccesoController {
  constructor(private readonly acceso: AccesoService) {}

  @Get('estado')
  @ApiOperation({ operationId: 'estadoAcceso', summary: '¿Hay clave local? ¿Este pedido está desbloqueado?' })
  @ApiOkResponse({ type: EstadoAccesoDto })
  estado(@Req() req: Request): EstadoAccesoDto {
    const cabecera = req.headers.authorization ?? '';
    const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7).trim() : undefined;
    return {
      claveConfigurada: this.acceso.hayClave,
      desbloqueado: this.acceso.tokens.identificar(token) !== null,
    };
  }

  @Post('desbloquear')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'desbloquear',
    summary: 'Cambia la clave local por un token de sesión de 12 horas',
  })
  @ApiOkResponse({ type: SesionDto })
  async desbloquear(@Body() dto: DesbloquearDto): Promise<SesionDto> {
    const s = await this.acceso.desbloquear(dto.clave);
    return { token: s.token, expiraEn: s.expiraEn.toISOString() };
  }
}
