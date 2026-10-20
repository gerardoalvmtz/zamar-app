import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bridges, tempoTip } from '../js/bridges.js';
import { parseKey } from '../js/music.js';

const path = (o) => o.steps.map((s) => s.chord).join(' ');
const b = (a, c) => bridges(parseKey(a), parseKey(c));

test('tonos vecinos usan un acorde en común como pivote', () => {
  const r = b('G', 'A');
  assert.equal(r.options[0].name, 'Acorde en común');
  assert.equal(path(r.options[0]), 'G Bm E7 A');
  assert.ok(r.options.some((o) => o.name === 'Subida'));
});

test('relativas: de mayor a su menor', () => {
  const r = b('D', 'Bm');
  assert.equal(r.closeness, 'near');
  assert.equal(path(r.options[0]), 'D Em F#7 Bm');
  assert.equal(path(r.options.find((o) => o.name === 'ii – V')), 'D C#m7b5 F#7 Bm');
});

test('tonos lejanos: tónica a menor, ii–V y bemoles cuando toca', () => {
  const r = b('F', 'Ab');
  assert.equal(r.closeness, 'far');
  assert.equal(path(r.options[0]), 'F Fm Eb7 Ab');
  assert.equal(path(r.options.find((o) => o.name === 'ii – V')), 'F Bbm7 Eb7 Ab');
  assert.match(r.tip, /Nota puente: C/);
  assert.equal(path(r.options.find((o) => o.name === 'Dominante con sus')), 'F Ebsus4 Eb7 Ab');
});

test('sin acorde en común ni tónica útil, empieza con ii–V', () => {
  assert.equal(path(b('C', 'E').options[0]), 'C F#m7 B7 E');
  assert.equal(path(b('G', 'C#m').options[0]), 'G D#m7b5 G#7 C#m');
});

test('mismo tono', () => {
  const r = b('G', 'G');
  assert.equal(r.closeness, 'same');
  assert.equal(r.options.length, 1);
});

test('consejo de tempo solo si cambia bastante', () => {
  assert.equal(tempoTip(72, 76), '');
  assert.match(tempoTip(70, 130), /más rápido/);
  assert.match(tempoTip(130, 70), /más lento/);
});
