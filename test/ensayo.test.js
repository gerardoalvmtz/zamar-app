import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlan, planMinutes, availableMinutes, startTimes, pendingTasks, clock, programText, minutesText } from '../js/ensayo.js';

const plan = parsePlan(
  JSON.stringify({
    items: [
      { id: 'a', kind: 'topic', title: 'Oración', minutes: 10 },
      { id: 'b', kind: 'song', songId: 'abba', title: 'Abba', key: 'G', minutes: 15, done: true, notes: 'Final en ritardando' },
      { id: 'c', kind: 'song', songId: 'x', title: 'Aleluya', key: '', minutes: 20 },
    ],
    agreements: [{ id: 'g', text: 'Llegar 45 min antes el domingo' }],
    tasks: [{ id: 't', text: 'Sacar la armonía del coro', who: 'Ale', done: false }],
  }),
);
const e = { id: 'e1', title: 'Ensayo general', day: '2026-10-24', time: '17:00', end: '19:00' };

test('lee lo guardado y no truena con basura', () => {
  assert.equal(plan.items.length, 3);
  assert.deepEqual(parsePlan('no es json').items, []);
  assert.deepEqual(parsePlan('').tasks, []);
});

test('minutos del programa, horario disponible y hora de cada punto', () => {
  assert.equal(planMinutes(plan), 45);
  assert.equal(availableMinutes(e), 120);
  assert.equal(availableMinutes({ time: '22:00', end: '01:00' }), 180);
  assert.equal(availableMinutes({ time: '17:00', end: '' }), 0);
  assert.deepEqual(startTimes(e, plan), ['17:00', '17:10', '17:25']);
});

test('las tareas sin terminar pasan al siguiente ensayo', () => {
  const next = { id: 'e2', day: '2026-10-31', plan: parsePlan('') };
  const old = { id: 'e0', day: '2026-10-17', plan: parsePlan(JSON.stringify({ tasks: [{ id: 'z', text: 'Ya hecha', done: true }] })) };
  const list = pendingTasks([old, { ...e, plan }, next], next);
  assert.deepEqual(list.map((p) => p.task.text), ['Sacar la armonía del coro']);
  assert.deepEqual(pendingTasks([{ ...e, plan }, next], { ...e, plan }), []);
});

test('cronómetro', () => {
  assert.equal(clock(605), '10:05');
  assert.equal(clock(-75), '−1:15');
});

test('textos para el chat', () => {
  const p = programText(e, plan, '📅 sábado');
  assert.match(p, /17:10 🎵 Abba \(G\) · 15 min/);
  assert.match(p, /Total: 45 min/);
  const m = minutesText(e, { ...plan, present: ['Gerardo', 'Ale'] }, '📅 sábado');
  assert.match(m, /Asistieron: Gerardo, Ale/);
  assert.match(m, /Vimos:\n• Abba — Final en ritardando/);
  assert.match(m, /Quedó pendiente:\n• Oración\n• Aleluya/);
  assert.match(m, /☐ Sacar la armonía del coro — Ale/);
});
