import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayOf, timeOf, daysUntil, relative, nextEvent, parseSetlist, toEvent, toIcs } from '../js/agenda.js';

test('fechas y horas escritas a mano o como texto', () => {
  assert.equal(dayOf('2026-10-25'), '2026-10-25');
  assert.equal(dayOf(''), '');
  assert.equal(timeOf('9:30'), '09:30');
  assert.equal(timeOf('18:00'), '18:00');
  assert.equal(timeOf(''), '');
});

test('cuenta regresiva', () => {
  assert.equal(daysUntil('2026-10-25', '2026-10-20'), 5);
  assert.equal(relative('2026-10-20', '2026-10-20'), 'Hoy');
  assert.equal(relative('2026-10-21', '2026-10-20'), 'Mañana');
  assert.equal(relative('2026-10-25', '2026-10-20'), 'En 5 días');
  assert.equal(relative('2026-11-17', '2026-10-20'), 'En 4 semanas');
});

test('el próximo evento ignora pasados y cancelados', () => {
  const evs = [
    { day: '2026-10-19', status: 'Confirmado', time: '' },
    { day: '2026-10-22', status: 'Cancelado', time: '' },
    { day: '2026-10-30', status: 'Invitación recibida', time: '' },
    { day: '2026-10-24', status: 'Confirmado', time: '19:00', id: 'b' },
    { day: '2026-10-24', status: 'Confirmado', time: '10:00', id: 'a' },
    { day: '', status: 'Confirmado', time: '' },
  ];
  assert.equal(nextEvent(evs, '2026-10-20').id, 'a');
  assert.equal(nextEvent([], '2026-10-20'), null);
});

test('setlist del evento', () => {
  assert.deepEqual(parseSetlist('Abba | G\n\nAleluya Hillsong\n'), [
    { title: 'Abba', key: 'G' },
    { title: 'Aleluya Hillsong', key: '' },
  ]);
});

test('archivo de calendario', () => {
  const e = toEvent({ ID: 'e1', Evento: 'Retiro, jóvenes', Fecha: '2026-10-25', Hora: '18:00', Lugar: 'San José' });
  const ics = toIcs(e);
  assert.match(ics, /DTSTART:20261025T180000/);
  assert.match(ics, /DTEND:20261025T200000/);
  assert.match(ics, /SUMMARY:Zamar · Retiro\\, jóvenes/);
  const allDay = toIcs(toEvent({ ID: 'e2', Evento: 'X', Fecha: '2026-10-31' }));
  assert.match(allDay, /DTSTART;VALUE=DATE:20261031/);
  assert.match(allDay, /DTEND;VALUE=DATE:20261101/);
});
