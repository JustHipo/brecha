"""F2-07: cada correo clasificado como de una postulación se asocia y se registra en el núcleo como señal.

Lo que no es de una postulación nunca se envía. El núcleo aplica R11 y D27 y abre discrepancias (R13).
"""

from dataclasses import dataclass, field

from ia.aplicacion.puertos import (
    ClasificadoPorEnviar,
    ColaDeEnvio,
    Nucleo,
    NucleoNoDisponible,
    SenalParaNucleo,
)
from ia.dominio.asociacion import asociar


@dataclass
class ResumenDeRegistro:
    a_postulacion: int = 0
    a_bandeja: int = 0
    aplicadas: int = 0
    repetidas: int = 0
    detalle: list[str] = field(default_factory=list)
    error: str | None = None


def a_senal(c: ClasificadoPorEnviar, postulacion_id: str | None) -> SenalParaNucleo:
    k = c.clasificacion
    return SenalParaNucleo(
        referencia_externa=c.message_id,
        postulacion_id=postulacion_id,
        plataforma=k.plataforma,
        resumen=k.resumen,
        estado_sugerido=k.estado_sugerido,
        confianza=k.confianza,
        recibida_en=c.recibido_en,
        remitente=c.remitente,
        asunto=c.asunto,
        empresa=k.empresa,
        cargo=k.cargo,
    )


class RegistrarSenales:
    def __init__(self, nucleo: Nucleo, cola: ColaDeEnvio, limite: int = 100, en_seco: bool = False) -> None:
        self.nucleo = nucleo
        self.cola = cola
        self.limite = limite
        self.en_seco = en_seco  # solo calcula la asociación, no envía nada

    def ejecutar(self) -> ResumenDeRegistro:
        r = ResumenDeRegistro()
        pendientes = self.cola.por_enviar(self.limite)
        if not pendientes:
            return r
        try:
            conocidas = self.nucleo.postulaciones()
            for c in pendientes:
                k = c.clasificacion
                a = asociar(k.empresa, k.cargo, k.plataforma, conocidas, c.remitente.rsplit("@", 1)[-1])
                destino = next((p for p in conocidas if p.id == a.postulacion_id), None)
                hacia = f"{destino.empresa} · {destino.titulo}" if destino else "bandeja"
                sugerido = k.estado_sugerido or "sin cambio"
                r.detalle.append(
                    f"{k.empresa or '-'} · {k.cargo or '-'} · {sugerido} {k.confianza:.2f}"
                    f" → {hacia} ({a.motivo})"
                )
                if self.en_seco:
                    continue
                resp = self.nucleo.registrar_senal(a_senal(c, a.postulacion_id))
                self.cola.marcar_enviado(c.message_id, a.postulacion_id)
                if resp.destino == "repetida":
                    r.repetidas += 1
                elif resp.destino == "bandeja":
                    r.a_bandeja += 1
                else:
                    r.a_postulacion += 1
                    r.aplicadas += int(resp.aplicada)
        except NucleoNoDisponible as e:
            r.error = f"núcleo no disponible: {e}"
        return r
