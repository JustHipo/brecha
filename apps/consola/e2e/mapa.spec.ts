import { expect, test, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Mapa en los dos focos (docs/diseno/arriendos.md §6, A6). El fondo es liso en las pruebas; los pines son botones.
async function api(request: APIRequestContext, metodo: 'post' | 'put', ruta: string, data: object) {
  const token = readFileSync(join(process.env.BRECHA_DIR_E2E!, 'token-consola'), 'utf8').trim();
  const r = await request[metodo](`http://127.0.0.1:${process.env.NUCLEO_E2E}/api/v1${ruta}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  expect(r.ok()).toBe(true);
  return r.status() === 204 ? null : ((await r.json()) as Record<string, unknown>);
}

test('Arriendos: la propiedad con punto sale en el mapa y la sin punto, en la lista', async ({
  page,
  request,
}) => {
  const a = (await api(request, 'post', '/arriendos/propiedades', {
    titulo: 'Depto con pin',
    comuna: 'Ñuñoa',
  })) as { propiedad: { id: string } };
  await api(request, 'put', `/arriendos/propiedades/${a.propiedad.id}/ubicacion`, {
    lat: -33.4569,
    lon: -70.5975,
  });
  await api(request, 'post', '/arriendos/propiedades', {
    titulo: 'Depto sin pin',
    comuna: 'Providencia',
  });

  // El worker de MapLibre se sirve aparte (angular.json): si falta, la consola lo dice y el fondo real no carga.
  const errores: string[] = [];
  page.on('console', (m) => {
    if (/worker/i.test(m.text())) errores.push(m.text());
  });
  await page.goto('/arriendos/mapa');
  const pin = page.locator(`[data-pin="${a.propiedad.id}"]`);
  await expect(pin).toBeVisible();
  await pin.click();
  await expect(page.locator('[data-propiedad-elegida]')).toContainText('Depto con pin');
  await expect(page.getByText(/\d+ sin ubicar/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Depto sin pin' })).toBeVisible();
  expect(errores).toEqual([]);
});

test('Empleo: un pin por comuna con cuántas postulaciones hay', async ({ page, request }) => {
  for (const [empresa, ubicacion] of [
    ['Mapa Uno', 'Las Condes, Santiago'],
    ['Mapa Dos', 'Las Condes'],
    ['Mapa Tres', 'Remoto'],
  ]) {
    await api(request, 'post', '/postulaciones', {
      aviso: {
        titulo: 'Backend',
        empresa,
        url: `https://ejemplo.test/mapa/${empresa.replace(' ', '-')}`,
        plataforma: 'getonboard',
        modalidad: ubicacion === 'Remoto' ? 'remoto' : 'presencial',
        ubicacion,
      },
      estado: 'sin_decidir',
    });
  }
  await page.goto('/mapa');
  const pin = page.locator('[data-pin="Las Condes"]');
  await expect(pin).toHaveText('2');
  // Con el mapa alejado los pines de comunas vecinas se tapan: se elige desde la lista del costado.
  await page.getByRole('button', { name: 'Las Condes 2' }).click();
  await expect(page.locator('[data-grupo-elegido]')).toContainText('Mapa Uno');
  await expect(page.getByText(/\d+ remotas/)).toBeVisible();
});
