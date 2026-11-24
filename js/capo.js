// Capo para guitarra: con el capo en el traste N se tocan las formas de N semitonos abajo y
// suena en el tono real. Aquí se calcula qué formas tocar y qué capo deja más acordes abiertos.
import { transposeChord, transposeKey, useFlats, keyName } from './music.js';

export const MAX_CAPO = 9;

// Qué tan cómoda es cada forma: abiertas = 1, F y Bm (cejilla corta) cuentan poco, el resto 0.
const EASY = { C: 1, D: 1, E: 1, G: 1, A: 1, Am: 1, Em: 1, Dm: 1, F: 0.4, Bm: 0.3 };

/** "G/B" → "G", "Am7" → "Am", "Dsus4" → "D", "Cmaj7" → "C", "F#m" → "F#m". */
function shapeOf(chord) {
  const m = String(chord).match(/^([A-G][#b]?)(m(?!aj))?/);
  return m ? m[1] + (m[2] || '') : '';
}

/** Tono de las formas con el capo puesto (A con capo 2 → formas de G). */
export function shapeKey(key, capo) {
  return key ? transposeKey(key, -capo) : null;
}

/** Semitonos que se mueve la hoja: los del tono elegido menos el capo. */
export function capoShift(shift, capo) {
  return shift - capo;
}

/** Calificación de 0 a 1: qué parte de los acordes queda en formas fáciles. */
export function easeScore(chords, capo, key = null) {
  if (!chords.length) return 0;
  const flats = useFlats(shapeKey(key, capo));
  let sum = 0;
  for (const c of chords) sum += EASY[shapeOf(transposeChord(c, -capo, flats))] || 0;
  return sum / chords.length;
}

/**
 * El capo (0 a 7) que deja más acordes abiertos. chords son los acordes como suenan, en
 * orden y repetidos (los que más se tocan pesan más). Solo sugiere capo si mejora de verdad.
 */
export function bestCapo(chords, key = null) {
  const base = easeScore(chords, 0, key);
  let best = { capo: 0, score: base };
  for (let capo = 1; capo <= 7; capo++) {
    const score = easeScore(chords, capo, key);
    if (score > best.score + 0.001) best = { capo, score };
  }
  return best.score - base >= 0.15 ? best : { capo: 0, score: base };
}

/** "Capo 2 · formas de G" para el selector. */
export function capoLabel(key, capo) {
  if (!capo) return 'Sin capo';
  return key ? `Capo ${capo} · formas de ${keyName(shapeKey(key, capo))}` : `Capo ${capo}`;
}
