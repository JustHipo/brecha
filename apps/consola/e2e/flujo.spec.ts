import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const hoy = new Date().toISOString().slice(0, 10);

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

async function crear(page: Page, titulo: string, empresa: string, url: string) {
  await page.goto('/postulaciones/nueva');
  await page.getByLabel('Cargo').fill(titulo);
  await page.getByLabel('Empresa').fill(empresa);
  await page.getByLabel('URL del aviso').fill(url);
  await page.getByLabel('Plataforma').selectOption('getonboard');
  await page.getByRole('button', { name: 'Crear postulación' }).click();
  await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('tablero vacío y accesible', async ({ page }) => {
  await page.goto('/tablero');
  await expect(page.getByText('Todavía no sigues ninguna postulación')).toBeVisible();
  await expect(page.getByText('Importar fichas')).toBeVisible();
  await sinViolaciones(page);
});

test('F1-14: crear, postular, señal de rechazo, discrepancia corregida y descartar con motivo', async ({
  page,
}) => {
  await crear(page, 'Backend NestJS', 'Andes Lab Ficticia', 'https://ejemplo.test/e2e/andes');

  // Postular pide fecha y canal (R2).
  await page.getByRole('button', { name: 'Pasar a Postulado' }).click();
  const postular = page.getByRole('dialog');
  await expect(postular.getByRole('heading', { name: 'Marcar como postulada' })).toBeVisible();
  await expect(postular.getByLabel('¿Cuándo postulaste?')).toHaveValue(hoy);
  await postular.getByText('Correo').click();
  await postular.getByLabel('Detalle').fill('rrhh@ejemplo.test');
  await postular.getByRole('button', { name: 'Marcar como postulada' }).click();
  await expect(page.getByText('Prioridad alta').first()).toBeVisible();
  await expect(page.getByText('Correo · rrhh@ejemplo.test')).toBeVisible();

  // Señal de rechazo a mano: queda como sugerencia y abre la discrepancia (R11, R13).
  await page.getByRole('button', { name: '+ Registrar señal' }).click();
  const senal = page.getByRole('dialog');
  await senal.getByLabel('Resumen').fill('No continuaremos con tu proceso');
  await senal.getByLabel('Estado que sugiere').selectOption('rechazado');
  await senal.getByRole('button', { name: 'Registrar' }).click();
  const banda = page
    .getByRole('alert')
    .filter({ hasText: 'Este movimiento no calza con la evidencia.' });
  await expect(banda).toBeVisible();
  await expect(page.getByText('Sugiere: Rechazado')).toBeVisible();
  await sinViolaciones(page);

  // Corregir: elegir Rechazado y dar motivo (R5, R14).
  await banda.getByRole('button', { name: 'Corregir estado…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Rechazado' }).click();
  const motivo = page.getByRole('dialog');
  await motivo.getByLabel('Motivo').fill('Llegó el correo de rechazo');
  await motivo.getByRole('button', { name: 'Confirmar' }).click();
  await expect(banda).toHaveCount(0);
  await expect(page.getByText('Prioridad baja').first()).toBeVisible();
  await expect(page.getByText('Motivo: Llegó el correo de rechazo')).toBeVisible();

  // Otra postulación: descartar con motivo.
  await crear(page, 'Full Stack Angular', 'Kora Ficticia', 'https://ejemplo.test/e2e/kora');
  await page.getByRole('button', { name: 'Pasar a Descartado' }).click();
  const descartar = page.getByRole('dialog');
  await expect(
    descartar.getByText('Si llega algo de esta postulación te avisaré con prioridad baja.'),
  ).toBeVisible();
  await expect(descartar.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  await descartar.getByLabel('Motivo').fill('Pide 5 años de experiencia');
  await descartar.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Movida de Sin decidir a Descartado (formulario)')).toBeVisible();
});

test('F1-13: soltar de sin_decidir a entrevista vuelve con TRANSICION_INVALIDA', async ({
  page,
}) => {
  await crear(page, 'Data Engineer', 'Pampa Ficticia', 'https://ejemplo.test/e2e/pampa');
  await page.goto('/tablero');
  const tarjeta = page.locator('[data-tarjeta]').filter({ hasText: 'Pampa Ficticia' });
  const destino = page.locator('#col-entrevista');
  await tarjeta.scrollIntoViewIfNeeded();
  const a = await tarjeta.boundingBox();
  await destino.scrollIntoViewIfNeeded();
  const b = await destino.boundingBox();
  await page.mouse.move(a!.x + 40, a!.y + 30);
  await page.mouse.down();
  await page.mouse.move(a!.x + 60, a!.y + 40, { steps: 5 });
  await page.mouse.move(b!.x + 60, b!.y + 60, { steps: 25 });
  await page.mouse.up();
  await expect(page.getByText('Ese cambio de estado no está permitido.')).toBeVisible();
  await expect(page.locator('#col-sin_decidir').getByText('Pampa Ficticia')).toBeVisible();
  await expect(page.locator('#col-entrevista').getByText('Pampa Ficticia')).toHaveCount(0);
  await sinViolaciones(page);
});

test('cambia de idioma en vivo', async ({ page }) => {
  await page.goto('/tablero');
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page.getByRole('heading', { name: 'My applications' })).toBeVisible();
  await page.getByRole('button', { name: 'ES' }).click();
  await expect(page.getByRole('heading', { name: 'Mis postulaciones' })).toBeVisible();
});
