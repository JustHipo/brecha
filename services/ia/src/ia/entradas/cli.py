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
        case "importar":
            # Lee {"usuario", "clave", "openai"} por la entrada estándar (de otro programa,
            # nunca de la pantalla) y los guarda en este llavero. No imprime ningún valor.
            datos = json.loads(sys.stdin.read() or "{}")
            guardadas = []
            for clave_json, tipo in (
                ("usuario", TipoDeCredencial.CORREO_USUARIO),
                ("clave", TipoDeCredencial.CORREO_CLAVE),
                ("openai", TipoDeCredencial.OPENAI),
            ):
                if isinstance(datos.get(clave_json), str) and datos[clave_json].strip():
                    llavero.guardar(tipo, datos[clave_json])
                    guardadas.append(clave_json)
            print(f"Importadas: {', '.join(guardadas) or 'ninguna'}.")
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
        print("Falta la llave de OpenAI: guárdala en Ajustes o con «credenciales openai».", file=sys.stderr)
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
    k = ClasificarPendientes(s.modelo(), repo, s.trazas, ahora, s.precios, nucleo=s.nucleo_http()).ejecutar()
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


def evaluar(args: argparse.Namespace, llavero: Credenciales) -> int:
    """F2-14: corre los sets contra el modelo configurado y falla si no llega a los umbrales de D30."""
    from ia.aplicacion.casos.avisos import IndexarAvisos, Preguntar
    from ia.aplicacion.casos.evaluar import (
        CasoDeCorreo,
        CasoDePregunta,
        EvaluarCorreos,
        EvaluarPreguntas,
        RespuestaEvaluada,
    )
    from ia.dominio.asociacion import PostulacionConocida
    from ia.dominio.aviso import Aviso
    from ia.entradas.servicios import ahora
    from ia.infraestructura.memoria import AvisosEnMemoria

    s = _servicios(llavero)
    if not s.hay_modelo():
        print("Falta la llave de OpenAI.", file=sys.stderr)
        return 1
    modelo = s.modelo()
    ok = True
    if args.correos:
        d = json.loads(Path(args.correos).read_text(encoding="utf-8"))
        conocidas = [
            PostulacionConocida(
                p["id"], p["empresa"], p["titulo"], p["plataforma"], p.get("activa", True), p.get("url", "")
            )
            for p in d["postulaciones"]
        ]
        casos = [
            CasoDeCorreo(
                c["id"],
                c["remitente"],
                c["asunto"],
                c["texto"],
                c.get("estado"),
                c.get("postulacion"),
                tuple(c["postulaciones"]) if "postulaciones" in c else None,
                c.get("paso"),
            )
            for c in d["casos"]
        ]
        rc = EvaluarCorreos(modelo, conocidas).ejecutar(casos)
        print(
            f"Correos: {rc.casos} casos · estado {rc.tasa_estado:.0%} (mínimo 80 %) · "
            f"asociación {rc.tasa_asociacion:.0%} (mínimo 75 %) · "
            f"falsos rechazos {rc.falsos_rechazos} (máximo 1) · "
            f"pasos {rc.tasa_pasos:.0%} de {rc.pasos_esperados} (mínimo 80 %), "
            f"inventados {rc.pasos_inventados} (máximo 1)"
            f" → {'PASA' if rc.pasa else 'NO PASA'}"
        )
        for f in rc.fallos:
            print(f"  · {f}")
        ok = ok and rc.pasa
    if args.preguntas:
        d = json.loads(Path(args.preguntas).read_text(encoding="utf-8"))
        repo = AvisosEnMemoria()
        for a in d["avisos"]:
            repo.guardar(
                Aviso(
                    a["url"],
                    a["titulo"],
                    a["empresa"],
                    "otra",
                    a.get("modalidad", "no_indica"),
                    "manual",
                    a["texto"],
                    stack=tuple(a.get("stack", [])),
                )
            )
        IndexarAvisos(modelo, repo, s.trazas, ahora, s.cfg.openai_precio_embeddings).ejecutar()
        p = Preguntar(modelo, modelo, repo, s.trazas, ahora, s.precios, s.cfg.openai_precio_embeddings)

        def preguntar(texto: str) -> RespuestaEvaluada:
            r = p.ejecutar(texto)
            return RespuestaEvaluada(r.avisos, len(r.respuesta.descartados))

        casos_p = [CasoDePregunta(c["id"], c["pregunta"], tuple(c["esperados"])) for c in d["casos"]]
        rp = EvaluarPreguntas(preguntar).ejecutar(casos_p)
        print(
            f"Preguntas: {rp.casos} casos · avisos esperados {rp.recall:.0%} (mínimo 70 %) · "
            f"citas válidas {rp.tasa_citas_validas:.0%} (100 %) → {'PASA' if rp.pasa else 'NO PASA'}"
        )
        for f in rp.fallos:
            print(f"  · {f}")
        ok = ok and rp.pasa
    return 0 if ok else 1


def red(args: argparse.Namespace, llavero: Credenciales) -> int:
    """D40: trae a tu red los avisos de LinkedIn de los últimos días y los registra en el núcleo."""
    from datetime import timedelta

    from ia.aplicacion.casos.registrar_red import RegistrarRed
    from ia.aplicacion.puertos import TipoDeCredencial
    from ia.dominio.linkedin import leer_aviso
    from ia.infraestructura.imap import LectorImap
    from ia.infraestructura.postgres.correos import RepositorioPostgresDeCorreos

    s = _servicios(llavero)
    repo = RepositorioPostgresDeCorreos(s.motor)
    if args.accion == "reprocesar":
        lector = LectorImap(
            llavero.obtener(TipoDeCredencial.CORREO_USUARIO) or "",
            llavero.obtener(TipoDeCredencial.CORREO_CLAVE) or "",
        )
        nuevos = 0
        for c in lector.de_linkedin(date.today() - timedelta(days=args.dias)):
            avisos = leer_aviso(c)
            if avisos:
                nuevos += repo.guardar_avisos_red(c.message_id, c.recibido_en, avisos)
        print(f"Avisos de LinkedIn de los últimos {args.dias} días: {nuevos} nuevos.")
    r = RegistrarRed(s.nucleo_http(), repo).ejecutar()
    for d in r.detalle:
        print(f"  · {d}")
    print(f"En tu red: {r.registrados} avisos, {r.nuevos} interacciones nuevas.")
    print(f"Ligados a postulaciones: {r.ligados}.")
    if r.error:
        print(r.error, file=sys.stderr)
        return 1
    return 0


def correo(args: argparse.Namespace, llavero: Credenciales) -> int:
    """Releer: los correos que el filtro descartó en los últimos días vuelven a pasar por el filtro de hoy.

    Los que ahora pasan se clasifican y se registran al tiro, como en una vuelta del vigía.
    """
    from ia.aplicacion.casos.clasificar_pendientes import ClasificarPendientes
    from ia.aplicacion.casos.registrar_senales import RegistrarSenales
    from ia.aplicacion.casos.sincronizar_correo import ReleerFiltrados
    from ia.aplicacion.puertos import TipoDeCredencial
    from ia.entradas.servicios import ahora
    from ia.infraestructura.imap import LectorImap
    from ia.infraestructura.postgres.correos import RepositorioPostgresDeCorreos

    s = _servicios(llavero)
    repo = RepositorioPostgresDeCorreos(s.motor)
    lector = LectorImap(
        llavero.obtener(TipoDeCredencial.CORREO_USUARIO) or "",
        llavero.obtener(TipoDeCredencial.CORREO_CLAVE) or "",
    )
    r = ReleerFiltrados(lector, repo, ahora).ejecutar(args.dias)
    print(f"Releídos {r.leidos} correos de los últimos {args.dias} días: {r.reabiertos} vuelven a la cola.")
    for d in r.detalle:
        print(f"  · {d}")
    if not r.reabiertos:
        return 0
    if not s.hay_modelo():
        print("Falta la llave de OpenAI: quedan en cola para el vigía.", file=sys.stderr)
        return 1
    nucleo = s.nucleo_http()
    k = ClasificarPendientes(s.modelo(), repo, s.trazas, ahora, s.precios, nucleo=nucleo).ejecutar()
    print(f"Clasificados: {k.clasificados} ({k.con_paso} con un paso pedido), USD {k.costo_usd:.5f}")
    g = RegistrarSenales(nucleo, repo).ejecutar()
    for d in g.detalle:
        print(f"  · {d}")
    print(f"Señales: {g.a_postulacion} a postulaciones, {g.a_bandeja} a la bandeja, {g.repetidas} repetidas.")
    if k.error or g.error:
        print(k.error or g.error, file=sys.stderr)
        return 1
    return 0


def pasos(args: argparse.Namespace, llavero: Credenciales) -> int:
    """Pasos pendientes (pasos.md §5.7): vuelve a mirar los correos leídos y crea los pasos que pidieron."""
    from ia.aplicacion.casos.reprocesar_pasos import ReprocesarPasos
    from ia.entradas.servicios import ahora
    from ia.infraestructura.postgres.correos import RepositorioPostgresDeCorreos

    s = _servicios(llavero)
    if not s.hay_modelo():
        print("Falta la llave de OpenAI (Ajustes de la consola o «ia credenciales openai»).", file=sys.stderr)
        return 1
    r = ReprocesarPasos(
        s.modelo(),
        s.nucleo_http(),
        RepositorioPostgresDeCorreos(s.motor),
        s.trazas,
        ahora,
        s.precios,
        en_seco=args.en_seco,
    ).ejecutar(args.dias)
    for d in r.detalle:
        print(f"  · {d}")
    print(
        f"Revisados {r.revisados} correos de los últimos {args.dias} días: {r.pasos_nuevos} pasos nuevos, "
        f"{r.ya_estaban} ya estaban, {r.recordatorios} recordatorios (USD {r.costo_usd:.5f})."
    )
    if args.en_seco:
        print("En seco: no se creó nada. Quita --en-seco para crearlos.")
    if r.error:
        print(r.error, file=sys.stderr)
        return 1
    return 0


def main(argv: list[str] | None = None, llavero: Credenciales | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ia", description="Herramientas del servicio con IA de Brecha")
    sub = parser.add_subparsers(dest="comando", required=True)
    cred = sub.add_parser("credenciales", help="Guardar, revisar o borrar credenciales en el llavero")
    cred.add_argument("accion", choices=["correo", "openai", "estado", "borrar", "importar"])
    av = sub.add_parser("avisos", help="Importar, buscar en Get on Board y procesar avisos")
    av.add_argument("accion", choices=["importar", "buscar", "procesar", "estado"])
    av.add_argument("valor", nargs="*", help="archivo para importar o consultas para buscar")
    pe = sub.add_parser("perfil", help="Cargar o ver tu perfil (herramientas y años)")
    pe.add_argument("accion", choices=["cargar", "ver"])
    pe.add_argument("archivo", nargs="?")
    pr = sub.add_parser("preguntar", help="Preguntar sobre tus avisos")
    pr.add_argument("pregunta", nargs="+")
    rd = sub.add_parser("red", help="Traer los avisos de LinkedIn del correo a tu red")
    rd.add_argument("accion", choices=["reprocesar", "enviar"])
    rd.add_argument("--dias", type=int, default=45)
    ev = sub.add_parser("evaluar", help="Medir la clasificación y Preguntar contra los umbrales de D30")
    ev.add_argument("--correos", help="set de correos (JSON)")
    ev.add_argument("--preguntas", help="set de preguntas (JSON)")
    co = sub.add_parser("correo", help="Releer los correos que el filtro descartó en los últimos días")
    co.add_argument("accion", choices=["releer"])
    co.add_argument("--dias", type=int, default=3)
    ps = sub.add_parser("pasos", help="Crear los pasos pendientes de los correos ya leídos")
    ps.add_argument("accion", choices=["reprocesar"])
    ps.add_argument("--dias", type=int, default=30)
    ps.add_argument("--en-seco", action="store_true", help="solo mostrar lo que crearía")
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
            case "evaluar":
                return evaluar(args, ll)
            case "red":
                return red(args, ll)
            case "pasos":
                return pasos(args, ll)
            case "correo":
                return correo(args, ll)
    except KeyboardInterrupt:
        print("\nCancelado.", file=sys.stderr)
        return 130
    return 2


if __name__ == "__main__":
    sys.exit(main())
