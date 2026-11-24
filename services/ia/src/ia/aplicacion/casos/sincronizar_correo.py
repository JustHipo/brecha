"""F2-05: lee los correos nuevos en solo lectura, aplica el filtro sin IA
y guarda lo que pasa para clasificar."""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from ia.aplicacion.puertos import (
    ColaDeRed,
    CorreoGuardado,
    CorreosConocidos,
    LectorDeCorreo,
    PuntoDeLectura,
    RepositorioDeCorreos,
)
from ia.dominio.correo import CorreoLeido, EstadoDeCorreo
from ia.dominio.enlaces import marcar_enlaces
from ia.dominio.filtro import filtrar
from ia.dominio.fragmento import fragmento
from ia.dominio.linkedin import leer_aviso


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
            dominios = dominios_de(self.repo)
            for c in self.lector.nuevos(desde_uid, desde_fecha):
                r.leidos += 1
                ultimo = max(ultimo or 0, c.uid)
                destino, plataforma = ingresar(self.repo, c, dominios)
                if destino == "repetido":
                    r.repetidos += 1
                elif destino in {"filtrado", "red"}:
                    r.filtrados += 1
                else:
                    r.pendientes += 1
                    clave = plataforma or "otra"
                    r.por_plataforma[clave] = r.por_plataforma.get(clave, 0) + 1
            self.repo.registrar_revision(PuntoDeLectura(validez, ultimo), cuando, None)
        except Exception as e:  # la fuente falló: queda visible en estado_vigia, nunca en silencio
            r.error = f"{type(e).__name__}: {str(e)[:200]}"
            self.repo.registrar_revision(punto, cuando, r.error)
        r.en_cola = self.repo.en_cola()
        return r


def dominios_de(repo: RepositorioDeCorreos) -> frozenset[str]:
    """Dominios que ya escribieron por una postulación: sus correos pasan el filtro sin palabras."""
    return repo.dominios_conocidos() if isinstance(repo, CorreosConocidos) else frozenset()


def ingresar(
    repo: RepositorioDeCorreos, c: CorreoLeido, dominios: frozenset[str] = frozenset()
) -> tuple[str, str | None]:
    """Un correo leído entra a la base: repetido, filtrado (sin asunto ni fragmento) o por clasificar.

    Lo usan el vigía y `ia probar-correo` (correos de prueba en archivos, sin tocar el punto de lectura).
    """
    if repo.existe(c.message_id):
        return "repetido", None
    avisos = leer_aviso(c)
    if avisos and isinstance(repo, ColaDeRed):
        repo.guardar_avisos_red(c.message_id, c.recibido_en, avisos)
        repo.guardar(
            CorreoGuardado(
                c.message_id,
                c.uid,
                c.remitente,
                c.recibido_en,
                EstadoDeCorreo.FILTRADO,
                "linkedin",
                f"aviso de LinkedIn: {len(avisos)} en tu red",
            )
        )
        return "red", "linkedin"
    f = filtrar(c, dominios)
    if not f.pasa:
        repo.guardar(
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
        return "filtrado", f.plataforma
    repo.guardar(por_clasificar(c, f.plataforma, f.motivo))
    return "pendiente", f.plataforma


def por_clasificar(c: CorreoLeido, plataforma: str | None, motivo: str) -> CorreoGuardado:
    # Los enlaces quedan en la base local y al modelo le llega «[enlace N]» (D54).
    texto, enlaces = marcar_enlaces(fragmento(c.texto), c.dominio)
    return CorreoGuardado(
        c.message_id,
        c.uid,
        c.remitente,
        c.recibido_en,
        EstadoDeCorreo.PENDIENTE,
        plataforma,
        motivo,
        asunto=c.asunto[:500],
        fragmento=texto,
        en_respuesta_a=c.en_respuesta_a,
        referencias=c.referencias,
        enlaces=tuple(enlaces),
    )


@dataclass
class ResumenDeRelectura:
    leidos: int = 0
    reabiertos: int = 0
    detalle: list[str] = field(default_factory=list)


class ReleerFiltrados:
    """Vuelve a leer del correo los mensajes que el filtro descartó y deja en cola los que ahora pasan.

    Un correo filtrado no guarda asunto ni texto, así que hay que leerlo de nuevo (solo lectura, D25).
    """

    def __init__(
        self, lector: LectorDeCorreo, repo: RepositorioDeCorreos, ahora: Callable[[], datetime]
    ) -> None:
        self.lector = lector
        self.repo = repo
        self.ahora = ahora

    def ejecutar(self, dias: int) -> ResumenDeRelectura:
        r = ResumenDeRelectura()
        if not isinstance(self.repo, CorreosConocidos):
            return r
        dominios = self.repo.dominios_conocidos()
        for c in self.lector.nuevos(None, (self.ahora() - timedelta(days=dias)).date()):
            r.leidos += 1
            if self.repo.estado_de(c.message_id) != EstadoDeCorreo.FILTRADO.value or leer_aviso(c):
                continue
            f = filtrar(c, dominios)
            if f.pasa and self.repo.reabrir(por_clasificar(c, f.plataforma, f.motivo)):
                r.reabiertos += 1
                r.detalle.append(f"{c.remitente} · {c.asunto[:80]} ({f.motivo})")
        return r
