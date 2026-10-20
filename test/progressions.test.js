import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOODS, suggest, degreeChord, toChordPro } from '../js/progressions.js';
import { parseKey } from '../js/music.js';

const names = (moodId, key, i = 0) => suggest(moodId, parseKey(key)).items[i].chords.map((c) => c.chord).join(' ');

test('la de siempre en Sol y en Si bemol', () => {
  assert.equal(names('alegre', 'G'), 'G D Em C');
  assert.equal(names('alegre', 'Bb'), 'Bb F Gm Eb');
});

test('tono menor usa los grados de la escala menor', () => {
  assert.equal(names('melancolica', 'Em'), 'Em C G D');
  assert.equal(names('suplica', 'Am'), 'Am Dm E E');
});

test('acordes prestados, extensiones y bajos', () => {
  const G = parseKey('G');
  assert.equal(degreeChord('♭VII', G).chord, 'F');
  assert.equal(degreeChord('♭VI', G).chord, 'Eb');
  assert.equal(degreeChord('iv', G).chord, 'Cm');
  assert.equal(degreeChord('Vsus4', G).chord, 'Dsus4');
  assert.equal(degreeChord('Imaj7', G).chord, 'Gmaj7');
  assert.equal(degreeChord('ii7', G).chord, 'Am7');
  assert.equal(degreeChord('I/III', G).chord, 'G/B');
  assert.equal(degreeChord('IV/I', parseKey('D')).chord, 'G/D');
  assert.equal(degreeChord('Iadd9', parseKey('E')).chord, 'Eadd9');
});

test('todos los grados de todos los ánimos se entienden en los 24 tonos', () => {
  for (const minor of [false, true])
    for (let pc = 0; pc < 12; pc++)
      for (const m of MOODS) {
        const r = suggest(m.id, { pc, minor });
        for (const p of r.items) assert.equal(p.chords.length, p.degrees.length, `${m.id} ${p.name} ${pc}${minor}`);
      }
});

test('sugiere la relativa cuando el modo no va con el ánimo', () => {
  assert.match(suggest('melancolica', parseKey('G')).tip, /Em/);
  assert.match(suggest('alegre', parseKey('Em')).tip, /G/);
  assert.equal(suggest('alegre', parseKey('G')).tip, '');
});

test('se puede pegar como ChordPro', () => {
  const r = suggest('alegre', parseKey('D'));
  assert.equal(toChordPro(r.items[0], r.mood), '{c: Coro · Alegre · La de siempre}\n[D] [A] [Bm] [G]\n');
});
