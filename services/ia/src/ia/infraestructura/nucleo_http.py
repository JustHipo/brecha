"""Cliente del núcleo con el token `servicio` (backend.md §6.1 y C3). Solo 127.0.0.1."""

from pathlib import Path
from typing import Any

import httpx

from ia.aplicacion.puertos import NucleoNoDisponible, RespuestaDelNucleo, SenalParaNucleo
from ia.dominio.asociacion import PostulacionConocida

TERMINALES = {"rechazado", "aceptada", "descartado"}


def leer_token(carpeta: Path) -> str:
    ruta = carpeta / "token-servicio"
    if not ruta.exists():
        raise NucleoNoDisponible(f"no existe {ruta.name}: levanta el núcleo una vez para que lo genere")
    return ruta.read_text().strip()


class NucleoHttp:
    def __init__(self, url: str, token: str, cliente: httpx.Client | None = None) -> None:
        self.cliente = cliente or httpx.Client(base_url=url, timeout=15)
        self.cliente.headers["Authorization"] = f"Bearer {token}"

    def _pedir(self, metodo: str, ruta: str, **kw: Any) -> httpx.Response:
        try:
            return self.cliente.request(metodo, f"/api/v1{ruta}", **kw)
        except httpx.HTTPError as e:
            raise NucleoNoDisponible(f"{type(e).__name__}") from e

    def postulaciones(self) -> list[PostulacionConocida]:
        conocidas: list[PostulacionConocida] = []
        offset = 0
        while True:
            r = self._pedir("GET", "/postulaciones", params={"limit": 200, "offset": offset})
            if r.status_code != 200:
                raise NucleoNoDisponible(f"listar postulaciones respondió {r.status_code}")
            datos = r.json()
            conocidas += [
                PostulacionConocida(
                    p["id"], p["empresa"], p["titulo"], p["plataforma"], p["estado"] not in TERMINALES
                )
                for p in datos["items"]
            ]
            offset += len(datos["items"])
            if offset >= datos["total"] or not datos["items"]:
                return conocidas

    def registrar_senal(self, s: SenalParaNucleo) -> RespuestaDelNucleo:
        cuerpo: dict[str, Any] = {
            "fuente": "correo",
            "plataforma": s.plataforma,
            "resumen": s.resumen,
            "confianza": s.confianza,
            "recibidaEn": s.recibida_en.isoformat(),
            "referenciaExterna": s.referencia_externa[:500],
            "remitente": s.remitente[:320],
            "asunto": s.asunto[:500],
        }
        if s.postulacion_id:
            cuerpo["postulacionId"] = s.postulacion_id
        if s.estado_sugerido:
            cuerpo["estadoSugerido"] = s.estado_sugerido
        if s.empresa:
            cuerpo["empresaDetectada"] = s.empresa[:200]
        if s.cargo:
            cuerpo["cargoDetectado"] = s.cargo[:300]
        r = self._pedir("POST", "/senales", json=cuerpo)
        if r.status_code == 409 and r.json().get("codigo") == "YA_EXISTE":
            return RespuestaDelNucleo("repetida", False, None)
        if r.status_code != 201:
            raise NucleoNoDisponible(f"registrar señal respondió {r.status_code}: {r.text[:200]}")
        d = r.json()
        if d["destino"] == "bandeja":
            return RespuestaDelNucleo("bandeja", False, None)
        return RespuestaDelNucleo("postulacion", bool(d["senal"]["aplicada"]), d["postulacion"]["estado"])
