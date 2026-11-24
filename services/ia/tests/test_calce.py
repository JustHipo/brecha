from ia.dominio.calce import Perfil, Requisito, calcular_calce, normalizar

PERFIL = Perfil({"TypeScript": 2, "Node.js": 1.5, "PostgreSQL": 1, "AWS (ECS)": 0.5}, 2)


def test_normaliza_alias_y_parentesis() -> None:
    assert normalizar("Node") == normalizar("NodeJS") == "node.js"
    assert normalizar("Postgres") == "postgresql"
    assert normalizar("AWS (ECS)") == "aws"
    assert normalizar("Vue.js") == normalizar("Vue 3") == "vue"


def test_sin_requisitos_no_hay_calce() -> None:
    assert calcular_calce(PERFIL, []) is None


def test_todo_cumplido_es_100() -> None:
    c = calcular_calce(PERFIL, [Requisito("TS", True), Requisito("Postgres", False)])
    assert c is not None
    assert c.puntaje == 100
    assert c.brechas == ()
    assert set(c.cumple) == {"TS", "Postgres"}


def test_formula_calculada_a_mano() -> None:
    # Obligatorios: Node.js (2 de 3 años → 2·2/3), Python (falta → 0). Deseables: AWS (1), Docker (falta).
    # Obtenido = 1,333 + 0 + 1 + 0 = 2,333 de 2 + 2 + 1 + 1 = 6 → 38,9 → 39.
    perfil = Perfil({"Node.js": 2, "AWS": 1}, 2)
    c = calcular_calce(
        perfil,
        [
            Requisito("Node.js", True, 3),
            Requisito("Python", True),
            Requisito("AWS", False),
            Requisito("Docker", False),
        ],
    )
    assert c is not None
    assert c.puntaje == 39
    assert c.brechas == ("Python", "Docker", "Node.js (2 de 3 años)")


def test_repetido_cuenta_una_vez_y_gana_obligatorio() -> None:
    c = calcular_calce(Perfil({}, 0), [Requisito("Go", False), Requisito("golang", True)])
    assert c is not None
    assert c.puntaje == 0
    assert c.brechas == ("golang",)


def test_anos_con_decimal_en_la_brecha() -> None:
    c = calcular_calce(Perfil({"Python": 0.5}, 0), [Requisito("Python", True, 2)])
    assert c is not None
    assert c.brechas == ("Python (0,5 de 2 años)",)
    assert c.puntaje == 25
