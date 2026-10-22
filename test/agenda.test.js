import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayOf, timeOf, daysUntil, relative, nextEvent, parseSetlist, toEvent, toIcs, daysOf, dateRange, whenLabel } from '../js/agenda.js';

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

test('eventos de varios días: un retiro de viernes a domingo', () => {
  const e = toEvent({ ID: 'r1', Evento: 'Retiro', Fecha: '2026-11-06', 'Fecha fin': '2026-11-08', Hora: '18:00', Fin: '14:00' });
  assert.deepEqual(daysOf(e), ['2026-11-06', '2026-11-07', '2026-11-08']);
  assert.equal(dateRange(e), 'viernes 6 al domingo 8 de noviembre de 2026');
  assert.equal(whenLabel(e, '2026-11-07'), 'En curso');
  assert.equal(nextEvent([{ ...e, status: 'Confirmado' }], '2026-11-08').id, 'r1');
  assert.equal(nextEvent([{ ...e, status: 'Confirmado' }], '2026-11-09'), null);
  const ics = toIcs(e);
  assert.match(ics, /DTSTART:20261106T180000/);
  assert.match(ics, /DTEND:20261108T140000/);
  const allDay = toIcs(toEvent({ ID: 'r2', Evento: 'X', Fecha: '2026-10-30', 'Fecha fin': '2026-11-01' }));
  assert.match(allDay, /DTSTART;VALUE=DATE:20261030/);
  assert.match(allDay, /DTEND;VALUE=DATE:20261102/);
  assert.equal(dateRange(toEvent({ Fecha: '2026-10-30', 'Fecha fin': '2026-11-01' })), 'viernes 30 de octubre al domingo 1 de noviembre de 2026');
  // Un día final que no es posterior al inicio se ignora.
  assert.equal(toEvent({ Fecha: '2026-11-06', 'Fecha fin': '2026-11-06' }).endDay, '');
  assert.equal(toEvent({ Fecha: '2026-11-06', 'Fecha fin': '2026-11-01' }).endDay, '');
});
