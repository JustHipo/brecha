import {
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccesoController, VerificacionController } from './acceso/acceso.controller';
import { BandejaController } from './postulaciones/infraestructura/http/bandeja.controller';
import { PasosController } from './postulaciones/infraestructura/http/pasos.controller';
import { PerfilController } from './postulaciones/infraestructura/http/perfil.controller';
import { CasosDePerfil } from './postulaciones/aplicacion/casos-de-perfil';
import { PrismaPerfilEmpleo } from './postulaciones/infraestructura/prisma/prisma-perfil';
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
import { PrismaBandeja } from './postulaciones/infraestructura/prisma/prisma-bandeja';
import { PrismaConsultas } from './postulaciones/infraestructura/prisma/prisma-consultas';
import { PrismaPasos } from './postulaciones/infraestructura/prisma/prisma-pasos';
import { PrismaPostulacionRepositorio } from './postulaciones/infraestructura/prisma/prisma-postulacion.repositorio';
import { CasosDeRed } from './red/aplicacion/casos-de-red';
import { CasosDeRedInyectables } from './red/infraestructura/casos-de-red.provider';
import { PrismaRed } from './red/infraestructura/prisma-red';
import { RedController } from './red/infraestructura/red.controller';
import { CasosCsv } from './csv/aplicacion/casos-csv';
import { CasosCsvInyectables } from './csv/infraestructura/casos-csv.provider';
import { CsvController } from './csv/infraestructura/csv.controller';
import { LectorCsvParse } from './csv/infraestructura/lector-csv';
import { ImportarFichas } from './postulaciones/aplicacion/importar-fichas';
import { CasosDeArriendos } from './arriendos/aplicacion/casos';
import { ArriendosController } from './arriendos/infraestructura/arriendos.controller';
import { GeocodificadorNominatim } from './arriendos/infraestructura/nominatim';
import {
  PrismaAjustesArriendos,
  PrismaBandejaArriendos,
  PrismaBusqueda,
  PrismaCanales,
  PrismaPropiedades,
} from './arriendos/infraestructura/prisma-arriendos';

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
      controllers: [
        AccesoController,
        VerificacionController,
        PostulacionesController,
        BandejaController,
        PasosController,
        PerfilController,
        EventosController,
        McpController,
        RedController,
        CsvController,
        ArriendosController,
      ],
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
              bandeja: new PrismaBandeja(prisma, ids, flujo),
              pasos: new PrismaPasos(prisma, ids, flujo),
              consultas: new PrismaConsultas(prisma, reloj, new PrismaPerfilEmpleo(prisma)),
              reloj,
              ids,
              ajustes: new PrismaAjustes(prisma),
            }),
          inject: [PRISMA, RELOJ, IDS, FLUJO],
        },
        {
          provide: CasosDePerfil,
          useFactory: (prisma: PrismaClient, reloj: Reloj, ids: GeneradorId) =>
            new CasosDePerfil({ perfil: new PrismaPerfilEmpleo(prisma), reloj, ids }),
          inject: [PRISMA, RELOJ, IDS],
        },
        {
          provide: CasosDeRedInyectables,
          useFactory: (prisma: PrismaClient, reloj: Reloj, ids: GeneradorId, flujo: FlujoDeEventos) =>
            new CasosDeRedInyectables(
              new CasosDeRed({
                red: new PrismaRed(prisma, flujo),
                reloj,
                ids,
                existePostulacion: async (id) =>
                  /^[0-9a-f-]{36}$/i.test(id) && (await prisma.postulacion.count({ where: { id } })) > 0,
              }),
            ),
          inject: [PRISMA, RELOJ, IDS, FLUJO],
        },
        {
          provide: CasosCsvInyectables,
          useFactory: (
            prisma: PrismaClient,
            reloj: Reloj,
            ids: GeneradorId,
            flujo: FlujoDeEventos,
            red: CasosDeRedInyectables,
          ) => {
            const repo = new PrismaPostulacionRepositorio(prisma, ids, flujo);
            const consultas = new PrismaConsultas(prisma, reloj);
            return new CasosCsvInyectables(
              new CasosCsv({
                lector: new LectorCsvParse(),
                reloj,
                fichas: new ImportarFichas({
                  repo,
                  bandeja: new PrismaBandeja(prisma, ids, flujo),
                  pasos: new PrismaPasos(prisma, ids, flujo),
                  consultas,
                  reloj,
                  ids,
                  ajustes: new PrismaAjustes(prisma),
                }),
                registrarContacto: red.red.registrarContacto,
                red: new PrismaRed(prisma, flujo),
                consultas,
                idPorUrl: (url) => repo.idPorUrl(url.trim()),
              }),
            );
          },
          inject: [PRISMA, RELOJ, IDS, FLUJO, CasosDeRedInyectables],
        },
        {
          provide: CasosDeArriendos,
          useFactory: (prisma: PrismaClient, reloj: Reloj, ids: GeneradorId, flujo: FlujoDeEventos) =>
            new CasosDeArriendos({
              propiedades: new PrismaPropiedades(prisma, flujo),
              canales: new PrismaCanales(prisma),
              busqueda: new PrismaBusqueda(prisma),
              bandeja: new PrismaBandejaArriendos(prisma, flujo),
              ajustes: new PrismaAjustesArriendos(prisma),
              // En las pruebas no se sale a internet (BRECHA_GEOCODIFICADOR=apagado).
              ...(process.env.BRECHA_GEOCODIFICADOR === 'apagado'
                ? {}
                : {
                    geocodificador: new GeocodificadorNominatim(prisma, () =>
                      new PrismaAjustesArriendos(prisma).geocodificar(),
                    ),
                  }),
              reloj,
              ids,
            }),
          inject: [PRISMA, RELOJ, IDS, FLUJO],
        },
        { provide: APP_GUARD, useClass: AccesoGuard },
        CicloDeVida,
      ],
    };
  }
}
