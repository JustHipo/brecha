"""Vigía (modo liviano, ADR 0014): revisa el correo cada D29 minutos y, con OpenAI, clasifica ahí mismo."""

import logging
import signal
import threading
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from ia.aplicacion.casos.clasificar_pendientes import ClasificarPendientes, ResumenDeClasificacion
from ia.aplicacion.casos.registrar_red import RegistrarRed
from ia.aplicacion.casos.registrar_senales import RegistrarSenales, ResumenDeRegistro
from ia.aplicacion.casos.sincronizar_correo import ResumenDeSincronizacion, SincronizarCorreo
from ia.aplicacion.puertos import Credenciales, TipoDeCredencial, estado_de
from ia.entradas.servicios import Servicios
from ia.infraestructura.config import cargar_config
from ia.infraestructura.imap import LectorImap
from ia.infraestructura.llavero import Llavero
from ia.infraestructura.nucleo_http import NucleoHttp, leer_token
from ia.infraestructura.openai_modelo import ModeloOpenAI
from ia.infraestructura.postgres.correos import RepositorioPostgresDeCorreos, TrazasPostgres
from ia.infraestructura.postgres.motor import crear_motor

log = logging.getLogger("ia.vigia")


def una_vuelta(
    credenciales: Credenciales,
    sincronizar: Callable[[], ResumenDeSincronizacion] | None = None,
    clasificar: Callable[[], ResumenDeClasificacion] | None = None,
    registrar: Callable[[], ResumenDeRegistro] | None = None,
) -> list[str]:
    """Una revisión. Sin credenciales no falla: dice qué falta y sigue esperando (nada silencioso)."""
    estado = estado_de(credenciales)
    faltan = estado.faltantes()
    if not estado.correo:
        log.warning("faltan credenciales: %s", "; ".join(faltan))
        return faltan
    if sincronizar is not None:
        r = sincronizar()
        if r.error:
            log.error("la lectura del correo falló: %s", r.error)
        else:
            log.info(
                "correo: %s leídos, %s filtrados, %s para clasificar %s, %s en cola",
                r.leidos,
                r.filtrados,
                r.pendientes,
                r.por_plataforma,
                r.en_cola,
            )
    # Con OpenAI el vigía clasifica ahí mismo (ADR 0014); sin llave, los correos esperan en cola.
    if clasificar is not None and estado.openai:
        k = clasificar()
        if k.error:
            log.error("la IA no está disponible: %s (los correos siguen en cola)", k.error)
        else:
            log.info(
                "clasificados %s (%s de postulaciones: %s), USD %.4f",
                k.clasificados,
                k.de_postulacion,
                k.por_estado,
                k.costo_usd,
            )
    elif not estado.openai:
        log.warning("falta la llave de OpenAI: los correos quedan en cola")
    if registrar is not None:
        g = registrar()
        if g.error:
            log.error("%s (las señales esperan a la próxima vuelta)", g.error)
        elif g.a_postulacion or g.a_bandeja or g.repetidas:
            log.info(
                "señales: %s a postulaciones (%s aplicadas solas), %s a la bandeja, %s repetidas",
                g.a_postulacion,
                g.aplicadas,
                g.a_bandeja,
                g.repetidas,
            )
    return faltan


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    cfg = cargar_config()
    llavero = Llavero()
    motor = crear_motor(cfg.ia_database_url)
    repo = RepositorioPostgresDeCorreos(motor)
    trazas = TrazasPostgres(motor)

    def sincronizar() -> ResumenDeSincronizacion:
        lector = LectorImap(
            llavero.obtener(TipoDeCredencial.CORREO_USUARIO) or "",
            llavero.obtener(TipoDeCredencial.CORREO_CLAVE) or "",
        )
        return SincronizarCorreo(
            lector, repo, lambda: datetime.now(UTC), cfg.dias_primera_sincronizacion
        ).ejecutar()

    def clasificar() -> ResumenDeClasificacion:
        modelo = ModeloOpenAI(llavero.obtener(TipoDeCredencial.OPENAI) or "", cfg.openai_modelo)
        precios = (cfg.openai_precio_entrada, cfg.openai_precio_salida)
        try:
            # Con el núcleo, el modelo ve las candidatas y sus pasos (pasos.md §5.2).
            nucleo: NucleoHttp | None = NucleoHttp(cfg.nucleo_url, leer_token(cfg.carpeta_instancia))
        except Exception:
            nucleo = None
        return ClasificarPendientes(
            modelo, repo, trazas, lambda: datetime.now(UTC), precios, nucleo=nucleo
        ).ejecutar()

    def registrar() -> ResumenDeRegistro:
        try:
            nucleo = NucleoHttp(cfg.nucleo_url, leer_token(cfg.carpeta_instancia))
        except Exception as e:
            return ResumenDeRegistro(error=str(e))
        return RegistrarSenales(nucleo, repo).ejecutar()

    def red() -> None:
        """Los avisos de LinkedIn que trajo el correo entran a tu red (D40)."""
        try:
            nucleo = NucleoHttp(cfg.nucleo_url, leer_token(cfg.carpeta_instancia))
        except Exception as e:
            log.error("red de LinkedIn: %s", e)
            return
        r = RegistrarRed(nucleo, repo).ejecutar()
        if r.error:
            log.error("red de LinkedIn: %s (los avisos esperan a la próxima vuelta)", r.error)
        elif r.registrados:
            log.info(
                "red de LinkedIn: %s avisos, %s nuevos, %s ligados a postulaciones, %s pasos",
                r.registrados,
                r.nuevos,
                r.ligados,
                r.pasos,
            )

    servicios = Servicios(cfg, llavero, motor)
    ultima_busqueda: list[datetime] = []

    def avisos() -> None:
        """Get on Board cada `getonboard_cada_horas` y, con OpenAI, análisis, calce, vectores y vínculos."""
        ahora = datetime.now(UTC)
        vencida = not ultima_busqueda or ahora - ultima_busqueda[0] >= timedelta(
            hours=cfg.getonboard_cada_horas
        )
        if cfg.getonboard_busquedas and vencida:
            ultima_busqueda[:] = [ahora]
            b = servicios.buscar_getonboard(cfg.getonboard_busquedas)
            log.info(
                "Get on Board: %s avisos, %s nuevos%s",
                b["encontrados"],
                b["nuevos"],
                f" (error: {b['error']})" if b["error"] else "",
            )
        r = servicios.procesar_avisos()
        a = r.get("analisis") or {}
        if a.get("analizados") or a.get("error"):
            log.info("avisos: %s analizados, error: %s", a.get("analizados"), a.get("error") or "ninguno")
        v = r.get("vinculos") or {}
        if v.get("calcesEnviados") or v.get("error"):
            log.info(
                "avisos ligados: %s calces enviados, error: %s",
                v.get("calcesEnviados"),
                v.get("error") or "ninguno",
            )

    parar = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: parar.set())
    signal.signal(signal.SIGINT, lambda *_: parar.set())
    log.info("vigía en marcha: cada %s minutos", cfg.vigia_minutos)
    while not parar.is_set():
        try:
            una_vuelta(llavero, sincronizar, clasificar, registrar)
        except Exception:  # una vuelta rota no apaga el vigía: queda en el log y se intenta en la próxima
            log.exception("la vuelta del vigía falló")
        try:
            red()
        except Exception:
            log.exception("la vuelta de la red falló")
        try:
            avisos()
        except Exception:
            log.exception("la vuelta de avisos falló")
        parar.wait(cfg.vigia_minutos * 60)
    log.info("vigía detenido")


if __name__ == "__main__":
    main()
