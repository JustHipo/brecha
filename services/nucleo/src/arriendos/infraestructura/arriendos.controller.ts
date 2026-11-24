import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { TipoDeToken } from '../../acceso/almacen-de-tokens';
import { CasosDeArriendos } from '../aplicacion/casos';
import { ESTADOS } from '../dominio/estado';
import type { Origen } from '../dominio/valores';
import {
  AsociarSenalArriendoDto,
  BusquedaDto,
  CambiarBusquedaDto,
  CambiarEstadoPropiedadDto,
  CanalArriendoDto,
  CanalArriendoEntradaDto,
  ContactoPropiedadEntradaDto,
  ContactoRegistradoDto,
  CrearPropiedadDto,
  DuplicadosDto,
  EditarCanalArriendoDto,
  EditarPropiedadDto,
  EstadoVisitaDto,
  InteraccionArriendoEntradaDto,
  InteraccionRegistradaDto,
  ListaPropiedadesDto,
  MapaArriendosDto,
  PropiedadCreadaDto,
  PropiedadDetalleDto,
  PublicacionEntradaDto,
  ResultadoSenalArriendoDto,
  SenalArriendoEntradaDto,
  SenalArriendoPendienteDto,
  TextoDto,
  UbicacionEntradaDto,
  UfEntradaDto,
  UnirDto,
  VisitaEntradaDto,
} from './arriendos.dto';

interface Pedido {
  acceso?: { tipo: TipoDeToken };
}

/** Quién escribe: tu IA por MCP (`ia`), el servicio con IA (`correo`) o tú en la consola. */
function origenDe(req: Pedido): Origen {
  if (req.acceso?.tipo === 'mcp') return 'ia';
  if (req.acceso?.tipo === 'servicio') return 'correo';
  return 'consola';
}

const si = (v: string | undefined) => v === 'true' || v === '1';

/** Adaptador de entrada REST del contexto Arriendos (docs/diseno/arriendos.md §8). */
@ApiTags('arriendos')
@ApiBearerAuth()
@Controller('arriendos')
export class ArriendosController {
  constructor(private readonly casos: CasosDeArriendos) {}

  @Get('propiedades')
  @ApiOperation({
    operationId: 'listarPropiedades',
    summary: 'Propiedades con su calce; lo que te toca responder primero',
  })
  @ApiQuery({ name: 'estado', required: false, enum: ESTADOS, enumName: 'EstadoPropiedad' })
  @ApiQuery({ name: 'texto', required: false })
  @ApiQuery({ name: 'canal', required: false })
  @ApiQuery({ name: 'abiertas', required: false, type: Boolean })
  @ApiQuery({ name: 'pendiente', required: false, enum: ['responder', 'esperando'] })
  @ApiOkResponse({ type: ListaPropiedadesDto })
  listar(
    @Query('estado') estado?: string,
    @Query('texto') texto?: string,
    @Query('canal') canal?: string,
    @Query('abiertas') abiertas?: string,
    @Query('pendiente') pendiente?: string,
  ) {
    return this.casos.listar({
      ...(estado ? { estado } : {}),
      ...(texto ? { texto } : {}),
      ...(canal ? { canal } : {}),
      ...(pendiente ? { pendiente } : {}),
      abiertas: si(abiertas),
    });
  }

  @Post('propiedades')
  @ApiOperation({
    operationId: 'crearPropiedad',
    summary: 'Crea una propiedad (o une la publicación a otra con unirA). La misma URL devuelve YA_EXISTE',
  })
  @ApiCreatedResponse({ type: PropiedadCreadaDto })
  crear(@Body() dto: CrearPropiedadDto, @Req() req: Pedido) {
    return this.casos.crear(dto as never, origenDe(req));
  }

  @Get('propiedades/duplicados')
  @ApiOperation({ operationId: 'buscarDuplicadosPropiedad', summary: 'Antes de crear: ¿ya la sigues?' })
  @ApiQuery({ name: 'url', required: false })
  @ApiQuery({ name: 'direccion', required: false })
  @ApiQuery({ name: 'comuna', required: false })
  @ApiQuery({ name: 'dormitorios', required: false, type: Number })
  @ApiOkResponse({ type: DuplicadosDto })
  duplicados(
    @Query('url') url?: string,
    @Query('direccion') direccion?: string,
    @Query('comuna') comuna?: string,
    @Query('dormitorios') dormitorios?: string,
  ) {
    return this.casos.buscarDuplicados({ url, direccion, comuna, dormitorios });
  }

  @Get('propiedades/:id')
  @ApiOperation({ operationId: 'verPropiedad' })
  @ApiOkResponse({ type: PropiedadDetalleDto })
  ver(@Param('id') id: string) {
    return this.casos.ver(id);
  }

  @Patch('propiedades/:id')
  @ApiOperation({ operationId: 'editarPropiedad', summary: 'Cambia solo lo que mandas; null borra un dato' })
  @ApiOkResponse({ type: PropiedadDetalleDto })
  editar(@Param('id') id: string, @Body() dto: EditarPropiedadDto) {
    return this.casos.editar(id, dto as never);
  }

  @Delete('propiedades/:id')
  @HttpCode(204)
  @ApiOperation({ operationId: 'borrarPropiedad' })
  @ApiNoContentResponse()
  async borrar(@Param('id') id: string) {
    await this.casos.borrar(id);
  }

  @Post('propiedades/:id/estado')
  @HttpCode(200)
  @ApiOperation({ operationId: 'cambiarEstadoPropiedad' })
  @ApiOkResponse({ type: PropiedadDetalleDto })
  cambiarEstado(@Param('id') id: string, @Body() dto: CambiarEstadoPropiedadDto, @Req() req: Pedido) {
    return this.casos.cambiarEstado(id, dto, origenDe(req));
  }

  @Post('propiedades/:id/publicaciones')
  @ApiOperation({ operationId: 'agregarPublicacion' })
  @ApiCreatedResponse({ type: PropiedadDetalleDto })
  publicacion(@Param('id') id: string, @Body() dto: PublicacionEntradaDto) {
    return this.casos.agregarPublicacion(id, dto as never);
  }

  @Post('propiedades/:id/unir')
  @HttpCode(200)
  @ApiOperation({ operationId: 'unirPropiedades', summary: 'Suma un duplicado a esta propiedad y lo borra' })
  @ApiOkResponse({ type: PropiedadDetalleDto })
  unir(@Param('id') id: string, @Body() dto: UnirDto) {
    return this.casos.unir(id, dto.origenId);
  }

  @Post('propiedades/:id/contactos')
  @ApiOperation({ operationId: 'registrarContactoPropiedad', summary: 'Agrega o completa un contacto' })
  @ApiCreatedResponse({ type: ContactoRegistradoDto })
  contacto(@Param('id') id: string, @Body() dto: ContactoPropiedadEntradaDto) {
    return this.casos.registrarContacto(id, dto);
  }

  @Delete('propiedades/:id/contactos/:contactoId')
  @ApiOperation({ operationId: 'quitarContactoPropiedad' })
  @ApiOkResponse({ type: PropiedadDetalleDto })
  quitarContacto(@Param('id') id: string, @Param('contactoId') contactoId: string) {
    return this.casos.quitarContacto(id, contactoId);
  }

  @Post('propiedades/:id/interacciones')
  @ApiOperation({
    operationId: 'registrarInteraccionArriendo',
    summary: 'Mensaje, llamada o nota con un contacto',
  })
  @ApiCreatedResponse({ type: InteraccionRegistradaDto })
  interaccion(@Param('id') id: string, @Body() dto: InteraccionArriendoEntradaDto, @Req() req: Pedido) {
    return this.casos.registrarInteraccion(id, dto, origenDe(req));
  }

  @Post('propiedades/:id/visitas')
  @ApiOperation({ operationId: 'agendarVisita' })
  @ApiCreatedResponse({ type: PropiedadDetalleDto })
  visita(@Param('id') id: string, @Body() dto: VisitaEntradaDto) {
    return this.casos.agendarVisita(id, dto);
  }

  @Patch('propiedades/:id/visitas/:visitaId')
  @ApiOperation({ operationId: 'cambiarVisita' })
  @ApiOkResponse({ type: PropiedadDetalleDto })
  cambiarVisita(@Param('id') id: string, @Param('visitaId') visitaId: string, @Body() dto: EstadoVisitaDto) {
    return this.casos.cambiarVisita(id, visitaId, dto.estado);
  }

  @Post('propiedades/:id/notas')
  @ApiOperation({ operationId: 'agregarNotaPropiedad' })
  @ApiCreatedResponse({ type: PropiedadDetalleDto })
  nota(@Param('id') id: string, @Body() dto: TextoDto) {
    return this.casos.agregarNota(id, dto.texto);
  }

  @Post('propiedades/:id/discrepancias/:discrepanciaId/resolver')
  @HttpCode(200)
  @ApiOperation({ operationId: 'resolverDiscrepanciaPropiedad' })
  @ApiOkResponse({ type: PropiedadDetalleDto })
  resolver(@Param('id') id: string, @Param('discrepanciaId') d: string) {
    return this.casos.resolverDiscrepancia(id, d);
  }

  @Post('propiedades/:id/senales/:senalId/aplicar')
  @HttpCode(200)
  @ApiOperation({ operationId: 'aplicarSenalPropiedad' })
  @ApiOkResponse({ type: PropiedadDetalleDto })
  aplicar(@Param('id') id: string, @Param('senalId') senalId: string, @Req() req: Pedido) {
    return this.casos.aplicarSenal(id, senalId, origenDe(req));
  }

  @Put('propiedades/:id/ubicacion')
  @ApiOperation({ operationId: 'fijarUbicacionPropiedad', summary: 'Mueve el pin a mano; queda fijo' })
  @ApiOkResponse({ type: PropiedadDetalleDto })
  ubicacion(@Param('id') id: string, @Body() dto: UbicacionEntradaDto) {
    return this.casos.fijarUbicacion(id, dto.lat, dto.lon);
  }

  @Post('senales')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'registrarSenalArriendo',
    summary: 'Evidencia de un arriendo: va a la propiedad (por id o URL) o a la Bandeja de Arriendos',
  })
  @ApiOkResponse({ type: ResultadoSenalArriendoDto })
  senal(@Body() dto: SenalArriendoEntradaDto) {
    return this.casos.registrarSenal(dto);
  }

  @Get('bandeja')
  @ApiOperation({ operationId: 'listarBandejaArriendos' })
  @ApiOkResponse({ type: [SenalArriendoPendienteDto] })
  bandeja() {
    return this.casos.listarBandeja();
  }

  @Post('bandeja/:senalId/asociar')
  @HttpCode(200)
  @ApiOperation({ operationId: 'asociarSenalArriendo' })
  @ApiOkResponse({ type: PropiedadDetalleDto })
  asociar(@Param('senalId') senalId: string, @Body() dto: AsociarSenalArriendoDto) {
    return this.casos.asociarSenal(senalId, dto.propiedadId);
  }

  @Post('bandeja/:senalId/descartar')
  @HttpCode(204)
  @ApiOperation({ operationId: 'descartarSenalArriendo' })
  @ApiNoContentResponse()
  async descartar(@Param('senalId') senalId: string) {
    await this.casos.descartarSenal(senalId);
  }

  @Get('canales')
  @ApiOperation({ operationId: 'listarCanales' })
  @ApiOkResponse({ type: [CanalArriendoDto] })
  canales() {
    return this.casos.listarCanales();
  }

  @Post('canales')
  @ApiOperation({ operationId: 'registrarCanal', summary: 'Crea un canal o actualiza el que tiene ese id' })
  @ApiCreatedResponse({ type: CanalArriendoDto })
  registrarCanal(@Body() dto: CanalArriendoEntradaDto) {
    return this.casos.registrarCanal(dto);
  }

  @Patch('canales/:id')
  @ApiOperation({ operationId: 'editarCanal' })
  @ApiOkResponse({ type: CanalArriendoDto })
  editarCanal(@Param('id') id: string, @Body() dto: EditarCanalArriendoDto) {
    return this.casos.editarCanal(id, dto);
  }

  @Get('busqueda')
  @ApiOperation({ operationId: 'verBusquedaArriendo', summary: 'Tus reglas duras y blandas y su historial' })
  @ApiOkResponse({ type: BusquedaDto })
  busqueda() {
    return this.casos.verBusqueda();
  }

  @Put('busqueda')
  @ApiOperation({ operationId: 'cambiarBusquedaArriendo', summary: 'Cambia reglas o tus datos, con motivo' })
  @ApiOkResponse({ type: BusquedaDto })
  cambiarBusqueda(@Body() dto: CambiarBusquedaDto, @Req() req: Pedido) {
    return this.casos.cambiarBusqueda(dto as never, origenDe(req));
  }

  @Put('uf')
  @HttpCode(204)
  @ApiOperation({ operationId: 'fijarUf', summary: 'Valor de la UF para comparar precios en UF' })
  @ApiNoContentResponse()
  async uf(@Body() dto: UfEntradaDto) {
    await this.casos.fijarUf(dto.valor, dto.fecha);
  }

  @Get('mapa')
  @ApiOperation({ operationId: 'mapaArriendos', summary: 'Propiedades abiertas con y sin ubicación' })
  @ApiOkResponse({ type: MapaArriendosDto })
  mapa() {
    return this.casos.mapa();
  }
}
