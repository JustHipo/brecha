from datetime import UTC, date, datetime
from email.message import EmailMessage
from typing import Any

from ia.infraestructura.imap import LectorImap, html_a_texto


def mensaje(uid: int, asunto: str, html: bool = False) -> bytes:
    m = EmailMessage()
    m["From"] = "Equipo <no-reply@trabajando.com>"
    m["Subject"] = asunto
    m["Message-ID"] = f"<{uid}@trabajando.test>"
    m["Date"] = "Thu, 20 Nov 2026 10:00:00 -0300"
    if html:
        m.set_content("texto plano alternativo")
        m.add_alternative(
            "<html><body><p>No continuaremos</p><script>x()</script></body></html>", subtype="html"
        )
    else:
        m.set_content("Gracias por postular")
    return m.as_bytes()


class ClienteFalso:
    """Doble de IMAPClient: guarda cada llamada para comprobar que nada escribe en el buzón."""

    PERMITIDAS = frozenset({"login", "list_folders", "select_folder", "search", "fetch", "logout"})

    def __init__(self, mensajes: dict[int, bytes]) -> None:
        self.mensajes = mensajes
        self.llamadas: list[tuple[str, Any]] = []

    def __getattr__(self, nombre: str) -> Any:
        raise AssertionError(f"llamada no permitida al buzón: {nombre}")

    def login(self, usuario: str, clave: str) -> None:
        self.llamadas.append(("login", usuario))

    def list_folders(self) -> list[tuple[tuple[bytes, ...], bytes, str]]:
        self.llamadas.append(("list_folders", None))
        return [
            ((b"\\HasNoChildren",), b"/", "INBOX"),
            ((b"\\All", b"\\HasNoChildren"), b"/", "[Gmail]/Todos"),
        ]

    def select_folder(self, carpeta: str, readonly: bool = False) -> dict[bytes, Any]:
        self.llamadas.append(("select_folder", (carpeta, readonly)))
        return {b"UIDVALIDITY": 42}

    def search(self, criterio: list[Any]) -> list[int]:
        self.llamadas.append(("search", criterio))
        if criterio[0] == "UID":
            return sorted(
                set(self.mensajes) | {max(self.mensajes)}
            )  # Gmail devuelve el último aunque sea viejo
        return sorted(self.mensajes)

    def fetch(self, uids: list[int], datos: list[str]) -> dict[int, dict[bytes, Any]]:
        self.llamadas.append(("fetch", datos))
        return {
            u: {b"BODY[]": self.mensajes[u], b"INTERNALDATE": datetime(2026, 11, 20, tzinfo=UTC)}
            for u in uids
        }

    def logout(self) -> None:
        self.llamadas.append(("logout", None))


def test_lee_en_solo_lectura_desde_la_carpeta_todos_y_no_marca_nada() -> None:
    falso = ClienteFalso({5: mensaje(5, "Tu postulación"), 6: mensaje(6, "Resultado", html=True)})
    lector = LectorImap("persona@ejemplo.test", "clave", fabrica=lambda _: falso)
    assert lector.uidvalidity() == 42
    correos = list(lector.nuevos(None, date(2026, 9, 25)))
    assert ("select_folder", ("[Gmail]/Todos", True)) in falso.llamadas
    assert ("fetch", ["BODY.PEEK[]", "INTERNALDATE"]) in falso.llamadas
    assert ("search", ["SINCE", date(2026, 9, 25)]) in falso.llamadas
    assert {n for n, _ in falso.llamadas} <= ClienteFalso.PERMITIDAS
    assert [c.message_id for c in correos] == ["<5@trabajando.test>", "<6@trabajando.test>"]
    assert correos[0].remitente == "no-reply@trabajando.com" and correos[0].recibido_en.tzinfo is not None
    assert falso.llamadas[-1][0] == "logout"


def test_desde_un_uid_descarta_el_ultimo_repetido_que_devuelve_gmail() -> None:
    falso = ClienteFalso({5: mensaje(5, "Viejo")})
    lector = LectorImap("p@e.test", "c", fabrica=lambda _: falso)
    assert list(lector.nuevos(5, date(2026, 9, 25))) == []
    assert ("search", ["UID", "6:*"]) in falso.llamadas


def test_html_a_texto_sin_scripts() -> None:
    assert html_a_texto("<p>Hola</p><script>malo()</script><p>chao</p>").split() == ["Hola", "chao"]


def test_si_el_texto_plano_viene_vacio_usa_el_html() -> None:
    from ia.infraestructura.imap import a_correo

    m = EmailMessage()
    m["From"] = "notificaciones@chiletrabajos.cl"
    m["Subject"] = "(Backend, 2026-10-19)"
    m["List-Unsubscribe"] = "<mailto:baja@chiletrabajos.cl>"
    m.set_content(" ")
    m.add_alternative("<p>Tu Postulación a Backend fue enviada correctamente</p>", subtype="html")
    c = a_correo(1, m.as_bytes(), None)
    assert "fue enviada correctamente" in c.texto
    assert c.masivo is True


def test_cabeceras_del_hilo_y_enlaces_del_html() -> None:
    from ia.infraestructura.imap import a_correo, html_a_texto

    crudo = (
        b"From: Chiletrabajos <info@chiletrabajos.cl>\r\n"
        b"Subject: Continua tu Postulacion #3916453\r\n"
        b"Message-ID: <nuevo@ct>\r\n"
        b"In-Reply-To: <previo@ct>\r\n"
        b"References: <raiz@ct> <previo@ct>\r\n"
        b"Content-Type: text/plain; charset=utf-8\r\n\r\n"
        b"Completa el test de personalidad para seguir en el proceso.\r\n"
    )
    c = a_correo(7, crudo, None)
    assert c.en_respuesta_a == "<previo@ct>" and c.referencias == ("<raiz@ct>", "<previo@ct>")
    texto = html_a_texto('<p>Haz <a href="https://www.chiletrabajos.cl/test?t=1">clic aquí</a></p>')
    assert "clic aquí (https://www.chiletrabajos.cl/test?t=1)" in texto
    assert "mailto" not in html_a_texto('<a href="mailto:a@b.cl">correo</a>')
