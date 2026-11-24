import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { firstValueFrom } from 'rxjs';
import {
  ApiArriendos,
  IaArriendos,
  type ChatLeido,
  type CrearPropiedad,
  type Duplicados,
  type Extraccion,
  type MensajeDeChat,
  type PropuestaArriendo,
} from '../../nucleo/api/arriendos.api';
import { Avisos } from '../../nucleo/avisos';
import { ArriendosStore, aError } from './arriendos.store';
import { pesos } from './piezas';

interface Fila {
  p: PropuestaArriendo;
  elegida: boolean;
  dup: Duplicados | null;
  resultado: 'creada' | 'unida' | 'error' | null;
  id?: string;
}

/** Huella corta de un mensaje para no registrarlo dos veces si importas el mismo chat de nuevo. */
function huella(m: MensajeDeChat): string {
  let h = 0;
  for (const c of `${m.fecha}|${m.autor}|${m.texto}`) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `wa:${m.fecha}:${(h >>> 0).toString(36)}`;
}

/**
 * Importar avisos viejos (P8): un texto pegado o un chat exportado de WhatsApp. La IA propone propiedades,
 * tú eliges cuáles guardar; las que ya sigues suman la publicación en vez de duplicarse.
 */
@Component({
  selector: 'b-arriendos-importar',
  imports: [FormsModule, RouterLink, TranslocoPipe, HlmButton, HlmInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex max-w-[980px] flex-col gap-4 px-6 pt-[22px] pb-10' },
  template: `
    <h1 class="titulo-pagina m-0">{{ 'importarArriendo.titulo' | transloco }}</h1>
    <p class="m-0 text-tinta-suave">{{ 'importarArriendo.ayuda' | transloco }}</p>

    <div
      role="tablist"
      class="inline-flex self-start rounded-full border border-linea bg-superficie p-[3px]"
    >
      @for (m of modos; track m) {
        <button
          hlmBtn
          size="sm"
          type="button"
          role="tab"
          [attr.aria-selected]="modo() === m"
          [variant]="modo() === m ? 'outline' : 'ghost'"
          (click)="cambiarModo(m)"
        >
          {{ 'importarArriendo.' + m | transloco }}
        </button>
      }
    </div>

    @if (modo() === 'texto') {
      <label class="flex flex-col gap-1">
        <span class="font-semibold">{{ 'importarArriendo.pegaTexto' | transloco }}</span>
        <textarea
          hlmInput
          class="min-h-48"
          name="texto"
          [(ngModel)]="texto"
          data-importar-texto
        ></textarea>
      </label>
      <button
        hlmBtn
        type="button"
        class="self-start"
        [disabled]="!texto.trim() || trabajando()"
        (click)="extraerTexto()"
      >
        {{ 'importarArriendo.buscar' | transloco }}
      </button>
    } @else {
      <div class="flex flex-col gap-2">
        <label class="flex flex-col gap-1">
          <span class="font-semibold">{{ 'importarArriendo.archivoChat' | transloco }}</span>
          <input
            type="file"
            accept=".txt,text/plain"
            (change)="cargarArchivo($event)"
            data-importar-archivo
          />
        </label>
        <p class="m-0 text-[13px] text-tinta-suave">
          {{ 'importarArriendo.comoExportar' | transloco }}
        </p>
        @if (chatLeido(); as c) {
          <fieldset class="m-0 flex flex-col gap-1 rounded-[12px] border border-linea p-3">
            <legend class="px-1 font-semibold">
              {{ 'importarArriendo.quienEres' | transloco: { n: c.mensajes } }}
            </legend>
            @for (a of c.autores; track a) {
              <label class="flex items-center gap-2">
                <input type="radio" name="yo" [value]="a" [(ngModel)]="yo" />
                <span>{{ a }}</span>
              </label>
            }
          </fieldset>
          <button
            hlmBtn
            type="button"
            class="self-start"
            [disabled]="!yo || trabajando()"
            (click)="extraerChat()"
          >
            {{ 'importarArriendo.buscar' | transloco }}
          </button>
        }
      </div>
    }

    @if (trabajando()) {
      <p class="m-0 text-tinta-suave" role="status">{{ 'importarArriendo.leyendo' | transloco }}</p>
    }
    @if (error()) {
      <div
        role="alert"
        class="rounded-[10px] border border-aviso-borde bg-aviso-fondo px-3.5 py-3 text-aviso-tinta"
      >
        {{ error() }}
      </div>
    }

    @if (resultado(); as r) {
      <section class="flex flex-col gap-3" aria-labelledby="t-propuestas">
        <h2 id="t-propuestas" class="m-0 text-base font-bold">
          {{ 'importarArriendo.encontradas' | transloco: { n: filas().length } }}
          @if (r.recortado) {
            <span class="font-normal text-tinta-suave"
              >· {{ 'importarArriendo.recortado' | transloco }}</span
            >
          }
        </h2>
        @for (f of filas(); track $index; let i = $index) {
          <article
            class="flex flex-col gap-1.5 rounded-[12px] border border-linea p-4"
            [attr.data-propuesta]="i"
          >
            <label class="flex items-start gap-2">
              <input
                type="checkbox"
                [(ngModel)]="f.elegida"
                [name]="'elegir' + i"
                [disabled]="!!f.resultado"
              />
              <span class="font-semibold">{{ titulo(f.p) }}</span>
            </label>
            <p class="m-0 text-[13px] text-tinta-suave">
              {{ resumen(f.p) }}
            </p>
            @if (f.p.contacto?.nombre) {
              <p class="m-0 text-[13px]">
                {{ f.p.contacto?.nombre }}
                @if (f.p.contacto?.telefono) {
                  · {{ f.p.contacto?.telefono }}
                }
              </p>
            }
            @if (f.p.nota) {
              <p class="m-0 text-[13px] text-tinta-suave">{{ f.p.nota }}</p>
            }
            @if (f.dup?.seguro || f.dup?.candidatos?.length) {
              <p class="m-0 text-[13px] font-semibold text-aviso-tinta">
                {{
                  'importarArriendo.yaLaSigues'
                    | transloco: { titulo: (f.dup?.seguro ?? f.dup?.candidatos?.[0])?.titulo }
                }}
              </p>
            }
            @if (f.resultado === 'creada' || f.resultado === 'unida') {
              <a [routerLink]="['/arriendos/propiedades', f.id]" class="text-[13px]">
                {{ 'importarArriendo.' + f.resultado | transloco }} →
              </a>
            }
          </article>
        }
        @if (filas().length) {
          <button
            hlmBtn
            type="button"
            class="self-start"
            [disabled]="trabajando()"
            (click)="guardar()"
          >
            {{ 'importarArriendo.agregarElegidas' | transloco }}
          </button>
        }
      </section>
    }
  `,
})
export class ArriendosImportarPagina {
  private readonly ia = inject(IaArriendos);
  private readonly api = inject(ApiArriendos);
  private readonly avisos = inject(Avisos);
  private readonly store = inject(ArriendosStore);
  protected readonly modos = ['texto', 'whatsapp'] as const;
  protected readonly modo = signal<'texto' | 'whatsapp'>('texto');
  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly chatLeido = signal<ChatLeido | null>(null);
  protected readonly resultado = signal<Extraccion | null>(null);
  protected readonly filas = signal<Fila[]>([]);
  protected texto = '';
  protected yo = '';
  private chat = '';

  protected cambiarModo(m: 'texto' | 'whatsapp'): void {
    this.modo.set(m);
    this.resultado.set(null);
    this.filas.set([]);
    this.error.set(null);
  }

  protected titulo(p: PropuestaArriendo): string {
    return (
      p.titulo ||
      `${p.tipo}${p.dormitorios !== null ? ` ${p.dormitorios}D` : ''}${p.comuna ? ` · ${p.comuna}` : ''}`
    );
  }

  protected resumen(p: PropuestaArriendo): string {
    const partes = [
      p.precio ? (p.precio.moneda === 'UF' ? `UF ${p.precio.monto}` : pesos(p.precio.monto)) : null,
      p.gastosComunes ? `GC ${pesos(p.gastosComunes)}` : null,
      p.direccion,
      p.url,
    ];
    return partes.filter(Boolean).join(' · ');
  }

  protected async cargarArchivo(e: Event): Promise<void> {
    const archivo = (e.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    this.chat = await archivo.text();
    this.error.set(null);
    try {
      const c = await firstValueFrom(this.ia.leerChat(this.chat));
      this.chatLeido.set(c);
      this.yo = '';
    } catch (err) {
      this.error.set(aError(err).message);
      this.chatLeido.set(null);
    }
  }

  protected async extraerTexto(): Promise<void> {
    await this.extraer({ texto: this.texto.trim() });
  }

  protected async extraerChat(): Promise<void> {
    await this.extraer({ chat: this.chat, yo: this.yo || null });
  }

  private async extraer(
    cuerpo: { texto: string } | { chat: string; yo: string | null },
  ): Promise<void> {
    this.trabajando.set(true);
    this.error.set(null);
    try {
      const r = await firstValueFrom(this.ia.extraer(cuerpo));
      this.resultado.set(r);
      const filas: Fila[] = await Promise.all(
        r.propuestas.map(async (p) => ({
          p,
          elegida: true,
          resultado: null,
          dup:
            p.url || p.direccion
              ? await firstValueFrom(
                  this.api.duplicados({
                    ...(p.url ? { url: p.url } : {}),
                    ...(p.direccion ? { direccion: p.direccion } : {}),
                    ...(p.comuna ? { comuna: p.comuna } : {}),
                    ...(p.dormitorios !== null ? { dormitorios: p.dormitorios } : {}),
                  }),
                ).catch(() => null)
              : null,
        })),
      );
      this.filas.set(filas);
    } catch (err) {
      this.error.set(aError(err).message);
    } finally {
      this.trabajando.set(false);
    }
  }

  private cuerpo(f: Fila): CrearPropiedad {
    const p = f.p;
    const desdeChat = this.modo() === 'whatsapp';
    const req = Object.fromEntries(Object.entries(p.requisitos).filter(([, v]) => v !== null));
    const contacto = p.contacto?.nombre
      ? {
          nombre: p.contacto.nombre,
          ...(p.contacto.rol ? { rol: p.contacto.rol } : {}),
          ...(p.contacto.telefono ? { telefono: p.contacto.telefono } : {}),
          ...(p.contacto.correo ? { correo: p.contacto.correo } : {}),
          ...(desdeChat
            ? {
                canalId: 'whatsapp',
                ...(p.contacto.telefono ? { whatsapp: p.contacto.telefono } : {}),
              }
            : {}),
        }
      : null;
    const unir = f.dup?.seguro?.id;
    return {
      tipo: p.tipo,
      ...(p.titulo ? { titulo: p.titulo } : {}),
      ...(p.direccion ? { direccion: p.direccion } : {}),
      ...(p.comuna ? { comuna: p.comuna } : {}),
      ...(p.precio ? { precio: p.precio } : {}),
      ...(p.gastosComunes !== null ? { gastosComunes: p.gastosComunes } : {}),
      ...(p.dormitorios !== null ? { dormitorios: p.dormitorios } : {}),
      ...(p.banos !== null ? { banos: p.banos } : {}),
      ...(p.m2 !== null ? { m2Utiles: p.m2 } : {}),
      ...(p.estacionamientos !== null ? { estacionamientos: p.estacionamientos } : {}),
      ...(p.mascotas !== null ? { mascotas: p.mascotas } : {}),
      ...(p.amoblado !== null ? { amoblado: p.amoblado } : {}),
      ...(Object.keys(req).length ? { requisitos: req } : {}),
      ...(p.estadoSugerido && !unir ? { estado: p.estadoSugerido } : {}),
      ...(p.url || desdeChat
        ? {
            publicacion: {
              ...(p.url ? { url: p.url } : {}),
              ...(desdeChat && !p.url ? { canalId: 'whatsapp' } : {}),
            },
          }
        : {}),
      ...(contacto ? { contactos: [contacto] } : {}),
      ...(p.nota ? { nota: p.nota } : {}),
      ...(unir ? { unirA: unir } : {}),
    } as CrearPropiedad;
  }

  /** Guarda las elegidas y, si vienen de un chat, registra sus mensajes como la conversación con el contacto. */
  protected async guardar(): Promise<void> {
    this.trabajando.set(true);
    const mensajes = this.resultado()?.mensajes ?? [];
    const filas = this.filas();
    let creadas = 0;
    for (const f of filas) {
      if (!f.elegida || f.resultado) continue;
      try {
        const r = await firstValueFrom(this.api.crear(this.cuerpo(f)));
        f.resultado = r.unida ? 'unida' : 'creada';
        f.id = r.propiedad.id;
        creadas++;
        const contactoId = r.propiedad.contactos.find((c) => c.nombre === f.p.contacto?.nombre)?.id;
        if (contactoId) {
          for (const i of f.p.mensajes) {
            const m = mensajes.find((x) => x.indice === i);
            if (!m) continue;
            await firstValueFrom(
              this.api.registrarInteraccion(f.id, {
                contactoId,
                tipo: m.tuyo ? 'mensaje_enviado' : 'mensaje_recibido',
                resumen: m.texto.slice(0, 2000),
                ocurridaEn: new Date(m.fecha).toISOString(),
                canalId: 'whatsapp',
                referenciaExterna: huella(m),
              }),
            ).catch(() => undefined);
          }
        }
      } catch {
        f.resultado = 'error';
      }
    }
    this.filas.set([...filas]);
    this.trabajando.set(false);
    void this.store.cargar(true);
    if (filas.some((f) => f.resultado === 'error'))
      this.avisos.aviso('importarArriendo.algunasFallaron');
    else this.avisos.exito('importarArriendo.listo', { n: creadas });
  }
}
