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
    assert asociar(None, "Backend", "otra", CONOCIDAS).postulacion_id is None
    assert asociar("Otra Empresa", "Backend", "otra", CONOCIDAS).postulacion_id is None


def test_empresa_desde_el_dominio_del_remitente() -> None:
    from ia.dominio.asociacion import empresa_del_dominio

    assert empresa_del_dominio("orbital-pruebas.example") == "orbital pruebas"
    assert empresa_del_dominio("seleccion.ficticia.com.co") == "ficticia"
    assert empresa_del_dominio("ficticia.cl") == "ficticia"
    assert empresa_del_dominio("jobs.linkedin.com") is None
    assert empresa_del_dominio("gmail.com") is None
    assert empresa_del_dominio(None) is None


def test_sin_empresa_asocia_por_el_dominio_o_solo_por_cargo() -> None:
    from ia.dominio.asociacion import PostulacionConocida, asociar

    conocidas = [
        PostulacionConocida("a", "Orbital Pruebas SpA", "Desarrollador Backend de Prueba", "otra", True),
        PostulacionConocida("b", "Otra Empresa", "Analista de Datos", "otra", True),
        PostulacionConocida("c", "Tercera", "Desarrollador Backend de Prueba", "otra", False),
    ]
    por_dominio = asociar(None, "Backend", "otra", conocidas, "orbital-pruebas.example")
    assert por_dominio.postulacion_id == "a" and "dominio" in por_dominio.motivo
    por_cargo = asociar(None, "Desarrollador Backend de Prueba", "otra", conocidas, "gmail.com")
    assert por_cargo.postulacion_id == "a" and "solo por cargo" in por_cargo.motivo  # «c» no está activa
    assert asociar(None, "Analista", "otra", conocidas, None).postulacion_id is None


def test_sin_empresa_y_cargo_repetido_va_a_la_bandeja() -> None:
    from ia.dominio.asociacion import PostulacionConocida, asociar

    conocidas = [
        PostulacionConocida("a", "Uno", "Desarrollador Backend", "otra", True),
        PostulacionConocida("b", "Dos", "Desarrollador Backend", "otra", True),
    ]
    r = asociar(None, "Desarrollador Backend", "otra", conocidas)
    assert r.postulacion_id is None and "2 postulaciones" in r.motivo


def test_empate_entre_una_cerrada_y_una_activa_gana_la_activa() -> None:
    from ia.dominio.asociacion import PostulacionConocida, asociar

    conocidas = [
        PostulacionConocida("vieja", "Ficticia", "Backend", "otra", False),
        PostulacionConocida("nueva", "Ficticia", "Backend", "otra", True),
    ]
    r = asociar("Ficticia", "Backend", "otra", conocidas)
    assert r.postulacion_id == "nueva" and "activa" in r.motivo
