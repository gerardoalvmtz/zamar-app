import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseKey,
  keyName,
  transposeKey,
  transposeChord,
  transposeText,
  isChordLine,
  keyRelation,
} from '../js/music.js';

test('lee las tonalidades como se escriben en la hoja', () => {
  assert.equal(keyName(parseKey('Bb')), 'Bb');
  assert.equal(keyName(parseKey('Gb')), 'Gb');
  assert.equal(keyName(parseKey('F#')), 'Gb');
  assert.equal(keyName(parseKey('Em')), 'Em');
  assert.equal(keyName(parseKey('Re menor')), 'Dm');
  assert.equal(keyName(parseKey('Sol')), 'G');
  assert.equal(keyName(parseKey('ab')), 'Ab');
  assert.equal(parseKey(''), null);
  assert.equal(parseKey('pendiente'), null);
});

test('transpone la tonalidad con la ortografía de la tonalidad destino', () => {
  assert.equal(keyName(transposeKey(parseKey('G'), 2)), 'A');
  assert.equal(keyName(transposeKey(parseKey('A'), 1)), 'Bb');
  assert.equal(keyName(transposeKey(parseKey('E'), -1)), 'Eb');
  assert.equal(keyName(transposeKey(parseKey('Em'), 3)), 'Gm');
});

test('transpone acordes con calidad y bajo', () => {
  assert.equal(transposeChord('G', 2, false), 'A');
  assert.equal(transposeChord('Bb/D', 2, false), 'C/E');
  assert.equal(transposeChord('F#m7', 1, false), 'Gm7');
  assert.equal(transposeChord('Csus4', 3, true), 'Ebsus4');
  assert.equal(transposeChord('Hola', 2, false), 'Hola');
});

test('reconoce líneas de acordes y no confunde la letra', () => {
  assert.ok(isChordLine('G     D/F#    Em   C'));
  assert.ok(isChordLine('| Am | F | C | G | x2'));
  assert.ok(!isChordLine('A ti te alabo'));
  assert.ok(!isChordLine('Santo es el Señor'));
});

test('transpone texto en ambos formatos', () => {
  const text = 'G       D\nSanto es el Señor\n[Em]Digno de [C]gloria';
  assert.equal(transposeText(text, 2, false), 'A       E\nSanto es el Señor\n[F#m]Digno de [D]gloria');
});

test('conserva la alineación cuando un acorde crece', () => {
  assert.equal(transposeText('C   G   Am', 1, false), 'C#  G#  A#m');
});

test('relaciones entre tonalidades', () => {
  const G = parseKey('G');
  assert.equal(keyRelation(G, parseKey('G')).label, 'Misma tonalidad');
  assert.equal(keyRelation(G, parseKey('Em')).label, 'Relativa menor');
  assert.equal(keyRelation(G, parseKey('D')).label, 'Una quinta arriba');
  assert.equal(keyRelation(G, parseKey('A')).label, 'Sube un tono');
  assert.equal(keyRelation(G, parseKey('Bb')).score, 0);
});
