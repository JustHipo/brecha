import type { Contexto } from '../aplicacion/base';
import {
  AgendarEntrevista,
  AgregarContacto,
  AgregarNota,
  AplicarSenal,
  CambiarEstado,
  CrearPostulacion,
  EditarPostulacion,
  RegistrarResultadoEntrevista,
  RegistrarSenal,
  ResolverDiscrepancia,
} from '../aplicacion/casos-de-escritura';
import {
  Exportar,
  ListarPostulaciones,
  ResumenDesde,
  VerPostulacion,
  VerTablero,
} from '../aplicacion/casos-de-lectura';

/** Todos los casos de uso armados sobre un mismo contexto. Los usan REST y MCP por igual (ADR 0012). */
export class CasosDeUso {
  readonly crear: CrearPostulacion;
  readonly cambiarEstado: CambiarEstado;
  readonly editar: EditarPostulacion;
  readonly registrarSenal: RegistrarSenal;
  readonly aplicarSenal: AplicarSenal;
  readonly resolverDiscrepancia: ResolverDiscrepancia;
  readonly agregarNota: AgregarNota;
  readonly agregarContacto: AgregarContacto;
  readonly agendarEntrevista: AgendarEntrevista;
  readonly registrarResultadoEntrevista: RegistrarResultadoEntrevista;
  readonly listar: ListarPostulaciones;
  readonly tablero: VerTablero;
  readonly ver: VerPostulacion;
  readonly resumen: ResumenDesde;
  readonly exportar: Exportar;

  constructor(c: Contexto) {
    this.crear = new CrearPostulacion(c);
    this.cambiarEstado = new CambiarEstado(c);
    this.editar = new EditarPostulacion(c);
    this.registrarSenal = new RegistrarSenal(c);
    this.aplicarSenal = new AplicarSenal(c);
    this.resolverDiscrepancia = new ResolverDiscrepancia(c);
    this.agregarNota = new AgregarNota(c);
    this.agregarContacto = new AgregarContacto(c);
    this.agendarEntrevista = new AgendarEntrevista(c);
    this.registrarResultadoEntrevista = new RegistrarResultadoEntrevista(c);
    this.listar = new ListarPostulaciones(c);
    this.tablero = new VerTablero(c);
    this.ver = new VerPostulacion(c);
    this.resumen = new ResumenDesde(c);
    this.exportar = new Exportar(c);
  }
}
