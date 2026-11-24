import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// docs/diseno/csv.md: importar los CSV de ejemplo (datos inventados), ver el informe, filtrar por etiqueta,
// ver el Stack en la ficha y exportar. Corre después de flujo.spec.ts (orden alfabético, modo serial).
const EJEMPLOS = resolve(__dirname, '../../../datos/ejemplo/csv');

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

async function importar(page: Page, archivo: string) {
  await page.locator('[data-archivo-csv]').setInputFiles(resolve(EJEMPLOS, archivo));
  await expect(page.locator('[data-resultado-csv]')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('importar postulaciones y contactos con informe por fila, dos veces deja lo mismo', async ({
  page,
}) => {
  await page.goto('/importar');
  await expect(page.getByRole('heading', { level: 1, name: 'Importar y exportar' })).toBeVisible();

  await importar(page, 'postulaciones.csv');
  await expect(page.locator('[data-conteo="creadas"]')).toContainText('6');
  await expect(page.locator('[data-conteo="errores"]')).toContainText('0');
  await sinViolaciones(page);

  await importar(page, 'contactos.csv');
  await expect(page.locator('[data-conteo="creadas"]')).toContainText('3');
  await expect(page.locator('[data-conteo="actualizadas"]')).toContainText('1');
  await expect(page.locator('[data-conteo="conAdvertencias"]')).toContainText('2');
  await expect(page.locator('[data-fila="4"]')).toContainText('Sin perfil de LinkedIn');
  await expect(page.locator('[data-fila="5"]')).toContainText('No hay una postulación con esa URL');

  await importar(page, 'postulaciones.csv');
  await expect(page.locator('[data-conteo="creadas"]')).toContainText('0');
  await expect(page.locator('[data-conteo="yaEstaban"]')).toContainText('6');
});

test('una fila mala se informa con su línea y su columna', async ({ page }) => {
  await page.goto('/importar');
  await page.locator('[data-archivo-csv]').setInputFiles({
    name: 'malo.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'titulo,empresa,url,estado\nBuena,Ficticia,https://ejemplo.test/e2e/csv-buena,\nMala,Ficticia,https://ejemplo.test/e2e/csv-mala,postulado\n',
    ),
  });
  await expect(page.locator('[data-conteo="creadas"]')).toContainText('1');
  await expect(page.locator('[data-conteo="errores"]')).toContainText('1');
  await expect(page.locator('[data-fila="3"]')).toContainText('fecha_postulacion');
});

test('filtrar por etiqueta en la lista y en el tablero', async ({ page }) => {
  await page.goto('/lista');
  await page.locator('[data-filtro-etiqueta]').selectOption('investigacion');
  const filas = page.locator('tbody tr');
  await expect(filas).toHaveCount(2);
  await expect(filas.first()).toContainText('#investigacion');

  await page.goto('/tablero');
  await page.locator('[data-filtro-etiqueta]').selectOption('p2');
  await expect(page.locator('[data-tarjeta]')).toHaveCount(2);
  await sinViolaciones(page);
});

test('la ficha muestra el Stack, los requisitos, las etiquetas y la prioridad fijada', async ({
  page,
}) => {
  await page.goto('/lista');
  await page.getByRole('link', { name: 'Observatorio Ficticio' }).click();
  const stack = page.locator('[data-stack]');
  await expect(stack.getByRole('heading', { name: 'Stack' })).toBeVisible();
  for (const h of ['Python', 'MATLAB', 'LabVIEW']) {
    await expect(stack.locator(`[data-herramienta="${h}"]`)).toBeVisible();
  }
  // Sin el servicio con IA no hay comparación con el perfil: la lista va sin colores y lo explica.
  await expect(stack.locator('[data-estado="falta"]')).toHaveCount(0);
  await expect(stack).toContainText('Cursando 5.º año de Ingeniería Física');
  await expect(stack.locator('[data-etiquetas]')).toContainText('#investigacion');
  await expect(stack.locator('[data-prioridad]')).toHaveValue('alta');

  await stack.locator('[data-nueva-etiqueta]').fill('Prioridad Máxima');
  await stack.locator('[data-nueva-etiqueta]').press('Enter');
  await expect(stack.locator('[data-etiquetas]')).toContainText('#prioridad maxima');
  await stack.locator('[data-prioridad]').selectOption('');
  await expect(page.getByText('Prioridad media').first()).toBeVisible();
  await sinViolaciones(page);
});

test('exportar baja los dos CSV en el formato de importar', async ({ page }) => {
  await page.goto('/importar');
  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-exportar="postulaciones"]').click(),
  ]);
  expect(descarga.suggestedFilename()).toMatch(/^brecha-postulaciones-\d{4}-\d{2}-\d{2}\.csv$/);
  const texto = readFileSync(await descarga.path(), 'utf8');
  expect(texto.split('\n')[0]).toContain('titulo,empresa,url,plataforma,modalidad');
  expect(texto).toContain('https://ejemplo.test/avisos/instrumentacion');

  const [plantilla] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-plantilla="contactos"]').click(),
  ]);
  expect(plantilla.suggestedFilename()).toBe('plantilla-contactos.csv');
});
