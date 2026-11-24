from datetime import date

from ia.dominio.perfil import Experiencia, fechas_de, perfil_desde_cv

HOY = date(2026, 11, 24)


def test_fechas_del_cv() -> None:
    assert fechas_de("ago. 2025 – actualidad", HOY) == (date(2025, 8, 1), HOY)
    assert fechas_de("dic. 2024 – mar. 2025", HOY) == (date(2024, 12, 1), date(2025, 3, 1))
    assert fechas_de("ene. – mar. 2024", HOY) == (date(2024, 1, 1), date(2024, 3, 1))
    assert fechas_de("Aug 2025 – present", HOY) == (date(2025, 8, 1), HOY)
    assert fechas_de("algo raro", HOY) is None


def test_anos_por_herramienta_con_periodos_que_se_solapan() -> None:
    exp = [
        Experiencia(date(2024, 11, 24), HOY, "Backend con Node.js y PostgreSQL"),
        Experiencia(date(2025, 11, 24), HOY, "API en NestJS (TypeScript)"),
    ]
    p = perfil_desde_cv(
        ["Node.js", "NestJS", "TypeScript", "Rust"], "Español nativo, inglés avanzado C1", exp
    )
    assert p.herramientas["Node.js"] == 2.0
    assert p.herramientas["NestJS"] == 1.0
    assert p.herramientas["TypeScript"] == 2.0  # Node.js también cuenta para TypeScript
    assert p.herramientas["Rust"] == 0.5  # solo en Habilidades
    assert p.herramientas["Inglés"] == 10
    assert p.anos_totales == 2.0
