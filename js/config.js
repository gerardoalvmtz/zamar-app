// Dónde vive el repertorio. Para usar otra hoja, cambia SHEET_ID (es la parte larga del link
// docs.google.com/spreadsheets/d/<SHEET_ID>/edit).
// La hoja debe estar compartida como "Cualquier persona con el enlace: Lector".
export const SHEET_ID = '1ZTB0DIIBhhpQkxFDLWZDUjVsDKh_x741u7y5KrDOK80';

// Las pestañas se identifican por su número (el "gid=" que aparece en el link al abrirla),
// así se pueden renombrar sin romper la app.
export const MAIN_GID = '0'; // RESUMEN
// Pestaña con las letras y hojas de acordes (columnas: Canción, Letra, Acordes).
export const LYRICS_GID = '1658370148'; // Letras

export const sheetCsvUrl = (gid = MAIN_GID) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&gid=${encodeURIComponent(gid)}`;

// Link del programa de Apps Script que guarda los cambios hechos desde la app
// (ver apps-script/LEEME.md). Mientras esté vacío, la app es solo de lectura.
export const WRITE_URL = 'https://script.google.com/macros/s/AKfycbzGTE178jhK3QbOKMe-Tkm3I_s-FfxhoCuScFa1UBv1fidL9w8XvT2w6MvAumZjf6zF/exec';
