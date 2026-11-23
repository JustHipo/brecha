// Proxy de desarrollo: /api va al núcleo en 127.0.0.1:4300 (backend.md §6.1, ADR 0019).
// Sin clave local, el núcleo escribe .brecha/token-consola; el proxy lo agrega si el pedido no trae token,
// como hará Electron en F3. Con clave ese archivo no existe y la consola pide desbloquear.
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const dir = process.env.BRECHA_DIR
  ? resolve(process.env.BRECHA_DIR)
  : resolve(__dirname, '../../.brecha');
const archivo = resolve(dir, 'token-consola');

module.exports = {
  '/api': {
    target: `http://127.0.0.1:${process.env.NUCLEO_PUERTO ?? 4300}`,
    changeOrigin: true,
    configure: (proxy) => {
      proxy.on('proxyReq', (pedido) => {
        if (!pedido.getHeader('authorization') && existsSync(archivo)) {
          pedido.setHeader('authorization', `Bearer ${readFileSync(archivo, 'utf8').trim()}`);
        }
      });
    },
  },
};
