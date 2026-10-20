import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderChordSheet, lyricsFromChords, tabsFromChords, sheetKey, metadata } from '../js/chordpro.js';

const CHO = `{title: Canción de prueba}
{artist: Zamar}
{key: G}
{tempo: 72}
{start_of_verse: Verso 1}
[G]Primera [D]línea
[Em]Segunda
{end_of_verse}
{soc}
[C]Coro aquí
{eoc}
{sot: Riff}
e|---3---2---|
B|---------3-|
{eot}`;

test('lee los datos de cabecera de un .cho', () => {
  assert.equal(metadata(CHO).title, 'Canción de prueba');
  assert.equal(metadata(CHO).tempo, '72');
  assert.deepEqual(sheetKey(CHO), { pc: 7, minor: false });
});

test('dibuja secciones y transpone sin tocar los tabs', () => {
  const html = renderChordSheet(CHO, 2, false);
  assert.match(html, /<span class="section">Verso 1<\/span>/);
  assert.match(html, /class="block chorus"><span class="section">Coro<\/span>/);
  assert.match(html, /<span class="chord">A<\/span><span>Primera<\/span><\/span><\/span> /);
  // Cada palabra va junta, pero el renglón se puede partir entre palabras.
  assert.match(html, /<span class="w"><span class="cp"><span class="chord">D<\/span><span>Coro<\/span><\/span><\/span> aquí/);
  assert.match(html, /e\|---3---2---\|/);
  assert.doesNotMatch(html, /Canción de prueba/);
});

test('saca la letra limpia de una hoja de acordes', () => {
  assert.equal(lyricsFromChords(CHO), '[[Verso 1]]\nPrimera línea\nSegunda\nCoro aquí');
  assert.equal(lyricsFromChords('G   D\nSanto es\n'), 'Santo es');
});

test('extrae los tabs', () => {
  assert.equal(tabsFromChords(CHO), 'Riff\ne|---3---2---|\nB|---------3-|');
});
