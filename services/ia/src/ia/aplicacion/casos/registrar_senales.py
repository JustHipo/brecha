"""F2-07: cada correo clasificado como de una postulación se asocia y se registra en el núcleo como señal.

Lo que no es de una postulación nunca se envía. El núcleo aplica R11 y D27 y abre discrepancias (R13).
Si la clasificación ya trae la decisión (pasos.md §5.3), se usa: una o varias postulaciones, el paso que
pide el correo y los pasos que da por hechos. Si no (correos clasificados antes), la asociación de siempre.
"""

from dataclasses import dataclass, field

from ia.aplicacion.puertos import (
    ClasificadoPorEnviar,
    ColaDeEnvio,
    DecisionGuardada,
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


def a_senal(
    c: ClasificadoPorEnviar, postulacion_id: str | None, decision: DecisionGuardada | None = None
) -> SenalParaNucleo:
    k = c.clasificacion
    ids = decision.postulacion_ids if decision else ()
    return SenalParaNucleo(
        referencia_externa=c.message_id,
        postulacion_id=postulacion_id if not ids else None,
        plataforma=k.plataforma,
        resumen=k.resumen,
        estado_sugerido=k.estado_sugerido,
        confianza=k.confianza,
        recibida_en=c.recibido_en,
        remitente=c.remitente,
        asunto=c.asunto,
        empresa=k.empresa,
        cargo=k.cargo,
        postulacion_ids=ids,
        candidatas=decision.candidatas if decision and not ids else (),
        paso=decision.paso if decision else None,
        pasos_cumplidos=decision.pasos_cumplidos if decision and ids else (),
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
                if c.decision:
                    ids, motivo = c.decision.postulacion_ids, c.decision.motivo
                else:
                    a = asociar(k.empresa, k.cargo, k.plataforma, conocidas, c.remitente.rsplit("@", 1)[-1])
                    ids = (a.postulacion_id,) if a.postulacion_id else ()
                    motivo = a.motivo
                destinos = [f"{p.empresa} · {p.titulo}" for p in conocidas if p.id in ids]
                hacia = " + ".join(destinos) if destinos else "bandeja"
                sugerido = k.estado_sugerido or "sin cambio"
                pide = f" · pide: {c.decision.paso.descripcion}" if c.decision and c.decision.paso else ""
                r.detalle.append(
                    f"{k.empresa or '-'} · {k.cargo or '-'} · {sugerido} {k.confianza:.2f}"
                    f" → {hacia} ({motivo}){pide}"
                )
                if self.en_seco:
                    continue
                resp = self.nucleo.registrar_senal(a_senal(c, ids[0] if ids else None, c.decision))
                self.cola.marcar_enviado(c.message_id, ids)
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
