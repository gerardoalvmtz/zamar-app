import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bridges, tempoTip, motion } from '../js/bridges.js';
import { parseKey, keyName } from '../js/music.js';

const path = (o) => o.steps.map((s) => s.chord).join(' ');
const b = (a, c) => bridges(parseKey(a), parseKey(c));
const route = (r, name) => r.options.find((o) => o.name === name);

test('mide cuánto se mueven las voces entre dos acordes', () => {
  assert.equal(motion({ pc: 0, q: '' }, { pc: 0, q: '' }), 0);
  assert.equal(motion({ pc: 0, q: '' }, { pc: 4, q: 'm' }), 2); // C → Em: solo C baja a B
  assert.ok(motion({ pc: 0, q: '' }, { pc: 6, q: '' }) > motion({ pc: 0, q: '' }, { pc: 9, q: 'm' }));
});

test('tonos vecinos: acorde en común, con las notas que se sostienen', () => {
  const r = b('G', 'A');
  assert.equal(path(r.options[0]), 'G Bm E7 A');
  assert.deepEqual(r.options[0].steps[1].glue, ['B', 'D']);
  assert.equal(path(route(r, 'Disminuido de paso')), 'G G#°7 A');
  assert.ok(route(r, 'Subida'));
});

test('relativas: de mayor a su menor', () => {
  const r = b('D', 'Bm');
  assert.equal(r.closeness, 'near');
  assert.equal(path(r.options[0]), 'D F#sus4 F#7 Bm');
  assert.equal(path(route(r, 'ii – V')), 'D C#m7b5 F#7 Bm');
});

test('el IV que se vuelve menor, con el bajo caminando', () => {
  assert.equal(path(b('C', 'G').options[0]), 'C Cm G');
  const r = b('F', 'Ab');
  assert.equal(r.closeness, 'far');
  assert.equal(path(r.options[0]), 'F Db/F Dbm Ab');
  assert.equal(path(route(r, 'ii – V')), 'F Bbm7 Eb7 Ab');
  assert.equal(path(route(r, 'Dominante con sus')), 'F Ebsus4 Eb7 Ab');
  assert.match(r.tip, /Nota puente: F/);
  assert.equal(path(route(b('G', 'A'), 'Cuarto menor')), 'G D/F# Dm A');
});

test('tonos a tercera mayor: el aumentado como portal', () => {
  assert.equal(path(b('C', 'E').options[0]), 'C C+ E');
  assert.equal(path(route(b('Bb', 'D'), 'Aumentado')), 'Bb Bb+ D');
});

test('las notas se escriben según el acorde', () => {
  const cm = b('E', 'G').options[0].steps.find((s) => s.chord === 'Cm');
  assert.equal(cm.keys, 'C-Eb-G');
});

test('en todos los pares de tonos, el camino recomendado no hace saltar a la mano derecha', () => {
  const keys = [false, true].flatMap((minor) => Array.from({ length: 12 }, (_, pc) => ({ pc, minor })));
  for (const f of keys)
    for (const t of keys) {
      const best = bridges(f, t).options[0].steps;
      for (let i = 1; i < best.length; i++) {
        for (const n of best[i].notes) {
          const jump = Math.min(...best[i - 1].notes.map((p) => Math.abs(n - p)));
          assert.ok(jump <= 3, `${keyName(f)} → ${keyName(t)}: ${best[i - 1].chord} → ${best[i].chord} salta ${jump}`);
        }
      }
    }
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
