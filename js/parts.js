// Vista por instrumento ("Mi parte"): bajo, batería y voces.
// Las secciones salen de la hoja de acordes ({c: CORO}, {start_of_verse}…). El arreglo del
// equipo (compases, dinámica, quién canta y notas) vive en la columna "Partes" de la pestaña
// Letras, un renglón por sección en el orden en que se toca:
//   CORO | 8 | Fuerte | Todos, Ale 3ra arriba | entra el bombo | piano | eléctrica | acústica
// Las tres últimas (opcionales) son lo que hace cada instrumento: "arpegios en la mano derecha",
// "riff de la intro con delay", "rasgueo abajo-abajo-arriba".
import { isChord, isChordLine, transposeChord } from './music.js';
import { normalize } from './songs.js';
import { parseChord } from './guitar.js';

export const INSTRUMENTS = [
  { id: 'voces', label: 'Voces', icon: '🎤' },
  { id: 'acustica', label: 'Acústica', icon: '🪕' },
  { id: 'electrica', label: 'Eléctrica', icon: '🎸' },
  { id: 'piano', label: 'Piano', icon: '🎹' },
  { id: 'bajo', label: 'Bajo', icon: '🎶' },
  { id: 'bateria', label: 'Batería', icon: '🥁' },
];
// Columnas de cada renglón de "Partes", en orden.
export const PART_FIELDS = ['label', 'bars', 'dynamic', 'voices', 'note', 'piano', 'electrica', 'acustica'];
export const DYNAMICS = ['Suave', 'Media', 'Crece', 'Fuerte', 'Baja', 'Solo voces', 'Break'];

const DIRECTIVE = /^\s*\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/i;
const START = { soc: 'Coro', start_of_chorus: 'Coro', sov: 'Verso', start_of_verse: 'Verso', sob: 'Puente', start_of_bridge: 'Puente' };
const TAB_START = new Set(['sot', 'start_of_tab', 'sog', 'start_of_grid']);
const TAB_END = new Set(['eot', 'end_of_tab', 'eog', 'end_of_grid']);
const COMMENT = new Set(['c', 'comment', 'ci', 'comment_italic', 'cb', 'comment_box', 'highlight']);

/** "PUENTE    (x4)" → { label: 'PUENTE', reps: 4 }; "CORO x2" → { label: 'CORO', reps: 2 }. */
export function splitReps(text) {
  const t = String(text || '').trim();
  const m = t.match(/^(.*?)[\s(]*[x×]\s*(\d+)\s*\)?\s*$/i);
  return m && m[1].trim() ? { label: m[1].trim(), reps: Number(m[2]) } : { label: t, reps: 1 };
}

const key = (label) => normalize(splitReps(label).label);

/**
 * Secciones de la hoja en orden: [{ label, reps, chords: [...], lines: [letra sin acordes] }].
 * Una sección vacía con el nombre de una anterior ({c: CORO} solo) es esa misma que se repite.
 */
export function sheetSections(text) {
  const out = [];
  let cur = null;
  let inTab = false;
  const open = (title) => {
    const { label, reps } = splitReps(title);
    cur = { label, reps, chords: [], lines: [] };
    out.push(cur);
  };
  for (const raw of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const d = raw.match(DIRECTIVE);
    if (d) {
      const name = d[1].toLowerCase();
      if (TAB_START.has(name)) inTab = true;
      else if (TAB_END.has(name)) inTab = false;
      else if (START[name]) open(d[2] || START[name]);
      else if (COMMENT.has(name) && d[2]) open(d[2]);
      continue;
    }
    if (inTab || !cur) continue; // lo que va antes de la primera sección (tono, tempo) no cuenta
    let found = [];
    let lyric = raw;
    if (/\[[^\]]+\]/.test(raw)) {
      found = [...raw.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim()).filter((c) => !c.startsWith('*'));
      lyric = raw.replace(/\[[^\]]*\]/g, '');
    } else if (isChordLine(raw)) {
      found = raw.trim().split(/\s+/).map((t) => t.replace(/^\(|\)$/g, ''));
      lyric = '';
    }
    cur.chords.push(...found.filter(isChord));
    if (lyric.trim()) cur.lines.push(lyric.replace(/\s+/g, ' ').trim());
  }
  // Las repeticiones toman acordes y letra de la primera vez.
  const first = new Map();
  for (const s of out) {
    const k = key(s.label);
    if (s.chords.length || s.lines.length) {
      if (!first.has(k)) first.set(k, s);
    } else if (first.has(k)) {
      s.chords = first.get(k).chords;
      s.lines = first.get(k).lines;
      s.repeat = true;
    }
  }
  return out.filter((s) => s.label);
}

/** Celda "Partes" → [{ label, bars, dynamic, voices, note }]. */
export function parseParts(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cells = line.split('|').map((x) => x.trim());
      const p = Object.fromEntries(PART_FIELDS.map((f, i) => [f, cells[i] || '']));
      p.bars = Number(p.bars) || 0;
      return p;
    })
    .filter((p) => p.label);
}

/** Lo contrario de parseParts; sin barras de más al final de cada renglón. */
export function serializeParts(parts) {
  return parts
    .filter((p) => String(p.label || '').trim())
    .map((p) => PART_FIELDS.map((f) => (f === 'bars' ? p.bars || '' : p[f])).map((x) => String(x ?? '').replace(/[|\n]/g, ' ').trim()).join(' | ').replace(/(\s\|\s*)+$/, ''))
    .join('\n');
}

/** Compases aproximados: un acorde por compás, por las veces que se repite. */
export const estimateBars = (s) => s.chords.length * (s.reps || 1);

/**
 * El arreglo de la canción: las partes anotadas por el equipo o, si no hay, las secciones de
 * la hoja. Cada parte trae los acordes y la letra de su sección (buscada por nombre).
 */
export function arrangement(song) {
  const sections = sheetSections(song.chords);
  const byKey = new Map();
  for (const s of sections) if (!byKey.has(key(s.label)) && (s.chords.length || s.lines.length)) byKey.set(key(s.label), s);
  const parts = parseParts(song.parts);
  if (!parts.length) {
    return {
      annotated: false,
      parts: sections.map((s) => ({ ...blank(), label: s.label, reps: s.reps, est: estimateBars(s), chords: s.chords, lines: s.lines, repeat: s.repeat })),
    };
  }
  const seen = new Set();
  return {
    annotated: true,
    parts: parts.map((p) => {
      const { label, reps } = splitReps(p.label);
      const s = byKey.get(key(label));
      const k = key(label);
      const repeat = seen.has(k);
      seen.add(k);
      return { ...p, label, reps, est: s ? estimateBars({ ...s, reps }) : 0, chords: s?.chords || [], lines: s?.lines || [], repeat };
    }),
  };
}

/** Partes para el editor: las anotadas o, si no hay, una por sección de la hoja. */
export function editableParts(song) {
  const parts = parseParts(song.parts);
  if (parts.length) return parts;
  return sheetSections(song.chords).map((s) => ({ ...blank(), label: s.reps > 1 ? `${s.label} x${s.reps}` : s.label, bars: estimateBars(s) || 0 }));
}

/** Parte vacía con todas las columnas. */
export const blank = () => ({ ...Object.fromEntries(PART_FIELDS.map((f) => [f, ''])), bars: 0 });

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * Cómo tocar el acorde en piano: mano derecha en posición cerrada desde la raíz (alrededor del
 * Do central) y el bajo en la octava de abajo. Devuelve MIDI: { right: [...], bass } o null.
 */
export function pianoVoicing(chord) {
  const c = parseChord(chord);
  if (!c) return null;
  const pcs = c.tones.filter((pc) => c.bass === c.root || pc !== c.bass);
  let n = 60 + c.root - (c.root > 7 ? 12 : 0);
  const right = [n];
  for (const pc of pcs.filter((pc) => pc !== c.root)) {
    while (((n % 12) + 12) % 12 !== pc) n++;
    right.push(n);
  }
  return { right: right.sort((a, b) => a - b), bass: 48 + c.bass - (c.bass > 7 ? 12 : 0) };
}

export const midiName = (m) => NOTE_NAMES[((m % 12) + 12) % 12];

/** Teclado de dos octavas (Do3 a Si4 + lo que haga falta) con las notas del acorde marcadas. */
export function keyboardSvg(v, label = '') {
  if (!v) return '';
  const lo = Math.min(v.bass, ...v.right) - (Math.min(v.bass, ...v.right) % 12); // desde un Do
  const hi = Math.max(lo + 23, Math.max(...v.right));
  const W = 11;
  const H = 46;
  const whites = [];
  const blacks = [];
  let x = 0;
  for (let m = lo; m <= hi; m++) {
    const black = [1, 3, 6, 8, 10].includes(m % 12);
    const on = v.right.includes(m) ? 'r' : m === v.bass ? 'bass' : '';
    if (black) blacks.push(`<rect x="${x - 3.5}" y="0" width="7" height="28" rx="1" class="kb k${on}"/>`);
    else {
      whites.push(`<rect x="${x}" y="0" width="${W}" height="${H}" rx="1.5" class="kw k${on}"/>`);
      x += W;
    }
  }
  return `<svg class="keys" viewBox="-1 -1 ${x + 2} ${H + 2}" role="img" aria-label="${label} en piano">${whites.join('')}${blacks.join('')}</svg>`;
}

/** Nota del bajo de un acorde (la de abajo de la diagonal, o la raíz). */
export function bassNote(chord, shift = 0, flats = false) {
  const c = shift ? transposeChord(chord, shift, flats) : chord;
  const m = String(c).match(/^([A-G][#b]?)[^/]*(?:\/([A-G][#b]?))?/);
  return m ? m[2] || m[1] : '';
}

const DYN_CLASS = { suave: 'soft', baja: 'soft', 'solo voces': 'soft', media: 'mid', crece: 'up', fuerte: 'loud', break: 'brk' };

/** Dibuja la pestaña "Mi parte" para el instrumento elegido. */
export function partsHtml(song, { instrument, shift = 0, flats = false, esc, canEdit = false, editHref = '', capo = 0, shapeFlats = flats, diagrams = null }) {
  const picker = `<div class="basesel seg instsel" role="tablist" aria-label="Instrumento">${INSTRUMENTS.map(
    (i) => `<button data-inst="${i.id}" aria-selected="${instrument === i.id}">${i.icon} ${i.label}</button>`,
  ).join('')}</div>`;
  if (!instrument) return `${picker}<p class="hint">Elige tu instrumento. Se recuerda en este teléfono.</p>`;
  const { annotated, parts } = arrangement(song);
  if (!parts.length) {
    return `${picker}<p class="hint">Esta canción todavía no tiene hoja de acordes con secciones ({c: CORO}, {c: VERSO}…) ni arreglo anotado.</p>`;
  }
  const dyn = (p) => (p.dynamic ? `<span class="dyn ${DYN_CLASS[normalize(p.dynamic)] || ''}">${esc(p.dynamic)}</span>` : '');
  const reps = (p) => (p.reps > 1 ? ` <span class="reps">×${p.reps}</span>` : '');
  const bars = (p) => (p.bars ? `${p.bars} comp.` : p.est ? `≈${p.est} comp.` : '');
  const note = (p) => (p.note ? `<p class="pnote">${esc(p.note)}</p>` : '');
  const missing = annotated
    ? ''
    : `<p class="hint">Todavía no está anotado el arreglo (dinámica, quién canta, compases exactos).${
        canEdit && editHref ? ` <a href="${editHref}">✎ Anotarlo</a>` : ' Se anota desde ✎ Editar.'
      }</p>`;

  const uniq = (list) => [...new Set(list)];
  const tr = (c, by = shift, f = flats) => (by ? transposeChord(c, by, f) : c);
  const own = (p, field) => (p[field] ? `<p class="pown">${esc(p[field])}</p>` : '');

  let body = '';
  if (instrument === 'piano') {
    body = parts
      .map((p) => {
        const chords = uniq(p.chords.map((c) => tr(c)));
        const voiced = chords.map((c) => ({ c, v: pianoVoicing(c) })).filter((x) => x.v);
        // ▶ con el piano de la app: cada acorde de la sección, un compás cada uno.
        const play = p.chords.map((c) => pianoVoicing(tr(c))).filter(Boolean).map((v) => [...v.right, v.bass]);
        return `<div class="part">
          <div class="phead"><span class="plabel">${esc(p.label)}${reps(p)}</span>${dyn(p)}</div>
          ${own(p, 'piano')}
          ${
            p.repeat
              ? `<p class="hint">Igual que antes: ${esc(chords.join(' · '))}</p>`
              : voiced.length
                ? `<div class="kbgrid">${voiced
                    .map(
                      ({ c, v }) => `<figure class="kbcell"><figcaption><strong>${esc(c)}</strong> <span>${esc(v.right.map(midiName).join(' '))} · bajo ${esc(midiName(v.bass))}</span></figcaption>${keyboardSvg(v, esc(c))}</figure>`,
                    )
                    .join('')}</div>
                   <button type="button" class="ghost small" data-bridgeplay="${esc(JSON.stringify(play))}" data-bpm="${song.bpm || 72}">▶ Escuchar</button>`
                : '<p class="hint">Sin acordes en esta sección.</p>'
          }
          ${note(p)}
        </div>`;
      })
      .join('');
    body = `<p class="hint">Cada acorde en el teclado: la mano derecha en posición cerrada (rojo) y el bajo en la mano izquierda (gris oscuro).</p>${body}`;
  } else if (instrument === 'acustica' || instrument === 'electrica') {
    const field = instrument;
    const gShift = shift - capo;
    body = parts
      .map((p) => {
        const chords = p.chords.map((c) => tr(c, gShift, shapeFlats));
        const set = uniq(chords);
        return `<div class="part">
          <div class="phead"><span class="plabel">${esc(p.label)}${reps(p)}</span>${dyn(p)}</div>
          ${own(p, field)}
          ${
            chords.length
              ? `<p class="pchords gch">${chords.map((c) => `<span data-gchord="${esc(c)}">${esc(c)}</span>`).join(' ')}</p>
                 ${!p.repeat && diagrams && set.length ? diagrams(set) : ''}`
              : '<p class="hint">Sin acordes en esta sección.</p>'
          }
          ${note(p)}
        </div>`;
      })
      .join('');
    const head = [
      capo ? `Con capo ${capo} (el que elegiste en Acordes).` : '',
      'Toca un acorde para ver todas sus posiciones.',
      instrument === 'electrica' && song.tabs ? 'Los riffs escritos están en la pestaña Tabs.' : '',
    ].filter(Boolean);
    body = `<p class="hint">${head.join(' ')}</p>${body}`;
  } else if (instrument === 'bajo') {
    body = parts
      .map((p) => {
        const notes = p.chords.map((c) => bassNote(c, shift, flats)).filter(Boolean);
        return `<div class="part">
          <div class="phead"><span class="plabel">${esc(p.label)}${reps(p)}</span>${dyn(p)}</div>
          ${
            p.repeat
              ? `<p class="hint">Igual que antes${notes.length ? `: <span class="bassline">${esc(notes.join(' · '))}</span>` : ''}</p>`
              : notes.length
                ? `<p class="bassline">${esc(notes.join(' · '))}</p>
                   <p class="pchords">${esc(p.chords.map((c) => (shift ? transposeChord(c, shift, flats) : c)).join('  '))}</p>`
                : '<p class="hint">Sin acordes en esta sección.</p>'
          }
          ${note(p)}
        </div>`;
      })
      .join('');
    body = `<p class="hint">Notas del bajo por sección: la raíz de cada acorde o la nota después de la diagonal (D/F# → F#).</p>${body}`;
  } else if (instrument === 'bateria') {
    const total = parts.reduce((n, p) => n + (p.bars || p.est || 0), 0);
    const mins = song.bpm && total ? (total * 4 * 60) / song.bpm / 60 : 0;
    body = `<div class="drumhead">
        <div><span class="label">BPM</span><span class="big">${song.bpm || '—'}</span></div>
        ${total ? `<div><span class="label">Compases</span><span class="big">${annotated ? '' : '≈'}${total}</span></div>` : ''}
        ${mins ? `<div><span class="label">Dura</span><span class="big">≈${Math.floor(mins)}:${String(Math.round((mins % 1) * 60)).padStart(2, '0')}</span></div>` : ''}
      </div>
      <ol class="drummap">${parts
        .map(
          (p) => `<li class="part">
            <div class="phead"><span class="plabel">${esc(p.label)}${reps(p)}</span><span class="pbars">${bars(p)}</span>${dyn(p)}</div>
            ${note(p)}
          </li>`,
        )
        .join('')}</ol>
      <p class="hint">Para el click al tempo, usa 🎤 Modo escenario.</p>`;
  } else {
    body = parts
      .map(
        (p) => `<div class="part">
          <div class="phead"><span class="plabel">${esc(p.label)}${reps(p)}</span>${dyn(p)}</div>
          ${p.voices ? `<p class="pvoices">🎤 ${esc(p.voices)}</p>` : ''}
          ${p.repeat ? '<p class="hint">Igual que antes.</p>' : p.lines.length ? `<p class="plyrics">${p.lines.map(esc).join('<br>')}</p>` : ''}
          ${note(p)}
        </div>`,
      )
      .join('');
  }
  return `${picker}${missing}<div class="parts ${instrument}">${body}</div>`;
}
