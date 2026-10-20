# Activar la edición desde la app

Este programa vive dentro del Google Sheets del repertorio y es el único que puede escribir en él.
La app le manda los cambios junto con un PIN; si el PIN no coincide, no se guarda nada.
Cada cambio queda anotado en la pestaña **Cambios** (fecha, quién, qué), y el historial de versiones
del Sheets permite deshacer cualquier cosa.

## Instalarlo (una sola vez, desde una computadora)

1. Abre el Sheets del repertorio → **Extensiones → Apps Script**.
2. Borra lo que aparezca en `Código.gs`, pega todo el contenido de [`Code.gs`](Code.gs) y guarda (ícono de disco).
3. Arriba a la derecha: **Implementar → Nueva implementación**.
   - En el engrane de "Tipo", elige **Aplicación web**.
   - **Ejecutar como:** Yo.
   - **Quién tiene acceso:** Cualquier usuario.
   - Toca **Implementar** y acepta los permisos que pide Google (es tu propia cuenta; puede decir
     "Google no ha verificado esta app": toca *Configuración avanzada → Ir a … (no seguro)*).
4. Copia la **URL de la aplicación web** (termina en `/exec`) y pásasela a Claude, o pégala en
   `js/config.js` en `WRITE_URL`.
5. Regresa al Sheets y recarga la página. Aparece el menú **Zamar → Cambiar PIN de edición**:
   elige el PIN que compartirás con quienes pueden editar.

## Qué puede hacer el equipo con el PIN

- Cambiar estatus, BPM, tonos, voz principal, autor, temas y link de Spotify.
- Editar letra, acordes y tabs, o cargar un `.cho` de Songbook Pro.
- Importar muchas hojas `.cho` a la vez.
- Adjuntar archivos (PDF o fotos de tabs). Se guardan en la carpeta de Drive
  **"Zamar · Archivos de la app"** con permiso de solo lectura por link.
- Agregar canciones nuevas.

La columna "Acordes actualizados (Songbook)" y las que no estén en la lista de arriba nunca se modifican.

## Composiciones (privadas)

La sección **Composiciones** de la app guarda letra, acordes, notas y audios de canciones nuevas.
No van en el Sheets público: el script crea en tu Drive una hoja aparte, **"Zamar · Composiciones"**
(pestañas *Composiciones* y *Audios*), y la carpeta **"Zamar · Audios de composiciones"**. La app solo
las muestra a quien escribe el PIN. Los audios quedan con permiso "cualquiera con el link", pero ese link
solo aparece dentro de la sección con PIN.

Después de pegar el código nuevo, en el editor elige la función **prepararComposiciones** en la lista de
arriba y toca **▶ Ejecutar**. Google pide permisos otra vez (ahora también para crear la hoja); acéptalos.
Luego vuelve a implementar como se explica abajo.

## Agenda (privada)

La sección **Agenda** guarda los eventos a los que invitan al ministerio (fecha, horas, lugar, contacto,
estatus, setlist y notas) y quién va a cada uno. Vive en la misma hoja privada "Zamar · Composiciones",
en las pestañas *Eventos* y *Asistencia*, que el script crea solo la primera vez que alguien abre la Agenda.
No hace falta ejecutar nada: basta con pegar el código nuevo y volver a implementar.

## Si cambias el código

Después de pegar una versión nueva: **Implementar → Administrar implementaciones → editar (lápiz) →
Versión: Nueva → Implementar**. Así la URL sigue siendo la misma.

Para cambiar el PIN usa otra vez el menú **Zamar → Cambiar PIN de edición**. Quien tenga el PIN viejo
guardado en su teléfono tendrá que escribir el nuevo.
