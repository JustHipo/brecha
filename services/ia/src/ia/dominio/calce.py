"""Calce de un aviso con el perfil (F2-10). Lo calcula el código, nunca el modelo (IAAPP-008).

Fórmula fija:
- Cada requisito pesa 2 si es obligatorio y 1 si es deseable.
- Un requisito que la persona tiene suma su peso completo; si pide más años de los que tiene,
  suma en proporción (años que tiene / años pedidos).
- Calce = suma obtenida / suma posible, de 0 a 100 redondeado. Sin requisitos no hay calce.
- Brechas: primero los obligatorios que no tiene, después los deseables
  y al final los que tiene con menos años.
"""

import re
from dataclasses import dataclass

from ia.dominio.aviso import sin_tildes

PESO_OBLIGATORIO = 2.0
PESO_DESEABLE = 1.0

ALIAS = {
    "node": "node.js",
    "nodejs": "node.js",
    "node js": "node.js",
    "js": "javascript",
    "ts": "typescript",
    "postgres": "postgresql",
    "psql": "postgresql",
    "k8s": "kubernetes",
    "nest": "nestjs",
    "nest.js": "nestjs",
    "react.js": "react",
    "reactjs": "react",
    "angularjs": "angular",
    "golang": "go",
    "gcp": "google cloud",
    "amazon web services": "aws",
    "ci cd": "ci/cd",
    "cicd": "ci/cd",
    "llm": "llms",
    "vue 3": "vue",
    "vue.js": "vue",
    "vuejs": "vue",
    "argocd": "argo cd",
    "nuxt.js": "nuxt",
    "nuxtjs": "nuxt",
    "english": "ingles",
}


def normalizar(herramienta: str) -> str:
    t = sin_tildes(herramienta).lower().strip()
    t = re.sub(r"\s*\(.*?\)\s*", " ", t).strip()
    t = re.sub(r"[\s_-]+", " ", t)
    return ALIAS.get(t, t)


# Un requisito (izquierda) se cumple con cualquiera de estas herramientas del perfil.
CUBRE: dict[str, tuple[str, ...]] = {
    "javascript": ("typescript",),
    "node.js": ("nestjs", "fastify"),
    "sql": ("postgresql", "mysql", "sql server", "oracle"),
    "bases de datos relacionales": ("postgresql", "mysql", "sql server"),
    "nosql": ("mongodb", "redis", "dynamodb"),
    "ci/cd": ("github actions", "gitlab ci", "argo cd", "jenkins"),
    "kubernetes": ("k8s",),
    "contenedores": ("docker",),
    "vue": ("nuxt",),
    "llms": ("langchain", "langgraph"),
    "ia generativa": ("langchain", "langgraph", "llms"),
    "colas de mensajes": ("bullmq", "rabbitmq", "kafka"),
    "observabilidad": ("grafana", "loki", "prometheus"),
}


@dataclass(frozen=True)
class Requisito:
    nombre: str
    obligatorio: bool
    anos: int | None = None


@dataclass(frozen=True)
class Perfil:
    """Herramientas con años de experiencia (D32: se carga desde los datos del CV)."""

    herramientas: dict[str, float]
    anos_totales: float = 0

    def anos_en(self, herramienta: str) -> float | None:
        """Años en esa herramienta o, si no la tiene, en la que la cubre (TypeScript cubre JavaScript)."""
        n = normalizar(herramienta)
        propias = {normalizar(h): anos for h, anos in self.herramientas.items()}
        if n in propias:
            return propias[n]
        cubren = [propias[c] for c in CUBRE.get(n, ()) if c in propias]
        return max(cubren) if cubren else None


@dataclass(frozen=True)
class Calce:
    puntaje: int
    brechas: tuple[str, ...]
    cumple: tuple[str, ...]


def calcular_calce(perfil: Perfil, requisitos: list[Requisito]) -> Calce | None:
    vistos: dict[str, Requisito] = {}
    for r in requisitos:
        clave = normalizar(r.nombre)
        previo = vistos.get(clave)
        if previo is None or (r.obligatorio and not previo.obligatorio):
            vistos[clave] = r
    if not vistos:
        return None
    posible = obtenido = 0.0
    faltan_obligatorios: list[str] = []
    faltan_deseables: list[str] = []
    con_menos_anos: list[str] = []
    cumple: list[str] = []
    for r in vistos.values():
        peso = PESO_OBLIGATORIO if r.obligatorio else PESO_DESEABLE
        posible += peso
        tiene = perfil.anos_en(r.nombre)
        if tiene is None:
            (faltan_obligatorios if r.obligatorio else faltan_deseables).append(r.nombre)
            continue
        if r.anos and tiene < r.anos:
            obtenido += peso * (tiene / r.anos)
            con_menos_anos.append(
                f"{r.nombre} ({_anos(tiene)} de {r.anos} {'año' if r.anos == 1 else 'años'})"
            )
        else:
            obtenido += peso
            cumple.append(r.nombre)
    return Calce(
        puntaje=round(100 * obtenido / posible),
        brechas=tuple(faltan_obligatorios + faltan_deseables + con_menos_anos),
        cumple=tuple(cumple),
    )


def _anos(a: float) -> str:
    return str(int(a)) if a == int(a) else f"{a:.1f}".replace(".", ",")
