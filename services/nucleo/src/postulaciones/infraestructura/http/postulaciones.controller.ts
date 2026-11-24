import {
  applyDecorators,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { PedidoConAcceso } from '../../../acceso/decoradores';
import type { Origen } from '../../dominio/objetos-valor/valores';
import type { FuenteDeSenal, TipoDeEntrevista } from '../../dominio/partes';
import { CasosDeUso } from '../casos';
import { fichasDesdeArtifact, type ExportArtifact } from '../importacion/desde-artifact';
import {
  AplicarSenalDto,
  ContactoEntradaDto,
  CrearPostulacionDto,
  EditarPostulacionDto,
  EntrevistaEntradaDto,
  ImportarArtifactDto,
  ListarQueryDto,
  NotaDto,
  ResolverDiscrepanciaDto,
  ResultadoEntrevistaDto,
  SenalEntradaDto,
  TransicionDto,
} from './dto';
import {
  DetallePostulacionDto,
  ElementoResumenDto,
  EtiquetaEnUsoDto,
  ErrorDto,
  ListaPostulacionesDto,
  ResultadoImportacionDto,
  SenalRegistradaDto,
  TableroDto,
} from './respuestas.dto';
import { ResumenQueryDto, TableroQueryDto } from './dto';

const HTTP = {
  400: 'VALIDACION',
  401: 'NO_AUTENTICADO',
  404: 'NO_ENCONTRADO',
  409: 'YA_EXISTE o CONFLICTO',
  422: 'TRANSICION_INVALIDA, AVISO_CERRADO o ESTADO_TERMINAL',
};
const Errores = (...status: (keyof typeof HTTP)[]) =>
  applyDecorators(
    ...[401 as const, ...status].map((s) => ApiResponse({ status: s, description: HTTP[s], type: ErrorDto })),
  );

type Pedido = Request & PedidoConAcceso;

/** El token decide el origen: la IA por MCP o REST queda como `ia`; el vigía como `senal`. */
function origenDe(req: Pedido, pedido?: 'tablero' | 'formulario'): Origen {
  if (req.acceso?.tipo === 'mcp') return 'ia';
  if (req.acceso?.tipo === 'servicio') return 'senal';
  return pedido ?? 'formulario';
}

/** Adaptador de entrada 1: REST (PLAN §12.1). */
@ApiTags('postulaciones')
@ApiBearerAuth()
@Controller('postulaciones')
export class PostulacionesController {
  constructor(@Inject(CasosDeUso) private readonly casos: CasosDeUso) {}

  @Get()
  @ApiOperation({ operationId: 'listarPostulaciones', summary: 'Lista paginada; orden por actualización' })
  @ApiOkResponse({ type: ListaPostulacionesDto })
  @Errores(400)
  listar(@Query() q: ListarQueryDto) {
    return this.casos.listar.ejecutar({
      ...(q.estado ? { estados: q.estado } : {}),
      ...(q.plataforma ? { plataformas: q.plataforma } : {}),
      ...(q.prioridad ? { prioridades: q.prioridad } : {}),
      ...(q.etiqueta ? { etiquetas: q.etiqueta } : {}),
      ...(q.q ? { q: q.q } : {}),
      ...(q.limit !== undefined ? { limit: q.limit } : {}),
      ...(q.offset !== undefined ? { offset: q.offset } : {}),
    });
  }

  @Get('tablero')
  @ApiOperation({
    operationId: 'verTablero',
    summary: 'Tarjetas por estado, ordenadas por prioridad, cierre y actualización',
  })
  @ApiOkResponse({ type: TableroDto })
  @Errores(400)
  tablero(@Query() q: TableroQueryDto) {
    return this.casos.tablero.ejecutar(q.etiqueta ? { etiquetas: q.etiqueta } : {});
  }

  @Get('etiquetas')
  @ApiOperation({ operationId: 'etiquetasEnUso', summary: 'Etiquetas en uso, de la más usada a la menos' })
  @ApiOkResponse({ type: [EtiquetaEnUsoDto] })
  @Errores()
  etiquetas() {
    return this.casos.etiquetas.ejecutar();
  }

  @Get('resumen')
  @ApiOperation({
    operationId: 'resumenDesde',
    summary: 'Qué cambió desde una fecha, ordenado por prioridad',
  })
  @ApiOkResponse({ type: [ElementoResumenDto] })
  @Errores(400)
  resumen(@Query() q: ResumenQueryDto) {
    return this.casos.resumen.ejecutar(q.desde);
  }

  @Post()
  @ApiOperation({ operationId: 'crearPostulacion' })
  @ApiCreatedResponse({ type: DetallePostulacionDto })
  @Errores(400, 409, 422)
  crear(@Body() dto: CrearPostulacionDto, @Req() req: Pedido) {
    return this.casos.crear.ejecutar({ ...dto, origen: origenDe(req) });
  }

  @Post('importar')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'importarFichas',
    summary: 'Importa el export del artifact; idempotente por URL del aviso (F1-11)',
  })
  @ApiOkResponse({ type: ResultadoImportacionDto })
  @Errores(400)
  importar(@Body() dto: ImportarArtifactDto) {
    return this.casos.importar.ejecutar(fichasDesdeArtifact(dto as unknown as ExportArtifact));
  }

  @Get(':id')
  @ApiOperation({
    operationId: 'verPostulacion',
    summary: 'Detalle con historial, señales, discrepancias y transiciones posibles',
  })
  @ApiOkResponse({ type: DetallePostulacionDto })
  @Errores(404)
  ver(@Param('id') id: string) {
    return this.casos.ver.ejecutar(id);
  }

  @Patch(':id')
  @ApiOperation({
    operationId: 'editarPostulacion',
    summary: 'Edita canal, sueldo pretendido y cierre del aviso',
  })
  @ApiOkResponse({ type: DetallePostulacionDto })
  @Errores(400, 404, 409)
  editar(@Param('id') id: string, @Body() dto: EditarPostulacionDto) {
    return this.casos.editar.ejecutar({ id, ...dto });
  }

  @Post(':id/transiciones')
  @HttpCode(200)
  @ApiOperation({ operationId: 'cambiarEstado' })
  @ApiOkResponse({ type: DetallePostulacionDto })
  @Errores(400, 404, 409, 422)
  transicion(@Param('id') id: string, @Body() dto: TransicionDto, @Req() req: Pedido) {
    const { origen, ...resto } = dto;
    return this.casos.cambiarEstado.ejecutar({ id, ...resto, origen: origenDe(req, origen) });
  }

  @Post(':id/notas')
  @ApiOperation({ operationId: 'agregarNota' })
  @ApiCreatedResponse({ type: DetallePostulacionDto })
  @Errores(400, 404)
  nota(@Param('id') id: string, @Body() dto: NotaDto) {
    return this.casos.agregarNota.ejecutar({ id, texto: dto.texto });
  }

  @Post(':id/contactos')
  @ApiOperation({ operationId: 'agregarContacto' })
  @ApiCreatedResponse({ type: DetallePostulacionDto })
  @Errores(400, 404, 422)
  contacto(@Param('id') id: string, @Body() dto: ContactoEntradaDto) {
    return this.casos.agregarContacto.ejecutar({ id, ...dto });
  }

  @Post(':id/entrevistas')
  @ApiOperation({ operationId: 'agendarEntrevista', summary: 'Si no está en entrevista, la mueve (R7)' })
  @ApiCreatedResponse({ type: DetallePostulacionDto })
  @Errores(400, 404, 422)
  entrevista(@Param('id') id: string, @Body() dto: EntrevistaEntradaDto, @Req() req: Pedido) {
    return this.casos.agendarEntrevista.ejecutar({
      id,
      fecha: dto.fecha,
      tipo: dto.tipo as TipoDeEntrevista,
      ...(dto.con ? { con: dto.con } : {}),
      origen: origenDe(req),
    });
  }

  @Patch(':id/entrevistas/:entrevistaId')
  @ApiOperation({ operationId: 'registrarResultadoEntrevista' })
  @ApiOkResponse({ type: DetallePostulacionDto })
  @Errores(400, 404)
  resultado(
    @Param('id') id: string,
    @Param('entrevistaId') entrevistaId: string,
    @Body() dto: ResultadoEntrevistaDto,
  ) {
    return this.casos.registrarResultadoEntrevista.ejecutar({ id, entrevistaId, resultado: dto.resultado });
  }

  @Post(':id/senales')
  @ApiOperation({
    operationId: 'registrarSenal',
    summary: 'Registra evidencia; nunca cambia el estado sola salvo «aplicar señales seguras» (R11)',
  })
  @ApiCreatedResponse({ type: SenalRegistradaDto })
  @Errores(400, 404, 409)
  senal(@Param('id') id: string, @Body() dto: SenalEntradaDto) {
    return this.casos.registrarSenal.ejecutar({
      id,
      fuente: dto.fuente as FuenteDeSenal,
      resumen: dto.resumen,
      confianza: dto.confianza,
      ...(dto.plataforma ? { plataforma: dto.plataforma } : {}),
      ...(dto.estadoSugerido ? { estadoSugerido: dto.estadoSugerido } : {}),
      ...(dto.recibidaEn ? { recibidaEn: new Date(dto.recibidaEn) } : {}),
      ...(dto.referenciaExterna ? { referenciaExterna: dto.referenciaExterna } : {}),
    });
  }

  @Post(':id/senales/:senalId/aplicar')
  @HttpCode(200)
  @ApiOperation({ operationId: 'aplicarSenal' })
  @ApiOkResponse({ type: DetallePostulacionDto })
  @Errores(400, 404, 409, 422)
  aplicar(@Param('id') id: string, @Param('senalId') senalId: string, @Body() dto: AplicarSenalDto) {
    return this.casos.aplicarSenal.ejecutar({
      id,
      senalId,
      ...(dto.version !== undefined ? { version: dto.version } : {}),
    });
  }

  @Post(':id/discrepancias/:discrepanciaId/resolver')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'resolverDiscrepancia',
    summary: 'Confirmar el movimiento o corregir el estado (R14)',
  })
  @ApiOkResponse({ type: DetallePostulacionDto })
  @Errores(400, 404, 409, 422)
  resolver(
    @Param('id') id: string,
    @Param('discrepanciaId') discrepanciaId: string,
    @Body() dto: ResolverDiscrepanciaDto,
    @Req() req: Pedido,
  ) {
    return this.casos.resolverDiscrepancia.ejecutar({ id, discrepanciaId, ...dto, origen: origenDe(req) });
  }
}
