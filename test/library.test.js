import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, chordsFor, sheetDegrees, songProgressions, majorOf } from '../js/library.js';
import { parseKey } from '../js/music.js';
import { chordsInSheet } from '../js/chordpro.js';

const names = (id, key, color) => chordsFor(CATALOG.find((p) => p.id === id), parseKey(key), color).map((c) => c.chord).join(' ');

test('18 progresiones, 9 en mayor y 9 que empiezan en menor', () => {
  assert.equal(CATALOG.length, 18);
  assert.equal(CATALOG.filter((p) => p.group === 'mayor').length, 9);
  assert.equal(new Set(CATALOG.map((p) => p.id)).size, 18);
});

test('acordes en el tono, sencillos y con color', () => {
  assert.equal(names('I-V-vi-IV', 'G'), 'G D Em C');
  assert.equal(names('vi-IV-I-V', 'Bb'), 'Gm Eb Bb F');
  assert.equal(names('I-V-vi-IV', 'D', true), 'Dadd9 Asus4 Bm7 Gmaj7');
});

test('lee los acordes de una hoja en orden', () => {
  const cho = '{key: G}\n[G]Santo [D]es\n{sot}\ne|--3--|\n{eot}\nEm   C/E\nletra';
  assert.deepEqual(chordsInSheet(cho), ['G', 'D', 'Em', 'C/E']);
  assert.deepEqual(chordsInSheet(cho, { shift: 2, unique: true }), ['A', 'E', 'F#m', 'D/F#']);
});

test('pasa una hoja a grados, también en tono menor', () => {
  const cho = '[G]a [Gsus4]b [D/F#]c [Em7]d [C]e [Bb]f';
  assert.deepEqual(sheetDegrees(cho, parseKey('G')), ['I', 'V', 'vi', 'IV', '?']);
  assert.deepEqual(sheetDegrees('[Em]a [C]b [G]c [D]d', parseKey('Em')), ['vi', 'IV', 'I', 'V']);
  assert.equal(majorOf(parseKey('Em')).pc, 7);
});

test('encuentra las progresiones que usa una canción', () => {
  const loop = '[G]a [D]b [Em]c [C]d\n'.repeat(4);
  const found = songProgressions(loop, parseKey('G'));
  assert.equal(found[0].id, 'I-V-vi-IV');
  // vi IV I V es la misma vuelta empezando en otro lado: no se repite.
  assert.ok(!found.some((h) => h.id === 'vi-IV-I-V'));
  assert.deepEqual(songProgressions('[G]a [C]b [D]c', parseKey('G')), []);
});

test('darle color: solo acordes sencillos del tono, la hoja sigue igual', async () => {
  const { colorChord, colorSheet } = await import('../js/library.js');
  const G = parseKey('G');
  assert.equal(colorChord('G', G), 'Gadd9');
  assert.equal(colorChord('C', G), 'Cmaj7');
  assert.equal(colorChord('D', G), 'Dsus4');
  assert.equal(colorChord('Em', G), 'Em7');
  assert.equal(colorChord('G/B', G), 'Gadd9/B');
  assert.equal(colorChord('D/F#', G), 'D/F#');
  assert.equal(colorChord('A7', G), 'A7');
  assert.equal(colorChord('Cm', G), 'Cm');
  assert.equal(colorChord('Dm', parseKey('Dm')), 'Dm7');
  const cho = '{key: G}\n[G]Santo [*C]es\nG   D\n{sot}\nG D\n{eot}';
  assert.equal(colorSheet(cho, G), '{key: G}\n[Gadd9]Santo [*Cmaj7]es\nGadd9 Dsus4\n{sot}\nG D\n{eot}');
});
