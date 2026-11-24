from ia.dominio.asociacion import PostulacionConocida
from ia.dominio.clasificacion import Clasificacion, PasoCumplido, PasoDetectado
from ia.dominio.enlaces import enlace_numero, marcar_enlaces
from ia.dominio.pasos import (
    ContextoDePostulacion,
    PasoConocido,
    candidatas,
    decidir,
    empresa_del_ats,
    id_de_aviso,
    numeros_en,
    para_modelo,
)

LANEK = PostulacionConocida(
    "lanek",
    "Lanek",
    "Ingeniero/a de Software Backend & IA",
    "chiletrabajos",
    False,  # rechazada: igual se asocia (J6)
    "https://www.chiletrabajos.cl/trabajo/ingeniero-de-software-backend-ia-3916453",
)
OTRA_CT = PostulacionConocida(
    "otra",
    "Kora",
    "Backend NestJS",
    "chiletrabajos",
    True,
    "https://www.chiletrabajos.cl/trabajo/backend-4000001",
)
TENPO = [
    PostulacionConocida(
        f"t{i}", "Tenpo", cargo, "sitio_empresa", activa, f"https://tenpo.teamtailor.com/jobs/{n}-x"
    )
    for i, (cargo, activa, n) in enumerate(
        [("AI Engineer", False, 8632917), ("Analista de Datos de Negocio", True, 8547709)]
    )
]


def test_id_de_aviso_y_numeros_del_correo():
    assert id_de_aviso(LANEK.url) == "3916453"
    assert id_de_aviso("https://tenpo.teamtailor.com/jobs/8632917-ai-engineer") == "8632917"
    assert id_de_aviso("https://www.getonbrd.com/jobs/backend-kora") is None
    assert numeros_en("Juan. Continua tu Postulacion #3916453 [23/11/2026]", "tel 12345") == {"3916453"}


def test_lanek_se_asocia_por_el_numero_del_aviso_aunque_este_cerrada_y_sin_empresa():
    lista = candidatas(
        empresa=None,
        cargo=None,
        plataforma="chiletrabajos",
        dominio_remitente="chiletrabajos.cl",
        textos=("Juan. Continua tu Postulacion #3916453 [23/11/2026]", "Completa el test de personalidad"),
        conocidas=[LANEK, OTRA_CT],
    )
    assert [c.id for c in lista] == ["lanek"]
    assert lista[0].segura and "3916453" in lista[0].motivo
    d = decidir(lista, [])
    assert d.postulacion_ids == ("lanek",) and d.motivo == "regla segura"


def test_el_numero_de_otra_plataforma_no_cuenta():
    otra = PostulacionConocida("x", "Y", "Z", "linkedin", True, "https://www.linkedin.com/jobs/view/3916453")
    lista = candidatas(
        empresa=None,
        cargo=None,
        plataforma="chiletrabajos",
        dominio_remitente="chiletrabajos.cl",
        textos=("#3916453",),
        conocidas=[otra],
    )
    assert lista == []


def test_hilo_es_regla_segura():
    lista = candidatas(
        empresa=None,
        cargo=None,
        plataforma="otra",
        dominio_remitente="gmail.com",
        textos=("Re: tu proceso",),
        conocidas=[OTRA_CT],
        del_hilo=("otra",),
    )
    assert lista[0].segura and lista[0].motivo == "mismo hilo"


def test_empresa_del_ats_y_varias_candidatas_de_tenpo():
    assert empresa_del_ats("tenpo.teamtailor-mail.com") == "tenpo"
    assert empresa_del_ats("mail.teamtailor-mail.com") is None
    assert empresa_del_ats("gmail.com") is None
    lista = candidatas(
        empresa=None,
        cargo=None,
        plataforma="sitio_empresa",
        dominio_remitente="tenpo.teamtailor-mail.com",
        textos=("Bienvenido a Connect by Tenpo!",),
        conocidas=TENPO,
    )
    assert {c.id for c in lista} == {"t0", "t1"}
    assert all(c.empresa_coincide and not c.segura for c in lista)
    # El modelo elige las dos: se aceptan porque la empresa calza.
    assert decidir(lista, ["t0", "t1"]).postulacion_ids == ("t0", "t1")
    # El modelo dice que es de ninguna: bandeja, con las candidatas para marcarlas.
    d = decidir(lista, [])
    assert d.postulacion_ids == () and set(d.candidatas) == {"t0", "t1"}


def test_la_empresa_en_el_texto_basta_para_ser_candidata():
    lista = candidatas(
        empresa=None,
        cargo=None,
        plataforma="otra",
        dominio_remitente="gmail.com",
        textos=("Hola Juan, te escribo de Kora por el cargo Backend NestJS",),
        conocidas=[OTRA_CT, LANEK],
    )
    assert [c.id for c in lista] == ["otra"]
    assert lista[0].puntaje > 0.85  # el cargo también aparece en el texto


def test_decidir_rechaza_lo_que_no_calza_y_sin_contexto_usa_la_asociacion_de_antes():
    lista = candidatas(
        empresa="Tenpo",
        cargo="AI Engineer",
        plataforma="sitio_empresa",
        dominio_remitente="tenpo.teamtailor-mail.com",
        textos=("x",),
        conocidas=[*TENPO, OTRA_CT],
    )
    assert lista[0].id == "t0"
    d = decidir(lista, ["otra"])
    assert d.postulacion_ids == () and "no calza" in d.motivo
    assert decidir([], None, "t1").postulacion_ids == ("t1",)
    assert decidir([], None).postulacion_ids == ()
    # El modelo no vio la que calza por empresa y cargo: se usa esa.
    assert decidir(lista[:1], [], "otra").postulacion_ids == ("otra",)
    # Una segura y el modelo suma otra de la misma empresa.
    seguras = candidatas(
        empresa="Tenpo",
        cargo=None,
        plataforma="sitio_empresa",
        dominio_remitente=None,
        textos=("https://tenpo.teamtailor.com/jobs/8632917-ai-engineer",),
        conocidas=TENPO,
    )
    assert decidir(seguras, ["t1"]).postulacion_ids == ("t0", "t1")


def test_para_modelo_usa_ids_cortos_y_muestra_lo_pendiente_y_lo_hecho():
    ctx = ContextoDePostulacion(
        "lanek",
        "Lanek",
        "Backend & IA",
        "en_proceso",
        (
            PasoConocido("uuid-1", "Completar el test de personalidad", "pendiente", "2026-11-30"),
            PasoConocido("uuid-2", "Enviar el CV", "hecho", None, "ia", "2026-11-20"),
        ),
        (("2026-11-23", "Te piden completar un test"),),
    )
    [c] = para_modelo([ctx])
    assert c.corto == "p1" and c.pasos_cortos == {"s1": "uuid-1"}
    texto = c.texto("2026-11-24")
    assert "paso pendiente s1: Completar el test de personalidad, plazo 2026-11-30" in texto
    assert "paso hecho (su IA, 2026-11-20): Enviar el CV" in texto
    assert "uuid" not in texto


def test_enlaces_de_confianza_quedan_en_local_y_el_resto_se_tapa():
    texto = (
        "Completa tu test aquí: https://www.chiletrabajos.cl/test?token=SECRETO123. "
        "Síguenos en https://facebook.com/chiletrabajos y otra vez https://www.chiletrabajos.cl/test?token=SECRETO123"
    )
    marcado, enlaces = marcar_enlaces(texto, "chiletrabajos.cl")
    assert "SECRETO123" not in marcado
    assert marcado.count("[enlace 1]") == 2 and "[enlace]" in marcado
    assert enlaces == ["https://www.chiletrabajos.cl/test?token=SECRETO123"]
    assert enlace_numero(enlaces, 1) == enlaces[0]
    assert enlace_numero(enlaces, 2) is None and enlace_numero(enlaces, None) is None
    # Un ATS escribe desde «…teamtailor-mail.com» y enlaza a «…teamtailor.com».
    _, ats = marcar_enlaces("Agenda aquí https://tenpo.teamtailor.com/x", "tenpo.teamtailor-mail.com")
    assert ats == ["https://tenpo.teamtailor.com/x"]


def test_clasificacion_con_paso_vuelve_desde_lo_guardado():
    from dataclasses import asdict

    k = Clasificacion(
        True,
        "chiletrabajos",
        None,
        None,
        "en_proceso",
        "Test",
        0.9,
        ("p1",),
        PasoDetectado("Completar el test", plazo="2026-11-30", enlace=1),
        (PasoCumplido("s1", 0.95),),
    )
    guardado = {**asdict(k), "decision": {"postulacion_ids": ["x"]}}
    assert Clasificacion.desde_dict(guardado) == k
    viejo = {k2: v for k2, v in asdict(k).items() if k2 not in {"postulaciones", "paso", "pasos_cumplidos"}}
    assert Clasificacion.desde_dict(viejo).postulaciones is None
