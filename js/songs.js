// Lectura del repertorio: de filas de la hoja de cálculo a canciones, y sugerencias de conexión.
import { parseKey, keyRelation, bpmRelation } from './music.js';

/** Parser de CSV (RFC 4180): comillas, comas y saltos de línea dentro de celdas. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function normalize(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(s) {
  return normalize(s).replace(/ /g, '-') || 'cancion';
}

// Encabezados reconocidos (ya normalizados). Se buscan por nombre, así el orden
// de las columnas en la hoja puede cambiar y se pueden agregar columnas nuevas.
const COLUMNS = {
  title: ['cancion', 'titulo', 'nombre'],
  author: ['autor', 'artista', 'interprete'],
  themes: ['temas', 'tema', 'genero', 'generos', 'categoria'],
  catholic: ['catolica'],
  voice: ['voz principal', 'voz'],
  key: ['tonalidad', 'tono', 'key'],
  bpm: ['bpm', 'tempo'],
  status: ['estatus', 'estado'],
  propresenter: ['lyrics propresenter', 'letra propresenter'],
  chords: ['letra y acordes', 'acordes y letra', 'chordpro', 'cifrado'],
  lyrics: ['letra', 'lyrics'],
  notes: ['notas', 'comentarios', 'anotaciones'],
  link: ['link', 'enlace', 'youtube', 'video'],
};

function columnIndex(headers) {
  const norm = headers.map(normalize);
  const idx = {};
  for (const [field, names] of Object.entries(COLUMNS)) {
    const i = norm.findIndex((h) => names.includes(h));
    if (i >= 0) idx[field] = i;
  }
  return idx;
}

const yes = (v) => /^(si|s|yes|y|x|true|1)$/.test(normalize(v));

/** rows: matriz con encabezados en la primera fila (como la devuelve la hoja). */
export function rowsToSongs(rows) {
  if (!rows?.length) return [];
  const idx = columnIndex(rows[0]);
  if (idx.title === undefined) idx.title = 0;
  const get = (row, field) => (idx[field] === undefined ? '' : String(row[idx[field]] ?? '').trim());
  const seen = new Map();
  const songs = [];
  for (const row of rows.slice(1)) {
    const title = get(row, 'title');
    if (!title) continue;
    let id = slugify(title);
    const n = (seen.get(id) || 0) + 1;
    seen.set(id, n);
    if (n > 1) id += '-' + n;
    const keyText = get(row, 'key');
    const bpm = parseFloat(get(row, 'bpm').replace(',', '.'));
    songs.push({
      id,
      title,
      author: get(row, 'author'),
      themes: get(row, 'themes')
        .split(/\s*[/,;]\s*/)
        .map((t) => t.trim())
        .filter(Boolean),
      catholic: yes(get(row, 'catholic')),
      voice: get(row, 'voice'),
      keyText,
      key: parseKey(keyText),
      bpm: Number.isFinite(bpm) && bpm > 0 ? Math.round(bpm) : null,
      status: get(row, 'status'),
      propresenter: yes(get(row, 'propresenter')),
      chords: get(row, 'chords'),
      lyrics: get(row, 'lyrics'),
      notes: get(row, 'notes'),
      link: get(row, 'link'),
    });
  }
  return songs;
}

/**
 * Pestaña opcional "Letras" de la hoja: una fila por canción con su letra y su hoja de acordes,
 * para no llenar la pestaña principal de textos largos. Devuelve un Map por título normalizado.
 */
export function rowsToTexts(rows) {
  const texts = new Map();
  if (!rows?.length) return texts;
  const norm = rows[0].map(normalize);
  // Si la pestaña no existe, Google puede devolver la principal: esa no es la de letras.
  if (norm.includes('estatus')) return texts;
  const col = (names) => norm.findIndex((h) => names.includes(h));
  const title = col(COLUMNS.title);
  const lyrics = col(['letra', 'lyrics']);
  const chords = col(['acordes', ...COLUMNS.chords]);
  if (title < 0 || (lyrics < 0 && chords < 0)) return texts;
  for (const row of rows.slice(1)) {
    const t = normalize(row[title]);
    if (!t) continue;
    texts.set(t, {
      lyrics: lyrics < 0 ? '' : String(row[lyrics] ?? '').trim(),
      chords: chords < 0 ? '' : String(row[chords] ?? '').trim(),
    });
  }
  return texts;
}

/** Completa letra y acordes de cada canción con lo que haya en la pestaña "Letras". */
export function attachTexts(songs, texts) {
  for (const song of songs) {
    const t = texts.get(normalize(song.title));
    if (!t) continue;
    song.lyrics = song.lyrics || t.lyrics;
    song.chords = song.chords || t.chords;
  }
  return songs;
}

/**
 * Canciones que conectan bien con `song` si se toca en `key` (la tonalidad elegida,
 * que puede ser distinta de la original si se transpuso).
 */
export function suggestions(song, key, songs, limit = 8) {
  if (!key) return [];
  const themes = new Set(song.themes.map(normalize));
  return songs
    .filter((s) => s.id !== song.id && s.key)
    .map((s) => {
      const k = keyRelation(key, s.key);
      if (k.score === 0) return null;
      const b = bpmRelation(song.bpm, s.bpm);
      const shared = s.themes.find((t) => themes.has(normalize(t)));
      const reasons = [k.label, b.label, shared ? `Tema: ${shared}` : ''].filter(Boolean);
      return { song: s, score: k.score * 2 + b.score + (shared ? 1 : 0), reasons };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title, 'es'))
    .slice(0, limit);
}
