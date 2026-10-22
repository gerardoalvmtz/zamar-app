// Agenda del ministerio: eventos a los que nos invitan, su estatus y quién va.
// Vive en la hoja privada (junto a las composiciones) y se lee con el PIN.
// La última copia se guarda en el teléfono para verla sin internet y para
// mostrar el próximo evento en la pantalla principal.
import { setupApi } from './api.js';
import { normalize } from './songs.js';
import { keyName } from './music.js';
import { allSetlists, encodeSetlist } from './setlists.js';
import { setupEnsayo, parsePlan, hasPlan, planMinutes } from './ensayo.js';

export const STATUSES = ['Invitación recibida', 'Pendiente de detalles', 'Confirmado', 'Realizado', 'Cancelado'];
export const TYPES = ['Misa', 'Hora santa', 'Retiro', 'Congreso', 'Concierto', 'Boda', 'XV años', 'Evangelización', 'Ensayo', 'Otro'];
const ANSWERS = ['Voy', 'Tal vez', 'No puedo'];
const ROLES = ['Voz', 'Coros', 'Guitarra', 'Bajo', 'Teclado', 'Batería', 'Percusión', 'Sonido', 'Otro'];
const CACHE = 'zamar:agenda';
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// ---------- fechas (todo en la hora local del teléfono) ----------
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());

/** Acepta "2026-10-25" o una fecha completa que venga de la hoja. */
export function dayOf(v) {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return s && !isNaN(d) ? ymd(d) : '';
}

export function timeOf(v) {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${pad(m[1])}:${m[2]}`;
  const d = new Date(s);
  return s.includes('T') && !isNaN(d) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
}

const asDate = (day) => new Date(day + 'T12:00:00');
const addDays = (day, n) => ymd(new Date(asDate(day).getTime() + n * 86400000));
/** Último día del evento: el mismo día, o el día final si dura varios (un retiro de viernes a domingo). */
export const lastDay = (e) => e.endDay || e.day;
/** Todos los días que ocupa el evento. */
export function daysOf(e) {
  if (!e.day) return [];
  const out = [e.day];
  while (out[out.length - 1] < lastDay(e) && out.length < 31) out.push(addDays(out[out.length - 1], 1));
  return out;
}
export const daysUntil = (day, from = today()) => Math.round((asDate(day) - asDate(from)) / 86400000);

export function relative(day, from = today()) {
  const n = daysUntil(day, from);
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  if (n === -1) return 'Ayer';
  if (n > 1) return n < 14 ? `En ${n} días` : n < 60 ? `En ${Math.round(n / 7)} semanas` : `En ${Math.round(n / 30)} meses`;
  return `Hace ${-n} días`;
}

const longDay = (day) =>
  day ? asDate(day).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Fecha por definir';

/** "viernes 6 al domingo 8 de noviembre de 2026", o la fecha sola si es de un día. */
export function dateRange(e) {
  if (!e.day || !e.endDay) return longDay(e.day);
  const a = asDate(e.day);
  const b = asDate(e.endDay);
  const wd = (d) => d.toLocaleDateString('es-MX', { weekday: 'long' });
  const month = (d) => d.toLocaleDateString('es-MX', { month: 'long' });
  const tail = `${b.getDate()} de ${month(b)} de ${b.getFullYear()}`;
  if (a.getFullYear() !== b.getFullYear()) return `${wd(a)} ${a.getDate()} de ${month(a)} de ${a.getFullYear()} al ${wd(b)} ${tail}`;
  if (a.getMonth() !== b.getMonth()) return `${wd(a)} ${a.getDate()} de ${month(a)} al ${wd(b)} ${tail}`;
  return `${wd(a)} ${a.getDate()} al ${wd(b)} ${tail}`;
}

/** Como relative(), pero un evento de varios días que ya empezó dice "En curso". */
export function whenLabel(e, from = today()) {
  if (e.endDay && e.day < from && e.endDay >= from) return 'En curso';
  return relative(e.day, from);
}
const shortDay = (day) => (day ? asDate(day).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Sin fecha');
const monthName = (y, m) => new Date(y, m, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

export const statusClass = (s) =>
  ({ Confirmado: 'ok', 'Pendiente de detalles': 'warn', 'Invitación recibida': 'warn', Cancelado: 'bad', Realizado: 'none' })[s] || 'none';

const active = (e) => e.status !== 'Cancelado' && e.status !== 'Realizado';

export function toEvent(r) {
  return {
    id: String(r.ID || ''),
    title: String(r.Evento || ''),
    type: String(r.Tipo || ''),
    status: String(r.Estatus || 'Invitación recibida'),
    day: dayOf(r.Fecha),
    endDay: dayOf(r['Fecha fin']) > dayOf(r.Fecha) && dayOf(r.Fecha) ? dayOf(r['Fecha fin']) : '',
    time: timeOf(r.Hora),
    arrive: timeOf(r.Llegada),
    end: timeOf(r.Fin),
    place: String(r.Lugar || ''),
    address: String(r['Dirección'] || ''),
    contact: String(r.Contacto || ''),
    phone: String(r['Teléfono'] || ''),
    setlist: String(r.Setlist || ''),
    notes: String(r.Notas || ''),
    plan: r.Ensayo ? parsePlan(r.Ensayo) : null,
  };
}

/** El siguiente evento vigente (hoy en adelante, o en curso), sin contar cancelados. */
export function nextEvent(events, from = today()) {
  return events
    .filter((e) => e.day && lastDay(e) >= from && active(e))
    .sort((a, b) => a.day.localeCompare(b.day) || (a.time || '99').localeCompare(b.time || '99'))[0] || null;
}

const byDate = (a, b) => (a.day || '9999').localeCompare(b.day || '9999') || (a.time || '99').localeCompare(b.time || '99');

/** Setlist guardado en el evento: una canción por línea, "Título | Tono". */
export const parseSetlist = (text) =>
  String(text || '')
    .split('\n')
    .map((l) => l.split('|').map((x) => x.trim()))
    .filter(([t]) => t)
    .map(([title, key]) => ({ title, key: key || '' }));

const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
const stamp = (day, time) => day.replace(/-/g, '') + (time ? 'T' + time.replace(':', '') + '00' : '');

function addHours(day, time, h) {
  const d = new Date(`${day}T${time}:00`);
  d.setHours(d.getHours() + h);
  return [ymd(d), `${pad(d.getHours())}:${pad(d.getMinutes())}`];
}

/**
 * Inicio y fin para el calendario. Con hora: del inicio del primer día a la hora de fin del
 * último (si no hay fin, dos horas). Sin hora: días completos, hasta el día siguiente al último.
 */
function calendarDates(e) {
  if (e.time) {
    if (e.endDay) return [stamp(e.day, e.time), e.end ? stamp(e.endDay, e.end) : stamp(e.endDay)];
    const [d2, t2] = e.end ? [e.end < e.time ? addHours(e.day, e.end, 24)[0] : e.day, e.end] : addHours(e.day, e.time, 2);
    return [stamp(e.day, e.time), stamp(d2, t2)];
  }
  return [stamp(e.day), stamp(addDays(lastDay(e), 1))];
}

function calendarSpan(e) {
  const [a, b] = calendarDates(e);
  const allDay = !a.includes('T');
  // Un evento con hora de inicio pero sin hora de fin termina el último día completo.
  if (!allDay && !b.includes('T')) return [`DTSTART:${a}`, `DTEND;VALUE=DATE:${stamp(addDays(lastDay(e), 1))}`];
  return allDay ? [`DTSTART;VALUE=DATE:${a}`, `DTEND;VALUE=DATE:${b}`] : [`DTSTART:${a}`, `DTEND:${b}`];
}

/** Archivo de calendario para iPhone, Outlook o cualquier app. */
export function toIcs(e) {
  const [start, end] = calendarSpan(e);
  const desc = [e.status, e.arrive && `Llegar ${e.arrive}`, e.contact && `Contacto: ${e.contact} ${e.phone}`, e.notes].filter(Boolean).join('\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Zamar Adoracion//Agenda//ES',
    'BEGIN:VEVENT',
    `UID:${e.id}@zamar-app`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    start,
    end,
    `SUMMARY:${icsText('Zamar · ' + e.title)}`,
    `LOCATION:${icsText([e.place, e.address].filter(Boolean).join(', '))}`,
    `DESCRIPTION:${icsText(desc)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function googleCalendarUrl(e) {
  let [a, b] = calendarDates(e);
  if (a.includes('T') && !b.includes('T')) b = stamp(lastDay(e), '23:59');
  const dates = `${a}/${b}`;
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'Zamar · ' + e.title,
    dates,
    location: [e.place, e.address].filter(Boolean).join(', '),
    details: [e.status, e.arrive && `Llegar ${e.arrive}`, e.notes].filter(Boolean).join('\n'),
  });
  return 'https://calendar.google.com/calendar/render?' + q;
}

const mapsUrl = (e) =>
  /^https?:\/\//.test(e.address)
    ? e.address
    : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([e.place, e.address].filter(Boolean).join(', '));

/** Teléfono para WhatsApp: si son 10 dígitos se asume México (+52). */
function waNumber(phone) {
  const d = String(phone).replace(/\D/g, '');
  if (d.length === 10) return '52' + d;
  return d.length > 10 ? d : '';
}

/** ctx: { app, store, esc, backHeader, homeHeader, songs } desde app.js */
export function setupAgenda(ctx) {
  const { app, store, esc, backHeader, homeHeader, songs } = ctx;
  const { api, who } = setupApi(store);
  const data = { events: null, rsvps: [], fresh: false, error: '' };
  const view = { mode: store.get('zamar:agendaview', 'lista'), month: null, day: '' };

  const fromCache = () => {
    const c = store.get(CACHE);
    if (!c?.events) return false;
    data.events = c.events.map(toEvent).filter((e) => e.id && e.title);
    data.rsvps = c.rsvps || [];
    return true;
  };

  async function load() {
    try {
      const res = await api('listAgenda');
      store.set(CACHE, { events: res.events, rsvps: res.rsvps, at: new Date().toISOString() });
      fromCache();
      data.fresh = true;
      data.error = '';
    } catch (err) {
      data.error = err.message;
    }
  }

  // Guarda en el teléfono lo que se acaba de cambiar, para que la copia no se quede atrás.
  function saveCache() {
    const back = (e) => ({
      ID: e.id, Evento: e.title, Tipo: e.type, Estatus: e.status, Fecha: e.day, 'Fecha fin': e.endDay, Hora: e.time, Llegada: e.arrive, Fin: e.end,
      Lugar: e.place, 'Dirección': e.address, Contacto: e.contact, 'Teléfono': e.phone, Setlist: e.setlist, Notas: e.notes,
      Ensayo: e.plan ? JSON.stringify(e.plan) : '',
    });
    store.set(CACHE, { events: data.events.map(back), rsvps: data.rsvps, at: new Date().toISOString() });
  }

  const byId = (id) => data.events?.find((e) => e.id === id);
  const rsvpsOf = (id) => data.rsvps.filter((r) => String(r.Evento) === id);
  const going = (id) => rsvpsOf(id).filter((r) => r.Respuesta === 'Voy');
  /** Todas las personas que alguna vez han respondido: así se sabe a quién le falta. */
  const people = () => {
    const seen = new Map();
    data.rsvps.forEach((r) => seen.set(normalize(r['Quién']), String(r['Quién'])));
    return [...seen.values()].sort((a, b) => a.localeCompare(b, 'es'));
  };

  /** Muestra lo guardado al instante y trae lo nuevo por detrás. */
  async function ensure(then) {
    if (data.fresh) return then();
    if (data.events || fromCache()) {
      const h = location.hash;
      then();
      await load();
      if (data.fresh && location.hash === h) then();
      return;
    }
    app.innerHTML = `${homeHeader('agenda')}<p class="empty">Cargando agenda…</p>`;
    await load();
    if (!data.events) {
      app.innerHTML = `${homeHeader('agenda')}
        <article class="detail">
          <p class="empty">${esc(data.error || 'No se pudo cargar la agenda.')}</p>
          <button data-action="agenda-retry">Intentar de nuevo</button>
        </article>`;
      app.querySelector('[data-action="agenda-retry"]').addEventListener('click', () => ensure(then));
      return;
    }
    then();
  }

  // ---------- piezas ----------
  function dateBlock(e) {
    if (!e.day) return '<span class="datebox muted"><b>?</b><small>sin fecha</small></span>';
    const d = asDate(e.day);
    if (e.endDay) {
      const f = asDate(e.endDay);
      const wd = (x) => x.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '');
      return `<span class="datebox range"><b>${d.getDate()}–${f.getDate()}</b><small>${esc(wd(d))}–${esc(wd(f))}</small></span>`;
    }
    return `<span class="datebox"><b>${d.getDate()}</b><small>${esc(d.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', ''))}</small></span>`;
  }

  function eventRow(e) {
    const n = going(e.id).length;
    const sub = [e.time, e.place].filter(Boolean).join(' · ') || e.type || 'Detalles por definir';
    return `<a class="song event ${e.status === 'Cancelado' ? 'cancelled' : ''}" href="#/agenda/${encodeURIComponent(e.id)}">
      ${dateBlock(e)}
      <span class="song-main">
        <span class="song-title">${esc(e.title)}</span>
        <span class="song-sub">${esc(sub)}</span>
      </span>
      <span class="song-meta">
        ${n ? `<span class="bpm" title="Van">👥 ${n}</span>` : ''}
        <span class="dot ${statusClass(e.status)}" title="${esc(e.status)}"></span>
      </span>
    </a>`;
  }

  function hero(e) {
    if (!e) {
      return `<section class="card nextcard empty-next">
        <span class="label">Próximo evento</span>
        <p>No hay eventos próximos en la agenda. Cuando llegue una invitación, regístrala aquí.</p>
      </section>`;
    }
    const names = going(e.id).map((r) => r['Quién']);
    return `<a class="card nextcard" href="#/agenda/${encodeURIComponent(e.id)}">
      <span class="label">Próximo evento · ${esc(whenLabel(e))}</span>
      <span class="nexttitle">${esc(e.title)}</span>
      <span class="nextwhen">${esc(dateRange(e))}${e.time ? ` · ${esc(e.time)}` : ''}${e.arrive ? ` (llegar ${esc(e.arrive)})` : ''}</span>
      ${e.place ? `<span class="nextwhere">📍 ${esc(e.place)}</span>` : ''}
      <span class="nextfoot">
        <span class="pill ${statusClass(e.status)}">${esc(e.status)}</span>
        <span>${names.length ? `👥 ${esc(names.join(', '))}` : 'Nadie ha confirmado asistencia'}</span>
      </span>
    </a>`;
  }

  function monthGrid(events) {
    const t = today();
    if (!view.month) {
      const [y, m] = t.split('-').map(Number);
      view.month = [y, m - 1];
    }
    const [y, m] = view.month;
    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7; // semana empieza en lunes
    const days = new Date(y, m + 1, 0).getDate();
    const byDay = {};
    events.forEach((e) => daysOf(e).forEach((d) => (byDay[d] ||= []).push(e)));
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push('<span></span>');
    for (let d = 1; d <= days; d++) {
      const key = `${y}-${pad(m + 1)}-${pad(d)}`;
      const evs = byDay[key] || [];
      cells.push(`<button class="cal-day ${key === t ? 'today' : ''} ${key === view.day ? 'picked' : ''}" data-day="${key}" ${evs.length ? '' : 'data-empty'}>
        <span>${d}</span>${evs.length ? `<i class="${statusClass(evs[0].status)}"></i>` : ''}</button>`);
    }
    const inMonth = events.filter((e) => daysOf(e).some((d) => d.startsWith(`${y}-${pad(m + 1)}`))).sort(byDate);
    const shown = view.day ? inMonth.filter((e) => daysOf(e).includes(view.day)) : inMonth;
    return `<section class="calendar">
        <div class="cal-head">
          <button data-month="-1" aria-label="Mes anterior">‹</button>
          <strong>${esc(monthName(y, m))}</strong>
          <button data-month="1" aria-label="Mes siguiente">›</button>
        </div>
        <div class="cal-grid">${WEEKDAYS.map((w) => `<small>${w}</small>`).join('')}${cells.join('')}</div>
      </section>
      <div class="list">${
        shown.length ? shown.map(eventRow).join('') : `<p class="empty">${view.day ? 'Nada ese día.' : 'Nada este mes.'}</p>`
      }</div>`;
  }

  function listView(events) {
    const t = today();
    const upcoming = events.filter((e) => !e.day || lastDay(e) >= t).sort(byDate);
    const past = events.filter((e) => e.day && lastDay(e) < t).sort((a, b) => byDate(b, a));
    let lastMonth = '';
    const rows = upcoming
      .map((e) => {
        const label = e.day ? monthName(...e.day.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0))) : 'Fecha por definir';
        const head = label !== lastMonth ? `<h2 class="month">${esc(label)}</h2>` : '';
        lastMonth = label;
        return head + eventRow(e);
      })
      .join('');
    return `<div class="list">${rows || '<p class="empty">No hay eventos próximos.</p>'}</div>
      ${
        past.length
          ? `<details class="past"><summary>Eventos pasados (${past.length})</summary><div class="list">${past.map(eventRow).join('')}</div></details>`
          : ''
      }`;
  }

  // ---------- agenda ----------
  function renderList() {
    document.title = 'Zamar · Agenda';
    ensure(() => {
      const events = data.events;
      app.innerHTML = `
        ${homeHeader('agenda')}
        ${hero(nextEvent(events))}
        <div class="row edittools">
          <a class="button ghost" href="#/agenda/nuevo">+ Nuevo evento</a>
          <div class="basesel seg" role="tablist">
            <button data-mode="lista" aria-selected="${view.mode === 'lista'}">Lista</button>
            <button data-mode="mes" aria-selected="${view.mode === 'mes'}">Mes</button>
          </div>
        </div>
        ${view.mode === 'mes' ? monthGrid(events) : listView(events)}
        <p class="hint">${data.fresh ? 'Solo la ve quien tiene el PIN del ministerio.' : esc(data.error ? `Sin conexión: mostrando la última copia. ${data.error}` : 'Actualizando…')}</p>`;
      app.querySelectorAll('[data-mode]').forEach((b) =>
        b.addEventListener('click', () => {
          view.mode = b.dataset.mode;
          store.set('zamar:agendaview', view.mode);
          renderList();
        }),
      );
      app.querySelectorAll('[data-month]').forEach((b) =>
        b.addEventListener('click', () => {
          const [y, m] = view.month;
          const d = new Date(y, m + Number(b.dataset.month), 1);
          view.month = [d.getFullYear(), d.getMonth()];
          view.day = '';
          renderList();
        }),
      );
      app.querySelectorAll('[data-day]').forEach((b) =>
        b.addEventListener('click', () => {
          view.day = view.day === b.dataset.day ? '' : b.dataset.day;
          renderList();
        }),
      );
    });
  }

  // ---------- un evento ----------
  function attendance(e) {
    const list = rsvpsOf(e.id);
    const me = list.find((r) => normalize(r['Quién']) === normalize(who()));
    const group = (a) => list.filter((r) => r.Respuesta === a);
    const responded = new Set(list.map((r) => normalize(r['Quién'])));
    const missing = people().filter((p) => !responded.has(normalize(p)));
    const person = (r) =>
      `<li><span>${esc(r['Quién'])}</span>${r.Rol ? `<small>${esc(r.Rol)}</small>` : ''}
        <button class="link" data-unrsvp="${esc(r['Quién'])}" aria-label="Quitar">✕</button></li>`;
    return `<section>
      <h2>¿Quién va?</h2>
      <form class="rsvp" id="rsvp">
        <div class="row">
          <input name="name" value="${esc(me?.['Quién'] || who())}" placeholder="Nombre" aria-label="Nombre" required>
          <select name="role" aria-label="Qué hace">
            <option value="">¿Qué haces?</option>
            ${ROLES.map((r) => `<option ${me?.Rol === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </div>
        <div class="answers">
          ${ANSWERS.map((a) => `<button type="submit" value="${a}" class="${me?.Respuesta === a ? 'primary' : ''}">${a}</button>`).join('')}
        </div>
        <p class="hint" id="rmsg">Puedes anotar también a alguien más cambiando el nombre.</p>
      </form>
      <div class="rsvps">
        ${ANSWERS.map((a) => {
          const g = group(a);
          return g.length ? `<div><h3>${a} · ${g.length}</h3><ul>${g.map(person).join('')}</ul></div>` : '';
        }).join('')}
        ${missing.length ? `<div><h3>Sin responder · ${missing.length}</h3><p class="hint">${esc(missing.join(', '))}</p></div>` : ''}
        ${list.length ? '' : '<p class="hint">Aún nadie ha respondido.</p>'}
      </div>
    </section>`;
  }

  function setlistSection(e) {
    const items = parseSetlist(e.setlist);
    const all = songs();
    const find = (t) => all.find((s) => normalize(s.title) === normalize(t));
    const mine = allSetlists();
    const rows = items.map((it) => ({ ...it, song: find(it.title) }));
    const shared = rows.length
      ? `#/compartido/${encodeSetlist({ name: e.title, date: e.day, items: rows.filter((r) => r.song).map((r) => ({ id: r.song.id, key: r.key })) })}`
      : '';
    return `<section>
      <h2>Setlist</h2>
      ${
        rows.length
          ? `<ol class="setlist mini">${rows
              .map(
                (r) => `<li><a href="${r.song ? `#/c/${encodeURIComponent(r.song.id)}` : '#'}">${esc(r.title)}</a>${r.key ? ` <span class="key">${esc(r.key)}</span>` : ''}</li>`,
              )
              .join('')}</ol>
             <a class="button" href="${shared}">Abrir setlist</a>`
          : '<p class="hint">Aún no hay setlist para este evento.</p>'
      }
      ${
        mine.length
          ? `<div class="row addset">
              <select id="linkset" aria-label="Setlist">${mine.map((s) => `<option value="${s.id}">${esc(s.name)}${s.date ? ` · ${esc(shortDay(s.date))}` : ''}</option>`).join('')}</select>
              <button data-action="linkset">${rows.length ? 'Reemplazar' : 'Usar este setlist'}</button>
            </div>`
          : '<p class="hint">Arma un setlist en la pestaña Setlists y luego vincúlalo aquí.</p>'
      }
      <p class="hint" id="smsg"></p>
    </section>`;
  }

  function ensayoSection(e) {
    const p = e.plan;
    const base = `#/agenda/${encodeURIComponent(e.id)}/ensayo`;
    const open = p ? p.tasks.filter((t) => !t.done).length : 0;
    return `<section class="card ensayocard">
      <h2>Ensayo</h2>
      <p class="hint">${
        hasPlan(p)
          ? esc([`${p.items.length} puntos · ${planMinutes(p)} min`, p.agreements.length && `${p.agreements.length} acuerdos`, open && `${open} tareas pendientes`].filter(Boolean).join(' · '))
          : 'Arma el programa con las canciones y los puntos a platicar, llévalo con cronómetro durante el ensayo y cierra con la minuta.'
      }</p>
      <div class="row three even">
        <a class="button" href="${base}/programa">Programa</a>
        <a class="button" href="${base}/durante">Modo ensayo</a>
        <a class="button" href="${base}/minuta">Minuta</a>
      </div>
    </section>`;
  }

  function shareText(e) {
    const names = going(e.id).map((r) => r['Quién']);
    return [
      `🎶 Zamar · ${e.title}`,
      `📅 ${dateRange(e)}${e.time ? `, ${e.time}` : ''}${e.arrive ? ` (llegar ${e.arrive})` : ''}`,
      e.place && `📍 ${e.place}${e.address && !/^https?:/.test(e.address) ? `, ${e.address}` : ''}`,
      `Estatus: ${e.status}`,
      names.length && `👥 Van: ${names.join(', ')}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  function renderOne(id) {
    ensure(() => {
      const e = byId(id);
      if (!e) {
        app.innerHTML = `${backHeader('#/agenda', 'Agenda')}<p class="empty">No encontré este evento.</p>`;
        return;
      }
      document.title = `${e.title} · Agenda`;
      const wa = waNumber(e.phone);
      app.innerHTML = `
        ${backHeader('#/agenda', 'Agenda')}
        <article class="detail">
          <h1>${esc(e.title)}</h1>
          <p class="author">${esc(e.type || 'Evento')}${e.day ? ` · ${esc(whenLabel(e))}` : ''}${e.endDay ? ` · ${daysOf(e).length} días` : ''}</p>
          <p class="status"><span class="dot ${statusClass(e.status)}"></span> ${esc(e.status)}
            <a class="editlink" href="#/agenda/${encodeURIComponent(e.id)}/editar">✎ Editar</a></p>
          <div class="chips statuspick">
            ${STATUSES.map((s) => `<button class="chip toggle" data-status="${esc(s)}" aria-pressed="${s === e.status}">${esc(s)}</button>`).join('')}
          </div>

          <section class="card when">
            <div><span class="label">${e.endDay ? 'Fechas' : 'Fecha'}</span><strong>${esc(dateRange(e))}</strong></div>
            <div class="times">
              <div><span class="label">Llegar</span><strong>${esc(e.arrive || '—')}</strong></div>
              <div><span class="label">${e.endDay ? 'Inicia el primer día' : 'Inicia'}</span><strong>${esc(e.time || '—')}</strong></div>
              <div><span class="label">${e.endDay ? 'Termina el último día' : 'Termina'}</span><strong>${esc(e.end || '—')}</strong></div>
            </div>
          </section>

          ${
            e.place || e.address
              ? `<section class="info">
                  <h2>Lugar</h2>
                  <p><strong>${esc(e.place)}</strong>${e.address && !/^https?:/.test(e.address) ? `<br>${esc(e.address)}` : ''}</p>
                  <a class="button ghost" href="${esc(mapsUrl(e))}" target="_blank" rel="noopener">Cómo llegar</a>
                </section>`
              : ''
          }
          ${
            e.contact || e.phone
              ? `<section class="info">
                  <h2>Contacto</h2>
                  <p><strong>${esc(e.contact)}</strong>${e.phone ? `<br>${esc(e.phone)}` : ''}</p>
                  <div class="row">
                    ${e.phone ? `<a class="button ghost" href="tel:${esc(e.phone.replace(/[^\d+]/g, ''))}">Llamar</a>` : ''}
                    ${wa ? `<a class="button ghost" href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
                  </div>
                </section>`
              : ''
          }

          ${e.type === 'Ensayo' ? ensayoSection(e) : ''}
          ${attendance(e)}
          ${setlistSection(e)}
          ${e.notes ? `<section><h2>Notas</h2><p class="teamnotes">${esc(e.notes)}</p></section>` : ''}

          <section>
            <h2>Compartir y calendario</h2>
            <div class="row">
              <button data-action="share">Compartir</button>
              ${e.day ? `<button data-action="ics">Agregar a mi calendario</button>` : ''}
            </div>
            ${e.day ? `<p class="hint"><a href="${esc(googleCalendarUrl(e))}" target="_blank" rel="noopener">O agrégalo a Google Calendar</a></p>` : ''}
            <p class="hint" id="sharemsg"></p>
          </section>
        </article>`;

      const save = async (fields, msgEl) => {
        try {
          await api('saveEvent', { id: e.id, fields });
          return true;
        } catch (err) {
          if (msgEl) msgEl.textContent = err.message;
          return false;
        }
      };

      app.querySelectorAll('[data-status]').forEach((b) =>
        b.addEventListener('click', async () => {
          const prev = e.status;
          e.status = b.dataset.status;
          saveCache();
          renderOne(e.id);
          if (!(await save({ Estatus: e.status }))) {
            e.status = prev;
            saveCache();
            renderOne(e.id);
            alert('No se pudo cambiar el estatus.');
          }
        }),
      );

      const form = app.querySelector('#rsvp');
      const rmsg = app.querySelector('#rmsg');
      const answer = async (name, value, role) => {
        rmsg.textContent = 'Guardando…';
        try {
          const res = await api('rsvp', { id: e.id, name, answer: value, role });
          data.rsvps = data.rsvps.filter((r) => !(String(r.Evento) === e.id && normalize(r['Quién']) === normalize(name)));
          if (res.rsvp) data.rsvps.push(res.rsvp);
          saveCache();
          renderOne(e.id);
        } catch (err) {
          rmsg.textContent = err.message;
        }
      };
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const name = form.elements.name.value.trim();
        if (name) answer(name, ev.submitter?.value || 'Voy', form.elements.role.value);
      });
      app.querySelectorAll('[data-unrsvp]').forEach((b) =>
        b.addEventListener('click', () => confirm(`¿Quitar a ${b.dataset.unrsvp}?`) && answer(b.dataset.unrsvp, '', '')),
      );

      app.querySelector('[data-action="linkset"]')?.addEventListener('click', async () => {
        const set = allSetlists().find((s) => s.id === app.querySelector('#linkset').value);
        if (!set) return;
        const all = songs();
        const text = set.items
          .map((it) => {
            const s = all.find((x) => x.id === it.id);
            return s ? `${s.title}${it.key || s.key ? ` | ${it.key || keyName(s.key)}` : ''}` : '';
          })
          .filter(Boolean)
          .join('\n');
        const smsg = app.querySelector('#smsg');
        smsg.textContent = 'Guardando…';
        if (await save({ Setlist: text }, smsg)) {
          e.setlist = text;
          saveCache();
          renderOne(e.id);
        }
      });

      app.querySelector('[data-action="share"]').addEventListener('click', async () => {
        const text = shareText(e);
        const out = app.querySelector('#sharemsg');
        try {
          if (navigator.share) return await navigator.share({ title: e.title, text });
          await navigator.clipboard.writeText(text);
          out.textContent = 'Copiado. Pégalo en el chat del equipo.';
        } catch (err) {
          if (err?.name !== 'AbortError') out.textContent = text;
        }
      });

      app.querySelector('[data-action="ics"]')?.addEventListener('click', () => {
        const url = URL.createObjectURL(new Blob([toIcs(e)], { type: 'text/calendar;charset=utf-8' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: `${e.title}.ics` });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      });
    });
  }

  // ---------- crear y editar ----------
  function renderEdit(id) {
    ensure(() => {
      const e = id ? byId(id) : null;
      if (id && !e) {
        app.innerHTML = `${backHeader('#/agenda', 'Agenda')}<p class="empty">No encontré este evento.</p>`;
        return;
      }
      const v = e || toEvent({ Estatus: 'Invitación recibida' });
      const back = e ? `#/agenda/${encodeURIComponent(e.id)}` : '#/agenda';
      document.title = `${e ? 'Editar' : 'Nuevo'} evento · Zamar`;
      const opt = (list, value) => list.map((x) => `<option ${x === value ? 'selected' : ''}>${esc(x)}</option>`).join('');
      app.innerHTML = `
        ${backHeader(back, e ? e.title : 'Agenda')}
        <form class="detail editor" id="editor">
          <h1>${e ? 'Editar evento' : 'Nuevo evento'}</h1>
          <label class="field"><span>Evento</span><input name="Evento" value="${esc(v.title)}" required placeholder="Por ejemplo: Retiro de jóvenes, Parroquia San José"></label>
          <div class="row">
            <label class="field"><span>Tipo</span><select name="Tipo"><option value=""></option>${opt(TYPES, v.type)}</select></label>
            <label class="field"><span>Estatus</span><select name="Estatus">${opt(STATUSES, v.status)}</select></label>
          </div>
          <div class="row">
            <label class="field"><span>Fecha</span><input type="date" name="Fecha" value="${esc(v.day)}"></label>
            <label class="field"><span>Hasta (si dura varios días)</span><input type="date" name="Fecha fin" value="${esc(v.endDay)}" min="${esc(v.day)}"></label>
          </div>
          <div class="row three even">
            <label class="field"><span>Llegar</span><input type="time" name="Llegada" value="${esc(v.arrive)}"></label>
            <label class="field"><span>Inicia</span><input type="time" name="Hora" value="${esc(v.time)}"></label>
            <label class="field"><span>Termina</span><input type="time" name="Fin" value="${esc(v.end)}"></label>
          </div>
          <label class="field"><span>Lugar</span><input name="Lugar" value="${esc(v.place)}" placeholder="Parroquia, salón, ciudad…"></label>
          <label class="field"><span>Dirección o link de Maps</span><input name="Dirección" value="${esc(v.address)}"></label>
          <div class="row">
            <label class="field"><span>Contacto</span><input name="Contacto" value="${esc(v.contact)}" placeholder="Quién nos invitó"></label>
            <label class="field"><span>Teléfono</span><input name="Teléfono" type="tel" value="${esc(v.phone)}"></label>
          </div>
          <label class="field"><span>Notas</span><textarea name="Notas" rows="5" class="prose" placeholder="Duración, momento de la misa, equipo de sonido, vestimenta, pago…">${esc(v.notes)}</textarea></label>
          <p class="hint" id="editmsg"></p>
          <div class="row actions">
            <button type="submit" class="primary">Guardar</button>
            <a class="button ghost" href="${back}">Cancelar</a>
            ${e ? '<button type="button" class="danger" data-action="delete">Borrar</button>' : ''}
          </div>
        </form>`;
      const form = app.querySelector('#editor');
      const msg = (t) => (app.querySelector('#editmsg').textContent = t);
      form.elements.Fecha.addEventListener('change', () => (form.elements['Fecha fin'].min = form.elements.Fecha.value));
      const NAMES = ['Evento', 'Tipo', 'Estatus', 'Fecha', 'Fecha fin', 'Hora', 'Llegada', 'Fin', 'Lugar', 'Dirección', 'Contacto', 'Teléfono', 'Notas'];

      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fields = {};
        NAMES.forEach((n) => (fields[n] = form.elements[n].value.trim()));
        // Un día final igual o anterior al inicio no cuenta: el evento es de un solo día.
        if (!fields.Fecha || fields['Fecha fin'] <= fields.Fecha) fields['Fecha fin'] = '';
        const button = form.querySelector('[type="submit"]');
        button.disabled = true;
        msg('Guardando…');
        try {
          const res = await api('saveEvent', { id: e?.id || '', fields });
          const updated = toEvent({ ID: res.id, ...fields, Setlist: e?.setlist || '', Ensayo: e?.plan || '' });
          if (e) Object.assign(e, updated);
          else data.events.push(updated);
          saveCache();
          location.hash = `#/agenda/${encodeURIComponent(res.id)}`;
        } catch (err) {
          msg(err.message);
          button.disabled = false;
        }
      });

      app.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
        if (!confirm(`¿Borrar “${e.title}” de la agenda? Si solo no se va a hacer, mejor márcalo como Cancelado.`)) return;
        msg('Borrando…');
        try {
          await api('deleteEvent', { id: e.id });
          data.events = data.events.filter((x) => x.id !== e.id);
          data.rsvps = data.rsvps.filter((r) => String(r.Evento) !== e.id);
          saveCache();
          location.hash = '#/agenda';
        } catch (err) {
          msg(err.message);
        }
      });
    });
  }

  /** Aviso del próximo evento en la pantalla de canciones, con la copia guardada (no pide PIN). */
  function nextBanner() {
    if (!data.events && !fromCache()) return '';
    const e = nextEvent(data.events);
    if (!e) return '';
    return `<a class="nextstrip" href="#/agenda/${encodeURIComponent(e.id)}">
      <span class="dot ${statusClass(e.status)}"></span>
      <span><strong>${esc(whenLabel(e))}</strong> · ${esc(e.title)}${e.time ? ` · ${esc(e.time)}` : ''}</span>
      <span aria-hidden="true">›</span>
    </a>`;
  }

  const ensayo = setupEnsayo({
    app, store, esc, backHeader, api, ensure, byId, saveCache, people, going, songs, who, dateRange, today,
    events: () => data.events || [],
  });

  return { renderList, renderOne, renderEdit, nextBanner, renderEnsayo: ensayo.render };
}
