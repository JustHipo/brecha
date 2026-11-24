"""D40: los avisos de LinkedIn entran a tu red, ligados a la postulación de su empresa.

Pasos pendientes (pasos.md §5.5): el aviso por correo de un mensaje nuevo no trae el texto. Si la persona
está ligada a una postulación (abierta o cerrada, J6), queda el paso «Leer el mensaje de X en LinkedIn»;
cuando tu IA lo lee con Chrome, lo cierra y anota el pedido real.
"""

from dataclasses import dataclass, field

from ia.aplicacion.puertos import ColaDeRed, NucleoNoDisponible, PasoParaNucleo, RedEnNucleo
from ia.dominio.asociacion import asociar


@dataclass
class ResumenDeRed:
    registrados: int = 0
    nuevos: int = 0
    ligados: int = 0
    pasos: int = 0
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
            # Todas, también las cerradas (J6): `asociar` prefiere la abierta si hay dos parecidas.
            conocidas = self.nucleo.postulaciones()
            for p in pendientes:
                a = p.aviso
                contacto = self.nucleo.registrar_contacto_red(a.nombre, a.perfil_url, a.titular, a.empresa)
                nuevo = self.nucleo.registrar_interaccion_red(
                    contacto.id, a.tipo, a.resumen, p.recibido_en, f"{p.message_id}#{p.indice}"
                )
                r.nuevos += int(nuevo)
                postulacion = None
                if a.empresa:
                    asociacion = asociar(a.empresa, None, "linkedin", conocidas)
                    postulacion = asociacion.postulacion_id
                    if postulacion and postulacion not in contacto.postulacion_ids:
                        self.nucleo.vincular_contacto_red(contacto.id, postulacion)
                        r.ligados += 1
                ligadas = list(
                    dict.fromkeys([*contacto.postulacion_ids, *([postulacion] if postulacion else [])])
                )
                if a.tipo == "mensaje_recibido" and ligadas:
                    paso = PasoParaNucleo(
                        descripcion=f"Leer el mensaje de {a.nombre} en LinkedIn"[:120],
                        detalle="El correo no trae el texto: ábrelo en LinkedIn y, si te piden algo, "
                        "anótalo como paso.",
                    )
                    r.pasos += int(
                        self.nucleo.registrar_paso(
                            ligadas,
                            paso,
                            "linkedin",
                            f"{p.message_id}#{p.indice}#leer",
                            p.recibido_en,
                            contacto.id,
                        )
                    )
                self.cola.marcar_aviso_red_enviado(p.message_id, p.indice, contacto.id, postulacion)
                r.registrados += 1
                destino = next(
                    (f"{x.empresa} · {x.titulo}" for x in conocidas if x.id == postulacion), "sin postulación"
                )
                r.detalle.append(f"{a.nombre} ({a.empresa or 'sin empresa'}): {a.tipo} → {destino}")
        except NucleoNoDisponible as e:
            r.error = f"el núcleo no respondió: {e}"
        return r
