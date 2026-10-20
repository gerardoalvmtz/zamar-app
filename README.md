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

- Buscar por título o autor, ordenar por canción o autor, y filtrar con selección múltiple por tema, voz principal, tono, estatus y canciones católicas.
- Cambiar el tono de una canción (los acordes se transponen solos). El tono elegido se recuerda en cada teléfono.
- Sugerir canciones para conectar según la tonalidad (misma, relativa, quinta/cuarta, subir medio tono o un tono),
  el BPM y el tema.
- Notas personales que se guardan solo en el teléfono de cada quien.
- Setlists para eventos: se arman en el teléfono, cada canción con su tono, y se comparten con un link.

## Editar desde la app

Con el programa de [`apps-script/`](apps-script/LEEME.md) instalado en el Sheets y su link en `WRITE_URL`
(`js/config.js`), aparece **✎ Editar** en cada canción, más **Nueva canción** e **Importar .cho** en la lista.
Se pide un PIN que el ministerio comparte. Todo se guarda en el mismo Sheets y queda registrado en la pestaña
*Cambios*. Los archivos adjuntos van a una carpeta de Drive y su link se anota en la columna *Archivos* de *Letras*.

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
