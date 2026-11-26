import subprocess
import sys

from ia.entradas.dev import detener


def test_detener_mata_al_proceso_que_ignora_la_senal() -> None:
    codigo = (
        "import signal, time; signal.signal(signal.SIGTERM, signal.SIG_IGN); "
        "print('listo', flush=True); time.sleep(60)"
    )
    p = subprocess.Popen([sys.executable, "-c", codigo], stdout=subprocess.PIPE)
    assert p.stdout is not None and p.stdout.readline() == b"listo\n"
    detener(p, espera_s=0.5)
    assert p.poll() is not None


def test_detener_un_proceso_terminado_no_falla() -> None:
    p = subprocess.Popen([sys.executable, "-c", "pass"])
    p.wait()
    detener(p)
