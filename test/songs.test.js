import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv, rowsToSongs, suggestions } from '../js/songs.js';
import { parseKey } from '../js/music.js';

test('parsea CSV con comillas, comas y saltos de línea', () => {
  const rows = parseCsv('a,b\n"x, y","línea 1\nlínea 2"\n"dice ""hola""",z');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'línea 1\nlínea 2'], ['dice "hola"', 'z']]);
});

test('lee el repertorio por nombre de columna', () => {
  const { rows } = JSON.parse(readFileSync(new URL('../data/repertorio.json', import.meta.url)));
  const songs = rowsToSongs(rows);
  assert.equal(songs.length, 71);
  const s = songs.find((x) => x.title === 'Aún en medio del dolor');
  assert.deepEqual(s.themes, ['Reflexión', 'Sanación', 'Heridas']);
  assert.equal(s.catholic, false);
  assert.equal(s.keyText, 'D');
  assert.equal(s.status, 'Pendiente repaso');
  assert.equal(new Set(songs.map((x) => x.id)).size, songs.length);
});

test('el orden de columnas puede cambiar y se aceptan columnas nuevas', () => {
  const songs = rowsToSongs([
    ['BPM', 'Tonalidad', 'Canción', 'Letra y acordes', 'Notas'],
    ['72', 'Em', 'Prueba', '[Em]Hola', 'Entrar en el coro'],
  ]);
  assert.equal(songs[0].bpm, 72);
  assert.equal(songs[0].chords, '[Em]Hola');
  assert.equal(songs[0].notes, 'Entrar en el coro');
});

test('sugiere primero la tonalidad y el BPM más cercanos', () => {
  const songs = rowsToSongs([
    ['Canción', 'Tonalidad', 'BPM', 'Temas'],
    ['Base', 'G', '70', 'Reflexión'],
    ['Igual', 'G', '72', 'Reflexión'],
    ['Relativa', 'Em', '120', 'Alabanza'],
    ['Lejana', 'Bb', '70', 'Reflexión'],
    ['Sin tono', '', '70', 'Reflexión'],
  ]);
  const base = songs[0];
  const out = suggestions(base, parseKey('G'), songs).map((x) => x.song.title);
  assert.deepEqual(out, ['Igual', 'Relativa']);
});
