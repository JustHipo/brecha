import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Selector de foco (docs/diseno/arriendos.md, A1): cambiar, volver a donde estabas y abrir un enlace directo.
test('cambia de Empleo a Arriendos y vuelve a la última pantalla', async ({ page }) => {
  await page.goto('/lista');
  const selector = page.locator('[data-selector-foco]');
  await expect(selector).toContainText('Empleo');

  await selector.click();
  await page.locator('[data-foco-opcion="arriendos"]').click();
  await expect(page).toHaveURL(/\/arriendos\/tablero$/);
  await expect(selector).toContainText('Arriendos');
  await expect(page.locator('html')).toHaveAttribute('data-foco', 'arriendos');
  await expect(page.getByRole('link', { name: 'Canales' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Red' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Mapa' }).click();
  await expect(page).toHaveURL(/\/arriendos\/mapa$/);

  await page.keyboard.press('ControlOrMeta+1');
  await expect(page).toHaveURL(/\/lista$/);
  await expect(page.locator('html')).toHaveAttribute('data-foco', 'empleo');

  await page.keyboard.press('ControlOrMeta+2');
  await expect(page).toHaveURL(/\/arriendos\/mapa$/);

  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
});

test('Ajustes no cambia el foco y la app abre en el último', async ({ page }) => {
  await page.goto('/arriendos/lista');
  await expect(page.locator('[data-selector-foco]')).toContainText('Arriendos');
  await page.goto('/ajustes');
  await expect(page.locator('[data-selector-foco]')).toContainText('Arriendos');
  await page.goto('/');
  await expect(page).toHaveURL(/\/arriendos\/tablero$/);
});

test('desde la paleta ⌘K', async ({ page }) => {
  await page.goto('/tablero');
  await expect(page.locator('[data-selector-foco]')).toContainText('Empleo');
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('combobox').fill('arriendos');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/arriendos\//);
});
