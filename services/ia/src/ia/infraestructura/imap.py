"""Lector de correo por IMAP, solo lectura (D25): `select_folder(readonly=True)` (EXAMINE) y `BODY.PEEK[]`.

Ninguna de las dos marca un correo como leído. Este adaptador nunca llama a STORE, MOVE, COPY ni EXPUNGE.
"""

from collections.abc import Callable, Iterator
from datetime import UTC, date, datetime
from email import message_from_bytes, policy
from email.message import EmailMessage
from email.utils import parseaddr, parsedate_to_datetime
from html.parser import HTMLParser
from typing import Any, Protocol

from imapclient import IMAPClient

from ia.dominio.correo import CorreoLeido

LOTE = 50


class ClienteImap(Protocol):
    """Lo que usamos de IMAPClient; en las pruebas se reemplaza por un doble que registra las llamadas."""

    def login(self, usuario: str, clave: str) -> Any: ...
    def list_folders(self) -> list[tuple[tuple[bytes, ...], bytes, str]]: ...
    def select_folder(self, carpeta: str, readonly: bool = ...) -> dict[bytes, Any]: ...
    def search(self, criterio: list[Any]) -> list[int]: ...
    def fetch(self, uids: list[int], datos: list[str]) -> dict[int, dict[bytes, Any]]: ...
    def logout(self) -> Any: ...


class _ATexto(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.partes: list[str] = []
        self._omitir = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "head"}:
            self._omitir += 1
        elif tag in {"br", "p", "div", "tr", "li", "h1", "h2", "h3"}:
            self.partes.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "head"} and self._omitir:
            self._omitir -= 1

    def handle_data(self, data: str) -> None:
        if not self._omitir:
            self.partes.append(data)


def html_a_texto(html: str) -> str:
    p = _ATexto()
    p.feed(html)
    return "".join(p.partes)


def texto_de(mensaje: EmailMessage) -> str:
    """Prefiere el texto plano, pero si viene vacío (pasa en notificaciones de portales) usa el HTML."""
    for tipo in ("plain", "html"):
        cuerpo = mensaje.get_body(preferencelist=(tipo,))
        if cuerpo is None:
            continue
        contenido = cuerpo.get_content()
        texto = contenido if isinstance(contenido, str) else ""
        if tipo == "html":
            texto = html_a_texto(texto)
        if len(texto.strip()) >= 20:
            return texto
    return ""


def a_correo(uid: int, crudo: bytes, interna: datetime | None) -> CorreoLeido:
    m = message_from_bytes(crudo, policy=policy.default)
    assert isinstance(m, EmailMessage)
    nombre, direccion = parseaddr(str(m.get("From", "")))
    try:
        fecha = parsedate_to_datetime(str(m["Date"])) if m["Date"] else interna
    except (TypeError, ValueError):
        fecha = interna
    message_id = str(m.get("Message-ID", "")).strip() or f"<sin-id-{uid}@brecha>"
    return CorreoLeido(
        uid=uid,
        message_id=message_id,
        remitente=direccion.lower(),
        nombre_remitente=nombre,
        asunto=str(m.get("Subject", "")),
        recibido_en=(fecha or datetime.now(UTC)).astimezone(UTC),
        texto=texto_de(m),
        masivo=bool(m.get("List-Unsubscribe")) or str(m.get("Precedence", "")).lower() in {"bulk", "list"},
    )


class LectorImap:
    def __init__(
        self,
        usuario: str,
        clave: str,
        servidor: str = "imap.gmail.com",
        fabrica: Callable[[str], ClienteImap] | None = None,
    ) -> None:
        self.usuario = usuario
        self.clave = clave
        self.fabrica = fabrica or (lambda host: IMAPClient(host, ssl=True, timeout=30))
        self.servidor = servidor
        self._cliente: ClienteImap | None = None
        self._validez: int | None = None

    def _abrir(self) -> ClienteImap:
        if self._cliente is None:
            c = self.fabrica(self.servidor)
            c.login(self.usuario, self.clave)
            carpeta = next((n for f, _, n in c.list_folders() if b"\\All" in f), "INBOX")
            info = c.select_folder(carpeta, readonly=True)
            self._validez = int(info.get(b"UIDVALIDITY", 0))
            self._cliente = c
        return self._cliente

    def uidvalidity(self) -> int:
        self._abrir()
        return self._validez or 0

    def nuevos(self, desde_uid: int | None, desde_fecha: date) -> Iterator[CorreoLeido]:
        c = self._abrir()
        try:
            criterio: list[Any] = ["UID", f"{desde_uid + 1}:*"] if desde_uid else ["SINCE", desde_fecha]
            uids = sorted(u for u in c.search(criterio) if not desde_uid or u > desde_uid)
            for i in range(0, len(uids), LOTE):
                lote = uids[i : i + LOTE]
                for uid, datos in sorted(c.fetch(lote, ["BODY.PEEK[]", "INTERNALDATE"]).items()):
                    crudo = datos.get(b"BODY[]")
                    if isinstance(crudo, bytes):
                        yield a_correo(uid, crudo, datos.get(b"INTERNALDATE"))
        finally:
            self.cerrar()

    def de_linkedin(self, desde_fecha: date) -> Iterator[CorreoLeido]:
        """Los avisos de LinkedIn desde una fecha (para traer a tu red lo que llegó antes de D40)."""
        c = self._abrir()
        try:
            uids = sorted(c.search(["SINCE", desde_fecha, "FROM", "linkedin.com"]))
            for i in range(0, len(uids), LOTE):
                for uid, datos in sorted(
                    c.fetch(uids[i : i + LOTE], ["BODY.PEEK[]", "INTERNALDATE"]).items()
                ):
                    crudo = datos.get(b"BODY[]")
                    if isinstance(crudo, bytes):
                        yield a_correo(uid, crudo, datos.get(b"INTERNALDATE"))
        finally:
            self.cerrar()

    def cerrar(self) -> None:
        if self._cliente is not None:
            try:
                self._cliente.logout()
            finally:
                self._cliente = None
