import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { avisoDe } from './notificaciones';
import { ProcesoPorArranque, ProcesoSupervisado } from './proceso';
import { Registro } from './registro';
import { puertos, rutas } from './rutas';

describe('avisos del sistema', () => {
  it('avisa lo que cambió solo, las discrepancias y las novedades sin aplicar', () => {
    const cambio = avisoDe(
      {
        tipo: 'postulacion.estado_cambiado',
        datos: { postulacionId: 'p1', a: 'rechazado', origen: 'senal' },
      },
      'Ficticia · Backend',
    );
    expect(cambio).toEqual({
      titulo: 'Ficticia · Backend: rechazada',
      cuerpo: 'Lo movió un correo que llegó.',
      ruta: '/postulaciones/p1',
    });
    expect(
      avisoDe({ tipo: 'postulacion.estado_cambiado', datos: { a: 'postulado', origen: 'tablero' } }, 'X'),
    ).toBeNull();
    expect(
      avisoDe({ tipo: 'postulacion.discrepancia_detectada', datos: { postulacionId: 'p1' } }, 'X')?.titulo,
    ).toBe('Revisa X');
    expect(
      avisoDe(
        {
          tipo: 'postulacion.senal_registrada',
          datos: { aplicada: false, resumen: 'Te invitan a entrevista' },
        },
        'X',
      )?.cuerpo,
    ).toBe('Te invitan a entrevista');
  });
});

describe('rutas y puertos', () => {
  it('empaquetada usa Resources; en desarrollo, el repo', () => {
    expect(rutas(true, '/App/Resources', 'darwin').ia).toBe(join('/App/Resources', 'ia', 'brecha-ia'));
    expect(rutas(true, '/App/Resources', 'win32').ia).toBe(join('/App/Resources', 'ia', 'brecha-ia.exe'));
    expect(rutas(false, '').nucleo.endsWith(join('services', 'nucleo'))).toBe(true);
  });
  it('los puertos se pueden cambiar solo con los tres', () => {
    expect(puertos({})).toEqual({ postgres: 5434, nucleo: 4300, ia: 4400 });
    expect(puertos({ BRECHA_PUERTOS: '5444,4310,4410' })).toEqual({ postgres: 5444, nucleo: 4310, ia: 4410 });
    expect(puertos({ BRECHA_PUERTOS: '5444' }).nucleo).toBe(4300);
  });
});

describe('registro y supervisor', () => {
  it('rota el registro al pasar el tope', () => {
    const dir = mkdtempSync(join(tmpdir(), 'reg-'));
    const r = new Registro(dir);
    writeFileSync(r.ruta('x'), 'a'.repeat(6 * 1024 * 1024));
    r.escribir('x', 'hola');
    expect(readFileSync(r.ruta('x'), 'utf8')).toMatch(/ hola\n$/);
    expect(readFileSync(`${r.ruta('x')}.1`, 'utf8').length).toBe(6 * 1024 * 1024);
  });

  it('reinicia un proceso que se cae y lo detiene a pedido', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sup-'));
    const marca = join(dir, 'veces');
    const codigo = `const f=require('fs');const p=${JSON.stringify(marca)};const n=(f.existsSync(p)?+f.readFileSync(p,'utf8'):0)+1;f.writeFileSync(p,String(n));if(n<2)process.exit(1);setInterval(()=>{},1000)`;
    const p = new ProcesoSupervisado(
      { nombre: 'prueba', comando: process.execPath, args: ['-e', codigo], env: process.env, listoTras: 200 },
      new Registro(dir),
      () => {},
    );
    p.iniciar();
    await new Promise((r) => setTimeout(r, 1_800));
    expect(readFileSync(marca, 'utf8')).toBe('2');
    expect(p.estado).toBe('corriendo');
    await p.detener();
    expect(p.estado).toBe('detenido');
    expect(readFileSync(join(dir, 'prueba.log'), 'utf8')).toContain('se cayó');
  });

  it('vigila por PID lo que arranca otro programa (PostgreSQL con pg_ctl en Windows) y lo rearranca si se cae', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'arr-'));
    let vivos = new Set<number>();
    let siguiente = 100;
    const anotados: (number | undefined)[] = [];
    const parar = vi.fn(async () => {
      vivos = new Set();
    });
    const p = new ProcesoPorArranque(
      {
        nombre: 'postgres',
        arrancar: async () => {
          siguiente += 1;
          vivos.add(siguiente);
          return siguiente;
        },
        parar,
        vivo: (pid) => vivos.has(pid),
        alLanzar: (pid) => anotados.push(pid),
        cadaMs: 50,
      },
      new Registro(dir),
      () => {},
    );
    p.iniciar();
    await new Promise((r) => setTimeout(r, 100));
    expect(p.estado).toBe('corriendo');
    vivos.delete(101); // se cae solo
    await new Promise((r) => setTimeout(r, 1_300));
    expect(p.estado).toBe('corriendo');
    expect(anotados).toEqual([101, undefined, 102]);
    expect(readFileSync(join(dir, 'app.log'), 'utf8')).toContain('postgres se cayó');
    await p.detener();
    expect(parar).toHaveBeenCalledOnce();
    expect(p.estado).toBe('detenido');
  });
});
