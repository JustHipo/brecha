import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { firstValueFrom } from 'rxjs';
import {
  ApiArriendos,
  type CrearPropiedad,
  type Duplicados,
  type Propiedad,
} from '../../nucleo/api/arriendos.api';
import { Avisos } from '../../nucleo/avisos';
import { esErrorDeApi } from '../../nucleo/errores/error-de-api';
import { ArriendosStore } from './arriendos.store';
import { CalceArriendo, precioTexto } from './piezas';

const vacio = () => ({
  url: '',
  canalId: '',
  tipo: 'departamento',
  direccion: '',
  comuna: '',
  monto: null as number | null,
  moneda: 'CLP' as 'CLP' | 'UF',
  gastosComunes: null as number | null,
  dormitorios: null as number | null,
  banos: null as number | null,
  contacto: '',
  telefono: '',
  nota: '',
});

/**
 * Agregar una propiedad a mano (P3 y P4): antes de crear revisa si ya la sigues (misma URL o dirección) y,
 * si es la misma en otro portal, ofrece sumar la publicación en vez de duplicarla.
 */
@Component({
  selector: 'b-nueva-propiedad',
  imports: [RouterLink, FormsModule, TranslocoPipe, HlmButton, HlmInput, CalceArriendo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex max-w-[880px] flex-col gap-4 px-6 pt-[22px] pb-10' },
  template: `
    <a routerLink="/arriendos/tablero" class="text-tinta-suave no-underline hover:underline"
      >← {{ 'arriendos.volver' | transloco }}</a
    >
    <h1 class="titulo-pagina m-0">{{ 'arriendos.nueva' | transloco }}</h1>
    <p class="m-0 text-tinta-suave">{{ 'arriendos.nuevaAyuda' | transloco }}</p>

    <form class="grid grid-cols-2 gap-3 md:grid-cols-4" (submit)="$event.preventDefault(); crear()">
      <label class="col-span-2 flex flex-col gap-1 md:col-span-3">
        <span class="font-semibold">{{ 'arriendos.urlAviso' | transloco }}</span>
        <input hlmInput name="url" [(ngModel)]="f.url" (blur)="revisar()" data-campo-url />
      </label>
      <label class="flex flex-col gap-1">
        <span class="font-semibold">{{ 'arriendos.canal' | transloco }}</span>
        <select hlmInput name="canal" [(ngModel)]="f.canalId">
          <option value="">{{ 'arriendos.porUrl' | transloco }}</option>
          @for (c of store.canales(); track c.id) {
            <option [value]="c.id">{{ c.nombre }}</option>
          }
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="font-semibold">{{ 'arriendos.campos.tipo' | transloco }}</span>
        <select hlmInput name="tipo" [(ngModel)]="f.tipo">
          @for (t of tipos; track t) {
            <option [value]="t">{{ 'tiposPropiedad.' + t | transloco }}</option>
          }
        </select>
      </label>
      <label class="col-span-1 flex flex-col gap-1 md:col-span-2">
        <span class="font-semibold">{{ 'arriendos.campos.direccion' | transloco }}</span>
        <input hlmInput name="direccion" [(ngModel)]="f.direccion" (blur)="revisar()" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="font-semibold">{{ 'arriendos.campos.comuna' | transloco }}</span>
        <input hlmInput name="comuna" [(ngModel)]="f.comuna" (blur)="revisar()" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="font-semibold">{{ 'arriendos.campos.precio' | transloco }}</span>
        <input hlmInput type="number" min="0" step="any" name="monto" [(ngModel)]="f.monto" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="font-semibold">{{ 'arriendos.campos.moneda' | transloco }}</span>
        <select hlmInput name="moneda" [(ngModel)]="f.moneda">
          <option value="CLP">CLP</option>
          <option value="UF">UF</option>
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="font-semibold">{{ 'arriendos.campos.gastosComunes' | transloco }}</span>
        <input hlmInput type="number" min="0" name="gc" [(ngModel)]="f.gastosComunes" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="font-semibold">{{ 'arriendos.campos.dormitorios' | transloco }}</span>
        <input
          hlmInput
          type="number"
          min="0"
          name="dorm"
          [(ngModel)]="f.dormitorios"
          (blur)="revisar()"
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="font-semibold">{{ 'arriendos.campos.banos' | transloco }}</span>
        <input hlmInput type="number" min="0" name="banos" [(ngModel)]="f.banos" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="font-semibold">{{ 'arriendos.contactoNombre' | transloco }}</span>
        <input hlmInput name="contacto" [(ngModel)]="f.contacto" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="font-semibold">{{ 'arriendos.telefono' | transloco }}</span>
        <input hlmInput name="telefono" [(ngModel)]="f.telefono" />
      </label>
      <label class="col-span-2 flex flex-col gap-1 md:col-span-4">
        <span class="font-semibold">{{ 'arriendos.nota' | transloco }}</span>
        <textarea hlmInput class="min-h-16" name="nota" [(ngModel)]="f.nota"></textarea>
      </label>

      @if (dup(); as d) {
        @if (d.seguro || d.candidatos.length) {
          <div
            role="status"
            class="col-span-2 flex flex-col gap-2 rounded-[10px] border border-aviso-borde bg-aviso-fondo p-3 text-aviso-tinta md:col-span-4"
            data-duplicados
          >
            <strong>{{
              (d.seguro ? 'arriendos.yaLaSigues' : 'arriendos.posibleDuplicado') | transloco
            }}</strong>
            @for (x of d.seguro ? [d.seguro] : d.candidatos; track x.id) {
              <div class="flex flex-wrap items-center gap-2 text-tinta">
                <a [routerLink]="['/arriendos/propiedades', x.id]">{{ x.titulo }}</a>
                <span class="tabular-nums">{{ precio(x) }}</span>
                <b-calce-arriendo [calce]="x.calce" />
                @if (!d.seguro) {
                  <button hlmBtn variant="outline" size="xs" type="button" (click)="crear(x)">
                    {{ 'arriendos.sumarPublicacion' | transloco }}
                  </button>
                }
              </div>
            }
          </div>
        }
      }

      <div class="col-span-2 flex justify-end gap-2 md:col-span-4">
        <button hlmBtn type="submit" [disabled]="enviando() || !!dup()?.seguro">
          {{ 'arriendos.crear' | transloco }}
        </button>
      </div>
    </form>
  `,
})
export class NuevaPropiedadPagina {
  protected readonly store = inject(ArriendosStore);
  private readonly api = inject(ApiArriendos);
  private readonly avisos = inject(Avisos);
  private readonly router = inject(Router);
  protected readonly tipos = ['departamento', 'casa', 'pieza', 'otro'] as const;
  protected readonly precio = precioTexto;
  protected readonly dup = signal<Duplicados | null>(null);
  protected readonly enviando = signal(false);
  protected f = vacio();

  constructor() {
    if (this.store.estado() === 'inicial') void this.store.cargar();
  }

  protected async revisar(): Promise<void> {
    const url = this.f.url.trim();
    const direccion = this.f.direccion.trim();
    if (!url && !direccion) return this.dup.set(null);
    try {
      this.dup.set(
        await firstValueFrom(
          this.api.duplicados({
            ...(url ? { url } : {}),
            ...(direccion ? { direccion } : {}),
            ...(this.f.comuna.trim() ? { comuna: this.f.comuna.trim() } : {}),
            ...(this.f.dormitorios !== null ? { dormitorios: Number(this.f.dormitorios) } : {}),
          }),
        ),
      );
    } catch {
      this.dup.set(null); // URL a medio escribir: se revisa de nuevo al crear
    }
  }

  /** Crea, o con `unirA` suma esta publicación a una propiedad que ya sigues. */
  protected async crear(unirA?: Propiedad): Promise<void> {
    const f = this.f;
    const n = (v: number | null) => (v === null || (v as unknown) === '' ? undefined : Number(v));
    const cuerpo: CrearPropiedad = {
      tipo: f.tipo as CrearPropiedad['tipo'],
      ...(f.direccion.trim() ? { direccion: f.direccion.trim() } : {}),
      ...(f.comuna.trim() ? { comuna: f.comuna.trim() } : {}),
      ...(n(f.monto) ? { precio: { monto: n(f.monto)!, moneda: f.moneda } } : {}),
      ...(n(f.gastosComunes) !== undefined ? { gastosComunes: n(f.gastosComunes) } : {}),
      ...(n(f.dormitorios) !== undefined ? { dormitorios: n(f.dormitorios) } : {}),
      ...(n(f.banos) !== undefined ? { banos: n(f.banos) } : {}),
      ...(f.url.trim() || f.canalId
        ? {
            publicacion: {
              ...(f.url.trim() ? { url: f.url.trim() } : {}),
              ...(f.canalId ? { canalId: f.canalId } : {}),
            },
          }
        : {}),
      ...(f.contacto.trim()
        ? {
            contactos: [
              {
                nombre: f.contacto.trim(),
                ...(f.telefono.trim() ? { telefono: f.telefono.trim() } : {}),
                ...(f.canalId ? { canalId: f.canalId } : {}),
              },
            ],
          }
        : {}),
      ...(f.nota.trim() ? { nota: f.nota.trim() } : {}),
      ...(unirA ? { unirA: unirA.id } : {}),
    };
    this.enviando.set(true);
    try {
      const r = await firstValueFrom(this.api.crear(cuerpo));
      void this.store.cargar(true);
      this.avisos.exito(r.unida ? 'arriendos.unida' : 'arriendos.creada');
      void this.router.navigate(['/arriendos/propiedades', r.propiedad.id]);
    } catch (e) {
      if (esErrorDeApi(e) && e.codigo === 'YA_EXISTE' && e.existenteId) {
        this.avisos.aviso(
          'arriendos.yaLaSigues',
          {},
          {
            clave: 'arriendos.abrirFicha',
            hacer: () => void this.router.navigate(['/arriendos/propiedades', e.existenteId]),
          },
        );
      } else this.avisos.error(e);
    } finally {
      this.enviando.set(false);
    }
  }
}
