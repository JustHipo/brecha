import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, Menu, nativeImage, Notification, session, shell, Tray } from 'electron';
import { ejecutarHook, hooksPara, leerHooks } from './hooks';
import { OyenteDeEventos } from './notificaciones';
import { abiertaAlIniciarSesion, ARGUMENTO_OCULTA, ARGUMENTO_SALIR } from './plataforma';
import { Registro } from './registro';
import { PUERTOS, rutas } from './rutas';
import { Servicios } from './servicios';

const URL_CONSOLA = `http://127.0.0.1:${PUERTOS.nucleo}`;
const ESTADO: Record<string, string> = {
  corriendo: '●',
  iniciando: '◐',
  reiniciando: '◐',
  fallando: '✕',
  detenido: '○',
};
const NOMBRES: Record<string, string> = {
  postgres: 'Base de datos',
  nucleo: 'Núcleo',
  'ia-api': 'Servicio con IA',
  vigia: 'Vigía del correo',
};

const WINDOWS = process.platform === 'win32';

app.setName('Brecha');
// Windows muestra los avisos del sistema solo con un identificador de la app (el mismo appId del instalador).
if (WINDOWS) app.setAppUserModelId('cl.brecha.app');
// BRECHA_DATOS: otra carpeta de datos y registros (solo para probar la app al lado de la instalada).
if (process.env.BRECHA_DATOS) {
  app.setPath('userData', process.env.BRECHA_DATOS);
  app.setAppLogsPath(join(process.env.BRECHA_DATOS, 'logs'));
}
// `--salir` sin una Brecha abierta no levanta nada.
if (!app.requestSingleInstanceLock() || process.argv.includes(ARGUMENTO_SALIR)) app.exit(0);

let tray: Tray | null = null;
let ventana: BrowserWindow | null = null;
let servicios: Servicios;
let oyente: OyenteDeEventos;
let saliendo = false;
let pendientesBandeja = 0;
let porResponder = 0;
let arriendosPorRevisar = 0;

function tokenConsola(): string | null {
  const ruta = join(servicios.instancia, 'token-consola');
  return existsSync(ruta) ? readFileSync(ruta, 'utf8').trim() : null;
}

function abrir(ruta = '/tablero'): void {
  if (!ventana || ventana.isDestroyed()) {
    ventana = new BrowserWindow({
      width: 1320,
      height: 860,
      minWidth: 960,
      minHeight: 640,
      title: 'Brecha',
      show: false,
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    ventana.on('close', (e) => {
      // Cerrar la ventana no apaga Brecha: sigue en la barra de menú revisando tu correo.
      if (!saliendo) {
        e.preventDefault();
        ventana?.hide();
        app.dock?.hide();
      }
    });
    ventana.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: 'deny' };
    });
    ventana.once('ready-to-show', () => ventana?.show());
    // BRECHA_CAPTURA=archivo.png: guarda cómo se ve la ventana (para verificar la app sin mirarla).
    if (process.env.BRECHA_CAPTURA) {
      ventana.webContents.on('did-finish-load', () =>
        setTimeout(async () => {
          const img = await ventana?.webContents.capturePage();
          if (img) writeFileSync(process.env.BRECHA_CAPTURA!, img.toPNG());
        }, 4_000),
      );
    }
  }
  void ventana.loadURL(`${URL_CONSOLA}${ruta}`);
  app.dock?.show();
  ventana.show();
  ventana.focus();
}

async function contarBandeja(): Promise<void> {
  const token = tokenConsola();
  if (!token) return;
  try {
    const r = await fetch(`${URL_CONSOLA}/api/v1/bandeja`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) pendientesBandeja = ((await r.json()) as unknown[]).length;
    const red = await fetch(`${URL_CONSOLA}/api/v1/red?filtro=responder`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (red.ok)
      porResponder = ((await red.json()) as { resumen: { porResponder: number } }).resumen.porResponder;
    const arriendos = await fetch(`${URL_CONSOLA}/api/v1/arriendos/propiedades?abiertas=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (arriendos.ok) {
      const { resumen } = (await arriendos.json()) as { resumen: { porResponder: number; bandeja: number } };
      arriendosPorRevisar = resumen.porResponder + resumen.bandeja;
    }
  } catch {
    // el núcleo todavía no responde
  }
  actualizarMenu();
}

function actualizarMenu(): void {
  if (!tray) return;
  const lineas = ['postgres', 'nucleo', 'ia-api', 'vigia'].map((n) => {
    const p = servicios.get(n);
    const estado = p?.estado ?? 'detenido';
    return {
      label: `${ESTADO[estado]} ${NOMBRES[n]}${estado === 'fallando' && p?.ultimoError ? `: ${p.ultimoError}` : ''}`,
      enabled: false,
    };
  });
  const todoBien =
    servicios.procesos.length === 4 && servicios.procesos.every((p) => p.estado === 'corriendo');
  const pendientes = pendientesBandeja + porResponder + arriendosPorRevisar;
  // En Windows no hay texto al lado del icono: el número va en el texto que aparece al pasar el mouse.
  if (!WINDOWS) tray.setTitle(pendientes ? ` ${pendientes}` : '');
  tray.setToolTip(
    `${todoBien ? 'Brecha: todo funcionando' : 'Brecha: revisando servicios'}${
      WINDOWS && pendientes ? ` · ${pendientes} pendientes` : ''
    }`,
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Brecha', click: () => abrir() },
      {
        label: pendientesBandeja ? `Bandeja: ${pendientesBandeja} por revisar` : 'Bandeja al día',
        click: () => abrir('/bandeja'),
      },
      {
        label: porResponder ? `Red: ${porResponder} por responder` : 'Tu red de LinkedIn',
        click: () => abrir('/red'),
      },
      {
        label: arriendosPorRevisar ? `Arriendos: ${arriendosPorRevisar} por revisar` : 'Arriendos',
        click: () => abrir('/arriendos/tablero'),
      },
      { type: 'separator' },
      ...(servicios.error ? [{ label: `✕ ${servicios.error}`, enabled: false }] : []),
      ...lineas,
      { type: 'separator' },
      {
        label: 'Abrir al iniciar sesión',
        type: 'checkbox',
        checked: app.getLoginItemSettings(inicioDeSesion()).openAtLogin,
        click: (item) => app.setLoginItemSettings({ ...inicioDeSesion(), openAtLogin: item.checked }),
      },
      { label: 'Ver registros', click: () => void shell.openPath(app.getPath('logs')) },
      {
        label: 'Reiniciar servicios',
        click: async () => {
          oyente.detener();
          await servicios.detener();
          await servicios.iniciar();
          oyente.iniciar();
        },
      },
      { type: 'separator' },
      { label: 'Salir de Brecha', click: () => void salir() },
    ]),
  );
}

async function salir(): Promise<void> {
  if (saliendo) return;
  saliendo = true;
  oyente?.detener();
  await servicios?.detener();
  app.exit(0);
}

/** En Windows, el inicio con la sesión lleva `--oculta` para arrancar callada (allá no existe wasOpenedAtLogin). */
function inicioDeSesion(): { args?: string[] } {
  return WINDOWS ? { args: [ARGUMENTO_OCULTA] } : {};
}

/** macOS: icono plantilla (negro, el sistema lo adapta). Windows: icono a color, porque el negro no se ve en la barra oscura. */
function icono(): Electron.NativeImage {
  const ruta = join(__dirname, '..', 'recursos-app', WINDOWS ? 'bandeja.png' : 'barraTemplate.png');
  if (!existsSync(ruta)) return nativeImage.createEmpty();
  const img = nativeImage.createFromPath(ruta);
  if (!WINDOWS) img.setTemplateImage(true);
  return img;
}

// Abrir Brecha otra vez muestra la ventana; `Brecha --salir` cierra la que está corriendo (apagado limpio).
app.on('second-instance', (_e, argv) => {
  if (argv.includes(ARGUMENTO_SALIR)) void salir();
  else abrir();
});
app.on('activate', () => abrir());
app.on('window-all-closed', () => {
  // Se queda en la barra de menú.
});
app.on('before-quit', (e) => {
  if (!saliendo) {
    e.preventDefault();
    void salir();
  }
});

void app.whenReady().then(async () => {
  app.dock?.hide();
  const registro = new Registro(app.getPath('logs'));
  servicios = new Servicios(
    rutas(app.isPackaged, process.resourcesPath),
    { datos: app.getPath('userData'), logs: app.getPath('logs') },
    registro,
    process.execPath,
    () => actualizarMenu(),
  );
  // La consola se sirve desde el núcleo; el token va en cada pedido, como hacía el proxy de desarrollo.
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`${URL_CONSOLA}/*`] }, (d, listo) => {
    const token = tokenConsola();
    if (token && !d.requestHeaders.Authorization) d.requestHeaders.Authorization = `Bearer ${token}`;
    listo({ requestHeaders: d.requestHeaders });
  });
  tray = new Tray(icono());
  if (!WINDOWS && tray.getTitle() === '' && icono().isEmpty()) tray.setTitle('Brecha');
  // En Windows el clic abre Brecha y el clic derecho muestra el menú (lo de siempre allá).
  if (WINDOWS) tray.on('click', () => abrir());
  actualizarMenu();
  // La primera vez queda configurada para abrir al iniciar sesión (corre en segundo plano, D19).
  if (!existsSync(join(app.getPath('userData'), 'postgres'))) {
    app.setLoginItemSettings({ ...inicioDeSesion(), openAtLogin: true });
  }
  await servicios.iniciar();
  oyente = new OyenteDeEventos(
    servicios.instancia,
    (a) => {
      const n = new Notification({ title: a.titulo, body: a.cuerpo });
      n.on('click', () => abrir(a.ruta));
      n.show();
    },
    (e) => {
      void contarBandeja();
      for (const h of hooksPara(leerHooks(servicios.instancia, registro), e.tipo))
        void ejecutarHook(h, e, registro);
    },
  );
  oyente.iniciar();
  void contarBandeja();
  setInterval(() => void contarBandeja(), 5 * 60_000);
  // Al iniciar sesión arranca callada en la barra de menú; abierta a mano, muestra la ventana.
  if (!abiertaAlIniciarSesion(process.argv, app.getLoginItemSettings().wasOpenedAtLogin)) abrir();
});
