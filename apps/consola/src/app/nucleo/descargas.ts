import type { HttpResponse } from '@angular/common/http';

/** El nombre que manda el núcleo en `Content-Disposition`, o el de respaldo. */
export function nombreDeArchivo(r: HttpResponse<Blob>, respaldo: string): string {
  const m = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') ?? '');
  return m?.[1] ?? respaldo;
}

/** Guarda un archivo generado: el navegador (o Electron) muestra dónde guardarlo. */
export function guardarArchivo(contenido: Blob, nombre: string): void {
  const url = URL.createObjectURL(contenido);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
