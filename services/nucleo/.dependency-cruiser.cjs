// Reglas de capas del núcleo (ADR 0003, backend.md §2). Rompen el CI si se violan.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'dominio-puro',
      comment: 'dominio/ no importa frameworks, Prisma, el SDK de MCP ni otras capas',
      severity: 'error',
      from: { path: '/dominio/' },
      to: {
        pathNot: ['/dominio/'],
      },
    },
    {
      name: 'aplicacion-sin-infraestructura',
      comment: 'aplicacion/ solo importa dominio/ y aplicacion/',
      severity: 'error',
      from: { path: '/aplicacion/' },
      to: {
        pathNot: ['/dominio/', '/aplicacion/'],
      },
    },
    {
      name: 'sin-ciclos',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['src/generado', '\\.spec\\.ts$'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
