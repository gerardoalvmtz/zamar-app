import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChord, voicings, positions, nearZone, diagramSvg } from '../js/guitar.js';

const shape = (v) => v.frets.map((f) => (f === null ? 'x' : f)).join(' ');
const shapes = (c) => positions(c).map(shape);

test('lee las notas de los acordes', () => {
  assert.deepEqual(parseChord('G').tones.sort((a, b) => a - b), [2, 7, 11]);
  assert.deepEqual(parseChord('Am7').tones.sort((a, b) => a - b), [0, 4, 7, 9]);
  assert.equal(parseChord('D/F#').bass, 6);
  assert.ok(parseChord('Cadd9').required.includes(2));
  assert.ok(parseChord('Bbmaj7').required.includes(9));
  assert.equal(parseChord('Hola'), null);
});

test('los acordes abiertos de siempre salen primero', () => {
  assert.equal(shapes('G')[0], '3 2 0 0 0 3');
  assert.equal(shapes('C')[0], 'x 3 2 0 1 0');
  assert.equal(shapes('D')[0], 'x x 0 2 3 2');
  assert.equal(shapes('Em')[0], '0 2 2 0 0 0');
  assert.equal(shapes('Am')[0], 'x 0 2 2 1 0');
  assert.equal(shapes('E')[0], '0 2 2 1 0 0');
});

test('cejillas conocidas y bajos correctos', () => {
  assert.ok(shapes('F').includes('1 3 3 2 1 1'));
  assert.ok(shapes('Bm').includes('x 2 4 4 3 2'));
  assert.equal(positions('F')[0].barre.fret, 1);
  assert.equal(shapes('D/F#')[0], '2 0 0 2 3 2');
  assert.equal(shapes('G/B')[0], 'x 2 0 0 0 3');
});

test('hasta 5 posiciones, del inicio hacia arriba del brazo', () => {
  for (const c of ['G', 'Bb', 'C#m', 'Ebmaj7', 'F#m7', 'Asus4', 'Eadd9']) {
    const p = positions(c);
    assert.ok(p.length >= 2 && p.length <= 5, c);
    const zones = p.map((v) => v.zone);
    assert.deepEqual(zones, [...zones].sort((a, b) => a - b), c);
  }
});

test('elige la digitación cerca de la mano', () => {
  assert.equal(shape(nearZone('C', 3)), 'x 3 5 5 5 3');
  assert.equal(nearZone('D', 5).barre.fret, 5);
});

test('el diagrama es un SVG con el nombre', () => {
  const svg = diagramSvg(voicings('F')[0], 'F');
  assert.match(svg, /^<svg class="gdiag"/);
  assert.match(svg, />F<\/text>/);
  assert.match(svg, /aria-label="F: 1 3 3 2 1 1"/);
  assert.match(diagramSvg(null, 'X'), /sin diagrama/);
});
