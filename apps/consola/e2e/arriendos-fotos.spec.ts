import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

// Fotos de las propiedades (docs/diseno/fotos-propiedades.md §8) contra el núcleo real y la base de pruebas.
test.describe.configure({ mode: 'serial' });

// Dos PNG de 16×12 de distinto color (contenido distinto: no se toman como la misma foto).
const AZUL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAFUlEQVR4nGPQzuonCTGMahjVgB0BAEgB2wGrvEqgAAAAAElFTkSuQmCC',
  'base64',
);
const NARANJA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAFUlEQVR4nGO4VmFDEmIY1TCqATsCAOapJ5BjyWPHAAAAAElFTkSuQmCC',
  'base64',
);
const TITULO = 'Departamento 3D en Macul';

async function sinViolaciones(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .exclude('[data-sonner-toaster]')
    .analyze();
  expect(r.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`))).toEqual(
    [],
  );
}

/** La imagen llegó con el token y el navegador la pudo dibujar. */
async function cargada(img: Locator) {
  await expect(img).toBeVisible();
  await expect
    .poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth))
    .toBe(16);
}

test('sube dos fotos, cambia la portada, la ve en el tablero y quita una', async ({ page }) => {
  // El proxy de desarrollo agrega el token de la consola.
  const r = await page.request.post('/api/v1/arriendos/propiedades', {
    data: {
      tipo: 'departamento',
      comuna: 'Macul',
      dormitorios: 3,
      publicacion: { url: 'https://www.portalinmobiliario.com/MLC-300-fotos' },
    },
  });
  expect(r.status()).toBe(201);
  const id = (await r.json()).propiedad.id as string;

  await page.goto(`/arriendos/propiedades/${id}`);
  const galeria = page.locator('[data-galeria]');
  await expect(galeria).toContainText('Sin fotos todavía');

  await galeria.locator('[data-subir-fotos]').setInputFiles([
    { name: 'living.png', mimeType: 'image/png', buffer: AZUL },
    { name: 'cocina.png', mimeType: 'image/png', buffer: NARANJA },
  ]);
  await expect(galeria.locator('[data-resultado-fotos]')).toContainText(
    '2 agregadas · 0 ya estaban · 0 con error',
  );
  await cargada(galeria.getByRole('img', { name: `Portada de ${TITULO}` }));
  await expect(galeria.locator('[data-miniatura]')).toHaveCount(2);
  await expect(galeria).toContainText('living.png');

  // La segunda pasa a portada.
  await galeria.getByRole('button', { name: 'Ver la foto 2 de 2' }).click();
  await expect(galeria.getByRole('img', { name: `Foto 2 de 2 de ${TITULO}` })).toBeVisible();
  await expect(galeria).toContainText('cocina.png');
  await galeria.getByRole('button', { name: 'Usar como portada' }).click();
  await expect(page.getByText('Portada cambiada')).toBeVisible();
  await expect(galeria.getByRole('img', { name: `Portada de ${TITULO}` })).toBeVisible();
  await expect(galeria).toContainText('cocina.png');
  await sinViolaciones(page);

  // Una URL local o privada no se descarga (SSRF), y lo dice en palabras.
  await galeria.getByLabel('URL de las fotos (una por línea)').fill('http://192.168.1.10/foto.jpg');
  await galeria.getByRole('button', { name: 'Agregar fotos' }).click();
  await expect(galeria.locator('[data-resultado-fotos]')).toContainText(
    '0 agregadas · 0 ya estaban · 1 con error',
  );
  await expect(galeria.locator('[data-resultado-fotos]')).toContainText('local o privada');

  // La portada en el tablero y en la lista.
  await page.goto('/arriendos/tablero');
  const tarjeta = page.locator(`[data-propiedad="${id}"]`);
  await cargada(tarjeta.locator('[data-portada] img'));
  await sinViolaciones(page);
  await page.goto('/arriendos/lista');
  await cargada(page.locator('tr', { hasText: TITULO }).locator('[data-portada] img'));

  // Quitar la portada: la otra pasa a serlo.
  await page.goto(`/arriendos/propiedades/${id}`);
  await galeria.getByRole('button', { name: 'Quitar' }).click();
  await galeria.getByRole('button', { name: 'Sí, quitar esta foto' }).click();
  await expect(page.getByText('Foto quitada')).toBeVisible();
  await expect(galeria.locator('[data-miniatura]')).toHaveCount(0);
  await cargada(galeria.getByRole('img', { name: `Portada de ${TITULO}` }));
  await expect(galeria).toContainText('living.png');
});
