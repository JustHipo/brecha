import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Foco, focoDeUrl } from './foco';

@Component({ template: '' })
class Vacia {}

describe('foco', () => {
  it('sale de la URL: /arriendos es Arriendos, Ajustes no decide y el resto es Empleo', () => {
    expect(focoDeUrl('/arriendos/tablero')).toBe('arriendos');
    expect(focoDeUrl('/arriendos')).toBe('arriendos');
    expect(focoDeUrl('/arriendos/propiedades/1?x=1')).toBe('arriendos');
    expect(focoDeUrl('/arriendosx')).toBe('empleo');
    expect(focoDeUrl('/tablero')).toBe('empleo');
    expect(focoDeUrl('/postulaciones/abc#nota')).toBe('empleo');
    expect(focoDeUrl('/ajustes')).toBeNull();
    expect(focoDeUrl('/conexiones')).toBeNull();
  });

  describe('servicio', () => {
    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({
        providers: [
          provideRouter([
            { path: 'tablero', component: Vacia },
            { path: 'lista', component: Vacia },
            { path: 'ajustes', component: Vacia },
            { path: 'arriendos/tablero', component: Vacia },
            { path: 'arriendos/mapa', component: Vacia },
          ]),
        ],
      });
    });

    it('al cambiar vuelve a la última pantalla de cada foco y pinta data-foco', async () => {
      const foco = TestBed.inject(Foco);
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/lista');
      await router.navigateByUrl('/arriendos/mapa');
      expect(foco.actual()).toBe('arriendos');
      foco.cambiar('empleo');
      await new Promise((r) => setTimeout(r));
      expect(router.url).toBe('/lista');
      foco.cambiar('arriendos');
      await new Promise((r) => setTimeout(r));
      expect(router.url).toBe('/arriendos/mapa');
      TestBed.tick();
      expect(document.documentElement.dataset['foco']).toBe('arriendos');
    });

    it('Ajustes no cambia el foco y la app recuerda el último al volver a abrir', async () => {
      const router = TestBed.inject(Router);
      const foco = TestBed.inject(Foco);
      await router.navigateByUrl('/arriendos/tablero');
      await router.navigateByUrl('/ajustes');
      expect(foco.actual()).toBe('arriendos');
      TestBed.tick();
      expect(JSON.parse(localStorage.getItem('brecha.foco')!).foco).toBe('arriendos');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
      expect(TestBed.inject(Foco).inicioRecordado()).toBe('/arriendos/tablero');
    });

    it('sin nada guardado parte en Empleo', () => {
      localStorage.setItem('brecha.foco', '{malo');
      expect(TestBed.inject(Foco).inicioRecordado()).toBe('/tablero');
    });
  });
});
