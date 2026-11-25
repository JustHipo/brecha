import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injectable,
  input,
  output,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { firstValueFrom } from 'rxjs';
import { ApiArriendos, type Foto, type FotosAgregadas } from '../../nucleo/api/arriendos.api';
import { Avisos } from '../../nucleo/avisos';
import { aError } from './arriendos.store';

/**
 * Las imágenes se piden con el token y se muestran como `blob:` (docs/diseno/fotos-propiedades.md F-D12): con clave
 * local nadie agrega el token a un `<img src>`. El id de una foto no cambia, así que se guarda mientras dure la sesión.
 */
@Injectable({ providedIn: 'root' })
export class ImagenesDeFotos {
  private readonly api = inject(ApiArriendos);
  private readonly cache = new Map<string, WritableSignal<string | 'error' | null>>();

  url(fotoId: string): Signal<string | 'error' | null> {
    let s = this.cache.get(fotoId);
    if (!s) {
      const nueva = signal<string | 'error' | null>(null);
      this.cache.set(fotoId, nueva);
      this.api.imagen(fotoId).subscribe({
        next: (b) => nueva.set(URL.createObjectURL(b)),
        error: () => {
          nueva.set('error');
          // Se puede volver a intentar la próxima vez que se pida.
          this.cache.delete(fotoId);
        },
      });
      s = nueva;
    }
    return s;
  }

  /** Una foto quitada: suelta la memoria del `blob:`. */
  olvidar(fotoId: string): void {
    const u = this.cache.get(fotoId)?.();
    if (u && u !== 'error') URL.revokeObjectURL(u);
    this.cache.delete(fotoId);
  }
}

/** Una foto guardada en Brecha: espacio reservado mientras llega, aviso si no se puede mostrar. */
@Component({
  selector: 'b-foto',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block overflow-hidden bg-superficie' },
  template: `
    @let u = url();
    @if (u && u !== 'error') {
      <img [src]="u" [alt]="alt()" [class]="'block h-full w-full ' + ajuste()" draggable="false" />
    } @else if (u === 'error') {
      <span
        role="img"
        [attr.aria-label]="alt()"
        class="flex h-full w-full items-center justify-center p-2 text-center text-[12px] text-tinta-suave"
        >{{ 'arriendos.fotos.noCarga' | transloco }}</span
      >
    } @else {
      <span role="img" [attr.aria-label]="alt()" class="block h-full w-full animate-pulse"></span>
    }
  `,
})
export class FotoGuardada {
  readonly fotoId = input.required<string>();
  readonly alt = input.required<string>();
  /** `object-cover` para miniaturas, `object-contain` para la grande. */
  readonly ajuste = input<'object-cover' | 'object-contain'>('object-cover');
  private readonly imagenes = inject(ImagenesDeFotos);
  protected readonly url = computed(() => this.imagenes.url(this.fotoId())());
}

const TIPOS_ACEPTADOS = 'image/jpeg,image/png,image/webp';

/**
 * Galería de la ficha (fotos-propiedades.md §6): la portada grande, las demás en miniatura, y para agregar
 * URL (Brecha las descarga) o archivos de tu equipo. La portada es la primera (F-D2).
 */
@Component({
  selector: 'b-galeria-fotos',
  imports: [FormsModule, TranslocoPipe, HlmButton, HlmInput, FotoGuardada],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      class="flex flex-col gap-3 rounded-[12px] border border-linea p-4"
      aria-labelledby="t-fotos"
      data-galeria
    >
      <h2 id="t-fotos" class="m-0 text-base font-bold">
        {{ 'arriendos.fotos.titulo' | transloco }}
        @if (fotos().length) {
          <span class="font-normal text-tinta-suave">· {{ fotos().length }}</span>
        }
      </h2>

      @if (elegida(); as f) {
        <figure class="m-0 flex flex-col gap-2">
          <b-foto
            class="h-[300px] rounded-[10px] sm:h-[380px]"
            ajuste="object-contain"
            [fotoId]="f.id"
            [alt]="altDe(f)"
            data-foto-grande
          />
          <figcaption class="flex flex-wrap items-center gap-2 text-[12.5px] text-tinta-suave">
            @if (f.portada) {
              <span class="rounded-full bg-acento px-2 py-px font-semibold text-white">{{
                'arriendos.fotos.portada' | transloco
              }}</span>
            }
            @if (f.urlOrigen) {
              <a [href]="f.urlOrigen" target="_blank" rel="noopener noreferrer" class="break-all">{{
                'arriendos.fotos.original' | transloco
              }}</a>
            } @else if (f.nombreOrigen) {
              <span class="break-all">{{ f.nombreOrigen }}</span>
            }
            <span class="flex-1"></span>
            @if (!f.portada) {
              <button
                hlmBtn
                variant="outline"
                size="sm"
                type="button"
                [disabled]="ocupado()"
                (click)="portada(f)"
              >
                {{ 'arriendos.fotos.usarPortada' | transloco }}
              </button>
            }
            @if (confirmarQuitar() === f.id) {
              <button
                hlmBtn
                variant="destructive"
                size="sm"
                type="button"
                [disabled]="ocupado()"
                (click)="quitar(f)"
              >
                {{ 'arriendos.fotos.siQuitar' | transloco }}
              </button>
              <button
                hlmBtn
                variant="ghost"
                size="sm"
                type="button"
                (click)="confirmarQuitar.set(null)"
              >
                {{ 'arriendos.fotos.cancelar' | transloco }}
              </button>
            } @else {
              <button
                hlmBtn
                variant="ghost"
                size="sm"
                type="button"
                [disabled]="ocupado()"
                (click)="confirmarQuitar.set(f.id)"
              >
                {{ 'arriendos.fotos.quitar' | transloco }}
              </button>
            }
          </figcaption>
        </figure>
        @if (fotos().length > 1) {
          <ul
            class="m-0 flex list-none flex-wrap gap-2 p-0"
            [attr.aria-label]="'arriendos.fotos.todas' | transloco"
          >
            @for (x of fotos(); track x.id; let i = $index) {
              <li>
                <button
                  type="button"
                  class="relative block h-[60px] w-[84px] overflow-hidden rounded-[8px] border-2 p-0"
                  [class.border-acento]="x.id === f.id"
                  [class.border-transparent]="x.id !== f.id"
                  [attr.aria-pressed]="x.id === f.id"
                  [attr.aria-label]="
                    'arriendos.fotos.ver' | transloco: { n: i + 1, total: fotos().length }
                  "
                  (click)="seleccion.set(x.id); confirmarQuitar.set(null)"
                  data-miniatura
                >
                  <b-foto class="h-full w-full" [fotoId]="x.id" alt="" />
                  @if (x.portada) {
                    <span
                      class="absolute bottom-0 left-0 bg-acento px-1 text-[10.5px] font-semibold text-white"
                      aria-hidden="true"
                      >{{ 'arriendos.fotos.portada' | transloco }}</span
                    >
                  }
                </button>
              </li>
            }
          </ul>
        }
      } @else {
        <p class="m-0 text-tinta-suave">{{ 'arriendos.fotos.vacio' | transloco }}</p>
      }

      <form class="flex flex-col gap-2" (submit)="$event.preventDefault(); agregarUrls()">
        <label class="flex flex-col gap-1">
          <span class="text-[12.5px]">{{ 'arriendos.fotos.urls' | transloco }}</span>
          <textarea
            hlmInput
            name="urlsFotos"
            rows="2"
            class="min-h-[60px] py-2"
            [(ngModel)]="urls"
            [placeholder]="'https://http2.mlstatic.com/D_NQ_NP_….webp'"
          ></textarea>
        </label>
        <div class="flex flex-wrap items-center gap-2">
          <button hlmBtn variant="outline" type="submit" [disabled]="ocupado() || !urls.trim()">
            {{ 'arriendos.fotos.agregar' | transloco }}
          </button>
          <label
            class="inline-flex h-9 cursor-pointer items-center rounded-md border border-linea px-3 text-sm font-medium hover:bg-superficie focus-within:outline-2 focus-within:outline-acento"
            [class.opacity-50]="ocupado()"
          >
            {{ 'arriendos.fotos.subir' | transloco }}
            <input
              type="file"
              class="solo-lector"
              multiple
              [accept]="tipos"
              [disabled]="ocupado()"
              (change)="subir($event)"
              data-subir-fotos
            />
          </label>
          <span class="text-[12.5px] text-tinta-suave" aria-live="polite">
            @if (ocupado()) {
              {{ 'arriendos.fotos.guardando' | transloco }}
            }
          </span>
        </div>
      </form>

      @if (resultado(); as r) {
        <div
          role="status"
          class="flex flex-col gap-1 rounded-[10px] bg-superficie px-3 py-2 text-[13px]"
          data-resultado-fotos
        >
          <p class="m-0 font-semibold">
            {{
              'arriendos.fotos.resultado'
                | transloco
                  : { agregadas: r.agregadas, yaEstaban: r.yaEstaban, errores: r.errores.length }
            }}
          </p>
          @for (e of r.errores; track $index) {
            <p class="m-0 break-all text-error">{{ e.fuente }}: {{ e.mensaje }}</p>
          }
        </div>
      }
    </section>
  `,
})
export class GaleriaFotos {
  readonly propiedadId = input.required<string>();
  readonly titulo = input.required<string>();
  readonly fotos = input.required<Foto[]>();
  /** Las fotos cambiaron: la ficha recarga la propiedad. */
  readonly cambio = output<void>();

  private readonly api = inject(ApiArriendos);
  private readonly avisos = inject(Avisos);
  private readonly t = inject(TranslocoService);
  private readonly imagenes = inject(ImagenesDeFotos);

  protected readonly tipos = TIPOS_ACEPTADOS;
  protected readonly seleccion = signal<string | null>(null);
  protected readonly confirmarQuitar = signal<string | null>(null);
  protected readonly ocupado = signal(false);
  protected readonly resultado = signal<{
    agregadas: number;
    yaEstaban: number;
    errores: { fuente: string; mensaje: string }[];
  } | null>(null);
  protected urls = '';

  /** La que se ve grande: la elegida si sigue estando, si no la portada. */
  protected readonly elegida = computed(() => {
    const fs = this.fotos();
    return fs.find((f) => f.id === this.seleccion()) ?? fs[0] ?? null;
  });

  protected altDe(f: Foto): string {
    return f.portada
      ? this.t.translate('arriendos.fotos.altPortada', { titulo: this.titulo() })
      : this.t.translate('arriendos.fotos.alt', {
          n: f.orden + 1,
          total: this.fotos().length,
          titulo: this.titulo(),
        });
  }

  private mostrar(r: FotosAgregadas['resultados']): void {
    this.resultado.set({
      agregadas: r.filter((x) => x.estado === 'agregada').length,
      yaEstaban: r.filter((x) => x.estado === 'ya_estaba').length,
      errores: r
        .filter((x) => x.estado === 'error')
        .map((x) => ({
          fuente: x.fuente,
          mensaje: x.mensaje ?? this.t.translate(`errores.${x.codigo ?? 'ERROR_INTERNO'}`),
        })),
    });
  }

  protected async agregarUrls(): Promise<void> {
    const fuentes = this.urls
      .split(/\s+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!fuentes.length) return;
    this.ocupado.set(true);
    try {
      const r = await firstValueFrom(this.api.agregarFotos(this.propiedadId(), fuentes));
      this.mostrar(r.resultados);
      if (r.resultados.some((x) => x.estado !== 'error')) this.urls = '';
      this.cambio.emit();
    } catch (e) {
      this.avisos.error(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async subir(ev: Event): Promise<void> {
    const entrada = ev.target as HTMLInputElement;
    const archivos = [...(entrada.files ?? [])];
    entrada.value = '';
    if (!archivos.length) return;
    this.ocupado.set(true);
    const resultados: FotosAgregadas['resultados'] = [];
    for (const a of archivos) {
      try {
        const r = await firstValueFrom(this.api.subirFoto(this.propiedadId(), a));
        resultados.push({
          fuente: a.name,
          estado: r.yaEstaba ? 'ya_estaba' : 'agregada',
          foto: r.foto,
        });
      } catch (e) {
        const err = aError(e);
        resultados.push({
          fuente: a.name,
          estado: 'error',
          codigo: err.codigo,
          mensaje: err.message,
        });
      }
    }
    this.mostrar(resultados);
    this.ocupado.set(false);
    this.cambio.emit();
  }

  protected async portada(f: Foto): Promise<void> {
    this.ocupado.set(true);
    try {
      await firstValueFrom(this.api.elegirPortada(this.propiedadId(), f.id));
      this.avisos.exito('arriendos.fotos.portadaElegida');
      this.cambio.emit();
    } catch (e) {
      this.avisos.error(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async quitar(f: Foto): Promise<void> {
    this.ocupado.set(true);
    try {
      await firstValueFrom(this.api.quitarFoto(this.propiedadId(), f.id));
      this.imagenes.olvidar(f.id);
      this.confirmarQuitar.set(null);
      this.seleccion.set(null);
      this.avisos.exito('arriendos.fotos.quitada');
      this.cambio.emit();
    } catch (e) {
      this.avisos.error(e);
    } finally {
      this.ocupado.set(false);
    }
  }
}
