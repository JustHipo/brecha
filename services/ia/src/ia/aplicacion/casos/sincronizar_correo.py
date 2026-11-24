"""F2-05: lee los correos nuevos en solo lectura, aplica el filtro sin IA
y guarda lo que pasa para clasificar."""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from ia.aplicacion.puertos import CorreoGuardado, LectorDeCorreo, PuntoDeLectura, RepositorioDeCorreos
from ia.dominio.correo import EstadoDeCorreo
from ia.dominio.filtro import filtrar
from ia.dominio.fragmento import fragmento


@dataclass
class ResumenDeSincronizacion:
    leidos: int = 0
    repetidos: int = 0
    filtrados: int = 0
    pendientes: int = 0
    por_plataforma: dict[str, int] = field(default_factory=dict)
    en_cola: int = 0
    error: str | None = None


class SincronizarCorreo:
    def __init__(
        self,
        lector: LectorDeCorreo,
        repo: RepositorioDeCorreos,
        ahora: Callable[[], datetime],
        dias_primera_vez: int,
    ) -> None:
        self.lector = lector
        self.repo = repo
        self.ahora = ahora
        self.dias_primera_vez = dias_primera_vez

    def ejecutar(self) -> ResumenDeSincronizacion:
        r = ResumenDeSincronizacion()
        punto = self.repo.punto_de_lectura()
        cuando = self.ahora()
        try:
            validez = self.lector.uidvalidity()
            # Si la carpeta cambió de uidvalidity, los UID viejos no sirven: se vuelve a la fecha
            # y la deduplicación por Message-ID evita repetir.
            desde_uid = punto.ultimo_uid if punto.uidvalidity == validez else None
            desde_fecha = (cuando - timedelta(days=self.dias_primera_vez)).date()
            ultimo = desde_uid
            for c in self.lector.nuevos(desde_uid, desde_fecha):
                r.leidos += 1
                ultimo = max(ultimo or 0, c.uid)
                if self.repo.existe(c.message_id):
                    r.repetidos += 1
                    continue
                f = filtrar(c)
                if not f.pasa:
                    r.filtrados += 1
                    self.repo.guardar(
                        CorreoGuardado(
                            c.message_id,
                            c.uid,
                            c.remitente,
                            c.recibido_en,
                            EstadoDeCorreo.FILTRADO,
                            f.plataforma,
                            f.motivo,
                        )
                    )
                    continue
                r.pendientes += 1
                clave = f.plataforma or "otra"
                r.por_plataforma[clave] = r.por_plataforma.get(clave, 0) + 1
                self.repo.guardar(
                    CorreoGuardado(
                        c.message_id,
                        c.uid,
                        c.remitente,
                        c.recibido_en,
                        EstadoDeCorreo.PENDIENTE,
                        f.plataforma,
                        f.motivo,
                        asunto=c.asunto[:500],
                        fragmento=fragmento(c.texto),
                    )
                )
            self.repo.registrar_revision(PuntoDeLectura(validez, ultimo), cuando, None)
        except Exception as e:  # la fuente falló: queda visible en estado_vigia, nunca en silencio
            r.error = f"{type(e).__name__}: {str(e)[:200]}"
            self.repo.registrar_revision(punto, cuando, r.error)
        r.en_cola = self.repo.en_cola()
        return r
