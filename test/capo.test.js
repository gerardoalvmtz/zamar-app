import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestCapo, shapeKey, capoLabel, easeScore } from '../js/capo.js';
import { parseKey, keyName } from '../js/music.js';

test('formas con capo: A con capo 2 son formas de G', () => {
  assert.equal(keyName(shapeKey(parseKey('A'), 2)), 'G');
  assert.equal(keyName(shapeKey(parseKey('Bb'), 3)), 'G');
  assert.equal(keyName(shapeKey(parseKey('C#m'), 4)), 'Am');
  assert.equal(capoLabel(parseKey('A'), 2), 'Capo 2 · formas de G');
  assert.equal(capoLabel(parseKey('A'), 0), 'Sin capo');
});

test('sugiere el capo que deja los acordes abiertos', () => {
  // I V vi IV en Bb: con capo 3 son G D Em C.
  const bb = ['Bb', 'F', 'Gm', 'Eb', 'Bb', 'F/A', 'Gm7', 'Eb'];
  assert.equal(bestCapo(bb, parseKey('Bb')).capo, 3);
  // En Ab: capo 1 (formas de G) o 4 (formas de E); gana el más bajo con más abiertos.
  const ab = ['Ab', 'Eb', 'Fm', 'Db'];
  const best = bestCapo(ab, parseKey('Ab'));
  assert.ok([1, 4].includes(best.capo));
  assert.equal(easeScore(ab, best.capo, parseKey('Ab')), 1);
});

test('si ya está en formas abiertas no sugiere capo', () => {
  assert.equal(bestCapo(['G', 'D', 'Em', 'C'], parseKey('G')).capo, 0);
  assert.equal(bestCapo([], null).capo, 0);
});
