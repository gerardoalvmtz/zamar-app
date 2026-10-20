// Teoría musical básica: tonalidades, transposición de acordes y relación entre tonos.
// Sin dependencias, para que funcione igual en el navegador y en las pruebas con Node.

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SOLFEGE = { DO: 'C', RE: 'D', MI: 'E', FA: 'F', SOL: 'G', LA: 'A', SI: 'B' };

// Tonalidades que se escriben con bemoles (por clase de altura 0-11).
const FLAT_MAJOR = new Set([5, 10, 3, 8, 1, 6]); // F Bb Eb Ab Db Gb
const FLAT_MINOR = new Set([2, 7, 0, 5, 10, 3]); // Dm Gm Cm Fm Bbm Ebm

function accidentalOffset(acc) {
  if (acc === '#' || acc === '♯') return 1;
  if (acc === 'b' || acc === '♭') return -1;
  return 0;
}

/** Convierte un nombre de nota ("Bb", "F#", "Sol#") a clase de altura 0-11, o null. */
export function noteToPc(name) {
  if (!name) return null;
  let s = String(name).trim();
  const sol = s.match(/^(do|re|mi|fa|sol|la|si)/i);
  if (sol) s = SOLFEGE[sol[1].toUpperCase()] + s.slice(sol[1].length);
  const m = s.match(/^([A-Ga-g])([#♯b♭]?)$/);
  if (!m) return null;
  return (LETTER_PC[m[1].toUpperCase()] + accidentalOffset(m[2]) + 12) % 12;
}

/**
 * Lee una tonalidad escrita como en la hoja: "Bb", "Em", "F#m", "Re menor", "Sol".
 * Devuelve { pc, minor } o null si no se reconoce.
 */
export function parseKey(text) {
  if (!text) return null;
  let s = String(text).trim().replace(/\s+/g, ' ');
  if (!s) return null;
  const sol = s.match(/^(do|re|mi|fa|sol|la|si)/i);
  if (sol) s = SOLFEGE[sol[1].toUpperCase()] + s.slice(sol[1].length);
  const m = s.match(/^([A-Ga-g])([#♯b♭]?)\s*(m|min|minor|menor|-)?\s*(maj|mayor|major)?$/i);
  if (!m) return null;
  // "b" en minúscula justo después de la letra es bemol; la letra puede venir en minúscula.
  const pc = (LETTER_PC[m[1].toUpperCase()] + accidentalOffset(m[2]) + 12) % 12;
  return { pc, minor: Boolean(m[3]) };
}

export function useFlats(key) {
  if (!key) return false;
  return key.minor ? FLAT_MINOR.has(key.pc) : FLAT_MAJOR.has(key.pc);
}

export function pcName(pc, flats) {
  const i = ((pc % 12) + 12) % 12;
  return (flats ? FLAT_NAMES : SHARP_NAMES)[i];
}

export function keyName(key) {
  if (!key) return '';
  return pcName(key.pc, useFlats(key)) + (key.minor ? 'm' : '');
}

export function transposeKey(key, semitones) {
  if (!key) return null;
  return { pc: (((key.pc + semitones) % 12) + 12) % 12, minor: key.minor };
}

/** Semitonos para ir de una tonalidad a otra, en el rango -5..+6 (el camino más corto). */
export function semitonesBetween(from, to) {
  let d = (((to.pc - from.pc) % 12) + 12) % 12;
  if (d > 6) d -= 12;
  return d;
}

const CHORD_RE = /^([A-G])([#♯b♭]?)([^/\s]*)(?:\/([A-G])([#♯b♭]?))?$/;
// Lo que puede seguir a la raíz de un acorde: m, maj7, sus4, add9, dim, aug, 7, 9, (b5), +, º...
const QUALITY_RE = /^(m|min|maj|M|dim|aug|sus|add|º|°|ø|\+|-|\d|\(|\)|b|#|♭|♯)*$/;

/** ¿Este texto es un acorde? ("C", "F#m7", "Bb/D", "Gsus4") */
export function isChord(token) {
  const m = String(token).match(CHORD_RE);
  return Boolean(m) && QUALITY_RE.test(m[3]);
}

/** Transpone un acorde. flats decide si se escriben bemoles o sostenidos. */
export function transposeChord(chord, semitones, flats) {
  const m = String(chord).match(CHORD_RE);
  if (!m || !QUALITY_RE.test(m[3])) return chord;
  const root = pcName(LETTER_PC[m[1]] + accidentalOffset(m[2]) + semitones, flats);
  const bass = m[4] ? '/' + pcName(LETTER_PC[m[4]] + accidentalOffset(m[5]) + semitones, flats) : '';
  return root + m[3] + bass;
}

const CHORD_LINE_EXTRA = /^(\||\|\||-+|x\d+|\(x?\d+\)|\(|\)|%|\/|N\.?C\.?)$/i;

/** Una línea de solo acordes ("G   D/F#   Em   C"). */
export function isChordLine(line) {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  const chords = tokens.filter((t) => isChord(t.replace(/^\(|\)$/g, '')));
  return chords.length > 0 && tokens.every((t) => isChord(t.replace(/^\(|\)$/g, '')) || CHORD_LINE_EXTRA.test(t));
}

/** Transpone una línea de acordes intentando conservar la alineación con la letra de abajo. */
export function transposeChordLine(line, semitones, flats) {
  let out = '';
  let debt = 0; // caracteres que el acorde nuevo ocupó de más
  for (const part of line.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      const keep = Math.max(1, part.length - debt);
      debt -= part.length - keep;
      out += ' '.repeat(keep);
      continue;
    }
    const bare = part.replace(/^\(|\)$/g, '');
    const next = isChord(bare) ? part.replace(bare, transposeChord(bare, semitones, flats)) : part;
    debt += next.length - part.length;
    if (debt < 0) {
      out += next + ' '.repeat(-debt);
      debt = 0;
    } else {
      out += next;
    }
  }
  return out;
}

/**
 * Transpone un texto con acordes. Entiende dos formas comunes sin obligar a ninguna:
 * acordes entre corchetes dentro de la letra ("[G]Santo es el [D]Señor") y
 * líneas de acordes encima de la letra.
 */
export function transposeText(text, semitones, flats) {
  return String(text)
    .split('\n')
    .map((line) => {
      if (/\[[^\]]+\]/.test(line)) {
        return line.replace(/\[([^\]]+)\]/g, (all, inner) =>
          isChord(inner.trim()) ? `[${transposeChord(inner.trim(), semitones, flats)}]` : all,
        );
      }
      return isChordLine(line) ? transposeChordLine(line, semitones, flats) : line;
    })
    .join('\n');
}

/**
 * ¿Qué tan bien se conecta pasar de una tonalidad a otra?
 * Devuelve { score, label } con score 0 si no hay una relación cómoda.
 */
export function keyRelation(from, to) {
  if (!from || !to) return { score: 0, label: '' };
  const d = (((to.pc - from.pc) % 12) + 12) % 12;
  if (from.minor === to.minor) {
    if (d === 0) return { score: 3, label: 'Misma tonalidad' };
    if (d === 7) return { score: 2, label: 'Una quinta arriba' };
    if (d === 5) return { score: 2, label: 'Una cuarta arriba' };
    if (d === 1) return { score: 2, label: 'Sube medio tono' };
    if (d === 2) return { score: 2, label: 'Sube un tono' };
    if (d === 11) return { score: 1, label: 'Baja medio tono' };
    if (d === 10) return { score: 1, label: 'Baja un tono' };
    return { score: 0, label: '' };
  }
  if (!from.minor && d === 9) return { score: 3, label: 'Relativa menor' };
  if (from.minor && d === 3) return { score: 3, label: 'Relativa mayor' };
  if (d === 0) return { score: 1, label: from.minor ? 'Paralela mayor' : 'Paralela menor' };
  return { score: 0, label: '' };
}

export function bpmRelation(a, b) {
  if (!a || !b) return { score: 0, label: '' };
  const diff = Math.abs(a - b);
  if (diff <= 4) return { score: 2, label: 'BPM casi igual' };
  if (diff <= 10) return { score: 1, label: `BPM parecido (±${diff})` };
  if (diff >= 25) return { score: -1, label: `BPM muy distinto (±${diff})` };
  return { score: 0, label: '' };
}
