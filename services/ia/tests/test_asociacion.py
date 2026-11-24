from ia.dominio.asociacion import PostulacionConocida, asociar, normalizar_empresa

CONOCIDAS = [
    PostulacionConocida("t1", "Ficticia Pagos", "AI Engineer", "sitio_empresa", False),
    PostulacionConocida("t2", "Ficticia Pagos", "Analista de Datos de Negocio", "sitio_empresa", True),
    PostulacionConocida("t3", "Ficticia Pagos", "Senior Fullstack Software Engineer", "sitio_empresa", False),
    PostulacionConocida("t4", "Ficticia Pagos", "Senior Backend Software Engineer", "sitio_empresa", False),
    PostulacionConocida("m1", "Gemela", "Ingeniero de Software", "trabajando", True),
    PostulacionConocida("m2", "Gemela", "Ingeniero de software", "sitio_empresa", False),
    PostulacionConocida(
        "n1", "Nube (grupo Suma+)", "AI Engineer - Revenue (Self Service)", "sitio_empresa", True
    ),
    PostulacionConocida("l1", "Lago", "Ingeniero/a de Software Backend & IA", "chiletrabajos", True),
]


def test_misma_empresa_varios_cargos_decide_el_cargo() -> None:
    assert asociar("Ficticia Pagos", "AI Engineer", "sitio_empresa", CONOCIDAS).postulacion_id == "t1"
    assert (
        asociar("Ficticia Pagos SpA", "Senior Backend Engineer", "sitio_empresa", CONOCIDAS).postulacion_id
        == "t4"
    )


def test_sin_cargo_y_varias_candidatas_va_a_la_bandeja() -> None:
    r = asociar("Ficticia Pagos", None, "sitio_empresa", CONOCIDAS)
    assert r.postulacion_id is None and "ambigua" in r.motivo


def test_mismo_cargo_desempata_la_plataforma() -> None:
    assert asociar("Gemela", "Ingeniero de Software", "sitio_empresa", CONOCIDAS).postulacion_id == "m2"
    assert asociar("Gemela", "Ingeniero de Software", "trabajando", CONOCIDAS).postulacion_id == "m1"


def test_normaliza_sufijos_parentesis_y_genero() -> None:
    assert normalizar_empresa("Nube (grupo Suma+)") == "nube"
    assert normalizar_empresa("Ficticia Pagos S.A.") == "ficticia pagos"
    assert asociar("Nube", "AI Engineer", "sitio_empresa", CONOCIDAS).postulacion_id == "n1"
    assert (
        asociar("Lago", "Ingeniero de Software Backend & IA", "chiletrabajos", CONOCIDAS).postulacion_id
        == "l1"
    )


def test_sin_empresa_o_empresa_desconocida_va_a_la_bandeja() -> None:
    assert asociar(None, "Backend", "otra", CONOCIDAS).motivo == "sin empresa detectada"
    assert asociar("Otra Empresa", "Backend", "otra", CONOCIDAS).postulacion_id is None
