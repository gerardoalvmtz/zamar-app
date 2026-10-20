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
// La agenda vive en el mismo archivo privado, en sus propias pestañas (se crean solas).
const EVENT_HEADERS = [
  'ID', 'Evento', 'Tipo', 'Estatus', 'Fecha', 'Hora', 'Llegada', 'Fin', 'Lugar', 'Dirección',
  'Contacto', 'Teléfono', 'Setlist', 'Notas', 'Creado', 'Actualizado',
];
const EVENT_EDITABLE = EVENT_HEADERS.filter((h) => ['ID', 'Creado', 'Actualizado'].indexOf(h) < 0);
// Se guardan como texto para que la hoja no las convierta en fechas u horas con otra zona horaria.
const EVENT_TEXT = ['Fecha', 'Hora', 'Llegada', 'Fin', 'Teléfono'];
const RSVP_HEADERS = ['Evento', 'Quién', 'Respuesta', 'Rol', 'Fecha'];
const RSVP_ANSWERS = ['Voy', 'Tal vez', 'No puedo'];
// Comentarios del equipo sobre una composición o sobre uno de sus audios (Audio = link del audio).
const COMMENT_HEADERS = ['ID', 'Composición', 'Audio', 'Quién', 'Comentario', 'Fecha'];
// Setlists del equipo. Canciones = JSON con [id de canción, tono] en orden.
// PDF = id del archivo en Drive con las letras para compartir por QR (uno por setlist; se reemplaza).
const SETLIST_HEADERS = ['ID', 'Nombre', 'Fecha', 'Canciones', 'Creado', 'Actualizado', 'Quién', 'PDF'];
const MAX_SETLIST_SONGS = 60;
const SETLIST_PDF_FOLDER = 'Zamar · Setlists para compartir';
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const PRIVATE_TABS = {
  Composiciones: COMP_HEADERS, Audios: AUDIO_HEADERS, Comentarios: COMMENT_HEADERS,
  Eventos: EVENT_HEADERS, Asistencia: RSVP_HEADERS, Setlists: SETLIST_HEADERS,
};
// Acciones que no piden PIN: ver, crear y editar setlists (borrarlos sí lo pide).
const OPEN_ACTIONS = ['listSetlists', 'saveSetlist', 'uploadSetlistPdf'];

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
  Object.keys(PRIVATE_TABS).forEach(compSheet);
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

function writeFields(sheet, row, fields, allowed, asText) {
  const changed = [];
  Object.keys(fields || {}).forEach((name) => {
    if (!allowed.some((a) => normalize(a) === normalize(name))) return;
    const col = column(sheet, name, true);
    const value = fields[name] == null ? '' : String(fields[name]);
    // El texto que empieza con = + - @ se guarda tal cual, nunca como fórmula.
    // Los números se guardan como número para que la app los lea igual que los escritos a mano.
    const text = (asText || []).some((a) => normalize(a) === normalize(name));
    const cellValue = text && value
      ? "'" + value
      : /^\d+(\.\d+)?$/.test(value) ? Number(value) : /^[=+\-@]/.test(value) ? "'" + value : value;
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
  const ss = compositionsFile();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(PRIVATE_TABS[name]);
  }
  return sheet;
}

/** Las fechas y horas escritas a mano en la hoja llegan a la app como texto legible. */
function cellText(v) {
  if (!(v instanceof Date)) return v;
  if (v.getFullYear() < 1900) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  return v.toISOString();
}

/** Filas de una pestaña como objetos { encabezado: valor }. */
function records(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const h = headers(sheet);
  return sheet.getRange(2, 1, last - 1, h.length).getValues().map((row) => {
    const o = {};
    h.forEach((name, i) => (o[name] = cellText(row[i])));
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
    return {
      ok: true,
      items: records(compSheet('Composiciones')),
      audios: records(compSheet('Audios')),
      comments: records(compSheet('Comentarios')),
    };
  },

  saveComposition(p) {
    const sheet = compSheet('Composiciones');
    let row = findById(sheet, p.id);
    const now = new Date();
    let id = p.id;
    if (!row) {
      if (!String((p.fields || {})['Título'] || '').trim()) throw new Error('Falta el título.');
      // Con letra al inicio para que la hoja nunca lo lea como número (por ejemplo 1e234567).
      id = 'c' + Utilities.getUuid().slice(0, 8);
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

  // El teléfono no siempre puede reproducir el link directo de Drive (sobre todo en iPhone),
  // así que el audio se manda desde aquí y la app lo toca desde la memoria.
  getAudio(p) {
    const id = String(p.fileId || '');
    const known = records(compSheet('Audios')).some((a) => id && String(a.Link).indexOf(id) >= 0);
    if (!known) throw new Error('No encontré ese audio.');
    const blob = DriveApp.getFileById(id).getBlob();
    return { ok: true, mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
  },

  addComment(p) {
    if (!findById(compSheet('Composiciones'), p.id)) throw new Error('No encontré la composición.');
    const text = String(p.text || '').trim().slice(0, 2000);
    if (!text) throw new Error('El comentario está vacío.');
    const comment = {
      ID: 'm' + Utilities.getUuid().slice(0, 8),
      'Composición': p.id,
      Audio: String(p.audio || '').slice(0, 300),
      'Quién': String(p.who || '').slice(0, 80),
      Comentario: text,
      Fecha: new Date().toISOString(),
    };
    // Un comentario que empieza con = + - @ se guarda como texto, nunca como fórmula.
    compSheet('Comentarios').appendRow(COMMENT_HEADERS.map((h) => (/^[=+\-@]/.test(comment[h]) ? "'" + comment[h] : comment[h])));
    log('Comentario', p.id, text.slice(0, 80), p.who);
    return { ok: true, comment: comment };
  },

  deleteComment(p) {
    const sheet = compSheet('Comentarios');
    const row = findById(sheet, p.commentId);
    if (!row) throw new Error('No encontré el comentario.');
    sheet.deleteRow(row);
    log('Borrar comentario', p.commentId, '', p.who);
    return { ok: true };
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

  // ---------- agenda ----------
  listAgenda() {
    return { ok: true, events: records(compSheet('Eventos')), rsvps: records(compSheet('Asistencia')) };
  },

  saveEvent(p) {
    const sheet = compSheet('Eventos');
    let row = findById(sheet, p.id);
    const now = new Date();
    let id = p.id;
    if (!row) {
      if (!String((p.fields || {}).Evento || '').trim()) throw new Error('Falta el nombre del evento.');
      id = 'e' + Utilities.getUuid().slice(0, 8);
      row = sheet.getLastRow() + 1;
      sheet.getRange(row, column(sheet, 'ID', true)).setValue(id);
      sheet.getRange(row, column(sheet, 'Creado', true)).setValue(now);
    }
    const changed = writeFields(sheet, row, p.fields, EVENT_EDITABLE, EVENT_TEXT);
    sheet.getRange(row, column(sheet, 'Actualizado', true)).setValue(now);
    log('Agenda', (p.fields || {}).Evento || id, changed.join(', '), p.who);
    return { ok: true, id: id };
  },

  deleteEvent(p) {
    const sheet = compSheet('Eventos');
    const row = findById(sheet, p.id);
    if (!row) throw new Error('No encontré el evento.');
    const title = records(sheet)[row - 2].Evento;
    sheet.deleteRow(row);
    const rsvps = compSheet('Asistencia');
    for (let r = rsvps.getLastRow(); r >= 2; r--) {
      if (String(rsvps.getRange(r, 1).getValue()) === String(p.id)) rsvps.deleteRow(r);
    }
    log('Borrar evento', title, '', p.who);
    return { ok: true };
  },

  // ---------- setlists ----------
  listSetlists() {
    const sets = records(compSheet('Setlists')).map((r) => {
      let items = [];
      try {
        items = JSON.parse(String(r.Canciones || '[]'));
      } catch (ignored) {}
      items = (Array.isArray(items) ? items : []).map((x) => ({ id: String(x[0] || ''), key: String(x[1] || '') }));
      return {
        id: String(r.ID),
        name: String(r.Nombre || ''),
        date: String(r.Fecha || '').slice(0, 10),
        items: items,
        pdf: r.PDF ? 'https://drive.google.com/file/d/' + r.PDF + '/view' : '',
      };
    });
    return { ok: true, setlists: sets.filter((x) => x.id) };
  },

  saveSetlist(p) {
    const id = String(p.id || '');
    if (!/^s[a-z0-9]{6,20}$/.test(id)) throw new Error('Setlist no válido.');
    const items = (Array.isArray(p.items) ? p.items : []).slice(0, MAX_SETLIST_SONGS).map((x) => [
      String((x && x.id) || '').slice(0, 120),
      String((x && x.key) || '').slice(0, 6),
    ]);
    const name = String(p.name || 'Setlist').trim().slice(0, 100) || 'Setlist';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(p.date || '')) ? String(p.date) : '';
    const sheet = compSheet('Setlists');
    let row = findById(sheet, id);
    const now = new Date();
    if (!row) {
      row = sheet.getLastRow() + 1;
      sheet.getRange(row, column(sheet, 'ID', true)).setValue(id);
      sheet.getRange(row, column(sheet, 'Creado', true)).setValue(now);
    }
    const values = { Nombre: name, Fecha: date, Canciones: JSON.stringify(items), 'Quién': String(p.who || '').slice(0, 80) };
    // Todo como texto: un nombre que empiece con = no se vuelve fórmula y la fecha no cambia de zona.
    Object.keys(values).forEach((h) => sheet.getRange(row, column(sheet, h, true)).setValue(values[h] ? "'" + values[h] : ''));
    sheet.getRange(row, column(sheet, 'Actualizado', true)).setValue(now);
    return { ok: true, id: id };
  },

  /** Sube el PDF con letras del setlist a Drive (público con el link) y reemplaza el anterior. */
  uploadSetlistPdf(p) {
    const sheet = compSheet('Setlists');
    const row = findById(sheet, p.id);
    if (!row) throw new Error('Primero guarda el setlist.');
    const bytes = Utilities.base64Decode(p.data || '');
    if (bytes.length < 5 || bytes.length > MAX_PDF_BYTES) throw new Error('El PDF no es válido o pesa más de 8 MB.');
    if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== '%PDF') throw new Error('El archivo no es un PDF.');
    const col = column(sheet, 'PDF', true);
    const old = String(sheet.getRange(row, col).getValue() || '');
    if (old) {
      try {
        DriveApp.getFileById(old).setTrashed(true);
      } catch (ignored) {}
    }
    const name = String(p.name || 'setlist.pdf').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
    const file = filesFolder(SETLIST_PDF_FOLDER).createFile(Utilities.newBlob(bytes, 'application/pdf', name));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    sheet.getRange(row, col).setValue(file.getId());
    log('PDF de setlist', records(sheet)[row - 2].Nombre, name, p.who);
    return { ok: true, url: 'https://drive.google.com/file/d/' + file.getId() + '/view' };
  },

  deleteSetlist(p) {
    const sheet = compSheet('Setlists');
    const row = findById(sheet, p.id);
    if (!row) return { ok: true };
    const rec = records(sheet)[row - 2];
    if (rec.PDF) {
      try {
        DriveApp.getFileById(String(rec.PDF)).setTrashed(true);
      } catch (ignored) {}
    }
    sheet.deleteRow(row);
    log('Borrar setlist', rec.Nombre, '', p.who);
    return { ok: true };
  },

  /** Quién va a un evento. Una fila por persona; respuesta vacía la quita. */
  rsvp(p) {
    if (!findById(compSheet('Eventos'), p.id)) throw new Error('No encontré el evento.');
    const name = String(p.name || '').trim().slice(0, 80);
    if (!name) throw new Error('Falta el nombre.');
    const answer = String(p.answer || '');
    if (answer && RSVP_ANSWERS.indexOf(answer) < 0) throw new Error('Respuesta no válida.');
    const sheet = compSheet('Asistencia');
    let row = 0;
    for (let r = 2; r <= sheet.getLastRow(); r++) {
      const v = sheet.getRange(r, 1, 1, 2).getValues()[0];
      if (String(v[0]) === String(p.id) && normalize(v[1]) === normalize(name)) row = r;
    }
    if (!answer) {
      if (row) sheet.deleteRow(row);
      return { ok: true, rsvp: null };
    }
    const rsvp = { Evento: p.id, 'Quién': name, Respuesta: answer, Rol: String(p.role || '').slice(0, 60), Fecha: new Date().toISOString() };
    const values = [RSVP_HEADERS.map((h) => (h === 'Quién' || h === 'Rol') && /^[=+\-@]/.test(rsvp[h]) ? "'" + rsvp[h] : rsvp[h])];
    if (row) sheet.getRange(row, 1, 1, RSVP_HEADERS.length).setValues(values);
    else sheet.appendRow(values[0]);
    log('Asistencia', p.id, name + ': ' + answer, p.who);
    return { ok: true, rsvp: rsvp };
  },
};

// ---------- entrada desde la app ----------
function doPost(e) {
  let result;
  const lock = LockService.getScriptLock();
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (OPEN_ACTIONS.indexOf(p.action) < 0) {
      const pin = PropertiesService.getScriptProperties().getProperty('PIN');
      if (!pin) throw new Error('Todavía no hay PIN. En la hoja usa el menú Zamar → Cambiar PIN de edición.');
      if (String(p.pin || '') !== pin) throw new Error('PIN incorrecto.');
    }
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
