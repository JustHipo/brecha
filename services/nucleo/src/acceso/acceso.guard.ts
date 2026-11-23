import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Config } from '../compartido/infraestructura/config';
import { CONFIG } from '../compartido/infraestructura/tokens';
import { AccesoService } from './acceso.service';
import type { TipoDeToken } from './almacen-de-tokens';
import { PUBLICO, TIPOS, type PedidoConAcceso } from './decoradores';
import { NoAutenticado } from './errores';

const HOSTS = new Set(['127.0.0.1', 'localhost']);

/** Guard global (backend.md §6.1): Host, Origin y token siempre. */
@Injectable()
export class AccesoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly acceso: AccesoService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request & PedidoConAcceso>();
    const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
    if (!HOSTS.has(host)) throw new NoAutenticado('Host no permitido');
    const origen = req.headers.origin;
    if (origen !== undefined && origen !== this.config.consolaOrigen)
      throw new NoAutenticado('Origen no permitido');

    const objetivos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO, objetivos)) return true;

    const cabecera = req.headers.authorization ?? '';
    const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7).trim() : undefined;
    const tipo = this.acceso.tokens.identificar(token);
    if (!tipo) throw new NoAutenticado();
    const permitidos = this.reflector.getAllAndOverride<TipoDeToken[] | undefined>(TIPOS, objetivos);
    if (permitidos && !permitidos.includes(tipo))
      throw new NoAutenticado('Este token no sirve para esta ruta');
    req.acceso = { tipo };
    return true;
  }
}
