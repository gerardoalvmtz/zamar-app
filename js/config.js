// Dónde vive el repertorio. Para usar otra hoja, cambia SHEET_ID (es la parte larga del link
// docs.google.com/spreadsheets/d/<SHEET_ID>/edit) y SHEET_NAME (el nombre de la pestaña).
// La hoja debe estar compartida como "Cualquier persona con el enlace: Lector".
export const SHEET_ID = '1ZTB0DIIBhhpQkxFDLWZDUjVsDKh_x741u7y5KrDOK80';
export const SHEET_NAME = 'Sheet1';
// Pestaña opcional con las letras y hojas de acordes (columnas: Canción, Letra, Acordes).
export const LYRICS_SHEET_NAME = 'Letras';

export const sheetCsvUrl = (name = SHEET_NAME) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(name)}`;
