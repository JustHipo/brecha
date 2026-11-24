import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Sin nada guardado: como la primera vez que alguien abre la consola.
test.use({ storageState: { cookies: [], origins: [] } });
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

const popup = (page: Page) => page.locator('[data-recorrido-paso]');

/** El resaltado cubre el ancla del paso. */
async function resaltaAncla(page: Page, ancla: string) {
  const foco = await page.locator('[data-recorrido-foco]').boundingBox();
  // Selector armado por partes: Tailwind escanea este archivo y lo leería como una clase.
  const selector = ['[data-tutorial="', ancla, '"]'].join('');
  const caja = await page.locator(selector).locator('visible=true').first().boundingBox();
  expect(foco && caja).toBeTruthy();
  expect(foco!.x).toBeLessThanOrEqual(caja!.x + 1);
  expect(foco!.y).toBeLessThanOrEqual(caja!.y + 1);
  expect(foco!.x + foco!.width).toBeGreaterThanOrEqual(caja!.x + caja!.width - 1);
  expect(foco!.y + foco!.height).toBeGreaterThanOrEqual(caja!.y + caja!.height - 1);
}

// [id del paso, ancla esperada]. La ficha señala una tarjeta o, sin postulaciones, el tablero;
// importar señala el botón del tablero vacío o, si no está, sale al centro.
const PASOS: [string, RegExp][] = [
  ['bienvenida', /^marca$/],
  ['tablero', /^tablero$/],
  ['nueva', /^nueva$/],
  ['ficha', /^(ficha|tablero)$/],
  ['bandeja', /^bandeja$/],
  ['red', /^red$/],
  ['ajustes', /^ajustes$/],
  ['importar', /^(importar|centro)$/],
];

test('la primera vez sale el recorrido, recorre sus 8 pasos anclados y no vuelve a salir', async ({
  page,
}) => {
  await page.goto('/lista');
  const bienvenida = page.getByRole('dialog', { name: 'Te damos la bienvenida a Brecha' });
  await expect(bienvenida).toBeVisible();
  // Navega a la pantalla del paso y el foco entra al botón principal.
  await expect(page).toHaveURL(/\/tablero$/);
  await expect(bienvenida.getByRole('button', { name: 'Siguiente' })).toBeFocused();
  await expect(bienvenida.getByRole('button', { name: 'Atrás' })).toHaveCount(0);
  await sinViolaciones(page);

  // El foco queda atrapado en el popup.
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
    true,
  );

  for (const [i, [id, ancla]] of PASOS.entries()) {
    const p = popup(page);
    await expect(p).toHaveAttribute('data-recorrido-paso', id);
    await expect(p).toHaveAttribute('data-recorrido-ancla', ancla);
    await expect(p.getByText(`Paso ${i + 1} de ${PASOS.length}`)).toBeVisible();
    const nombre = await p.getAttribute('data-recorrido-ancla');
    // El resaltado se desliza de un ancla a la otra: se espera a que llegue.
    if (nombre !== 'centro') await expect(() => resaltaAncla(page, nombre!)).toPass();
    if (i > 0) {
      // Cada paso nuevo se anuncia a los lectores de pantalla.
      await expect(page.locator('.cdk-live-announcer-element')).toContainText(
        `Paso ${i + 1} de ${PASOS.length}`,
      );
    }
    if (id === 'bandeja') await sinViolaciones(page);
    if (i < PASOS.length - 1) await p.getByRole('button', { name: 'Siguiente' }).click();
  }

  // Atrás vuelve al paso anterior; con la flecha derecha se avanza de nuevo.
  await popup(page).getByRole('button', { name: 'Atrás' }).click();
  await expect(popup(page)).toHaveAttribute('data-recorrido-paso', 'ajustes');
  await page.keyboard.press('ArrowRight');
  await expect(popup(page)).toHaveAttribute('data-recorrido-paso', 'importar');

  await popup(page).getByRole('button', { name: 'Terminar' }).click();
  await expect(page.locator('[data-recorrido]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('brecha.recorrido'))).toBe('1');

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Mis postulaciones' })).toBeVisible();
  await expect(page.locator('[data-recorrido]')).toHaveCount(0);
});

test('Escape lo cierra, y se vuelve a ver desde Ajustes y desde la búsqueda', async ({ page }) => {
  await page.goto('/tablero');
  await expect(popup(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-recorrido]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('brecha.recorrido'))).toBe('1');

  // Desde Ajustes: arranca desde el primer paso.
  await page.goto('/ajustes');
  await expect(page.locator('[data-recorrido]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver el recorrido' }).click();
  await expect(page.getByRole('dialog', { name: 'Te damos la bienvenida a Brecha' })).toBeVisible();
  await popup(page).getByRole('button', { name: 'Siguiente' }).click();
  await expect(popup(page)).toHaveAttribute('data-recorrido-paso', 'tablero');
  await popup(page).getByRole('button', { name: 'Saltar' }).click();
  await expect(page.locator('[data-recorrido]')).toHaveCount(0);

  // Desde la búsqueda (⌘K o Ctrl+K), escribiendo «recorrido».
  await page.getByRole('button', { name: /Buscar o ejecutar/ }).click();
  await page.getByRole('combobox').fill('recorrido');
  await page.getByRole('option', { name: 'Ver el recorrido guiado' }).click();
  await expect(popup(page)).toHaveAttribute('data-recorrido-paso', 'bienvenida');
  await sinViolaciones(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-recorrido]')).toHaveCount(0);
});

test('con «reducir movimiento» no anima nada, y en inglés', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tablero');
  await expect(popup(page)).toHaveAttribute('data-recorrido-paso', 'bienvenida');
  await popup(page).getByRole('button', { name: 'Siguiente' }).click();
  await expect(popup(page)).toHaveAttribute('data-recorrido-paso', 'tablero');
  for (const sel of ['[data-recorrido-paso]', '[data-recorrido-foco]']) {
    const transicion = await page
      .locator(sel)
      .evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(transicion).toBe('none');
  }
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.goto('/ajustes');
  await page.getByRole('button', { name: 'Take the tour' }).click();
  const p = page.getByRole('dialog', { name: 'Welcome to Brecha' });
  await expect(p.getByText('Step 1 of 8')).toBeVisible();
  await p.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('dialog', { name: 'The board' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'ES', exact: true }).click();
});
