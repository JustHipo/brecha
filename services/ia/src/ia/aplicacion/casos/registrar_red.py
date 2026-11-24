"""D40: los avisos de LinkedIn entran a tu red, ligados a la postulación de su empresa."""

from dataclasses import dataclass, field

from ia.aplicacion.puertos import ColaDeRed, NucleoNoDisponible, RedEnNucleo
from ia.dominio.asociacion import asociar


@dataclass
class ResumenDeRed:
    registrados: int = 0
    nuevos: int = 0
    ligados: int = 0
    detalle: list[str] = field(default_factory=list)
    error: str | None = None


class RegistrarRed:
    def __init__(self, nucleo: RedEnNucleo, cola: ColaDeRed, limite: int = 100) -> None:
        self.nucleo = nucleo
        self.cola = cola
        self.limite = limite

    def ejecutar(self) -> ResumenDeRed:
        r = ResumenDeRed()
        pendientes = self.cola.avisos_red_por_enviar(self.limite)
        if not pendientes:
            return r
        try:
            activas = [p for p in self.nucleo.postulaciones() if p.activa]
            for p in pendientes:
                a = p.aviso
                contacto = self.nucleo.registrar_contacto_red(a.nombre, a.perfil_url, a.titular, a.empresa)
                if self.nucleo.registrar_interaccion_red(
                    contacto, a.tipo, a.resumen, p.recibido_en, f"{p.message_id}#{p.indice}"
                ):
                    r.nuevos += 1
                postulacion = None
                if a.empresa:
                    asociacion = asociar(a.empresa, None, "linkedin", activas)
                    postulacion = asociacion.postulacion_id
                    if postulacion:
                        self.nucleo.vincular_contacto_red(contacto, postulacion)
                        r.ligados += 1
                self.cola.marcar_aviso_red_enviado(p.message_id, p.indice, contacto, postulacion)
                r.registrados += 1
                destino = next(
                    (f"{x.empresa} · {x.titulo}" for x in activas if x.id == postulacion), "sin postulación"
                )
                r.detalle.append(f"{a.nombre} ({a.empresa or 'sin empresa'}): {a.tipo} → {destino}")
        except NucleoNoDisponible as e:
            r.error = f"el núcleo no respondió: {e}"
        return r
