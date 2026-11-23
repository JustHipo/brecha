import { Controller, Get, Inject, Sse, type MessageEvent } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { interval, map, merge, type Observable } from 'rxjs';
import { Publico } from '../../acceso/decoradores';
import { EventoDto } from '../../postulaciones/infraestructura/http/respuestas.dto';
import { FlujoDeEventos } from './flujo-de-eventos';
import { FLUJO } from './tokens';

@ApiTags('sistema')
@Controller()
export class EventosController {
  constructor(@Inject(FLUJO) private readonly flujo: FlujoDeEventos) {}

  /** Flujo de eventos local (backend.md §6.2): lo usan el supervisor (F3) y la consola. */
  @Sse('eventos/stream')
  @ApiBearerAuth()
  @ApiProduces('text/event-stream')
  @ApiOperation({
    operationId: 'flujoDeEventos',
    summary: 'Server-Sent Events con los eventos recién guardados',
  })
  @ApiOkResponse({ type: EventoDto, description: 'Cada mensaje trae un evento; cada 25 s llega un latido' })
  stream(): Observable<MessageEvent> {
    const eventos = this.flujo
      .eventos()
      .pipe(map((e): MessageEvent => ({ id: e.id, type: e.tipo, data: e })));
    const latidos = interval(25_000).pipe(map((): MessageEvent => ({ type: 'latido', data: {} })));
    return merge(eventos, latidos);
  }

  @Get('salud')
  @Publico()
  @ApiOperation({ operationId: 'salud' })
  salud() {
    return { ok: true };
  }
}
