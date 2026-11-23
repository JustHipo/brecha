import { RequestMethod, ValidationPipe, type INestApplication, type LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { ValidationError } from 'class-validator';
import { AppModule } from './app.module';
import type { Reloj } from './compartido/dominio/puertos';
import type { Config } from './compartido/infraestructura/config';
import { FiltroDeErrores } from './compartido/infraestructura/filtro-de-errores';
import { DatoInvalido } from './postulaciones/dominio/errores';

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
  opciones: { logger?: LogLevel[] | false; reloj?: Reloj } = {},
): Promise<INestApplication> {
  const app = await NestFactory.create(
    AppModule.para(config, { ...(opciones.reloj ? { reloj: opciones.reloj } : {}) }),
    {
      logger: opciones.logger ?? ['error', 'warn', 'log'],
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
