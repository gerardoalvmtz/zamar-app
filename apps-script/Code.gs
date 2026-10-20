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
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
// Las composiciones van en una hoja aparte que NO es pública: solo se leen con el PIN.
const COMPOSITIONS_FILE = 'Zamar · Composiciones';
const AUDIO_FOLDER = 'Zamar · Audios de composiciones';
const COMP_HEADERS = ['ID', 'Título', 'Autores', 'Estado', 'Tono', 'BPM', 'Letra', 'Acordes', 'Notas', 'Creada', 'Actualizada'];
const AUDIO_HEADERS = ['Composición', 'Etiqueta', 'Archivo', 'Link', 'Fecha', 'Quién'];
const COMP_EDITABLE = ['Título', 'Autores', 'Estado', 'Tono', 'BPM', 'Letra', 'Acordes', 'Notas'];

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

/**
 * Córrelo una vez desde el editor (botón ▶ Ejecutar) después de pegar el código nuevo:
 * pide los permisos que faltan y crea en tu Drive la hoja privada de composiciones.
 */
function prepararComposiciones() {
  const ss = compositionsFile();
  filesFolder(AUDIO_FOLDER);
  Logger.log('Listo: ' + ss.getUrl());
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

function filesFolder(name) {
  const it = DriveApp.getFoldersByName(name || FILES_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name || FILES_FOLDER);
}

/** Hoja privada de composiciones; se crea en tu Drive la primera vez. */
function compositionsFile() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('COMPOSITIONS_ID');
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      // Si alguien borró el archivo se crea otro.
    }
  }
  const ss = SpreadsheetApp.create(COMPOSITIONS_FILE);
  const comps = ss.getSheets()[0];
  comps.setName('Composiciones');
  comps.appendRow(COMP_HEADERS);
  ss.insertSheet('Audios').appendRow(AUDIO_HEADERS);
  props.setProperty('COMPOSITIONS_ID', ss.getId());
  return ss;
}

function compSheet(name) {
  return compositionsFile().getSheetByName(name);
}

/** Filas de una pestaña como objetos { encabezado: valor }. */
function records(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const h = headers(sheet);
  return sheet.getRange(2, 1, last - 1, h.length).getValues().map((row) => {
    const o = {};
    h.forEach((name, i) => (o[name] = row[i] instanceof Date ? row[i].toISOString() : row[i]));
    return o;
  });
}

function findById(sheet, id) {
  const last = sheet.getLastRow();
  if (!id || last < 2) return 0;
  const values = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) if (String(values[i][0]) === String(id)) return i + 2;
  return 0;
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
    const file = filesFolder(FILES_FOLDER).createFile(Utilities.newBlob(bytes, p.mimeType || 'application/octet-stream', p.title + ' · ' + name));
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

  // ---------- composiciones ----------
  listCompositions() {
    return { ok: true, items: records(compSheet('Composiciones')), audios: records(compSheet('Audios')) };
  },

  saveComposition(p) {
    const sheet = compSheet('Composiciones');
    let row = findById(sheet, p.id);
    const now = new Date();
    let id = p.id;
    if (!row) {
      if (!String((p.fields || {})['Título'] || '').trim()) throw new Error('Falta el título.');
      id = Utilities.getUuid().slice(0, 8);
      row = sheet.getLastRow() + 1;
      sheet.getRange(row, column(sheet, 'ID', true)).setValue(id);
      sheet.getRange(row, column(sheet, 'Creada', true)).setValue(now);
    }
    const changed = writeFields(sheet, row, p.fields, COMP_EDITABLE);
    sheet.getRange(row, column(sheet, 'Actualizada', true)).setValue(now);
    log('Composición', (p.fields || {})['Título'] || id, changed.join(', '), p.who);
    return { ok: true, id: id };
  },

  uploadAudio(p) {
    if (!findById(compSheet('Composiciones'), p.id)) throw new Error('No encontré la composición.');
    const bytes = Utilities.base64Decode(p.data || '');
    if (!bytes.length) throw new Error('El audio está vacío.');
    if (bytes.length > MAX_AUDIO_BYTES) throw new Error('El audio pesa más de 25 MB.');
    const name = String(p.name || 'audio').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
    const file = filesFolder(AUDIO_FOLDER).createFile(Utilities.newBlob(bytes, p.mimeType || 'audio/mpeg', name));
    // Solo quien tenga el link (que solo se ve con el PIN) puede escucharlo.
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const audio = {
      'Composición': p.id,
      Etiqueta: String(p.label || '').slice(0, 200),
      Archivo: name,
      Link: file.getUrl(),
      Fecha: new Date().toISOString(),
      'Quién': String(p.who || '').slice(0, 80),
    };
    compSheet('Audios').appendRow(AUDIO_HEADERS.map((h) => audio[h]));
    log('Audio de composición', p.id, name, p.who);
    return { ok: true, audio: audio };
  },

  /** Pasa una composición terminada al repertorio (RESUMEN y Letras). */
  promoteComposition(p) {
    const sheet = compSheet('Composiciones');
    const row = findById(sheet, p.id);
    if (!row) throw new Error('No encontré la composición.');
    const c = records(sheet)[row - 2];
    const title = String(c['Título'] || '').trim();
    ACTIONS.addSong({
      who: p.who,
      fields: {
        'Canción': title,
        Autor: c.Autores,
        'Tonalidad Zamar': c.Tono,
        BPM: c.BPM,
        Estatus: 'Pendiente ensayo / Definir estructura',
      },
    });
    ACTIONS.updateTexts({ who: p.who, title: title, fields: { Letra: c.Letra, Acordes: c.Acordes } });
    writeFields(sheet, row, { Estado: 'En repertorio' }, COMP_EDITABLE);
    return { ok: true, title: title };
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
