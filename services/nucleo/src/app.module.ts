import {
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccesoController } from './acceso/acceso.controller';
import { AccesoGuard } from './acceso/acceso.guard';
import { AccesoService } from './acceso/acceso.service';
import { AlmacenDeTokens } from './acceso/almacen-de-tokens';
import type { Config } from './compartido/infraestructura/config';
import { EventosController } from './compartido/infraestructura/eventos.controller';
import { FlujoDeEventos } from './compartido/infraestructura/flujo-de-eventos';
import { crearPrisma, type PrismaClient } from './compartido/infraestructura/prisma';
import { GeneradorUuidV7, RelojDelSistema } from './compartido/infraestructura/reloj-y-ids';
import { CONFIG, FLUJO, IDS, PRISMA, RELOJ } from './compartido/infraestructura/tokens';
import type { GeneradorId, Reloj } from './compartido/dominio/puertos';
import { CasosDeUso } from './postulaciones/infraestructura/casos';
import { PostulacionesController } from './postulaciones/infraestructura/http/postulaciones.controller';
import { McpController } from './postulaciones/infraestructura/mcp/mcp.controller';
import { PrismaAjustes } from './postulaciones/infraestructura/prisma/prisma-ajustes';
import { PrismaConsultas } from './postulaciones/infraestructura/prisma/prisma-consultas';
import { PrismaPostulacionRepositorio } from './postulaciones/infraestructura/prisma/prisma-postulacion.repositorio';

@Injectable()
class CicloDeVida implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    private readonly acceso: AccesoService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}
  async onApplicationBootstrap() {
    await this.acceso.iniciar();
  }
  async onApplicationShutdown() {
    await this.prisma.$disconnect();
  }
}

/** Composición del núcleo: aquí se conectan los puertos con sus adaptadores (ADR 0003). */
@Module({})
export class AppModule {
  static para(config: Config, extra: { reloj?: Reloj } = {}): DynamicModule {
    return {
      module: AppModule,
      controllers: [AccesoController, PostulacionesController, EventosController, McpController],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: PRISMA, useFactory: () => crearPrisma(config.databaseUrl) },
        { provide: RELOJ, useValue: extra.reloj ?? new RelojDelSistema() },
        { provide: IDS, useValue: new GeneradorUuidV7() },
        { provide: FLUJO, useValue: new FlujoDeEventos() },
        {
          provide: AccesoService,
          useFactory: (prisma: PrismaClient) => new AccesoService(prisma, new AlmacenDeTokens(config.dir)),
          inject: [PRISMA],
        },
        {
          provide: CasosDeUso,
          useFactory: (prisma: PrismaClient, reloj: Reloj, ids: GeneradorId, flujo: FlujoDeEventos) =>
            new CasosDeUso({
              repo: new PrismaPostulacionRepositorio(prisma, ids, flujo),
              consultas: new PrismaConsultas(prisma, reloj),
              reloj,
              ids,
              ajustes: new PrismaAjustes(prisma),
            }),
          inject: [PRISMA, RELOJ, IDS, FLUJO],
        },
        { provide: APP_GUARD, useClass: AccesoGuard },
        CicloDeVida,
      ],
    };
  }
}
