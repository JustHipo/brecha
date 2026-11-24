from datetime import UTC, datetime

from ia.aplicacion.casos.avisos import (
    AnalizarAvisos,
    BuscarAvisos,
    ImportarAvisos,
    IndexarAvisos,
    Preguntar,
    RecalcularCalces,
    VincularConPostulaciones,
)
from ia.aplicacion.puertos import ErrorDeModelo
from ia.dominio.asociacion import PostulacionConocida
from ia.dominio.aviso import Aviso
from ia.dominio.calce import Perfil
from ia.dominio.respuesta import NO_ENCONTRE
from tests.dobles_avisos import AvisosEnMemoria, FuenteFalsa, ModeloFalso, NucleoFalso, PerfilFijo, Trazas

AHORA = datetime(2026, 11, 24, tzinfo=UTC)
PRECIOS = (0.10, 0.50)
PERFIL = Perfil({"NestJS": 2, "PostgreSQL": 2}, 2)


def aviso(n: int, texto: str = "NestJS y PostgreSQL", modalidad: str = "remoto") -> Aviso:
    return Aviso(
        f"https://ejemplo.test/a/{n}", f"Cargo {n}", "Ficticia", "otra", modalidad, "importado", texto
    )


def test_importar_dos_veces_no_duplica_y_reporta_invalidos() -> None:
    repo = AvisosEnMemoria()

    def roto() -> Aviso:
        raise KeyError("url")

    crudos = [lambda: aviso(1), lambda: aviso(2), roto]
    r1 = ImportarAvisos(repo).ejecutar(crudos)
    r2 = ImportarAvisos(repo).ejecutar(crudos)
    assert (r1.nuevos, r1.actualizados, len(r1.invalidos)) == (2, 0, 1)
    assert (r2.nuevos, r2.actualizados) == (0, 2)
    assert len(repo.d) == 2


def test_buscar_guarda_lo_nuevo_y_el_error_de_la_fuente_se_ve() -> None:
    repo = AvisosEnMemoria()
    r = BuscarAvisos(FuenteFalsa([aviso(1), aviso(2)]), repo).ejecutar(["nestjs", "python"])
    assert (r.encontrados, r.nuevos, r.error) == (4, 2, None)
    caida = BuscarAvisos(FuenteFalsa([], falla=True), repo).ejecutar(["nestjs"])
    assert caida.error is not None and "sin red" in caida.error


def test_analizar_calcula_el_calce_con_el_perfil_y_traza_el_costo() -> None:
    repo, trazas = AvisosEnMemoria(), Trazas()
    id1, _ = repo.guardar(aviso(1, "NestJS, PostgreSQL y Python"))
    r = AnalizarAvisos(ModeloFalso(), repo, PerfilFijo(PERFIL), trazas, lambda: AHORA, PRECIOS).ejecutar()
    assert r.analizados == 1 and not r.sin_perfil
    g = repo.d[id1]
    assert g.calce is not None and g.calce.puntaje == 67  # 2 de 3 obligatorios
    assert g.calce.brechas == ("Python",)
    assert trazas.t[0].caso == "analizar_aviso" and trazas.t[0].costo_usd > 0


def test_sin_perfil_se_analiza_pero_no_hay_calce_y_se_recalcula_despues() -> None:
    repo, perfiles = AvisosEnMemoria(), PerfilFijo(None)
    id1, _ = repo.guardar(aviso(1))
    r = AnalizarAvisos(ModeloFalso(), repo, perfiles, Trazas(), lambda: AHORA, PRECIOS).ejecutar()
    assert r.sin_perfil and repo.d[id1].calce is None
    perfiles.guardar(PERFIL)
    assert RecalcularCalces(repo, perfiles).ejecutar() == 1
    calce = repo.d[id1].calce
    assert calce is not None and calce.puntaje == 100


def test_cuota_agotada_detiene_y_deja_el_aviso_para_despues() -> None:
    repo = AvisosEnMemoria()
    repo.guardar(aviso(1))
    repo.guardar(aviso(2))
    modelo = ModeloFalso(error=ErrorDeModelo("cuota", "sin saldo"))
    r = AnalizarAvisos(modelo, repo, PerfilFijo(PERFIL), Trazas(), lambda: AHORA, PRECIOS).ejecutar()
    assert r.error is not None and r.error.startswith("cuota")
    assert modelo.llamadas == 1
    assert len(repo.sin_analizar(10)) == 2


def test_vincular_manda_el_calce_una_sola_vez() -> None:
    repo = AvisosEnMemoria()
    id1, _ = repo.guardar(aviso(1))
    repo.guardar(aviso(2))
    AnalizarAvisos(ModeloFalso(), repo, PerfilFijo(PERFIL), Trazas(), lambda: AHORA, PRECIOS).ejecutar()
    nucleo = NucleoFalso(
        [
            PostulacionConocida(
                "p1", "Ficticia", "Cargo 1", "otra", True, "http://ejemplo.test/a/1/?utm_source=x"
            )
        ]
    )
    r = VincularConPostulaciones(repo, nucleo).ejecutar()
    assert (r.vinculados, r.calces_enviados) == (1, 1)
    assert nucleo.enviados == [("p1", id1, 1.0)]
    assert repo.d[id1].postulacion_id == "p1"
    otra = VincularConPostulaciones(repo, nucleo).ejecutar()
    assert otra.calces_enviados == 0 and len(nucleo.enviados) == 1


def test_indexar_de_a_lotes_hasta_terminar() -> None:
    repo, trazas = AvisosEnMemoria(), Trazas()
    for n in range(5):
        repo.guardar(aviso(n))
    r = IndexarAvisos(ModeloFalso(), repo, trazas, lambda: AHORA, 0.02, lote=2).ejecutar()
    assert r.indexados == 5 and len(repo.vectores) == 5
    assert len(trazas.t) == 3


def _preparado() -> tuple[AvisosEnMemoria, str, str]:
    repo = AvisosEnMemoria()
    a, _ = repo.guardar(aviso(1, "NestJS remoto"))
    b, _ = repo.guardar(aviso(2, "Python presencial", "presencial"))
    IndexarAvisos(ModeloFalso(), repo, Trazas(), lambda: AHORA, 0.02).ejecutar()
    return repo, a, b


def test_preguntar_cita_solo_avisos_recuperados() -> None:
    repo, a, _ = _preparado()
    m = ModeloFalso()
    r = Preguntar(m, m, repo, Trazas(), lambda: AHORA, PRECIOS, 0.02).ejecutar("¿Qué avisos piden NestJS?")
    assert r.respuesta.citados == (a,)
    assert [g.id for g in r.avisos] == [a]
    assert r.costo_usd > 0


def test_preguntar_descarta_citas_inventadas_y_dice_no_encontre() -> None:
    repo, _, _ = _preparado()
    m = ModeloFalso(cita=["id-inventado"])
    r = Preguntar(m, m, repo, Trazas(), lambda: AHORA, PRECIOS, 0.02).ejecutar("¿Qué piden?")
    assert r.respuesta.texto == NO_ENCONTRE
    assert r.respuesta.descartados == ("id-inventado",)
    assert r.avisos == []


def test_preguntar_sin_avisos_dice_no_encontre_sin_llamar_al_modelo() -> None:
    m = ModeloFalso()
    r = Preguntar(m, m, AvisosEnMemoria(), Trazas(), lambda: AHORA, PRECIOS, 0.02).ejecutar("¿Hay algo?")
    assert r.respuesta.texto == NO_ENCONTRE


def test_preguntar_con_filtro_de_modalidad() -> None:
    repo, _, b = _preparado()
    m = ModeloFalso()
    r = Preguntar(m, m, repo, Trazas(), lambda: AHORA, PRECIOS, 0.02).ejecutar("¿Hay algo presencial?")
    assert r.respuesta.citados == (b,)
