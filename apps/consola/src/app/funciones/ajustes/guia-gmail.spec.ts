import { computed, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { Credenciales } from '../../nucleo/api/ia.service';
import { AjustesStore, type Operacion, type Resultado } from './ajustes.store';
import { ENLACES_GMAIL, GuiaGmail } from './guia-gmail';

function tiendaFalsa(ok: boolean) {
  const operacion = signal<Record<'correo' | 'openai', Operacion>>({
    correo: 'quieta',
    openai: 'quieta',
  });
  const resultado = signal<Record<'correo' | 'openai', Resultado | null>>({
    correo: null,
    openai: null,
  });
  return {
    operacion,
    resultado,
    credenciales: signal<Credenciales | null>({
      correo: { configurado: false, usuario: null },
      openai: { configurado: false },
    }),
    apagada: computed(() => false),
    guardarCorreo: vi.fn(async () => {
      if (!ok)
        resultado.set({
          correo: { tipo: 'error', error: {} as never, mensaje: 'Gmail no aceptó el correo' },
          openai: null,
        });
      return ok;
    }),
  };
}

async function montar(ok = true): Promise<{
  f: ComponentFixture<GuiaGmail>;
  tienda: ReturnType<typeof tiendaFalsa>;
  el: HTMLElement;
}> {
  const tienda = tiendaFalsa(ok);
  await TestBed.configureTestingModule({
    imports: [GuiaGmail, TranslocoTestingModule.forRoot({ langs: { es: {} } })],
    providers: [{ provide: AjustesStore, useValue: tienda }],
  }).compileComponents();
  const f = TestBed.createComponent(GuiaGmail);
  f.detectChanges();
  return { f, tienda, el: f.nativeElement as HTMLElement };
}

const boton = (el: HTMLElement, texto: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(texto))!;

describe('Conectar con Gmail', () => {
  it('empieza cerrada y recorre los 4 pasos con sus enlaces a Google', async () => {
    const { f, el } = await montar();
    expect(el.querySelector('[data-guia-gmail]')).toBeNull();
    (el.querySelector('[data-conectar-gmail]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(el.querySelector('[data-guia-gmail]')).not.toBeNull();
    expect(el.querySelector(`a[href="${ENLACES_GMAIL.dosPasos}"]`)).not.toBeNull();
    expect(el.querySelector('[aria-current="step"]')?.textContent).toContain(
      'ajustes.gmail.pasoDe',
    );

    boton(el, 'ajustes.gmail.siguiente').click();
    f.detectChanges();
    expect(el.querySelector(`a[href="${ENLACES_GMAIL.contrasenas}"]`)).not.toBeNull();
    expect(
      el.querySelector(`a[href="${ENLACES_GMAIL.contrasenas}"]`)?.getAttribute('rel'),
    ).toContain('noopener');

    boton(el, 'ajustes.gmail.siguiente').click();
    f.detectChanges();
    boton(el, 'ajustes.gmail.siguiente').click();
    f.detectChanges();
    expect(el.querySelector('form')).not.toBeNull();
    expect(boton(el, 'ajustes.gmail.siguiente')).toBeUndefined();

    boton(el, 'ajustes.gmail.atras').click();
    f.detectChanges();
    expect(el.querySelector('form')).toBeNull();
    boton(el, 'ajustes.gmail.cancelar').click();
    f.detectChanges();
    expect(el.querySelector('[data-guia-gmail]')).toBeNull();
  });

  it('pide 16 letras, borra la contraseña del formulario al enviarla y se cierra si Gmail la acepta', async () => {
    const { f, el, tienda } = await montar(true);
    const guia = f.componentInstance;
    guia.ir(4);
    f.detectChanges();
    const correo = el.querySelector('input[type="email"]') as HTMLInputElement;
    const clave = el.querySelector('input[type="password"]') as HTMLInputElement;
    const enviar = boton(el, 'ajustes.gmail.probarYGuardar');
    correo.value = 'tamara@gmail.com';
    correo.dispatchEvent(new Event('input'));
    clave.value = 'abcd efgh ijkl mno';
    clave.dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(enviar.disabled).toBe(true);
    clave.value = 'abcd efgh ijkl mnop';
    clave.dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(enviar.disabled).toBe(false);

    await guia.guardar();
    f.detectChanges();
    expect(tienda.guardarCorreo).toHaveBeenCalledWith('tamara@gmail.com', 'abcd efgh ijkl mnop');
    expect(guia.paso()).toBe(0);
  });

  it('si Gmail la rechaza, se queda en el paso 4 sin la contraseña y muestra qué revisar', async () => {
    const { f, el } = await montar(false);
    const guia = f.componentInstance;
    guia.ir(4);
    f.detectChanges();
    const correo = el.querySelector('input[type="email"]') as HTMLInputElement;
    const clave = el.querySelector('input[type="password"]') as HTMLInputElement;
    correo.value = 'tamara@gmail.com';
    correo.dispatchEvent(new Event('input'));
    clave.value = 'abcdefghijklmnop';
    clave.dispatchEvent(new Event('input'));
    f.detectChanges();

    await guia.guardar();
    f.detectChanges();
    expect(guia.paso()).toBe(4);
    expect((el.querySelector('input[type="password"]') as HTMLInputElement).value).toBe('');
    expect((el.querySelector('input[type="email"]') as HTMLInputElement).value).toBe(
      'tamara@gmail.com',
    );
    expect(el.querySelector('[data-resultado="gmail"]')?.textContent).toContain(
      'Gmail no aceptó el correo',
    );
    expect(el.querySelector('[data-ayuda-gmail]')).not.toBeNull();
  });
});
