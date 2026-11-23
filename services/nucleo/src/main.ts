import 'reflect-metadata';
import { SwaggerModule } from '@nestjs/swagger';
import { crearApp, documentoOpenApi } from './app';
import { cargarConfig } from './compartido/infraestructura/config';

async function main() {
  const config = cargarConfig();
  const app = await crearApp(config);
  SwaggerModule.setup('docs', app, documentoOpenApi(app));
  app.enableShutdownHooks();
  await app.listen(config.puerto, config.host);
  console.log(`Núcleo en http://${config.host}:${config.puerto}/api/v1 · OpenAPI en /docs · MCP en /mcp`);
}

void main();
