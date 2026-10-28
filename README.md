# Zamar · Repertorio

App del repertorio de **Zamar Adoración**. Se abre con un link desde cualquier celular o computadora,
se puede instalar en la pantalla de inicio y funciona sin internet. Nadie necesita cuenta.

## De dónde salen las canciones

La app lee en vivo la hoja de Google **"Repertorio Canciones Rise Up"**, pestañas **RESUMEN** y **Letras**
(se identifican por su número `gid` en `js/config.js`, así que se pueden renombrar). Para agregar o corregir una
canción solo se edita la hoja; los teléfonos ven el cambio la próxima vez que abren la app o tocan ⟳.

La hoja debe estar compartida como **"Cualquier persona con el enlace: Lector"**. Si no lo está, la
app muestra la copia guardada en el teléfono (o la incluida en `data/repertorio.json`) y avisa con un
letrero amarillo.

Otras columnas como "Acordes actualizados (Songbook)" o "Lyrics ProPresenter" son de control interno y la app no las muestra.

Columnas que la app reconoce (por nombre, en cualquier orden; las demás se ignoran):

| Columna | Uso |
| --- | --- |
| Canción | Título (obligatoria) |
| Autor | |
| Temas | Varios separados con ` / `. Se vuelven filtros |
| Voz Principal | Hombre / Mujer / Ambos |
| Católica? | Sí / No |
| Tonalidad Original | `G`, `Bb`, `F#m`, `Em`... También acepta `Sol`, `Re menor` |
| Tonalidad Zamar | La que toca el ministerio. Si está, es la que se usa por defecto |
| BPM | Número |
| Estatus | Lista para tocar / Pendiente repaso / ... |
| Spotify | Link de la canción en Spotify (se muestra el reproductor) |
| Notas | *(opcional)* Notas del equipo, visibles para todos |
| Link | *(opcional)* Video de referencia |

### Letras y hojas de acordes

Van en una pestaña aparte llamada **Letras** dentro de la misma hoja, para que la pestaña principal
siga siendo fácil de leer. Columnas: **Canción** (igual que en la pestaña principal), **Letra**, **Acordes** y **Tabs**.
En la app, cada canción tiene las pestañas *Letra*, *Acordes* y, si hay, *Tabs*.

**Desde Songbook Pro:** exporta la canción como `.cho` (ChordPro), ábrela como texto y pega todo en la columna
*Acordes*. La app entiende las secciones (`{soc}`, `{start_of_verse}`...), los tabs (`{sot}`...`{eot}`) y la
tonalidad en que está escrita (`{key: G}`), y saca la letra sola si la columna *Letra* está vacía. Si la hoja no
trae `{key}`, se asume que está en la Tonalidad Zamar. Los acordes se pueden escribir entre
corchetes dentro de la letra (`[G]Santo es el [D]Señor`) o en una línea encima de la letra, y se
transponen al cambiar el tono.

## Qué hace

- Página de **Inicio** con la foto del equipo, el próximo evento, la última canción abierta y accesos a cada
  sección (Canciones, Setlists, Agenda y Composiciones). El repertorio está en `#/canciones`.
- Buscar por título o autor, ordenar por canción o autor, y filtrar con selección múltiple por tema, voz principal, tono, estatus, canciones católicas y canciones sin acordes. Las que no tienen acordes en la pestaña Letras llevan la marca "Sin acordes" en la lista.
- Cambiar el tono de una canción (los acordes se transponen solos). El tono elegido se recuerda en cada teléfono.
- Cambiar el tamaño de la letra en Letra y Acordes (A− / A+); se recuerda en cada teléfono.
- Exportar la hoja de acordes de una canción a PDF en el tono elegido (botón debajo de los acordes): acordes en
  negritas encima de la letra, alineados, y en una sola hoja cuando cabe.
- Sugerir canciones para conectar según la tonalidad (misma, relativa, quinta/cuarta, subir medio tono o un tono),
  el BPM y el tema.
- Notas personales que se guardan solo en el teléfono de cada quien.
- Setlists para eventos, del equipo: con el programa de Apps Script se guardan en la hoja privada y todos los ven;
  verlos, crearlos y editarlos no pide PIN, borrarlos sí. Se arman buscando la canción por nombre o por tema y eligiendo el tono
  (el de Zamar por defecto). Se comparten con un link, como imagen PNG (canciones, tonos y BPM) o como PDF con
  las letras, una canción por página. **Duplicar** copia un setlist con sus tonos para reutilizarlo.
  **QR con letras** sube a Drive un PDF solo con las letras (sin tonos ni BPM) y muestra su QR para proyectarlo o
  imprimirlo; todos los PDF llevan el link al Linktree de Zamar. El PDF usa [jsPDF](https://github.com/parallax/jsPDF) (MIT, en `js/vendor/`).

## Editar desde la app

Con el programa de [`apps-script/`](apps-script/LEEME.md) instalado en el Sheets y su link en `WRITE_URL`
(`js/config.js`), aparece **✎ Editar** en cada canción, más **Nueva canción** e **Importar .cho** en la lista.
Se pide un PIN que el ministerio comparte. Todo se guarda en el mismo Sheets y queda registrado en la pestaña
*Cambios*. Los archivos adjuntos van a una carpeta de Drive y su link se anota en la columna *Archivos* de *Letras*.

### Puentes entre tonos

Cuando dos canciones seguidas de un setlist están en tonos distintos, la app propone el camino de acordes para
pasar de una a otra sin que suene brusco. Prueba varios recursos (acorde en común, tónica a menor o mayor, notas
en común con las transformaciones P, R y L, el IV que se vuelve menor, disminuido de paso, aumentado como portal,
ii–V, dominante suspendida, sustituto tritonal y subida) y además busca un **camino suave** de hasta 6 acordes
entre los acordes de los dos tonos. Mide cada cambio nota por nota (idea tomada de *Armonía Ilustrada* de Brian
Callipari) y recomienda el camino cuyo paso promedio y paso más brusco sean los más chicos, así que un camino largo
de pasos pequeños le gana a uno corto con un brinco (F → Am → C → Cm → Eb7 → Ab). Cada acorde muestra su función (por
ejemplo *V7 de A*) y las notas que comparte con el anterior; cada camino trae las notas para la mano derecha ya
acomodadas en la inversión más cercana, con el bajo caminando por pasos cuando se puede (G → D/F# → Dm → A), y un
botón ▶ Escuchar con piano. También sugiere una nota que voces o teclado pueden sostener, y un consejo si cambia
mucho el tempo.
Se ve en tres lugares: al tocar una canción del setlist (abajo, "Para llegar a la siguiente"), en el setlist
(tocando "ver puente" entre canciones) y en la página **Puente entre tonos** para probar cualquier par de tonos.

### Composiciones

Con la edición activa aparece la pestaña **Composiciones**, que pide el PIN. Ahí se registran canciones
nuevas por etapa (Idea, En proceso, Terminada): título, autores, tono, BPM, letra, acordes, notas y los audios
de referencia de cada momento, que se graban desde el teléfono o se suben como archivo (hasta 25 MB).
Cuando una está *Terminada*, el botón **Pasar al repertorio** la agrega a la lista de canciones con su letra
y acordes. **📷 Transcribir foto** (junto a Letra, al editar) lee una foto de la hoja escrita a mano o
impresa y agrega el texto a la letra para revisarlo (necesita activar Drive API una vez, ver el LEEME del
script). Cada composición tiene **Comentarios del equipo**, y cada audio su propio hilo para opinar sobre
esa toma; cada comentario lleva quién lo escribió y la fecha. Los datos viven en una hoja privada aparte, no en el Sheets público (ver [`apps-script/LEEME.md`](apps-script/LEEME.md)).

**💡 Ideas de progresiones** (`#/comp/ideas`, y plegado en cada composición y en el editor): eliges un ánimo
(Alegre, Melancólica, Reflexiva, Adoración íntima, Victoriosa, Esperanza, Súplica) y un tono, y salen cuatro
progresiones con la sección donde suelen ir, por qué suenan así y el tempo sugerido. Se pueden **escuchar** con sonido de piano real (muestras del Salamander Grand Piano, CC BY 3.0, en `audio/piano/`) y,
en el editor, **agregar a los acordes** como ChordPro. Las progresiones están en grados en `js/progressions.js`;
para agregar o cambiar alguna basta con editar `MOODS`. No usa el Apps Script.

### Grabaciones de ensayo

En la ficha de cada canción, **Grabaciones del equipo** guarda audios de cómo la tocamos nosotros (un
ensayo, una versión acústica). Se graban desde el teléfono o se suben como archivo (hasta 25 MB) y quedan en
la pestaña *Ensayos* de la hoja privada, con los audios en la carpeta de Drive **"Zamar · Grabaciones de
ensayos"**. Escucharlas no pide PIN; subirlas y borrarlas sí. Una grabación borrada queda 30 días en la
papelera de Drive.

### Agenda

También con PIN. Cada evento lleva tipo, estatus (Invitación recibida, Pendiente de detalles, Confirmado,
Realizado, Cancelado), fecha (o varias, para un retiro de viernes a domingo), hora de llegada, inicio y fin,
lugar, contacto y notas. Arriba se ve el
**próximo evento** con su cuenta regresiva y quién va; la lista se puede ver por mes o como calendario.
En cada evento cada quien marca **Voy / Tal vez / No puedo** con lo que toca, se puede vincular un setlist,
compartir el resumen por WhatsApp, agregarlo al calendario del teléfono y abrir el lugar en Maps.
El próximo evento también aparece en la página de inicio (con la última copia guardada).

**Ensayos.** Un evento de tipo *Ensayo* no lleva estatus de invitación (solo se puede cancelar ese día) y, al
crearlo, se puede repetir cada semana o cada 2 semanas hasta una fecha: se crea un evento por fecha y cada uno
se ajusta por separado. Trae tres pestañas:
- *Antes · Programa:* canciones del repertorio o de un setlist y puntos para platicar, cada uno con sus minutos.
  Muestra la hora de cada punto (en formato de 12 horas), avisa si se pasa del horario y se comparte por WhatsApp como texto o como imagen PNG. Las tareas sin
  terminar de ensayos anteriores aparecen ahí.
- *Durante · Modo ensayo:* un punto a la vez, con cronómetro (vive en el teléfono de quien lo lleva), notas y
  acceso a la canción. Desde ahí, Anterior/Siguiente recorre las canciones del programa como un setlist, el
  tono que se cambie queda en el programa y "Volver al ensayo" regresa al modo ensayo.
- *Después · Minuta:* quién vino, lo que se vio, acuerdos y tareas con responsable. Se comparte por WhatsApp.
Todo se guarda en la columna *Ensayo* de la pestaña Eventos.

## Publicarla (GitHub Pages, gratis)

En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)` → Save**.
En un par de minutos queda en `https://gerardoalvmtz.github.io/zamar-app/`.

## Para desarrollo

Es HTML, CSS y JavaScript sin dependencias ni compilación.

```sh
npm start   # sirve la app en http://localhost:8080
npm test    # pruebas de transposición, lectura de la hoja y sugerencias
```

Cada vez que cambien archivos de la app, sube `VERSION` en `sw.js` para que los teléfonos descarguen la versión nueva.
