// El CI revisa que es.json y en.json tengan las mismas claves (ui.md §6) y que no haya claves repetidas.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const texto = (i) => readFileSync(resolve(import.meta.dirname, `../public/i18n/${i}.json`), 'utf8');
const leer = (i) => JSON.parse(texto(i));
const claves = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? claves(v, `${p}${k}.`) : [`${p}${k}`],
  );
// JSON.parse se queda callado con una clave repetida (la última pisa a la primera): se cuentan a mano.
const cuantas = (o) =>
  Object.values(o).reduce((n, v) => n + 1 + (v && typeof v === 'object' ? cuantas(v) : 0), 0);

for (const i of ['es', 'en']) {
  const enTexto = (texto(i).match(/"(?:[^"\\]|\\.)*"\s*:/g) ?? []).length;
  const alLeer = cuantas(leer(i));
  if (enTexto !== alLeer) {
    console.error(`${i}.json tiene claves repetidas: ${enTexto} en el texto y ${alLeer} al leerlo`);
    process.exit(1);
  }
}

const es = new Set(claves(leer('es')));
const en = new Set(claves(leer('en')));
const faltanEn = [...es].filter((k) => !en.has(k));
const faltanEs = [...en].filter((k) => !es.has(k));
if (faltanEn.length || faltanEs.length) {
  console.error('Claves de idioma distintas:');
  for (const k of faltanEn) console.error(`  falta en en.json: ${k}`);
  for (const k of faltanEs) console.error(`  falta en es.json: ${k}`);
  process.exit(1);
}
console.log(`Idiomas al día: ${es.size} claves en es y en, sin repetidas.`);
