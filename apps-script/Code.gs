/**
 * Zamar · Repertorio: recibe los cambios que el equipo hace desde la app y los
 * escribe en esta hoja. Se instala una vez desde Extensiones → Apps Script
 * (ver apps-script/LEEME.md). Cualquier cambio queda también en la pestaña "Cambios".
 */

const MAIN_GID = 0; // pestaña RESUMEN
const LYRICS_GID = 1658370148; // pestaña Letras
const LOG_SHEET = 'Cambios';
const FILES_FOLDER = 'Zamar · Archivos de la app';
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Columnas que la app puede cambiar. Las demás (por ejemplo la de Songbook) no se tocan.
const MAIN_EDITABLE = [
  'Canción', 'Autor', 'Temas', 'Voz Principal', 'Católica?', 'Tonalidad Original',
  'Tonalidad Zamar', 'BPM', 'Estatus', 'Spotify',
];
const LYRICS_EDITABLE = ['Letra', 'Acordes', 'Tabs'];

// ---------- menú en la hoja ----------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Zamar')
    .addItem('Cambiar PIN de edición', 'cambiarPin')
    .addToUi();
}

function cambiarPin() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('PIN de edición', 'Escribe el PIN que usará el equipo para editar desde la app (mínimo 4 caracteres):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const pin = r.getResponseText().trim();
  if (pin.length < 4) {
    ui.alert('El PIN debe tener al menos 4 caracteres.');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('PIN', pin);
  ui.alert('Listo. Comparte el PIN solo con quienes deben poder editar.');
}

// ---------- utilidades ----------
function normalize(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sheetByGid(gid) {
  const sheet = SpreadsheetApp.getActive().getSheets().find((s) => s.getSheetId() === gid);
  if (!sheet) throw new Error('No encontré la pestaña ' + gid);
  return sheet;
}

function headers(sheet) {
  return sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(String);
}

/** Columna (1-based) del encabezado; la crea al final si no existe y create es true. */
function column(sheet, name, create) {
  const h = headers(sheet).map(normalize);
  const i = h.indexOf(normalize(name));
  if (i >= 0) return i + 1;
  if (!create) return 0;
  const col = sheet.getLastColumn() + 1;
  sheet.getRange(1, col).setValue(name).setFontWeight('bold');
  return col;
}

/** Fila (1-based) de la canción por título; 0 si no está. */
function findRow(sheet, title) {
  const col = column(sheet, 'Canción', false) || 1;
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const values = sheet.getRange(2, col, last - 1, 1).getValues();
  const t = normalize(title);
  for (let i = 0; i < values.length; i++) if (normalize(values[i][0]) === t) return i + 2;
  return 0;
}

function log(action, title, detail, who) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(LOG_SHEET) || ss.insertSheet(LOG_SHEET);
  if (sheet.getLastRow() === 0) sheet.appendRow(['Fecha', 'Quién', 'Acción', 'Canción', 'Detalle']);
  sheet.appendRow([new Date(), who || '', action, title || '', String(detail || '').slice(0, 500)]);
}

function writeFields(sheet, row, fields, allowed) {
  const changed = [];
  Object.keys(fields || {}).forEach((name) => {
    if (!allowed.some((a) => normalize(a) === normalize(name))) return;
    const col = column(sheet, name, true);
    const value = fields[name] == null ? '' : String(fields[name]);
    // El texto que empieza con = + - @ se guarda tal cual, nunca como fórmula.
    // Los números se guardan como número para que la app los lea igual que los escritos a mano.
    const cellValue = /^\d+(\.\d+)?$/.test(value) ? Number(value) : /^[=+\-@]/.test(value) ? "'" + value : value;
    sheet.getRange(row, col).setValue(cellValue);
    changed.push(name);
  });
  return changed;
}

function filesFolder() {
  const it = DriveApp.getFoldersByName(FILES_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FILES_FOLDER);
}

// ---------- acciones ----------
const ACTIONS = {
  check() {
    return { ok: true };
  },

  updateSong(p) {
    const sheet = sheetByGid(MAIN_GID);
    const row = findRow(sheet, p.title);
    if (!row) throw new Error('No encontré la canción "' + p.title + '".');
    const changed = writeFields(sheet, row, p.fields, MAIN_EDITABLE);
    log('Editar datos', p.title, changed.join(', '), p.who);
    return { ok: true, changed: changed };
  },

  addSong(p) {
    const title = String((p.fields || {})['Canción'] || '').trim();
    if (!title) throw new Error('Falta el nombre de la canción.');
    const sheet = sheetByGid(MAIN_GID);
    if (findRow(sheet, title)) throw new Error('Ya existe una canción llamada "' + title + '".');
    const row = sheet.getLastRow() + 1;
    writeFields(sheet, row, p.fields, MAIN_EDITABLE);
    const lyrics = sheetByGid(LYRICS_GID);
    if (!findRow(lyrics, title)) lyrics.getRange(lyrics.getLastRow() + 1, column(lyrics, 'Canción', true)).setValue(title);
    log('Agregar canción', title, '', p.who);
    return { ok: true };
  },

  updateTexts(p) {
    const sheet = sheetByGid(LYRICS_GID);
    let row = findRow(sheet, p.title);
    if (!row) {
      row = sheet.getLastRow() + 1;
      sheet.getRange(row, column(sheet, 'Canción', true)).setValue(p.title);
    }
    const changed = writeFields(sheet, row, p.fields, LYRICS_EDITABLE);
    log('Editar textos', p.title, changed.join(', '), p.who);
    return { ok: true, changed: changed };
  },

  upload(p) {
    const bytes = Utilities.base64Decode(p.data || '');
    if (!bytes.length) throw new Error('El archivo está vacío.');
    if (bytes.length > MAX_FILE_BYTES) throw new Error('El archivo pesa más de 10 MB.');
    const name = String(p.name || 'archivo').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
    const file = filesFolder().createFile(Utilities.newBlob(bytes, p.mimeType || 'application/octet-stream', p.title + ' · ' + name));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const sheet = sheetByGid(LYRICS_GID);
    let row = findRow(sheet, p.title);
    if (!row) {
      row = sheet.getLastRow() + 1;
      sheet.getRange(row, column(sheet, 'Canción', true)).setValue(p.title);
    }
    const col = column(sheet, 'Archivos', true);
    const cell = sheet.getRange(row, col);
    const line = name + ' | ' + file.getUrl();
    cell.setValue(cell.getValue() ? cell.getValue() + '\n' + line : line);
    log('Subir archivo', p.title, name, p.who);
    return { ok: true, url: file.getUrl() };
  },
};

// ---------- entrada desde la app ----------
function doPost(e) {
  let result;
  const lock = LockService.getScriptLock();
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const pin = PropertiesService.getScriptProperties().getProperty('PIN');
    if (!pin) throw new Error('Todavía no hay PIN. En la hoja usa el menú Zamar → Cambiar PIN de edición.');
    if (String(p.pin || '') !== pin) throw new Error('PIN incorrecto.');
    const action = ACTIONS[p.action];
    if (!action) throw new Error('Acción desconocida.');
    lock.waitLock(20000);
    result = action(p);
  } catch (err) {
    result = { ok: false, error: String((err && err.message) || err) };
  } finally {
    try {
      lock.releaseLock();
    } catch (ignored) {}
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, app: 'zamar' })).setMimeType(ContentService.MimeType.JSON);
}
