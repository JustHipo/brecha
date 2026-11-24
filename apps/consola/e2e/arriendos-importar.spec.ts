import { expect, test } from '@playwright/test';

// Importar un chat de WhatsApp (docs/diseno/arriendos.md §7, A5). El servicio con IA no corre en el e2e:
// sus respuestas se simulan aquí y lo que se prueba es la consola contra el núcleo real.
const CHAT = `[20/11/26, 10:15:03] Juan: Hola, ¿sigue disponible el depto de Providencia?
[20/11/26, 10:20:41] Luis Dueño: Sí, 600 mil. ¿Lo quieres ver el sábado?
`;

const propuesta = {
  titulo: 'Depto Providencia',
  tipo: 'departamento',
  direccion: 'Los Leones 1200',
  comuna: 'Providencia',
  precio: { monto: 600000, moneda: 'CLP' },
  gastosComunes: null,
  dormitorios: 1,
  banos: 1,
  m2: null,
  estacionamientos: null,
  mascotas: null,
  amoblado: null,
  url: null,
  requisitos: { rentaVeces: null, aval: null, mesesGarantia: null },
  estadoSugerido: 'contactada',
  contacto: { nombre: 'Luis Dueño', telefono: '+56 9 3333 4444', correo: null, rol: 'dueno' },
  nota: 'Ofrece visita el sábado',
  mensajes: [0, 1],
};

test('importa un chat: elige quién eres, revisa y agrega con la conversación', async ({ page }) => {
  await page.route('**/api/ia/arriendos/chat', (r) =>
    r.fulfill({
      json: {
        autores: ['Juan', 'Luis Dueño'],
        mensajes: 2,
        desde: '2026-11-20T10:15:03',
        hasta: '2026-11-20T10:20:41',
      },
    }),
  );
  await page.route('**/api/ia/arriendos/extraer', async (r) => {
    expect(r.request().postDataJSON()).toMatchObject({ yo: 'Juan' });
    await r.fulfill({
      json: {
        propuestas: [propuesta],
        mensajes: [
          {
            indice: 0,
            fecha: '2026-11-20T10:15:03',
            autor: 'Juan',
            texto: '¿Sigue disponible?',
            tuyo: true,
          },
          {
            indice: 1,
            fecha: '2026-11-20T10:20:41',
            autor: 'Luis Dueño',
            texto: 'Sí, ¿el sábado?',
            tuyo: false,
          },
        ],
        recortado: false,
        costoUsd: 0.001,
      },
    });
  });

  await page.goto('/arriendos/importar');
  await page.getByRole('tab', { name: 'Chat de WhatsApp' }).click();
  await page.locator('[data-importar-archivo]').setInputFiles({
    name: 'Chat de WhatsApp con Luis.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(CHAT),
  });
  await page.getByLabel('Juan', { exact: true }).check();
  await page.getByRole('button', { name: 'Buscar propiedades' }).click();
  await expect(page.locator('[data-propuesta="0"]')).toContainText('Depto Providencia');
  await page.getByRole('button', { name: 'Agregar las elegidas' }).click();
  await expect(page.getByText('Listo: 1 agregadas')).toBeVisible();

  await page.locator('[data-propuesta="0"]').getByRole('link').click();
  await expect(page.locator('[data-estado-propiedad]')).toHaveText('Contactada');
  const luis = page.locator('[data-contacto="Luis Dueño"]');
  await expect(luis).toContainText('WhatsApp +56933334444');
  await expect(luis.getByText('Sí, ¿el sábado?')).toBeVisible();
  // El último mensaje es de Luis: te toca responder.
  await page.goto('/arriendos/lista');
  await expect(page.getByRole('row', { name: /Depto Providencia/ })).toContainText(
    'Te toca responder',
  );

  // Importar el mismo chat otra vez no duplica: se suma a la que ya sigues.
  await page.goto('/arriendos/importar');
  await page.getByRole('tab', { name: 'Chat de WhatsApp' }).click();
  await page.locator('[data-importar-archivo]').setInputFiles({
    name: 'chat.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(CHAT),
  });
  await page.getByLabel('Juan', { exact: true }).check();
  await page.getByRole('button', { name: 'Buscar propiedades' }).click();
  await expect(page.locator('[data-propuesta="0"]')).toContainText('Ya la sigues');
});
