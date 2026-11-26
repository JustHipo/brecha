import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ejecutarHook, hooksPara, leerHooks } from './hooks';
import { Registro } from './registro';

const dir = () => mkdtempSync(join(tmpdir(), 'hooks-'));

describe('hooks', () => {
  it('lee hooks.json y filtra por tipo, comodín y URL local', () => {
    const d = dir();
    writeFileSync(
      join(d, 'hooks.json'),
      JSON.stringify({
        'postulacion.creada': [{ comando: 'echo hola' }, { url: 'https://afuera.test/x' }],
        '*': [{ url: 'http://127.0.0.1:9/x' }],
      }),
    );
    const h = leerHooks(d, new Registro(d));
    expect(hooksPara(h, 'postulacion.creada')).toEqual([
      { comando: 'echo hola' },
      { url: 'http://127.0.0.1:9/x' },
    ]);
    expect(hooksPara(h, 'otro')).toEqual([{ url: 'http://127.0.0.1:9/x' }]);
  });

  it('un hooks.json roto no rompe nada y queda en el registro', () => {
    const d = dir();
    writeFileSync(join(d, 'hooks.json'), '{ roto');
    expect(leerHooks(d, new Registro(d))).toEqual({});
    expect(readFileSync(join(d, 'hooks.log'), 'utf8')).toContain('no es válido');
  });

  it('el comando recibe el evento por la entrada estándar', async () => {
    const d = dir();
    const salida = join(d, 'evento.json');
    await ejecutarHook({ comando: `cat > ${salida}` }, { tipo: 'x', datos: { a: 1 } }, new Registro(d));
    expect(JSON.parse(readFileSync(salida, 'utf8'))).toEqual({ tipo: 'x', datos: { a: 1 } });
  });

  it('la URL local recibe el evento por POST', async () => {
    let recibido = '';
    const s = createServer((req, res) => {
      req.on('data', (c) => (recibido += c));
      req.on('end', () => res.end('ok'));
    });
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
    const d = dir();
    await ejecutarHook(
      { url: `http://127.0.0.1:${(s.address() as AddressInfo).port}/` },
      { tipo: 'y' },
      new Registro(d),
    );
    s.close();
    expect(JSON.parse(recibido)).toEqual({ tipo: 'y' });
  });
});
