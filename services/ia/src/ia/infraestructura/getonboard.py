"""Get on Board por su API pública (F2-09): sin llave, como máximo 20 pedidos cada 5 segundos.

Cada aviso se guarda con su enlace público y la cita «Get on Board», como piden sus condiciones.
"""

import time
from datetime import UTC, datetime
from typing import Any

import httpx

from ia.dominio.aviso import Aviso, AvisoInvalido, texto_plano

URL = "https://www.getonbrd.com"
CITA = "Aviso de Get on Board (getonbrd.com)"
POR_PAGINA = 20
PAUSA_S = 0.3  # 20 pedidos cada 5 s dan 0,25 s por pedido: se deja margen

_MODALIDAD = {
    "fully_remote": "remoto",
    "remote_local": "remoto",
    "temporarily_remote": "remoto",
    "hybrid": "hibrido",
    "no_remote": "presencial",
}


def aviso_de(dato: dict[str, Any]) -> Aviso:
    at = dato["attributes"]
    empresa = (((at.get("company") or {}).get("data") or {}).get("attributes") or {}).get("name") or "?"
    partes = [texto_plano(at.get(k) or "") for k in ("functions", "description", "desirable") if at.get(k)]
    sueldo = None
    if at.get("min_salary") or at.get("max_salary"):
        sueldo = f"USD {at.get('min_salary') or '?'} - {at.get('max_salary') or '?'}/mes"
    publicado = at.get("published_at")
    return Aviso(
        url=(dato.get("links") or {}).get("public_url") or f"{URL}/jobs/{dato['id']}",
        titulo=at["title"],
        empresa=empresa,
        plataforma="getonboard",
        modalidad=_MODALIDAD.get(
            at.get("remote_modality") or "", "remoto" if at.get("remote") else "no_indica"
        ),
        origen="getonboard",
        texto="\n".join(partes)[:12000],
        ubicacion=", ".join(at.get("countries") or []) or None,
        sueldo=sueldo,
        usd_mes=at.get("max_salary") or at.get("min_salary"),
        publicado_en=datetime.fromtimestamp(publicado, UTC).date() if publicado else None,
        cita=CITA,
    )


class GetOnBoard:
    def __init__(self, cliente: httpx.Client | None = None, pausa_s: float = PAUSA_S) -> None:
        self.cliente = cliente or httpx.Client(
            base_url=URL, timeout=20, headers={"User-Agent": "brecha (app local de postulaciones)"}
        )
        self.pausa_s = pausa_s

    def buscar(self, consulta: str, maximo: int) -> list[Aviso]:
        avisos: list[Aviso] = []
        pagina = 1
        while len(avisos) < maximo:
            r = self.cliente.get(
                "/api/v0/search/jobs",
                params={"query": consulta, "per_page": POR_PAGINA, "page": pagina, "expand": '["company"]'},
            )
            if r.status_code == 429:
                time.sleep(5)
                continue
            r.raise_for_status()
            cuerpo = r.json()
            for d in cuerpo.get("data", []):
                try:
                    avisos.append(aviso_de(d))
                except (AvisoInvalido, KeyError):
                    continue
            total = (cuerpo.get("meta") or {}).get("total_pages", 1)
            if pagina >= total or not cuerpo.get("data"):
                break
            pagina += 1
            time.sleep(self.pausa_s)
        return avisos[:maximo]
