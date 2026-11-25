import { RequestMethod, ValidationPipe, type INestApplication, type LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, raw, type NextFunction, type Request, type Response } from 'express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { ValidationError } from 'class-validator';
import { AppModule } from './app.module';
import type { Reloj } from './compartido/dominio/puertos';
import type { Config } from './compartido/infraestructura/config';
import { FiltroDeErrores } from './compartido/infraestructura/filtro-de-errores';
import { DatoInvalido } from './postulaciones/dominio/errores';
import type { ObtenedorDeImagenes } from './arriendos/aplicacion/puertos';

/** El primer error de validación, con la ruta completa del campo (p. ej. `aviso.url`). */
function primerError(errores: ValidationError[], prefijo = ''): DatoInvalido {
  const e = errores[0]!;
  const campo = prefijo ? `${prefijo}.${e.property}` : e.property;
  if (e.children?.length) return primerError(e.children, campo);
  const mensaje = Object.values(e.constraints ?? {})[0] ?? 'Dato inválido';
  return new DatoInvalido(campo, mensaje.replace(/^property /, ''));
}

export async function crearApp(
  config: Config,
  opciones: { logger?: LogLevel[] | false; reloj?: Reloj; obtenerImagenes?: ObtenedorDeImagenes } = {},
): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.para(config, {
      ...(opciones.reloj ? { reloj: opciones.reloj } : {}),
      ...(opciones.obtenerImagenes ? { obtenerImagenes: opciones.obtenerImagenes } : {}),
    }),
    {
      logger: opciones.logger ?? ['error', 'warn', 'log'],
      // El stream SSE de la consola queda abierto: sin esto, app.close() espera para siempre
      // y el modo watch nunca levanta el proceso nuevo.
      forceCloseConnections: true,
    },
  );
  // Un CSV de cientos de filas con requisitos en texto pasa los 100 KB que Express acepta por defecto. Solo en
  // esa ruta: un parser global leería también el cuerpo de /api/ia antes de que el proxy lo reenvíe.
  // Va envuelto: Nest no registra su parser JSON global si ya ve un middleware llamado `jsonParser`.
  const jsonGrande = json({ limit: '6mb' });
  app.use('/api/v1/csv/importar', function cuerpoDeCsv(req: Request, res: Response, next: NextFunction) {
    jsonGrande(req, res, next);
  });
  // Fotos que sube la consola (docs/diseno/fotos-propiedades.md §4): el archivo va tal cual en el cuerpo, hasta 10 MB.
  const imagen = raw({ limit: '10mb', type: ['image/*', 'application/octet-stream'] });
  app.use(
    '/api/v1/arriendos/propiedades/:id/fotos/archivo',
    function cuerpoDeFoto(req: Request, res: Response, next: NextFunction) {
      imagen(req, res, (e?: unknown) => {
        if ((e as { type?: string } | undefined)?.type === 'entity.too.large') {
          res
            .status(400)
            .json({ codigo: 'VALIDACION', mensaje: 'La imagen pesa más de 10 MB', campo: 'archivo' });
          return;
        }
        next(e);
      });
    },
  );
  app.setGlobalPrefix('api/v1', { exclude: [{ path: 'mcp', method: RequestMethod.ALL }] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errores) => primerError(errores),
    }),
  );
  app.useGlobalFilters(new FiltroDeErrores());
  app.enableCors({ origin: config.consolaOrigen, credentials: false });
  return app;
}

export function documentoOpenApi(app: INestApplication): OpenAPIObject {
  const doc = new DocumentBuilder()
    .setTitle('Brecha · núcleo')
    .setDescription(
      'API local del núcleo de Brecha (PLAN §12.1). Escucha solo en 127.0.0.1 y siempre pide token.',
    )
    .setVersion('1')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, doc, { operationIdFactory: (_c, m) => m });
}
