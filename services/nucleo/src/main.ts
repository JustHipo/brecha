import 'reflect-metadata';
import { SwaggerModule } from '@nestjs/swagger';
import { crearApp, documentoOpenApi } from './app';
import { cargarConfig } from './compartido/infraestructura/config';
import { montarConsolaYProxyDeIa } from './compartido/infraestructura/escritorio';

async function main() {
  const config = cargarConfig();
  const app = await crearApp(config);
  montarConsolaYProxyDeIa(app, {
    ...(process.env.CONSOLA_DIR ? { consolaDir: process.env.CONSOLA_DIR } : {}),
    ...(process.env.IA_URL ? { iaUrl: process.env.IA_URL } : {}),
  });
  SwaggerModule.setup('docs', app, documentoOpenApi(app));
  app.enableShutdownHooks();
  await app.listen(config.puerto, config.host);
  console.log(`Núcleo en http://${config.host}:${config.puerto}/api/v1 · OpenAPI en /docs · MCP en /mcp`);
}

void main();
