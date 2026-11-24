"""Línea de comandos `ia`: credenciales (F2-03), avisos y perfil (F2-09 y F2-10), preguntar (F2-12)."""

import argparse
import getpass
import json
import sys
from datetime import date
from pathlib import Path
from typing import TYPE_CHECKING

from ia.aplicacion.puertos import Credenciales, TipoDeCredencial, estado_de
from ia.infraestructura.llavero import Llavero

if TYPE_CHECKING:
    from ia.entradas.servicios import Servicios


def credenciales(args: argparse.Namespace, llavero: Credenciales) -> int:
    match args.accion:
        case "correo":
            usuario = input("Correo de Gmail: ").strip()
            clave = getpass.getpass("Contraseña de aplicación (no se muestra): ").replace(" ", "")
            if "@" not in usuario or len(clave) < 16:
                print("Revisa el correo y la contraseña de aplicación (16 letras).", file=sys.stderr)
                return 1
            llavero.guardar(TipoDeCredencial.CORREO_USUARIO, usuario)
            llavero.guardar(TipoDeCredencial.CORREO_CLAVE, clave)
            print("Correo guardado en el llavero.")
        case "openai":
            llave = getpass.getpass("Llave de OpenAI (no se muestra): ").strip()
            if not llave.startswith("sk-"):
                print("Esa no parece una llave de OpenAI (empieza con sk-).", file=sys.stderr)
                return 1
            llavero.guardar(TipoDeCredencial.OPENAI, llave)
            print("Llave de OpenAI guardada en el llavero.")
        case "estado":
            e = estado_de(llavero)
            print(f"Correo: {'configurado' if e.correo else 'falta'}")
            print(f"OpenAI: {'configurado' if e.openai else 'falta'}")
        case "borrar":
            for t in TipoDeCredencial:
                llavero.borrar(t)
            print("Credenciales de Brecha borradas del llavero.")
    return 0


def _servicios(llavero: Credenciales) -> "Servicios":
    from ia.entradas.servicios import Servicios
    from ia.infraestructura.config import cargar_config

    return Servicios(cargar_config(), llavero)


def _imprimir(datos: object) -> None:
    print(json.dumps(datos, ensure_ascii=False, indent=2, default=str))


def avisos(args: argparse.Namespace, llavero: Credenciales) -> int:
    from ia.aplicacion.casos.avisos import ImportarAvisos
    from ia.infraestructura.archivos import avisos_del_archivo

    s = _servicios(llavero)
    match args.accion:
        case "importar":
            if not args.valor:
                print("Falta el archivo: uv run ia avisos importar ruta.json", file=sys.stderr)
                return 1
            r = ImportarAvisos(s.avisos).ejecutar(avisos_del_archivo(Path(args.valor[0])))
            print(
                f"Avisos: {r.nuevos} nuevos, {r.actualizados} actualizados, {len(r.invalidos)} con errores."
            )
            for e in r.invalidos[:10]:
                print(f"  {e}", file=sys.stderr)
        case "buscar":
            consultas = args.valor or s.cfg.getonboard_busquedas
            if not consultas:
                print("Falta qué buscar: uv run ia avisos buscar nestjs", file=sys.stderr)
                return 1
            _imprimir(s.buscar_getonboard(consultas))
        case "procesar":
            if not s.hay_modelo():
                print(
                    "Falta la llave de OpenAI: solo se ligan los avisos con tus postulaciones.",
                    file=sys.stderr,
                )
            while True:  # de a 50 avisos por vuelta, hasta que no quede ninguno sin analizar
                vuelta = s.procesar_avisos()
                _imprimir(vuelta)
                if vuelta.get("ocupado"):
                    print(
                        "El vigía está procesando avisos ahora: vuelve a intentarlo en un rato.",
                        file=sys.stderr,
                    )
                    break
                analisis = vuelta.get("analisis") or {}
                if not analisis.get("analizados") or analisis.get("error"):
                    break
        case "estado":
            _imprimir(s.avisos.contar())
    return 0


def perfil(args: argparse.Namespace, llavero: Credenciales) -> int:
    from ia.infraestructura.archivos import perfil_del_archivo

    s = _servicios(llavero)
    if args.accion == "cargar":
        if not args.archivo:
            print("Falta el archivo: uv run ia perfil cargar ruta.json", file=sys.stderr)
            return 1
        p = perfil_del_archivo(Path(args.archivo), date.today())
        s.perfiles.guardar(p)
        n = s.recalcular_calces()
        print(f"Perfil guardado: {len(p.herramientas)} herramientas y {p.anos_totales} años de experiencia.")
        print(f"Calce recalculado en {n} avisos.")
        return 0
    actual = s.perfiles.perfil()
    if actual is None:
        print("Todavía no hay perfil: uv run ia perfil cargar ruta.json")
        return 0
    _imprimir({"anosTotales": actual.anos_totales, "herramientas": actual.herramientas})
    return 0


def preguntar(args: argparse.Namespace, llavero: Credenciales) -> int:
    s = _servicios(llavero)
    if not s.hay_modelo():
        print("Falta la llave de OpenAI (uv run ia credenciales openai).", file=sys.stderr)
        return 1
    r = s.preguntar(" ".join(args.pregunta))
    if r.error:
        print(f"La IA no está disponible: {r.error}", file=sys.stderr)
        return 1
    print(r.respuesta.texto)
    for g in r.avisos:
        print(f"  · {g.aviso.titulo} · {g.aviso.empresa}: {g.aviso.url}")
    print(f"(USD {r.costo_usd:.5f})")
    return 0


def probar_correo(args: argparse.Namespace, llavero: Credenciales) -> int:
    """Pasa correos de prueba (.eml) por el mismo camino del vigía, sin tocar el punto de lectura del IMAP."""
    from sqlalchemy import select

    from ia.aplicacion.casos.clasificar_pendientes import ClasificarPendientes
    from ia.aplicacion.casos.registrar_senales import RegistrarSenales
    from ia.aplicacion.casos.sincronizar_correo import ingresar
    from ia.entradas.servicios import ahora
    from ia.infraestructura.imap import a_correo
    from ia.infraestructura.postgres.correos import RepositorioPostgresDeCorreos
    from ia.infraestructura.postgres.tablas import clasificacion, correo

    s = _servicios(llavero)
    repo = RepositorioPostgresDeCorreos(s.motor)
    archivos = sorted(
        p for a in args.archivos for p in (Path(a).glob("*.eml") if Path(a).is_dir() else [Path(a)])
    )
    ids: list[str] = []
    for ruta in archivos:
        c = a_correo(0, ruta.read_bytes(), None)
        destino, plataforma = ingresar(repo, c)
        ids.append(c.message_id)
        print(f"{ruta.name}: {destino} ({plataforma or 'sin plataforma'})")
    if not s.hay_modelo():
        print("Falta la llave de OpenAI: los correos quedan en cola.", file=sys.stderr)
        return 1
    k = ClasificarPendientes(s.modelo(), repo, s.trazas, ahora, s.precios).ejecutar()
    print(
        f"Clasificados: {k.clasificados} (USD {k.costo_usd:.5f}){' · error: ' + k.error if k.error else ''}"
    )
    g = RegistrarSenales(s.nucleo_http(), repo).ejecutar()
    print(f"Señales: {g.a_postulacion} a postulaciones ({g.aplicadas} aplicadas solas)")
    print(f"Señales a la bandeja: {g.a_bandeja}")
    if g.error:
        print(f"Error al registrar: {g.error}", file=sys.stderr)
    with s.motor.connect() as cx:
        filas = cx.execute(
            select(
                correo.c.message_id,
                correo.c.asunto,
                correo.c.estado,
                clasificacion.c.resultado,
                clasificacion.c.postulacion_id,
            )
            .select_from(correo.outerjoin(clasificacion))
            .where(correo.c.message_id.in_(ids))
        ).all()
    for f in sorted(filas, key=lambda f: ids.index(f.message_id)):
        res = f.resultado or {}
        print(
            f"  · {(f.asunto or '')[:60]}: {f.estado}, sugiere {res.get('estado_sugerido') or 'nada'}"
            f" (confianza {res.get('confianza', '-')}), postulación {f.postulacion_id or 'ninguna (bandeja)'}"
        )
    return 0 if not g.error and not k.error else 1


def main(argv: list[str] | None = None, llavero: Credenciales | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ia", description="Herramientas del servicio con IA de Brecha")
    sub = parser.add_subparsers(dest="comando", required=True)
    cred = sub.add_parser("credenciales", help="Guardar, revisar o borrar credenciales en el llavero")
    cred.add_argument("accion", choices=["correo", "openai", "estado", "borrar"])
    av = sub.add_parser("avisos", help="Importar, buscar en Get on Board y procesar avisos")
    av.add_argument("accion", choices=["importar", "buscar", "procesar", "estado"])
    av.add_argument("valor", nargs="*", help="archivo para importar o consultas para buscar")
    pe = sub.add_parser("perfil", help="Cargar o ver tu perfil (herramientas y años)")
    pe.add_argument("accion", choices=["cargar", "ver"])
    pe.add_argument("archivo", nargs="?")
    pr = sub.add_parser("preguntar", help="Preguntar sobre tus avisos")
    pr.add_argument("pregunta", nargs="+")
    pc = sub.add_parser("probar-correo", help="Pasar correos de prueba (.eml) por el camino del vigía")
    pc.add_argument("archivos", nargs="+", help="archivos .eml o carpetas con .eml")
    args = parser.parse_args(argv)
    ll = llavero or Llavero()
    try:
        match args.comando:
            case "credenciales":
                return credenciales(args, ll)
            case "avisos":
                return avisos(args, ll)
            case "perfil":
                return perfil(args, ll)
            case "preguntar":
                return preguntar(args, ll)
            case "probar-correo":
                return probar_correo(args, ll)
    except KeyboardInterrupt:
        print("\nCancelado.", file=sys.stderr)
        return 130
    return 2


if __name__ == "__main__":
    sys.exit(main())
