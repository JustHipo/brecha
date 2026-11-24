"""Los correos de prueba de `datos/ejemplo/correos` (inventados) pasan el filtro y se leen bien."""

from pathlib import Path

from ia.dominio.filtro import filtrar
from ia.infraestructura.imap import a_correo

CARPETA = Path(__file__).resolve().parents[3] / "datos" / "ejemplo" / "correos"


def test_los_cuatro_correos_de_prueba_pasan_el_filtro() -> None:
    archivos = sorted(CARPETA.glob("*.eml"))
    assert [a.name for a in archivos] == [
        "1-postulado.eml",
        "2-prueba-tecnica.eml",
        "3-entrevista.eml",
        "4-rechazo.eml",
    ]
    for a in archivos:
        c = a_correo(0, a.read_bytes(), None)
        assert c.remitente == "seleccion@orbital-pruebas.example"
        assert c.message_id.startswith("<prueba-brecha-")
        assert "Desarrollador Backend de Prueba" in c.asunto
        assert filtrar(c).pasa, a.name
