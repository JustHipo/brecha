"""Reprocesar (docs/diseno/pasos.md §5.7): vuelve a clasificar con el contexto los correos ya leídos y solo
crea los pasos que pidieron. No vuelve a registrar señales. Lo corre la persona, una vez, con su llave.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from ia.aplicacion.casos.clasificar_pendientes import clasificar_con_contexto
from ia.aplicacion.puertos import (
    CorreosYaClasificados,
    ErrorDeModelo,
    ModeloDeLenguaje,
    NucleoConPasos,
    NucleoNoDisponible,
    RegistroDeTrazas,
    Traza,
)
from ia.dominio.clasificacion import costo_usd


@dataclass
class ResumenDeReproceso:
    revisados: int = 0
    pasos_nuevos: int = 0
    ya_estaban: int = 0
    recordatorios: int = 0
    costo_usd: float = 0.0
    detalle: list[str] = field(default_factory=list)
    error: str | None = None


class ReprocesarPasos:
    def __init__(
        self,
        modelo: ModeloDeLenguaje,
        nucleo: NucleoConPasos,
        correos: CorreosYaClasificados,
        trazas: RegistroDeTrazas,
        ahora: Callable[[], datetime],
        precios: tuple[float, float],
        en_seco: bool = False,
    ) -> None:
        self.modelo = modelo
        self.nucleo = nucleo
        self.correos = correos
        self.trazas = trazas
        self.ahora = ahora
        self.precios = precios
        self.en_seco = en_seco  # muestra lo que crearía, sin crear nada

    def ejecutar(self, dias: int) -> ResumenDeReproceso:
        r = ResumenDeReproceso()
        try:
            conocidas = self.nucleo.postulaciones()
            nombres = {p.id: f"{p.empresa} · {p.titulo}" for p in conocidas}
            for c in self.correos.clasificados_desde(self.ahora() - timedelta(days=dias)):
                _k, uso, d = clasificar_con_contexto(
                    self.modelo, self.nucleo, self.correos, c, conocidas, self.ahora().date().isoformat()
                )
                costo = costo_usd(uso.tokens_entrada, uso.tokens_salida, *self.precios)
                self.trazas.registrar(
                    Traza(
                        "reprocesar_pasos",
                        uso.modelo,
                        uso.tokens_entrada,
                        uso.tokens_salida,
                        costo,
                        uso.duracion_ms,
                        "ok",
                        self.ahora(),
                    )
                )
                r.revisados += 1
                r.costo_usd = round(r.costo_usd + costo, 6)
                if not d.paso or not d.postulacion_ids:
                    continue
                donde = " + ".join(nombres.get(i, i) for i in d.postulacion_ids)
                if d.paso.mismo_que:
                    r.recordatorios += 1
                    r.detalle.append(f"recordatorio: {d.paso.descripcion} → {donde}")
                    continue
                if self.en_seco:
                    r.detalle.append(f"crearía: {d.paso.descripcion} → {donde} ({d.motivo})")
                    continue
                nuevo = self.nucleo.registrar_paso(
                    list(d.postulacion_ids), d.paso, "correo", c.message_id, c.recibido_en
                )
                if nuevo:
                    r.pasos_nuevos += 1
                    r.detalle.append(f"creado: {d.paso.descripcion} → {donde} ({d.motivo})")
                else:
                    r.ya_estaban += 1
        except (NucleoNoDisponible, ErrorDeModelo) as e:
            r.error = str(e)[:300]
        return r
