import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitReps, sheetSections, parseParts, serializeParts, arrangement, editableParts, bassNote } from '../js/parts.js';

const SHEET = `{title: Tú El Único Rey}
{key: Bb}
Tono original: Bb

{c: CORO}
[Bb]Tú, el único [Gm]Rey, que tiene que rei[Eb]nar
El único Señ[F]or

{c: PRE-CORO}
Que alab[Eb]arte a ti S[F]eñor
sea si[Bb]empr[*Bb/A]e lo pr[Gm]imero

{c: CORO}

{c: INTERLUDIO}
[Eb]     [Bb]     [Cm]     [F]

{c: PUENTE    (x4)}
Y a [Eb]ti, toda la alab[Bb]anza`;

test('repeticiones en el nombre de la sección', () => {
  assert.deepEqual(splitReps('PUENTE    (x4)'), { label: 'PUENTE', reps: 4 });
  assert.deepEqual(splitReps('CORO x2'), { label: 'CORO', reps: 2 });
  assert.deepEqual(splitReps('Verso 1'), { label: 'Verso 1', reps: 1 });
});

test('secciones de una hoja de Songbook Pro', () => {
  const s = sheetSections(SHEET);
  assert.deepEqual(s.map((x) => x.label), ['CORO', 'PRE-CORO', 'CORO', 'INTERLUDIO', 'PUENTE']);
  assert.deepEqual(s[0].chords, ['Bb', 'Gm', 'Eb', 'F']);
  assert.deepEqual(s[1].chords, ['Eb', 'F', 'Bb', 'Gm']); // [*Bb/A] es anotación
  assert.equal(s[2].repeat, true);
  assert.deepEqual(s[2].chords, s[0].chords);
  assert.equal(s[3].lines.length, 0);
  assert.equal(s[4].reps, 4);
  assert.equal(s[0].lines[0], 'Tú, el único Rey, que tiene que reinar');
});

test('columna Partes ida y vuelta', () => {
  const text = 'CORO | 8 | Fuerte | Todos, Ale 3ra arriba | entra el bombo\nPUENTE x4 | 16 | Crece';
  const parts = parseParts(text);
  assert.equal(parts[0].voices, 'Todos, Ale 3ra arriba');
  assert.equal(parts[1].bars, 16);
  assert.equal(serializeParts(parts), text);
});

test('arreglo: sin anotar sale de la hoja, anotado toma acordes por nombre', () => {
  const raw = arrangement({ chords: SHEET, parts: '' });
  assert.equal(raw.annotated, false);
  assert.equal(raw.parts[4].est, 8); // 2 acordes x4
  const done = arrangement({ chords: SHEET, parts: 'Coro | 8 | Suave | Roberto\nPuente x2 | | Crece\nCORO | 8 | Fuerte | Todos' });
  assert.equal(done.annotated, true);
  assert.deepEqual(done.parts[0].chords, ['Bb', 'Gm', 'Eb', 'F']);
  assert.equal(done.parts[1].est, 4);
  assert.equal(done.parts[2].repeat, true);
  assert.equal(editableParts({ chords: SHEET, parts: '' })[4].label, 'PUENTE x4');
});

test('nota del bajo', () => {
  assert.equal(bassNote('D/F#'), 'F#');
  assert.equal(bassNote('Gm7'), 'G');
  assert.equal(bassNote('Bb', 2, false), 'C');
  assert.equal(bassNote('Bb/D', -3, false), 'B');
});
