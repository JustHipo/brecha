"""Reglas del filtro sin IA (docs/diseno/f2.md §4, paso 2).

Se editan aquí y se prueban en tests/test_filtro.py.

Lo que no pasa el filtro no sale de la máquina.
"""

# Dominio del remitente (o un sufijo) → plataforma de Brecha.
DOMINIOS_DE_PLATAFORMAS: dict[str, str] = {
    "linkedin.com": "linkedin",
    "trabajando.com": "trabajando",
    "trabajando.cl": "trabajando",
    "getonbrd.com": "getonboard",
    "getonboard.com": "getonboard",
    "computrabajo.com": "computrabajo",
    "computrabajo.cl": "computrabajo",
    "chiletrabajos.cl": "chiletrabajos",
    "indeed.com": "indeed",
    "indeedemail.com": "indeed",
}

# Sistemas de selección que usan las empresas en su propio sitio (ATS).
DOMINIOS_DE_SELECCION: tuple[str, ...] = (
    "greenhouse.io",
    "greenhouse-mail.io",
    "lever.co",
    "hire.lever.co",
    "workable.com",
    "teamtailor.com",
    "teamtailor-mail.com",
    "bamboohr.com",
    "smartrecruiters.com",
    "ashbyhq.com",
    "recruitee.com",
    "myworkday.com",
    "workday.com",
    "gupy.io",
    "buk.cl",
    "hiringroom.com",
    "breezy.hr",
    "jobvite.com",
    "icims.com",
    "personio.com",
    "talana.com",
    "bizneo.com",
)

# Palabras fuertes: hablan de una postulación casi siempre. Pasan aunque el correo sea masivo.
PALABRAS_FUERTES: tuple[str, ...] = (
    "postulación",
    "postulacion",
    "postulaste",
    "has postulado",
    "tu candidatura",
    "proceso de selección",
    "proceso de seleccion",
    "prueba técnica",
    "prueba tecnica",
    "desafío técnico",
    "desafio tecnico",
    "carta oferta",
    "oferta laboral",
    "no continuaremos",
    "no seguiremos",
    "tu cv fue",
    "your application",
    "application for",
    "not moving forward",
)

# Palabras débiles: también aparecen en boletines.
# Pasan desde una plataforma o en un correo personal (no masivo).
PALABRAS_DEBILES: tuple[str, ...] = (
    "entrevista",
    "interview",
    "assessment",
    "next steps",
    "offer letter",
    "unfortunately",
    "applied to",
    "reclutador",
    "recruiter",
    # Invitaciones de calendario (una llamada o entrevista agendada por Google Calendar, Outlook o Calendly).
    "invitation:",
    "invitación:",
    "updated invitation",
    "invitación actualizada",
    "google meet",
    "meet.google.com",
    "zoom.us/j",
    "teams.microsoft.com",
    "calendly",
)

# Correo de uso personal: un dominio de estos no dice de qué empresa es el remitente.
DOMINIOS_GENERICOS: tuple[str, ...] = (
    "gmail.com",
    "googlemail.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "yahoo.com",
    "icloud.com",
    "me.com",
    "proton.me",
    "protonmail.com",
)

# Asuntos de avisos masivos (alertas de empleo, boletines): no son evidencia de una postulación.
ASUNTOS_DE_PUBLICIDAD: tuple[str, ...] = (
    "empleos recomendados",
    "nuevos empleos",
    "nuevas ofertas",
    "ofertas para ti",
    "alerta de empleo",
    "te pueden interesar",
    "job alert",
    "jobs you may be interested",
    "new jobs",
    "recommended jobs",
    "is hiring",
    "están contratando",
    "estan contratando",
    "newsletter",
    "boletín",
    "webinar",
)

# Cuántos caracteres del comienzo del texto se miran para las palabras clave.
CARACTERES_PARA_PALABRAS = 1500
