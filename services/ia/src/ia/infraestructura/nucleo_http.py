"""Cliente del núcleo con el token `servicio` (backend.md §6.1 y C3). Solo 127.0.0.1."""

from datetime import datetime
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
                    p["id"],
                    p["empresa"],
                    p["titulo"],
                    p["plataforma"],
                    p["estado"] not in TERMINALES,
                    p.get("url", ""),
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

    def vincular_aviso(self, postulacion_id: str, aviso_id: str, calce: float | None) -> None:
        cuerpo: dict[str, Any] = {"avisoId": aviso_id}
        if calce is not None:
            cuerpo["calce"] = round(calce, 4)
        r = self._pedir("PATCH", f"/postulaciones/{postulacion_id}/aviso", json=cuerpo)
        if r.status_code != 200:
            raise NucleoNoDisponible(f"vincular aviso respondió {r.status_code}: {r.text[:200]}")

    # ── Tu red de LinkedIn (D40) ───────────────────────────────────────────────

    def registrar_contacto_red(
        self, nombre: str, perfil_url: str, titular: str | None, empresa: str | None
    ) -> str:
        cuerpo: dict[str, Any] = {"nombre": nombre[:200], "perfilUrl": perfil_url[:500]}
        if titular:
            cuerpo["titular"] = titular[:300]
        if empresa:
            cuerpo["empresa"] = empresa[:200]
        r = self._pedir("POST", "/red", json=cuerpo)
        if r.status_code != 201:
            raise NucleoNoDisponible(f"registrar contacto respondió {r.status_code}: {r.text[:200]}")
        return str(r.json()["id"])

    def registrar_interaccion_red(
        self, contacto_id: str, tipo: str, resumen: str, ocurrida_en: datetime, referencia: str
    ) -> bool:
        cuerpo = {
            "tipo": tipo,
            "resumen": resumen[:1000],
            "ocurridaEn": ocurrida_en.isoformat(),
            "referenciaExterna": referencia[:500],
        }
        r = self._pedir("POST", f"/red/{contacto_id}/interacciones", json=cuerpo)
        if r.status_code != 201:
            raise NucleoNoDisponible(f"registrar interacción respondió {r.status_code}: {r.text[:200]}")
        return bool(r.json().get("agregada"))

    def vincular_contacto_red(self, contacto_id: str, postulacion_id: str) -> None:
        r = self._pedir("PATCH", f"/red/{contacto_id}", json={"vincular": postulacion_id})
        if r.status_code != 200:
            raise NucleoNoDisponible(f"ligar contacto respondió {r.status_code}: {r.text[:200]}")
