from ia.dominio.fragmento import MAXIMO, fragmento


def test_saca_historial_firma_y_pie() -> None:
    texto = (
        "Hola Juan,\n\nGracias por postular. Lamentamos informarte que no continuaremos.\n\n"
        "Saludos,\nEquipo de selección\n\nPara darte de baja haz clic aquí\n\n"
        "El lun, 10 nov 2026 a las 10:00, Juan <juan@ejemplo.test> escribió:\n> mi postulación anterior"
    )
    f = fragmento(texto)
    assert "no continuaremos" in f
    assert "escribió" not in f and "> mi postulación" not in f and "darte de baja" not in f
    assert "Equipo de selección" not in f


def test_respeta_el_maximo_y_compacta_espacios() -> None:
    assert len(fragmento("palabra   " * 2000)) == MAXIMO
    assert fragmento("a    b\n\n\n\n\nc") == "a b\n\nc"
