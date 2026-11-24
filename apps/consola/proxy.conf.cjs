// Proxy de desarrollo: /api va al núcleo en 127.0.0.1:4300 (backend.md §6.1, ADR 0019) y /api/ia a la
// API de IA en 127.0.0.1:4400 (docs/diseno/f2.md §8). /api/ia va primero: gana la primera entrada que
// calza. Sin clave local, el núcleo escribe .brecha/token-consola; el proxy lo agrega si el pedido no
// trae token, como hará Electron en F3. La API de IA acepta el mismo token (lo verifica con el núcleo).
// Con clave ese archivo no existe y la consola pide desbloquear.
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const dir = process.env.BRECHA_DIR
  ? resolve(process.env.BRECHA_DIR)
  : resolve(__dirname, '../../.brecha');
const archivo = resolve(dir, 'token-consola');

/** Agrega el token de la consola si el pedido no trae uno. */
function conToken(proxy) {
  proxy.on('proxyReq', (pedido) => {
    if (!pedido.getHeader('authorization') && existsSync(archivo)) {
      pedido.setHeader('authorization', `Bearer ${readFileSync(archivo, 'utf8').trim()}`);
    }
  });
}

module.exports = {
  '/api/ia': {
    target: `http://127.0.0.1:${process.env.IA_PUERTO ?? 4400}`,
    changeOrigin: true,
    configure: conToken,
  },
  '/api': {
    target: `http://127.0.0.1:${process.env.NUCLEO_PUERTO ?? 4300}`,
    changeOrigin: true,
    configure: conToken,
  },
};
