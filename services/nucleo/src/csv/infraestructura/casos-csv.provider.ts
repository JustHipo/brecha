import type { CasosCsv } from '../aplicacion/casos-csv';

/** Los casos de CSV para Nest (token de inyección por clase). */
export class CasosCsvInyectables {
  constructor(readonly csv: CasosCsv) {}
}
