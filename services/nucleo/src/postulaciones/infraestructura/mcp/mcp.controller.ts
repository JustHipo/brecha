import { All, Controller, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { SoloTokens } from '../../../acceso/decoradores';
import { CasosDeRedInyectables } from '../../../red/infraestructura/casos-de-red.provider';
import { CasosCsvInyectables } from '../../../csv/infraestructura/casos-csv.provider';
import { CasosDeUso } from '../casos';
import { crearServidorMcp } from './servidor-mcp';

/** MCP por HTTP dentro del núcleo (ADR 0018), en modo sin sesión: un servidor por pedido. */
@ApiExcludeController()
@Controller('mcp')
@SoloTokens('mcp')
export class McpController {
  constructor(
    @Inject(CasosDeUso) private readonly casos: CasosDeUso,
    @Inject(CasosDeRedInyectables) private readonly red: CasosDeRedInyectables,
    @Inject(CasosCsvInyectables) private readonly csv: CasosCsvInyectables,
  ) {}

  @Post()
  async pedido(@Req() req: Request, @Res() res: Response): Promise<void> {
    const servidor = crearServidorMcp(this.casos, this.red.red, this.csv.csv);
    const transporte = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transporte.close();
      void servidor.close();
    });
    await servidor.connect(transporte);
    await transporte.handleRequest(req, res, req.body);
  }

  @All()
  noPermitido(@Res() res: Response): void {
    res
      .status(405)
      .set('Allow', 'POST')
      .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Método no permitido' }, id: null });
  }
}
