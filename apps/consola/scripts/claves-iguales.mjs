// El CI revisa que es.json y en.json tengan las mismas claves (ui.md §6).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const leer = (i) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `../public/i18n/${i}.json`), 'utf8'));
const claves = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? claves(v, `${p}${k}.`) : [`${p}${k}`],
  );
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
console.log(`Idiomas al día: ${es.size} claves en es y en.`);
