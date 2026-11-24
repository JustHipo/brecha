import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Fecha local (no UTC): el núcleo compara con su reloj local y entre las 21:00 y las 24:00 en Chile
// la fecha UTC ya es «mañana», una fechaPostulacion futura que rechaza.
function fechaLocal(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const hoy = fechaLocal();

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

// F2-13: la Bandeja contra el núcleo real. La señal entra como la manda el vigía (token de servicio).
async function senalSinPostulacion(request: APIRequestContext, datos: Record<string, unknown>) {
  const token = readFileSync(join(process.env.BRECHA_DIR_E2E!, 'token-servicio'), 'utf8').trim();
  const r = await request.post(`http://127.0.0.1:${process.env.NUCLEO_E2E}/api/v1/senales`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { fuente: 'correo', plataforma: 'getonboard', confianza: 0.8, ...datos },
  });
  expect(r.status()).toBe(201);
  expect((await r.json()).destino).toBe('bandeja');
}

test('F2-13: una señal de la bandeja se asocia a una postulación y aparece en su ficha', async ({
  page,
  request,
}) => {
  await crear(page, 'Analista QA', 'Lumen Ficticia', 'https://ejemplo.test/e2e/lumen');
  const ficha = page.url();
  await senalSinPostulacion(request, {
    resumen: 'Queremos agendar una entrevista técnica contigo',
    estadoSugerido: 'entrevista',
    referenciaExterna: `<e2e-lumen-${Date.now()}@ejemplo.test>`,
    remitente: 'talento@lumen.test',
    asunto: 'Entrevista con Lumen',
    empresaDetectada: 'Lumen Ficticia',
    cargoDetectado: 'Analista QA',
  });
  await senalSinPostulacion(request, {
    resumen: 'Gracias por postular a Data Analyst',
    referenciaExterna: `<e2e-orbe-${Date.now()}@ejemplo.test>`,
    asunto: 'Recibimos tu postulación',
    empresaDetectada: 'Orbe Ficticia',
    cargoDetectado: 'Data Analyst',
  });

  await page.goto('/bandeja');
  await expect(page.getByRole('heading', { level: 1, name: 'Bandeja' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Bandeja (2 por revisar)' })).toBeVisible();
  const lumen = page.locator('[data-senal]').filter({ hasText: 'Entrevista con Lumen' });
  await expect(lumen.getByText('talento@lumen.test')).toBeVisible();
  await expect(lumen).toContainText(/Confianza:\s*80\s?%/);
  await sinViolaciones(page);

  // Asociar: el buscador parte con la empresa detectada.
  await lumen.getByRole('button', { name: 'Asociar' }).click();
  const asociar = page.getByRole('dialog');
  await expect(asociar.getByLabel('Buscar postulación')).toHaveValue('Lumen Ficticia');
  const resultado = asociar.getByRole('button', { name: /Lumen Ficticia/ });
  await expect(resultado).toBeVisible();
  await sinViolaciones(page);
  await resultado.click();
  await expect(page.getByText('Señal asociada a Lumen Ficticia · Analista QA')).toBeVisible();
  await expect(lumen).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Bandeja (1 por revisar)' })).toBeVisible();

  // Crear postulación con los datos de la otra señal (falta solo la URL del aviso).
  const orbe = page.locator('[data-senal]').filter({ hasText: 'Recibimos tu postulación' });
  await orbe.getByRole('button', { name: 'Crear postulación' }).click();
  const crearDialogo = page.getByRole('dialog');
  await expect(crearDialogo.getByLabel('Empresa')).toHaveValue('Orbe Ficticia');
  await expect(crearDialogo.getByLabel('Cargo')).toHaveValue('Data Analyst');
  await crearDialogo.getByLabel('URL del aviso').fill('https://ejemplo.test/e2e/orbe');
  await crearDialogo.getByRole('button', { name: 'Crear y asociar' }).click();
  await expect(page.getByText('Postulación creada: Orbe Ficticia · Data Analyst')).toBeVisible();
  await expect(page.getByText('No hay señales por revisar')).toBeVisible();
  await sinViolaciones(page);

  // La señal asociada está en la ficha.
  await page.goto(ficha);
  await expect(page.getByText('Queremos agendar una entrevista técnica contigo')).toBeVisible();
});

test('F2-13: sin la API de IA, las pantallas lo dicen y son accesibles', async ({ page }) => {
  await page.goto('/conexiones');
  await expect(page.getByRole('heading', { level: 1, name: 'Conexiones' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Servicio con IA apagado' })).toBeVisible();
  await expect(
    page.getByText('El servicio con IA no responde: está apagado o se cayó.').first(),
  ).toBeVisible();
  await sinViolaciones(page);

  await page.goto('/avisos');
  await expect(page.getByRole('heading', { level: 1, name: 'Avisos' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('El servicio con IA no responde');
  await sinViolaciones(page);

  await page.goto('/preguntar');
  await expect(page.getByRole('heading', { level: 1, name: 'Preguntar' })).toBeVisible();
  await page.getByLabel('Tu pregunta').fill('¿Qué aviso calza mejor conmigo?');
  await page.getByRole('button', { name: 'Preguntar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('El servicio con IA no responde');
  await sinViolaciones(page);
});

// Red de LinkedIn: el contacto entra como lo registraría Claude por MCP (aquí, por REST con el token
// de la consola) y se liga desde la pantalla Red.
async function conConsola(request: APIRequestContext, ruta: string, data: object) {
  const token = readFileSync(join(process.env.BRECHA_DIR_E2E!, 'token-consola'), 'utf8').trim();
  const r = await request.post(`http://127.0.0.1:${process.env.NUCLEO_E2E}/api/v1${ruta}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  expect(r.status()).toBe(201);
  return (await r.json()) as { id: string };
}

test('Red: un contacto de LinkedIn se liga a una postulación y aparece en «Con quién hablas»', async ({
  page,
  request,
}) => {
  await crear(page, 'Frontend Angular', 'Brisa Ficticia', 'https://ejemplo.test/e2e/brisa');
  const ficha = page.url();
  const { id } = await conConsola(request, '/red', {
    nombre: 'Camila Rojas Ficticia',
    perfilUrl: 'linkedin.com/in/camila-rojas-ficticia',
    titular: 'Talent Partner',
    empresa: 'Brisa Ficticia',
  });
  await conConsola(request, `/red/${id}/interacciones`, {
    tipo: 'mensaje_recibido',
    resumen: '¿Conversamos el jueves sobre la vacante?',
  });

  await page.goto('/red');
  await expect(page.getByRole('heading', { level: 1, name: 'Red' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Red (1 por responder)' })).toBeVisible();
  const fila = page.locator('[data-contacto]').filter({ hasText: 'Camila Rojas Ficticia' });
  await expect(fila.getByText('Te toca responder')).toBeVisible();
  await expect(fila.getByText('¿Conversamos el jueves sobre la vacante?')).toBeVisible();
  await sinViolaciones(page);

  await page.getByRole('button', { name: 'Seguimiento vencido' }).click();
  await expect(page.getByText('Nadie calza con este filtro.')).toBeVisible();
  await page.getByRole('button', { name: /^Por responder/ }).click();
  await fila.getByRole('link', { name: 'Camila Rojas Ficticia', exact: true }).click();

  // Detalle: ligar a la postulación con el buscador, que parte con la empresa del contacto.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Camila Rojas Ficticia' }),
  ).toBeVisible();
  await expect(page.getByText('Todavía no está ligado a ninguna postulación.')).toBeVisible();
  await sinViolaciones(page);
  await page.getByRole('button', { name: '+ Ligar a una postulación' }).click();
  const ligar = page.getByRole('dialog');
  await expect(ligar.getByLabel('Buscar postulación')).toHaveValue('Brisa Ficticia');
  const brisa = ligar.getByRole('button', { name: /Brisa Ficticia/ });
  await expect(brisa).toBeVisible();
  await sinViolaciones(page);
  await brisa.click();
  await expect(page.getByText('Ligado a Brisa Ficticia · Frontend Angular')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Brisa Ficticia · Frontend Angular' })).toBeVisible();

  // Respondes: ahora le toca a la otra persona.
  await page.getByLabel('Qué pasó').selectOption('mensaje_enviado');
  await page.getByLabel('Resumen').fill('Sí, el jueves a las 10');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(page.getByText('Registrado en la conversación')).toBeVisible();
  await expect(page.getByText('Esperando respuesta desde hoy')).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Secciones' })
      .getByRole('link', { name: 'Red', exact: true }),
  ).toBeVisible();

  // En la ficha: con quién hablas, lo pendiente y el mensaje en la línea de tiempo.
  await page.goto(ficha);
  const conQuien = page.locator('[data-con-quien]');
  await expect(
    conQuien.getByRole('link', { name: 'Camila Rojas Ficticia', exact: true }),
  ).toBeVisible();
  await expect(conQuien.getByText('Esperando respuesta desde hoy')).toBeVisible();
  await expect(
    conQuien.getByText('Le escribiste: Sí, el jueves a las 10', { exact: false }),
  ).toBeVisible();
  await expect(
    page.locator('[data-linkedin]').filter({ hasText: '¿Conversamos el jueves sobre la vacante?' }),
  ).toBeVisible();
  const resumen = page.locator('[data-resumen]');
  await expect(resumen.getByText('Todavía no postulas')).toBeVisible();
  await expect(
    resumen.getByRole('link', { name: /Abrir el aviso en Get on Board/ }),
  ).toHaveAttribute('href', 'https://ejemplo.test/e2e/brisa');
  await sinViolaciones(page);

  // Ligar a alguien más desde la ficha: el buscador de la red marca a quien ya está ligado.
  await conQuien.getByRole('button', { name: '+ Ligar a alguien de tu red' }).click();
  const elegir = page.getByRole('dialog');
  await expect(elegir.getByRole('button', { name: /Camila Rojas Ficticia/ })).toBeDisabled();
  await sinViolaciones(page);
  await elegir.getByRole('button', { name: '+ Agregar a alguien nuevo' }).click();
  const nuevo = page.getByRole('dialog');
  await nuevo.getByLabel('Nombre').fill('Pablo Soto Ficticio');
  await nuevo
    .getByLabel('Perfil de LinkedIn')
    .fill('https://cl.linkedin.com/in/pablo-soto-ficticio/');
  await nuevo.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(page.getByText('Pablo Soto Ficticio quedó ligado a esta postulación')).toBeVisible();
  await expect(
    conQuien.getByRole('link', { name: 'Pablo Soto Ficticio', exact: true }),
  ).toBeVisible();
});

test('Ajustes sin la API de IA: lo dice, no deja guardar y es accesible', async ({ page }) => {
  await page.goto('/ajustes');
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('El servicio con IA no responde');
  await expect(page.getByRole('button', { name: 'Conectar con Gmail' })).toBeDisabled();
  await expect(page.locator('[data-vigia]')).toContainText('sin dato');
  await sinViolaciones(page);

  await page.getByLabel('Idioma de la consola').selectOption('en');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect Gmail' })).toBeVisible();
  await page.getByLabel('Console language').selectOption('es');
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible();
});

test('Conectar con Gmail: la guía de 4 pasos, un rechazo y la cuenta conectada', async ({
  page,
}) => {
  // El servicio con IA simulado: la primera contraseña no pasa la prueba con Gmail, la segunda sí.
  let conectado = false;
  const enviadas: string[] = [];
  await page.route('**/api/ia/credenciales', (r) =>
    r.fulfill({
      json: {
        correo: { configurado: conectado, usuario: conectado ? 'ta•••@gmail.com' : null },
        openai: { configurado: false },
      },
    }),
  );
  await page.route('**/api/ia/credenciales/correo', async (r) => {
    const cuerpo = r.request().postDataJSON() as { usuario: string; clave: string };
    enviadas.push(cuerpo.clave);
    if (enviadas.length === 1) {
      return r.fulfill({
        status: 400,
        json: {
          codigo: 'CREDENCIAL_INVALIDA',
          mensaje: 'Gmail no aceptó el correo y la contraseña de aplicación (LoginError)',
          campo: 'clave',
        },
      });
    }
    conectado = true;
    return r.fulfill({ json: { configurado: true, usuario: 'ta•••@gmail.com' } });
  });

  await page.goto('/ajustes');
  await page.getByRole('button', { name: 'Conectar con Gmail' }).click();
  const guia = page.locator('[data-guia-gmail]');
  await expect(
    guia.getByRole('heading', { name: 'Activa la verificación en dos pasos' }),
  ).toBeFocused();
  await expect(
    guia.getByRole('link', { name: /Abrir la verificación en dos pasos/ }),
  ).toHaveAttribute('href', 'https://myaccount.google.com/signinoptions/twosv');
  await sinViolaciones(page);
  await guia.getByRole('button', { name: 'Ya lo hice, siguiente' }).click();
  await expect(
    guia.getByRole('link', { name: /myaccount\.google\.com\/apppasswords/ }),
  ).toHaveAttribute('href', 'https://myaccount.google.com/apppasswords');
  await guia.getByRole('button', { name: 'Ya lo hice, siguiente' }).click();
  await expect(guia.getByText('Escribe «Brecha» como nombre de la app')).toBeVisible();
  await guia.getByRole('button', { name: 'Ya lo hice, siguiente' }).click();
  await expect(guia.getByRole('heading', { name: 'Pega la contraseña aquí' })).toBeFocused();
  await sinViolaciones(page);

  await guia.getByLabel('Tu correo de Gmail').fill('tamara@gmail.com');
  await guia.getByLabel('Contraseña de aplicación').fill('abcd efgh ijkl mnop');
  await guia.getByRole('button', { name: 'Probar y guardar' }).click();
  await expect(guia.locator('[data-resultado="gmail"]')).toContainText('Gmail no aceptó');
  await expect(guia.locator('[data-ayuda-gmail]')).toContainText('16 letras completas');
  await expect(guia.getByLabel('Contraseña de aplicación')).toHaveValue('');
  await sinViolaciones(page);

  await guia.getByLabel('Contraseña de aplicación').fill('qrst uvwx yzab cdef');
  await guia.getByRole('button', { name: 'Probar y guardar' }).click();
  await expect(page.locator('[data-guia-gmail]')).toHaveCount(0);
  await expect(page.locator('[data-usuario-correo]')).toContainText('ta•••@gmail.com');
  await expect(page.getByRole('button', { name: 'Conectar otra cuenta de Gmail' })).toBeVisible();
  expect(enviadas).toEqual(['abcd efgh ijkl mnop', 'qrst uvwx yzab cdef']);
  // Nada de la contraseña queda en la página.
  expect(await page.content()).not.toContain('qrst uvwx');
});
