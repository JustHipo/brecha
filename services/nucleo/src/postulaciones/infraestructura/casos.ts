import type { Contexto } from '../aplicacion/base';
import { ImportarFichas } from '../aplicacion/importar-fichas';
import {
  AsociarSenal,
  CrearDesdeSenal,
  DescartarSenal,
  ListarBandeja,
  RecibirSenal,
} from '../aplicacion/casos-de-bandeja';
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
  VincularAviso,
} from '../aplicacion/casos-de-escritura';
import {
  Exportar,
  ListarPostulaciones,
  ResumenDesde,
  VerPostulacion,
  VerTablero,
  EtiquetasEnUso,
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
  readonly etiquetas: EtiquetasEnUso;
  readonly ver: VerPostulacion;
  readonly resumen: ResumenDesde;
  readonly exportar: Exportar;
  readonly importar: ImportarFichas;
  readonly recibirSenal: RecibirSenal;
  readonly bandeja: ListarBandeja;
  readonly asociarSenal: AsociarSenal;
  readonly crearDesdeSenal: CrearDesdeSenal;
  readonly descartarSenal: DescartarSenal;
  readonly vincularAviso: VincularAviso;

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
    this.etiquetas = new EtiquetasEnUso(c);
    this.ver = new VerPostulacion(c);
    this.resumen = new ResumenDesde(c);
    this.exportar = new Exportar(c);
    this.importar = new ImportarFichas(c);
    this.recibirSenal = new RecibirSenal(c);
    this.bandeja = new ListarBandeja(c);
    this.asociarSenal = new AsociarSenal(c);
    this.crearDesdeSenal = new CrearDesdeSenal(c);
    this.descartarSenal = new DescartarSenal(c);
    this.vincularAviso = new VincularAviso(c);
  }
}
