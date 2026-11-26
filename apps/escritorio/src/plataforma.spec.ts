import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  abiertaAlIniciarSesion,
  comandoDeShell,
  entradaDelLlavero,
  exe,
  puertoDePostgres,
  puertoDisponible,
  RegistroDePids,
} from './plataforma';
import { entradaAnteriorDelLlavero, servicioDelLlavero } from './servicios';

const carpeta = () => mkdtempSync(join(tmpdir(), 'plataforma-'));

describe('diferencias entre macOS y Windows', () => {
  it('los ejecutables llevan .exe solo en Windows', () => {
    expect(exe('postgres', 'win32')).toBe('postgres.exe');
    expect(exe('postgres', 'darwin')).toBe('postgres');
  });

  it('los hooks corren con /bin/sh en macOS y con cmd.exe en Windows', () => {
    expect(comandoDeShell('echo hola', 'darwin')).toEqual({
      programa: '/bin/sh',
      args: ['-c', 'echo hola'],
      opciones: {},
    });
    const w = comandoDeShell('C:\\hooks\\avisar.bat "con espacios"', 'win32');
    expect(w.programa.toLowerCase()).toMatch(/cmd\.exe$/);
    expect(w.args).toEqual(['/d', '/s', '/c', '"C:\\hooks\\avisar.bat "con espacios""']);
    expect(w.opciones.windowsVerbatimArguments).toBe(true);
  });

  it('el llavero usa la huella del binario en macOS y una entrada fija en Windows', () => {
    expect(entradaDelLlavero('abc123', 'darwin')).toBe('brecha-app-abc123');
    expect(entradaDelLlavero('abc123', 'win32')).toBe('brecha-app');
    expect(entradaDelLlavero(null, 'darwin')).toBe('brecha-app');
    const dir = carpeta();
    const ia = join(dir, 'brecha-ia');
    writeFileSync(ia, 'binario');
    expect(servicioDelLlavero(ia, 'darwin')).toMatch(/^brecha-app-[0-9a-f]{12}$/);
    expect(servicioDelLlavero(ia, 'win32')).toBe('brecha-app');
    // Firmado con una identidad estable (D63): entrada fija en macOS, no cambia al actualizar.
    expect(servicioDelLlavero(ia, 'darwin', () => true)).toBe('brecha-mac');
    expect(servicioDelLlavero(ia, 'darwin', () => false)).toMatch(/^brecha-app-[0-9a-f]{12}$/);
  });

  it('recuerda la entrada del llavero y avisa cuando cambió (una actualización)', () => {
    const dir = carpeta();
    expect(entradaAnteriorDelLlavero(dir, 'brecha-app-aaa')).toBeNull();
    expect(entradaAnteriorDelLlavero(dir, 'brecha-app-aaa')).toBeNull();
    expect(entradaAnteriorDelLlavero(dir, 'brecha-mac')).toBe('brecha-app-aaa');
    expect(entradaAnteriorDelLlavero(dir, 'brecha-mac')).toBeNull();
  });

  it('al iniciar sesión, Windows se reconoce por --oculta y macOS por wasOpenedAtLogin', () => {
    expect(abiertaAlIniciarSesion(['Brecha.exe', '--oculta'], undefined, 'win32')).toBe(true);
    expect(abiertaAlIniciarSesion(['Brecha.exe'], undefined, 'win32')).toBe(false);
    expect(abiertaAlIniciarSesion(['Brecha'], true, 'darwin')).toBe(true);
    expect(abiertaAlIniciarSesion(['Brecha', '--oculta'], false, 'darwin')).toBe(false);
  });
});

describe('puerto de PostgreSQL', () => {
  it('usa 5434 si está disponible y no escribe nada', async () => {
    const dir = carpeta();
    expect(await puertoDePostgres(dir, 5434, async () => true)).toBe(5434);
  });

  it('si 5434 no sirve, elige uno libre, lo guarda y lo reusa la próxima vez', async () => {
    const dir = carpeta();
    const ocupado = async (p: number) => p !== 5434;
    expect(await puertoDePostgres(dir, 5434, ocupado, async () => 61234)).toBe(61234);
    expect(JSON.parse(readFileSync(join(dir, 'puertos.json'), 'utf8'))).toEqual({ postgres: 61234 });
    expect(await puertoDePostgres(dir, 5434, ocupado, async () => 1)).toBe(61234);
  });

  it('vuelve a 5434 cuando se libera', async () => {
    const dir = carpeta();
    writeFileSync(join(dir, 'puertos.json'), JSON.stringify({ postgres: 61234 }));
    expect(await puertoDePostgres(dir, 5434, async () => true)).toBe(5434);
    expect(JSON.parse(readFileSync(join(dir, 'puertos.json'), 'utf8'))).toEqual({ postgres: 5434 });
  });

  it('reconoce un puerto tomado de verdad', async () => {
    const s = createServer();
    await new Promise<void>((r) => s.listen({ port: 0, host: '127.0.0.1' }, r));
    const puerto = (s.address() as { port: number }).port;
    expect(await puertoDisponible(puerto)).toBe(false);
    await new Promise<void>((r) => s.close(() => r()));
    expect(await puertoDisponible(puerto)).toBe(true);
  });
});

describe('procesos de la vez anterior', () => {
  it('detiene solo los que siguen vivos con el mismo ejecutable', async () => {
    const dir = carpeta();
    const pids = new RegistroDePids(dir);
    // Este proceso de prueba está vivo: hace de «huérfano». El PID 1 está vivo pero es otro ejecutable.
    pids.anotar('nucleo', process.ppid, '/App/Brecha');
    pids.anotar('postgres', 1, 'C:\\Brecha\\postgres.exe');
    pids.anotar('vigia', 999_999_9, 'brecha-ia');
    const muertos: number[] = [];
    const nombres: Record<number, string> = { [process.ppid]: 'Brecha', 1: 'launchd' };
    const detenidos = await pids.detenerHuerfanos(
      async (pid) => nombres[pid] ?? null,
      (pid) => muertos.push(pid),
      0,
    );
    expect(detenidos).toEqual(['nucleo']);
    expect(muertos).toEqual([process.ppid]);
    expect(pids.leer()).toEqual({});
  });

  it('anota y borra el PID de cada lanzamiento', () => {
    const pids = new RegistroDePids(carpeta());
    pids.anotar('ia-api', 4242, 'C:\\Programs\\Brecha\\resources\\ia\\brecha-ia.exe');
    expect(pids.leer()).toEqual({ 'ia-api': { pid: 4242, ejecutable: 'brecha-ia.exe' } });
    pids.anotar('ia-api', undefined, 'x');
    expect(pids.leer()).toEqual({});
  });
});
