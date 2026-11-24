"""Arriendos en el servicio con IA (docs/diseno/arriendos.md §7): filtro, WhatsApp, teléfonos y casos de uso.

Los correos de ejemplo están escritos a mano (P8 de Juan: todavía no hay correos reales de arriendo).
"""

import os
from datetime import UTC, datetime

import pytest
from sqlalchemy import text

from ia.aplicacion.casos.arriendos import (
    ExtraerArriendos,
    PreguntarArriendos,
    ProcesarArriendos,
    senales_de,
)
from ia.aplicacion.casos.sincronizar_correo import ingresar
from ia.aplicacion.puertos import (
    CorreoDeArriendo,
    CorreoGuardado,
    ErrorDeModelo,
    NucleoNoDisponible,
    SenalDeArriendo,
    Traza,
    Uso,
)
from ia.dominio.arriendo import (
    AvisoEnAlerta,
    ClasificacionArriendo,
    ClasificacionInvalida,
    Contacto,
    Precio,
    PropuestaDePropiedad,
    de_arriendo,
    solo_https,
)
from ia.dominio.correo import EstadoDeCorreo
from ia.dominio.whatsapp import ChatInvalido, autores, desenmascarar, enmascarar, leer_chat, para_el_modelo
from ia.infraestructura.config import cargar_config
from ia.infraestructura.postgres.correos import RepositorioPostgresDeCorreos
from ia.infraestructura.postgres.motor import crear_motor
from tests.fabrica import correo

AHORA = datetime(2026, 11, 24, 12, tzinfo=UTC)


# ── Filtro ──


def test_un_portal_de_arriendo_pasa_por_dominio() -> None:
    c = correo(remitente="alertas@mail.portalinmobiliario.com", asunto="3 nuevos departamentos en Ñuñoa")
    assert de_arriendo(c) == "canal de arriendo: mail.portalinmobiliario.com"


def test_un_canal_que_agregaste_tambien_pasa() -> None:
    c = correo(remitente="ana@corredoraandes.cl", asunto="Re: depto", texto="Hola, sigue disponible")
    assert de_arriendo(c) is None
    assert de_arriendo(c, frozenset({"corredoraandes.cl"})) == "canal de arriendo: corredoraandes.cl"


def test_palabras_de_arriendo_pasan_pero_no_si_es_de_empleo_o_publicidad() -> None:
    corredor = correo(
        remitente="pedro@gmail.com", asunto="Departamento en arriendo", texto="Los gastos comunes son 80 mil"
    )
    assert de_arriendo(corredor) == "palabra de arriendo: arriendo"
    empleo = correo(
        remitente="rrhh@ficticia.cl",
        asunto="Tu postulación",
        texto="Gracias por tu postulación. Incluye bono de arriendo.",
    )
    assert de_arriendo(empleo) is None
    boletin = correo(remitente="news@banco.cl", asunto="Newsletter: arriendo o compra?", texto="arriendo")
    assert de_arriendo(boletin) is None
    masivo = correo(
        remitente="news@tienda.cl", asunto="Ideas para tu arriendo", texto="arriendo", masivo=True
    )
    assert de_arriendo(masivo) is None
    empleo_normal = correo()
    assert de_arriendo(empleo_normal) is None


class RepoMemoria:
    def __init__(self) -> None:
        self.guardados: list[CorreoGuardado] = []

    def existe(self, message_id: str) -> bool:
        return any(g.message_id == message_id for g in self.guardados)

    def guardar(self, c: CorreoGuardado) -> None:
        self.guardados.append(c)


def test_ingresar_deja_el_correo_de_arriendo_en_su_cola() -> None:
    repo = RepoMemoria()
    c = correo(remitente="avisos@yapo.cl", asunto="Nuevo aviso", texto="Depto 2D Ñuñoa $550.000")
    assert ingresar(repo, c) == ("pendiente", "arriendo")  # type: ignore[arg-type]
    g = repo.guardados[0]
    assert (g.estado, g.plataforma, g.motivo) == (
        EstadoDeCorreo.PENDIENTE,
        "arriendo",
        "canal de arriendo: yapo.cl",
    )
    assert g.fragmento and "Depto 2D" in g.fragmento


# ── WhatsApp ──

CHAT_IPHONE = """[20/11/26, 10:15:03] Juan: Hola, ¿sigue disponible el depto de Irarrázaval?
[20/11/26, 10:20:41] Ana Corredora: Sí! 550 mil + 90 de gastos comunes. Piden renta 3 veces y aval.
Puedes verlo el sábado.
[20/11/26, 10:21:00] Ana Corredora: ‎imagen omitida
[20/11/26, 10:22:10] Ana Corredora: Mi otro número es +56 9 8765 4321
"""

CHAT_ANDROID = """20/11/2026 10:15 p. m. - Los mensajes y las llamadas están cifrados de extremo a extremo.
20/11/2026 10:15 p. m. - Juan: Hola
21/11/2026 9:03 a. m. - +56 9 1111 2222: Hola, ¿cuándo te acomoda?
"""


def test_lee_un_chat_de_iphone_con_mensajes_de_varias_lineas_y_sin_adjuntos() -> None:
    m = leer_chat(CHAT_IPHONE)
    assert [x.autor for x in m] == ["Juan", "Ana Corredora", "Ana Corredora"]
    assert m[1].texto.endswith("Puedes verlo el sábado.")
    assert m[0].fecha == datetime(2026, 11, 20, 10, 15, 3)
    assert autores(m) == ["Juan", "Ana Corredora"]


def test_lee_un_chat_de_android_con_am_pm_y_sin_avisos_del_sistema() -> None:
    m = leer_chat(CHAT_ANDROID)
    assert [(x.autor, x.fecha.hour) for x in m] == [("Juan", 22), ("+56 9 1111 2222", 9)]


def test_un_texto_que_no_es_chat_falla_claro() -> None:
    with pytest.raises(ChatInvalido, match="Exportar chat"):
        leer_chat("hola esto no es un chat")


def test_los_telefonos_no_van_al_modelo_y_vuelven_despues() -> None:
    m = leer_chat(CHAT_IPHONE + CHAT_ANDROID)
    texto, marcas = enmascarar(para_el_modelo(m, "Juan"))
    assert "8765" not in texto and "1111" not in texto
    assert "[tel 1]" in texto and "Tú: Hola" in texto
    assert desenmascarar("Llamar al [tel 1]", marcas) == "Llamar al +56 9 8765 4321"
    # El mismo número escrito distinto es la misma marca.
    t2, m2 = enmascarar("+56987654321 o 9 8765 4321")
    assert t2 == "[tel 1] o [tel 1]" and len(m2) == 1


def test_solo_urls_web() -> None:
    assert solo_https("https://yapo.cl/x") == "https://yapo.cl/x"
    assert solo_https("javascript:alert(1)") is None
    assert solo_https("yapo") is None


# ── Clasificación y señales ──


def k(**cambios: object) -> ClasificacionArriendo:
    base: dict[str, object] = {
        "es_arriendo": True,
        "tipo": "mensaje",
        "estado_sugerido": None,
        "resumen": "El corredor responde",
        "confianza": 0.8,
    }
    return ClasificacionArriendo(**{**base, **cambios})  # type: ignore[arg-type]


def test_la_clasificacion_se_valida() -> None:
    with pytest.raises(ClasificacionInvalida):
        k(tipo="spam")
    with pytest.raises(ClasificacionInvalida):
        k(estado_sugerido="postulado")
    with pytest.raises(ClasificacionInvalida):
        Precio(0, "CLP")


def test_una_alerta_da_una_senal_por_aviso_y_un_mensaje_una_sola() -> None:
    alerta = k(
        tipo="alerta",
        avisos=(
            AvisoEnAlerta("https://yapo.cl/1", "Depto 2D", "Ñuñoa", Precio(550000, "CLP"), 2),
            AvisoEnAlerta("javascript:x", "Casa", None, Precio(18.5, "UF"), None),
        ),
    )
    s = senales_de("<a@x>", "avisos@yapo.cl", "Nuevos", AHORA, alerta)
    assert [x.referencia_externa for x in s] == ["<a@x>#0", "<a@x>#1"]
    assert s[0].resumen == "Aviso de una alerta: Depto 2D · $550.000 · 2D · Ñuñoa"
    assert s[0].url == "https://yapo.cl/1" and s[1].url is None
    assert "UF 18,5" in s[1].resumen
    visita = senales_de("<b@x>", "ana@c.cl", "Visita", AHORA, k(tipo="visita", url="https://yapo.cl/1"))
    assert len(visita) == 1 and visita[0].estado_sugerido == "visita_agendada"
    assert senales_de("<c@x>", "x@y.cl", "x", AHORA, k(es_arriendo=False)) == []


class ModeloFalso:
    def __init__(self, respuestas: list[ClasificacionArriendo | ErrorDeModelo]) -> None:
        self.respuestas = respuestas
        self.propuestas: list[PropuestaDePropiedad] = []
        self.textos: list[str] = []

    def clasificar_arriendo(
        self, remitente: str, asunto: str, fragmento: str
    ) -> tuple[ClasificacionArriendo, Uso]:
        r = self.respuestas.pop(0)
        if isinstance(r, ErrorDeModelo):
            raise r
        return r, Uso("gpt-prueba", 1000, 100, 50)

    def extraer_arriendos(self, texto: str, es_chat: bool) -> tuple[list[PropuestaDePropiedad], Uso]:
        self.textos.append(texto)
        return self.propuestas, Uso("gpt-prueba", 2000, 300, 80)

    def responder_arriendos(
        self, pregunta: str, propiedades: list[dict[str, object]]
    ) -> tuple[str, list[str], Uso]:
        return "La de Ñuñoa", ["p1", "inventada"], Uso("gpt-prueba", 500, 50, 30)


class ColaFalsa:
    def __init__(self, n: int) -> None:
        self.cola = [CorreoDeArriendo(f"<{i}@x>", "a@yapo.cl", "Asunto", "texto", AHORA, 0) for i in range(n)]
        self.marcados: list[str] = []
        self.fallidos: list[str] = []

    def pendientes_de_arriendo(self, limite: int) -> list[CorreoDeArriendo]:
        return self.cola[:limite]

    def marcar_arriendo(
        self, message_id: str, resultado: dict[str, object], modelo: str, confianza: float
    ) -> None:
        self.marcados.append(message_id)

    def marcar_intento_fallido(self, message_id: str, maximo: int) -> None:
        self.fallidos.append(message_id)


class NucleoFalso:
    def __init__(self, caido: bool = False) -> None:
        self.senales: list[SenalDeArriendo] = []
        self.caido = caido

    def registrar_senal_arriendo(self, s: SenalDeArriendo) -> str:
        if self.caido:
            raise NucleoNoDisponible("ConnectError")
        self.senales.append(s)
        return "bandeja" if not s.url else "propiedad"

    def dominios_de_arriendo(self) -> frozenset[str]:
        return frozenset()

    def propiedades_para_preguntar(self) -> list[dict[str, object]]:
        return [{"id": "p1", "titulo": "Depto 2D en Ñuñoa", "estado": "vista"}]


class Trazas:
    def __init__(self) -> None:
        self.trazas: list[Traza] = []

    def registrar(self, t: Traza) -> None:
        self.trazas.append(t)


def procesar(modelo: ModeloFalso, cola: ColaFalsa, nucleo: NucleoFalso) -> ProcesarArriendos:
    return ProcesarArriendos(modelo, cola, nucleo, Trazas(), lambda: AHORA, (0.1, 0.5))


def test_procesa_clasifica_manda_y_marca() -> None:
    cola = ColaFalsa(2)
    nucleo = NucleoFalso()
    r = procesar(
        ModeloFalso([k(tipo="no_disponible", url="https://yapo.cl/1", confianza=0.95), k(es_arriendo=False)]),
        cola,
        nucleo,
    ).ejecutar()
    assert (r.clasificados, r.de_arriendo, r.senales) == (2, 1, 1)
    assert nucleo.senales[0].estado_sugerido == "no_disponible"
    assert cola.marcados == ["<0@x>", "<1@x>"]


def test_si_el_nucleo_no_responde_el_correo_queda_pendiente() -> None:
    cola = ColaFalsa(1)
    r = procesar(ModeloFalso([k()]), cola, NucleoFalso(caido=True)).ejecutar()
    assert r.error and "núcleo no disponible" in r.error
    assert cola.marcados == []


def test_una_cuota_agotada_detiene_y_un_error_suelto_cuenta_intento() -> None:
    cola = ColaFalsa(3)
    m = ModeloFalso([ErrorDeModelo("respuesta_invalida", "x"), ErrorDeModelo("cuota", "sin saldo"), k()])
    r = procesar(m, cola, NucleoFalso()).ejecutar()
    assert cola.fallidos == ["<0@x>"]
    assert r.error == "cuota: sin saldo" and r.clasificados == 0


# ── Importar y preguntar ──


def propuesta(**cambios: object) -> PropuestaDePropiedad:
    base: dict[str, object] = {
        "titulo": None,
        "tipo": "departamento",
        "direccion": "Irarrázaval 3000",
        "comuna": "Ñuñoa",
        "precio": Precio(550000, "CLP"),
        "gastos_comunes": 90000.0,
        "dormitorios": 2,
        "banos": 1,
        "m2": None,
        "estacionamientos": None,
        "mascotas": None,
        "amoblado": None,
        "url": None,
        "renta_veces": 3.0,
        "aval": True,
        "meses_garantia": None,
        "estado_sugerido": "contactada",
        "contacto": Contacto("Ana Corredora", "[tel 1]", None, "corredor"),
        "nota": "Llamar al [tel 1] para la visita",
        "mensajes": (1, 2, 99),
    }
    return PropuestaDePropiedad(**{**base, **cambios})  # type: ignore[arg-type]


def test_extraer_de_un_chat_no_manda_telefonos_y_los_devuelve_en_la_propuesta() -> None:
    modelo = ModeloFalso([])
    modelo.propuestas = [propuesta()]
    r = ExtraerArriendos(modelo, Trazas(), lambda: AHORA, (0.1, 0.5)).desde_chat(CHAT_IPHONE, "Juan")
    assert "8765" not in modelo.textos[0] and "Tú: Hola" in modelo.textos[0]
    p = r.propuestas[0]
    assert p.contacto and p.contacto.telefono == "+56 9 8765 4321"
    assert p.nota == "Llamar al +56 9 8765 4321 para la visita"
    assert p.mensajes == (1, 2)  # el 99 no existe en el chat
    assert r.autores == ["Juan", "Ana Corredora"] and r.costo_usd > 0


def test_extraer_de_un_texto_pegado() -> None:
    modelo = ModeloFalso([])
    modelo.propuestas = [propuesta(contacto=None, nota=None, url="https://yapo.cl/1", mensajes=())]
    r = ExtraerArriendos(modelo, Trazas(), lambda: AHORA, (0.1, 0.5)).desde_texto(
        "Depto 2D, fono 9 1234 5678"
    )
    assert "5678" not in modelo.textos[0]
    assert r.propuestas[0].url == "https://yapo.cl/1" and r.mensajes == []


def test_preguntar_solo_acepta_citas_que_existen() -> None:
    r = PreguntarArriendos(ModeloFalso([]), NucleoFalso(), Trazas(), lambda: AHORA, (0.1, 0.5)).ejecutar(
        "¿Cuál me conviene?"
    )
    assert r.texto == "La de Ñuñoa"
    assert [c["id"] for c in r.citados] == ["p1"] and r.descartados == 1


# ── Repositorio: la cola de empleo no toma los correos de arriendo ──


@pytest.fixture
def repo() -> RepositorioPostgresDeCorreos:
    url = os.environ.get("IA_DATABASE_URL_PRUEBAS") or cargar_config().ia_database_url.replace(
        "/brecha", "/brecha_pruebas"
    )
    motor = crear_motor(url)
    with motor.begin() as c:
        c.execute(text("TRUNCATE ia.correo, ia.estado_vigia, ia.clasificacion, ia.traza"))
    return RepositorioPostgresDeCorreos(motor)


def test_las_colas_de_empleo_y_arriendo_van_separadas(repo: RepositorioPostgresDeCorreos) -> None:
    def g(mid: str, plataforma: str | None) -> CorreoGuardado:
        return CorreoGuardado(
            mid, 1, "a@b.test", AHORA, EstadoDeCorreo.PENDIENTE, plataforma, "m", "asunto", "f"
        )

    repo.guardar(g("<e@x>", "linkedin"))
    repo.guardar(g("<s@x>", None))
    repo.guardar(g("<a@x>", "arriendo"))
    assert {c.message_id for c in repo.pendientes(10)} == {"<e@x>", "<s@x>"}
    assert [c.message_id for c in repo.pendientes_de_arriendo(10)] == ["<a@x>"]
    repo.marcar_arriendo("<a@x>", {"es_arriendo": True}, "gpt-prueba", 0.8)
    assert repo.pendientes_de_arriendo(10) == []
    assert [c.message_id for c in repo.por_enviar(10)] == []  # ya se mandó: la cola de envío no lo toma
