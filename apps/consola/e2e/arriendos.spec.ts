import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Flujo de Arriendos (docs/diseno/arriendos.md, A3) contra el núcleo real y la base de pruebas.
test.describe.configure({ mode: 'serial' });

async function sinViolaciones(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .exclude('[data-sonner-toaster]')
    .analyze();
  expect(r.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`))).toEqual(
    [],
  );
}

test('tu búsqueda: reglas duras y blandas con motivo', async ({ page }) => {
  await page.goto('/arriendos/busqueda');
  await expect(page.getByRole('heading', { level: 1, name: 'Tu búsqueda' })).toBeVisible();
  await page.getByRole('button', { name: '+ Arriendo más gastos comunes (máximo)' }).click();
  const regla = page.locator('[data-regla="presupuesto_total"]');
  await regla.locator('input').first().fill('600000');
  await page.locator('[data-motivo-busqueda]').fill('Empiezo a buscar');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Empiezo a buscar')).toBeVisible();
  await sinViolaciones(page);
});

test('agrega una propiedad, avisa el duplicado y la mueve con el diálogo', async ({ page }) => {
  await page.goto('/arriendos/propiedades/nueva');
  await page.getByLabel('URL del aviso').fill('https://www.portalinmobiliario.com/MLC-77-depto');
  await page.getByLabel('Comuna', { exact: true }).fill('Ñuñoa');
  await page.getByLabel('Arriendo', { exact: true }).fill('550000');
  await page.getByLabel('Gastos comunes', { exact: true }).fill('90000');
  await page.getByLabel('Dormitorios', { exact: true }).fill('2');
  await page.getByLabel('Contacto (corredor o dueño)').fill('Ana Corredora');
  await page.getByRole('button', { name: 'Agregar propiedad' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Departamento 2D en Ñuñoa' }),
  ).toBeVisible();
  // Calce: se pasa $40.000 del presupuesto de la regla anterior.
  await expect(page.getByText(/Se pasa \$40\.000 del presupuesto/)).toBeVisible();
  await sinViolaciones(page);

  // La misma URL otra vez: avisa que ya la sigues.
  await page.goto('/arriendos/propiedades/nueva');
  await page.getByLabel('URL del aviso').fill('portalinmobiliario.com/MLC-77-depto/');
  await page.getByLabel('Comuna', { exact: true }).click();
  await expect(page.locator('[data-duplicados]')).toContainText('Ya sigues esta propiedad');

  // En el tablero: mover a «Visita agendada» pide fecha y hora.
  await page.goto('/arriendos/tablero');
  await page.getByRole('button', { name: 'Acciones de Departamento 2D en Ñuñoa' }).click();
  await page.getByRole('menuitem', { name: 'Mover a Visita agendada' }).click();
  await page.locator('[data-campo-fecha]').fill('2026-12-05T11:00');
  await page.getByRole('button', { name: 'Mover', exact: true }).click();
  await expect(page.getByText('Movida a Visita agendada')).toBeVisible();
  await expect(page.locator('section[aria-label="Visita agendada"] [data-propiedad]')).toHaveCount(
    1,
  );
  await sinViolaciones(page);
});

test('en la ficha: un mensaje del corredor deja «te toca responder»', async ({ page }) => {
  await page.goto('/arriendos/tablero');
  await page.getByRole('link', { name: 'Departamento 2D en Ñuñoa' }).click();
  const ana = page.locator('[data-contacto="Ana Corredora"]');
  await ana.getByLabel('Tipo').selectOption('mensaje_recibido');
  await ana.getByLabel('Qué se dijo').fill('¿Te acomoda el viernes a las 11?');
  await ana.getByRole('button', { name: 'Registrar' }).click();
  await expect(ana.getByText('¿Te acomoda el viernes a las 11?')).toBeVisible();
  await page.goto('/arriendos/lista');
  await expect(page.getByText('· Te toca responder')).toBeVisible();
  // El selector de foco cuenta lo que Arriendos tiene por revisar.
  await page.locator('[data-selector-foco]').click();
  await expect(page.locator('[data-foco-opcion="arriendos"]')).toContainText('1 por revisar');
});
