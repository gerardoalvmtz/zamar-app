import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderChordSheet, lyricsFromChords, tabsFromChords, sheetKey, metadata, chordSheetLines } from '../js/chordpro.js';

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

test('renglones para el PDF: acordes encima de la letra, transpuestos', () => {
  const lines = chordSheetLines('{title: X}\n{soc}\n[G]Santo, [D]santo es el [Em]Se[C]ñor\n{eoc}\n\nG  D', 2);
  assert.deepEqual(
    lines.map((l) => [l.type, l.text]),
    [
      ['section', 'Coro'],
      ['chords', 'A      E           F#m D'],
      ['lyric', 'Santo, santo es el Se--ñor'],
      ['blank', ''],
      ['chords', 'A  E'],
    ],
  );
  assert.equal(lines[1].pair, true);
});

test('los acordes marcados con * (Songbook Pro) también se transponen', () => {
  const lines = chordSheetLines('sea si[Bb]empr[*Bb/A]e lo pr[Gm]imero', 1);
  assert.equal(lines[0].text, '      B   B/A#   G#m');
});
