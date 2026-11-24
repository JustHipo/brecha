# Instalar Brecha en Windows con la ayuda de Claude

Este archivo es el prompt que se pega en una sesión nueva de Claude Code (app de escritorio) en el Windows donde se instala Brecha. Primero lo corre Juan en su Windows con sus credenciales, para probarlo; después Tamara en el suyo.

Antes de pegarlo:

1. En el Mac de Juan, la sesión de Claude que se llama **windows** (la que armó la app) debe tener **Remote Control** encendido.
2. En el Windows, abre Claude (con la misma cuenta de Claude que usa Juan), crea una sesión nueva en una carpeta cualquiera (por ejemplo `Documentos\brecha-instalacion`) y enciende **Remote Control** en esa sesión.
3. Pega todo el bloque de abajo.

---

```text
Vas a ayudarme a instalar y dejar funcionando Brecha en este Windows, paso a paso y hablándome en español simple. Brecha es una app de escritorio para seguir postulaciones de trabajo: un tablero con tus postulaciones, que lee tu Gmail para darte cuenta cuando una empresa te responde y usa OpenAI para entender esos correos. Todo corre en este equipo.

Quién soy: la persona que va a usar Brecha en este equipo. Si no sabes mi nombre, pregúntamelo al empezar. Uso la cuenta de Claude de Juan.

Con quién te coordinas: en el Mac de Juan hay una sesión de Claude que se llama «windows» y que construyó la app. Encuentra esa sesión con ListAgents (Remote Control debe estar encendido en las dos) y escríbele con SendMessage a «windows». A ella le pides el enlace del instalador, le cuentas cómo va cada paso (lo que salió bien y lo que falló, con el mensaje de error literal) y le preguntas lo que no sepas de Brecha. Si no la encuentras, dime que le pida a Juan encender Remote Control en esa sesión y espera.

Reglas:
- Un paso a la vez. Antes de cada paso dime qué vamos a hacer y por qué; después revisa tú que salió bien (con PowerShell) antes de seguir.
- Nunca me pidas que te dicte contraseñas, contraseñas de aplicación ni llaves de API, y nunca las escribas tú: las escribo yo directo en la app. Si alguna aparece en la pantalla o en un comando, no la repitas.
- No desactives protecciones de Windows por tu cuenta. Si algo de seguridad bloquea la instalación, explícame qué es y decido yo.
- Si algo falla, no improvises arreglos: muéstrame el error, avísale a «windows» y sigue sus instrucciones.

Pasos:

1. Revisión del equipo (solo leer, no cambia nada): versión de Windows y que sea de 64 bits (x64); que los puertos 4300 y 4400 estén libres (Get-NetTCPConnection -LocalPort 4300,4400); y el estado de Smart App Control (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy' -Name VerifiedAndReputablePolicyState: 0 apagado, 1 encendido, 2 evaluación). Cuéntale el resultado a «windows».
   Si Smart App Control está encendido, explícame que bloquea cualquier app sin firma digital (Brecha no está firmada) y que la única forma es apagarlo en Seguridad de Windows → Control de aplicaciones y del navegador → Smart App Control. Hoy se puede volver a encender sin reinstalar Windows. La decisión es mía.

2. Descargar el instalador: pídele a «windows» el enlace de la última corrida del CI que pasó. Es un .zip (el artefacto «Brecha-Setup-windows»): GitHub pide iniciar sesión para bajarlo, así que ábreme el enlace en el navegador para que yo lo baje (o, si `gh` está instalado y con sesión, usa `gh run download <id> -n Brecha-Setup-windows -R JustHipo/brecha`). Descomprímelo en Descargas y revisa que quede Brecha-Setup-<versión>.exe y que pese más de 100 MB.

3. Instalar: ábreme la carpeta Descargas y pídeme que haga doble clic en Brecha-Setup. Si aparece «Windows ha protegido su PC», explícame que sale porque la app no está firmada y que debo elegir «Más información» y después «Ejecutar de todos modos». Se instala solo para mi usuario, sin pedir clave de administrador, y Brecha se abre sola al terminar. Avísame que la instalación tarda unos 3 minutos y que la barra se queda quieta cerca del 65 % un buen rato (copia unos 29 mil archivos): no está colgada.
   Revisa: que exista $env:LOCALAPPDATA\Programs\Brecha\Brecha.exe y que respondan http://127.0.0.1:4300/api/v1/salud y http://127.0.0.1:4400/api/ia/salud (puede tardar hasta un minuto la primera vez). Si no responden, lee los registros en $env:APPDATA\Brecha\logs (app.log, postgres.log, nucleo.log, ia-api.log) y mándale a «windows» las últimas 30 líneas de los que tengan errores, sin contraseñas.
   Muéstrame dónde quedó el icono de Brecha (bandeja del sistema, al lado del reloj o en la flecha «^»): clic abre la ventana, clic derecho el menú.

4. El recorrido de bienvenida: la primera vez la app muestra un recorrido corto con globos (8 pasos). Dime que lo siga; si lo cerré, se puede volver a ver desde Ajustes o desde la búsqueda (Ctrl+K).

5. Conectar mi Gmail: en Brecha, Ajustes → «Conectar con Gmail». La guía tiene 4 pasos (verificación en dos pasos, abrir myaccount.google.com/apppasswords, crear una contraseña llamada «Brecha» y pegarla). Acompáñame paso a paso, pero las páginas de Google y la contraseña las manejo yo. Ojo: tiene que ser MI cuenta de Gmail (la que uso para postular). Conectar mi Gmail aquí no toca el Gmail de Juan: cada equipo tiene su propia conexión y cada contraseña de aplicación es de una sola cuenta. Tampoco hay que conectar ni desconectar nada en los conectores de Claude.
   Revisa: que Ajustes diga «Conectado como …» y que en $env:APPDATA\Brecha\logs\vigia.log aparezca una revisión del correo sin error en los minutos siguientes.

6. OpenAI: la llave la pone Juan (es suya y él paga el uso). Cuando él esté, Ajustes → OpenAI → pega la llave → Guardar. Tú no la ves ni la escribes. Revisa después que Ajustes diga «Configurado».

7. Conectar Claude con Brecha (para que yo pueda pedirte cosas sobre mis postulaciones): con Brecha abierta, corre en PowerShell
   claude mcp add --transport http --scope user brecha http://127.0.0.1:4300/mcp --header "Authorization: Bearer $(Get-Content $env:APPDATA\Brecha\instancia\token-mcp)"
   Si «claude» no se reconoce (solo está la app de escritorio, sin el CLI aparte), usa el claude.exe que trae la app: búscalo con Get-ChildItem "$env:LOCALAPPDATA\Claude-Data" -Recurse -Filter claude.exe y córrelo con su ruta completa. Revisa con «claude mcp get brecha» que diga Connected.
   No muestres el token. Después pídeme que abra una sesión nueva de Claude y comprueba que la herramienta brecha responde con «resumen».

8. Usar la app: con mi ayuda, crea una postulación de prueba desde el tablero (Crear postulación), muévela de columna arrastrándola y ábrela para ver su ficha. Después bórrala o descártala. Explícame en simple: el tablero, la Bandeja (correos que la IA leyó y espera que yo confirme), Avisos, mi red de LinkedIn y Ajustes.

9. Importar postulaciones (en Brecha: «Importar y exportar» en la barra lateral; ahí también hay plantillas para descargar):
   a) Las que Juan y yo ya seguimos juntos: pídele a «windows» que Juan exporte el CSV desde su Brecha («Importar y exportar» → exportar postulaciones) y me lo mande. Lo importo yo con «Elegir archivo CSV». Primero postulaciones y después contactos, si hay.
   b) Las mías que tengo en otro lado (una planilla, notas, correos): pregúntame dónde están y conviértelas a un postulaciones.csv con estas reglas, y muéstrame el resultado antes de importarlo:
      - UTF-8, separado por comas (no punto y coma), primera fila con el encabezado. Si sale de Excel, «CSV UTF-8 (delimitado por comas)».
      - Encabezado: titulo,empresa,url,plataforma,modalidad,ubicacion,cierre,estado,prioridad,fecha_postulacion,canal_tipo,canal_valor,correo_postulacion,sueldo_publicado,stack,requisitos,etiquetas,notas,motivo (pueden faltar las opcionales).
      - Obligatorias: titulo, empresa y url (la URL del aviso; es lo que identifica cada postulación). Si no tengo la URL, pregúntame; no la inventes.
      - plataforma: linkedin, trabajando, getonboard, computrabajo, chiletrabajos, indeed, sitio_empresa u otra (si falta, se deduce de la URL). modalidad: remoto, hibrido, presencial o no_indica.
      - estado: sin_decidir, por_postular, postulado, en_proceso, entrevista, oferta, aceptada, rechazado o descartado.
      - Desde postulado en adelante (también rechazado) son obligatorias fecha_postulacion (AAAA-MM-DD, no futura), canal_tipo (portal, email, formulario o referido: por dónde postulé) y canal_valor (la URL o el correo). Si no sé la fecha exacta, pregúntame cuál poner.
      - motivo para rechazado o descartado (opcional). Fechas siempre AAAA-MM-DD. Listas dentro de una celda (stack, etiquetas) separadas por «;». Celdas con comas o comillas, entre comillas dobles.
   Después de importar, Brecha muestra cuántas entraron, cuáles ya estaban y los errores por línea. Si hay errores, corrige solo esas filas y vuelve a importar (importar dos veces el mismo archivo no duplica). Revisa en el tablero que estén todas.

10. Cierre: haz un resumen de lo que quedó funcionando, lo pendiente y dónde están mis datos ($env:APPDATA\Brecha). Mándale el mismo resumen a «windows».
```
