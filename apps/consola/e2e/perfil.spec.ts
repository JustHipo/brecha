import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Página Perfil (docs/diseno/perfil.md §5) contra el núcleo real y la base de pruebas.
test.describe.configure({ mode: 'serial' });

async function sinViolaciones(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .exclude('[data-sonner-toaster]')
    .analyze();
  expect(
    r.violations.flatMap((v) =>
      v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} · ${n.failureSummary ?? ''}`),
    ),
  ).toEqual([]);
}

async function conConsola(
  request: APIRequestContext,
  metodo: 'post' | 'put',
  ruta: string,
  data: object,
) {
  const token = readFileSync(join(process.env.BRECHA_DIR_E2E!, 'token-consola'), 'utf8').trim();
  const r = await request[metodo](`http://127.0.0.1:${process.env.NUCLEO_E2E}/api/v1${ruta}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  expect(r.ok()).toBe(true);
  return (await r.json()) as { id: string };
}

test('perfil de Empleo: agregar con etiqueta, filtrar, ordenar blandas, historial y choque en la tarjeta', async ({
  page,
  request,
}) => {
  // Así lo dejaría Claude por MCP: una dura con chequeo y dos blandas.
  await conConsola(request, 'put', '/perfil', {
    agregar: [
      {
        texto: 'Santiago solo híbrido o remoto',
        criterio: 'modalidad_por_region',
        valor: {
          valparaiso: ['presencial', 'hibrido', 'remoto'],
          santiago: ['hibrido', 'remoto'],
          otra: ['remoto'],
          noIndicaEsPresencialEn: ['trabajando'],
        },
        etiquetas: ['ubicacion'],
      },
      {
        texto: 'Ojalá con sueldo publicado',
        criterio: 'sueldo_publicado',
        dura: false,
        etiquetas: ['sueldo'],
      },
      { texto: 'Empresa de producto', dura: false },
    ],
    motivo: 'Perfil inicial',
  });

  await page.goto('/perfil');
  await expect(page.getByRole('heading', { level: 1, name: 'Perfil de búsqueda' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Perfil', exact: true })).toBeVisible();
  await sinViolaciones(page);

  // Una regla nueva, sin chequeo, con etiqueta.
  await page.locator('[data-agregar-regla]').click();
  await page
    .locator('article[data-regla=""]')
    .getByLabel('Regla', { exact: true })
    .fill('Sin pasantías ni reemplazos');
  const nueva = page.locator('[data-regla="Sin pasantías ni reemplazos"]');
  await nueva.getByLabel('Agregar una etiqueta a «Sin pasantías ni reemplazos»').fill('Contrato');
  await nueva.getByLabel('Agregar una etiqueta a «Sin pasantías ni reemplazos»').press('Enter');
  await expect(nueva.getByText('#contrato')).toBeVisible();

  // Subir «Empresa de producto» a P1.
  await page.getByRole('button', { name: 'Subir la prioridad de «Empresa de producto»' }).click();
  await expect(page.locator('[data-regla="Empresa de producto"] [data-tipo-regla]')).toHaveText(
    'P1',
  );

  await page.locator('[data-motivo-perfil]').fill('Juan: sin contratos cortos');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Perfil guardado')).toBeVisible();
  await expect(page.getByText('Juan: sin contratos cortos')).toBeVisible();
  await expect(
    page.locator('[data-regla="Ojalá con sueldo publicado"] [data-tipo-regla]'),
  ).toHaveText('P2');

  // Filtrar por etiqueta deja solo esas.
  await page.getByRole('button', { name: '#contrato 1' }).click();
  await expect(page.locator('article[data-regla]')).toHaveCount(1);
  await expect(page.locator('[data-regla="Sin pasantías ni reemplazos"]')).toBeVisible();
  await page.getByRole('button', { name: /^Todas/ }).click();
  await expect(page.locator('article[data-regla]')).toHaveCount(4);
  await sinViolaciones(page);

  // Una postulación presencial en Santiago muestra el choque en la tarjeta y en la ficha, sin cambiar su estado.
  const { id } = await conConsola(request, 'post', '/postulaciones', {
    aviso: {
      titulo: 'Backend NestJS',
      empresa: 'Logpilot Ficticia',
      url: 'https://ejemplo.test/e2e/logpilot',
      plataforma: 'linkedin',
      modalidad: 'presencial',
      ubicacion: 'Las Condes, Santiago',
    },
  });
  await page.goto('/tablero');
  await expect(
    page.locator('article', { hasText: 'Logpilot Ficticia' }).locator('[data-choque-perfil]'),
  ).toContainText('Choca con tu perfil: Presencial en Santiago; ahí solo aceptas híbrido, remoto');
  await page.goto(`/postulaciones/${id}`);
  const ficha = page.locator('[data-perfil-ficha]');
  await expect(ficha).toContainText('Presencial en Santiago');
  await expect(ficha).toContainText('No publica sueldo');
  await expect(ficha).toContainText('no cambia el estado de la postulación');
  await sinViolaciones(page);
});
