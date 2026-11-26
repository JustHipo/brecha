import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SesionLocal } from '../acceso/sesion';
import { ErrorDeApi } from './error-de-api';
import { erroresInterceptor, tokenInterceptor } from './interceptores';

describe('interceptores', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([tokenInterceptor, erroresInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => ctrl.verify());

  const CODIGOS = [
    ['VALIDACION', 400],
    ['NO_ENCONTRADO', 404],
    ['YA_EXISTE', 409],
    ['CONFLICTO', 409],
    ['TRANSICION_INVALIDA', 422],
    ['AVISO_CERRADO', 422],
    ['ESTADO_TERMINAL', 422],
    ['ERROR_INTERNO', 500],
  ] as const;

  it.each(CODIGOS)(
    'convierte %s (%i) en un ErrorDeApi con su clave de idioma',
    async (codigo, status) => {
      const p = firstValueFrom(http.get('/api/v1/x'));
      ctrl
        .expectOne('/api/v1/x')
        .flush({ codigo, mensaje: 'm', campo: 'a' }, { status, statusText: 'x' });
      const e = await p.catch((x: unknown) => x);
      expect(e).toBeInstanceOf(ErrorDeApi);
      expect(e).toMatchObject({ codigo, status, campo: 'a', clave: `errores.${codigo}` });
    },
  );

  it('sin respuesta del núcleo da RED', async () => {
    const p = firstValueFrom(http.get('/api/v1/x'));
    ctrl.expectOne('/api/v1/x').error(new ProgressEvent('error'), { status: 0 });
    await expect(p).rejects.toMatchObject({ codigo: 'RED' });
  });

  it('YA_EXISTE trae el id de la postulación existente', async () => {
    const p = firstValueFrom(http.post('/api/v1/postulaciones', {}));
    ctrl
      .expectOne('/api/v1/postulaciones')
      .flush(
        { codigo: 'YA_EXISTE', mensaje: 'm', existenteId: 'abc' },
        { status: 409, statusText: 'x' },
      );
    await expect(p).rejects.toMatchObject({ existenteId: 'abc' });
  });

  it('un 401 olvida la sesión y manda a desbloquear', async () => {
    const sesion = TestBed.inject(SesionLocal);
    sesion.guardar('t', new Date(Date.now() + 60_000).toISOString());
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const p = firstValueFrom(http.get('/api/v1/postulaciones'));
    const req = ctrl.expectOne('/api/v1/postulaciones');
    expect(req.request.headers.get('Authorization')).toBe('Bearer t');
    req.flush({ codigo: 'NO_AUTENTICADO', mensaje: 'm' }, { status: 401, statusText: 'x' });
    await expect(p).rejects.toMatchObject({ codigo: 'NO_AUTENTICADO' });
    expect(sesion.actual()).toBeNull();
    expect(navegar).toHaveBeenCalledWith(['/desbloquear'], expect.anything());
  });

  it('la API de IA apagada (proxy con 500 sin cuerpo o sin red) da IA_APAGADA', async () => {
    const p = firstValueFrom(http.get('/api/ia/conexiones'));
    ctrl.expectOne('/api/ia/conexiones').flush('', { status: 500, statusText: 'x' });
    await expect(p).rejects.toMatchObject({ codigo: 'IA_APAGADA', clave: 'errores.IA_APAGADA' });
    const q = firstValueFrom(http.get('/api/ia/avisos'));
    ctrl.expectOne('/api/ia/avisos').error(new ProgressEvent('error'), { status: 0 });
    await expect(q).rejects.toMatchObject({ codigo: 'IA_APAGADA' });
  });

  it('la API de IA con codigo lo respeta (IA_NO_DISPONIBLE) y un 422 sin codigo es VALIDACION', async () => {
    const p = firstValueFrom(http.post('/api/ia/preguntas', {}));
    ctrl
      .expectOne('/api/ia/preguntas')
      .flush(
        { codigo: 'IA_NO_DISPONIBLE', mensaje: 'Falta la llave' },
        { status: 503, statusText: 'x' },
      );
    await expect(p).rejects.toMatchObject({ codigo: 'IA_NO_DISPONIBLE', status: 503 });
    const q = firstValueFrom(http.post('/api/ia/preguntas', {}));
    ctrl
      .expectOne('/api/ia/preguntas')
      .flush({ detail: [{ loc: ['body', 'pregunta'] }] }, { status: 422, statusText: 'x' });
    await expect(q).rejects.toMatchObject({ codigo: 'VALIDACION' });
  });

  it('la validación de la API de IA llega como 400 VALIDACION con su campo', async () => {
    const p = firstValueFrom(http.post('/api/ia/avisos', {}));
    ctrl
      .expectOne('/api/ia/avisos')
      .flush(
        { codigo: 'VALIDACION', mensaje: 'Field required', campo: 'titulo' },
        { status: 400, statusText: 'x' },
      );
    await expect(p).rejects.toMatchObject({
      codigo: 'VALIDACION',
      status: 400,
      campo: 'titulo',
      clave: 'errores.VALIDACION',
    });
  });

  it('una credencial que no pasa la prueba trae el mensaje del servidor', async () => {
    const p = firstValueFrom(http.put('/api/ia/credenciales/openai', { llave: 'sk-x' }));
    ctrl
      .expectOne('/api/ia/credenciales/openai')
      .flush(
        { codigo: 'CREDENCIAL_INVALIDA', mensaje: 'OpenAI rechazó la llave', campo: 'llave' },
        { status: 400, statusText: 'x' },
      );
    await expect(p).rejects.toMatchObject({
      codigo: 'CREDENCIAL_INVALIDA',
      message: 'OpenAI rechazó la llave',
      campo: 'llave',
    });
  });

  it('un 401 de la API de IA no cierra la sesión (puede ser el Host o el Origin)', async () => {
    const sesion = TestBed.inject(SesionLocal);
    sesion.guardar('t', new Date(Date.now() + 60_000).toISOString());
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const p = firstValueFrom(http.get('/api/ia/conexiones'));
    ctrl
      .expectOne('/api/ia/conexiones')
      .flush(
        { codigo: 'NO_AUTENTICADO', mensaje: 'Origen no permitido' },
        { status: 401, statusText: 'x' },
      );
    await expect(p).rejects.toMatchObject({ codigo: 'NO_AUTENTICADO' });
    expect(sesion.actual()).toBe('t');
    expect(navegar).not.toHaveBeenCalled();
  });

  it('sin sesión no pone cabecera (la pone Electron o el proxy)', () => {
    http.get('/api/v1/x').subscribe();
    const req = ctrl.expectOne('/api/v1/x');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });
});
