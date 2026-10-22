// Herramienta de ensayos: cada evento de tipo Ensayo en la Agenda trae su programa (antes),
// el modo ensayo con cronómetro (durante) y la minuta con acuerdos y tareas (después).
// Todo se guarda como JSON en la columna "Ensayo" del evento; el cronómetro vive solo en el
// teléfono de quien lo lleva.
import { normalize } from './songs.js';
import { keyName } from './music.js';
import { allSetlists } from './setlists.js';

export const TABS = [
  { id: 'programa', label: 'Antes', title: 'Programa' },
  { id: 'durante', label: 'Durante', title: 'Modo ensayo' },
  { id: 'minuta', label: 'Después', title: 'Minuta' },
];
const SONG_MINUTES = 10;
const TOPIC_MINUTES = 5;

export const uid = () => Math.random().toString(36).slice(2, 9);
export const emptyPlan = () => ({ items: [], agreements: [], tasks: [], present: null });

/** Lee el JSON guardado en la hoja; si viene vacío o roto, un ensayo en blanco. */
export function parsePlan(text) {
  if (text && typeof text === 'object') return { ...emptyPlan(), ...text };
  try {
    const p = JSON.parse(text);
    if (!p || typeof p !== 'object') return emptyPlan();
    return {
      items: Array.isArray(p.items) ? p.items : [],
      agreements: Array.isArray(p.agreements) ? p.agreements : [],
      tasks: Array.isArray(p.tasks) ? p.tasks : [],
      present: Array.isArray(p.present) ? p.present : null,
    };
  } catch {
    return emptyPlan();
  }
}

export const hasPlan = (p) => Boolean(p && (p.items.length || p.agreements.length || p.tasks.length));
export const planMinutes = (plan) => plan.items.reduce((s, i) => s + (Number(i.minutes) || 0), 0);

/** Minutos entre la hora de inicio y la de fin del evento (0 si falta alguna). */
export function availableMinutes(e) {
  const toMin = (t) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
  const a = toMin(e.time);
  const b = toMin(e.end);
  if (a === null || b === null) return 0;
  return b > a ? b - a : b + 1440 - a;
}

/** Hora del reloj a la que empieza cada punto, si el ensayo tiene hora de inicio. */
export function startTimes(e, plan) {
  if (!e.time) return plan.items.map(() => '');
  let t = Number(e.time.slice(0, 2)) * 60 + Number(e.time.slice(3, 5));
  return plan.items.map((i) => {
    const out = `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    t += Number(i.minutes) || 0;
    return out;
  });
}

/** Tareas sin terminar de ensayos anteriores a este, con el ensayo de donde salieron. */
export function pendingTasks(events, current) {
  return events
    .filter((e) => e.id !== current.id && e.plan && (!current.day || !e.day || e.day < current.day))
    .flatMap((e) => e.plan.tasks.filter((t) => !t.done && t.text).map((task) => ({ task, event: e })))
    .sort((a, b) => (a.event.day || '').localeCompare(b.event.day || ''));
}

/** mm:ss, con signo menos cuando ya se pasó del tiempo. */
export function clock(secs) {
  const neg = secs < 0;
  const s = Math.abs(Math.round(secs));
  return `${neg ? '−' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const itemLine = (i) => `${i.title}${i.key ? ` (${i.key})` : ''}${i.minutes ? ` · ${i.minutes} min` : ''}`;

/** Programa para mandar al chat del equipo. */
export function programText(e, plan, when) {
  const times = startTimes(e, plan);
  return [
    `🎸 Zamar · ${e.title}`,
    when,
    '',
    'Programa:',
    ...plan.items.map((i, n) => `${times[n] ? times[n] + ' ' : ''}${i.kind === 'song' ? '🎵' : '💬'} ${itemLine(i)}`),
    `Total: ${planMinutes(plan)} min`,
  ].join('\n');
}

/** Minuta para mandar al chat del equipo. */
export function minutesText(e, plan, when) {
  const covered = plan.items.filter((i) => i.done);
  const missing = plan.items.filter((i) => !i.done);
  return [
    `📝 Minuta · ${e.title}`,
    when,
    plan.present?.length ? `👥 Asistieron: ${plan.present.join(', ')}` : '',
    '',
    covered.length ? `✅ Vimos:\n${covered.map((i) => `• ${i.title}${i.notes ? ` — ${i.notes}` : ''}`).join('\n')}` : '',
    missing.length ? `⏭ Quedó pendiente:\n${missing.map((i) => `• ${i.title}`).join('\n')}` : '',
    plan.agreements.length ? `🤝 Acuerdos:\n${plan.agreements.map((a) => `• ${a.text}`).join('\n')}` : '',
    plan.tasks.length ? `📌 Tareas para el próximo ensayo:\n${plan.tasks.map((t) => `${t.done ? '☑' : '☐'} ${t.text}${t.who ? ` — ${t.who}` : ''}`).join('\n')}` : '',
  ]
    .filter((x, n, all) => x || (n && all[n - 1]))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * deps: { app, store, esc, backHeader, api, ensure, byId, events, saveCache, people, going, songs,
 *         who, dateRange, whenLabel }
 */
export function setupEnsayo(deps) {
  const { app, store, esc, backHeader, api, ensure, byId, events, saveCache, people, going, songs, who, dateRange } = deps;
  let tick = null;
  const timers = (id) => `zamar:ensayo-reloj:${id}`;

  // ---------- guardar ----------
  const pending = {};
  function persist(e, msgEl) {
    saveCache();
    const show = (t) => {
      const el = msgEl || app.querySelector('#pmsg');
      if (el) el.textContent = t;
    };
    show('Guardando…');
    clearTimeout(pending[e.id]);
    pending[e.id] = setTimeout(async () => {
      try {
        await api('saveEvent', { id: e.id, fields: { Ensayo: JSON.stringify(e.plan) } });
        show('Guardado ✓');
      } catch (err) {
        show(`No se guardó: ${err.message}`);
      }
    }, 700);
  }

  // ---------- cronómetro (solo en este teléfono) ----------
  const readTimer = (id) => ({ current: '', running: false, startedAt: 0, spent: {}, ...store.get(timers(id), {}) });
  const writeTimer = (id, t) => store.set(timers(id), t);
  const spentOn = (t, itemId) => (t.spent[itemId] || 0) + (t.running && t.current === itemId ? (Date.now() - t.startedAt) / 1000 : 0);
  function pause(t) {
    if (t.running) {
      t.spent[t.current] = spentOn(t, t.current);
      t.running = false;
    }
    return t;
  }

  // ---------- piezas ----------
  const findSong = (id) => songs().find((s) => s.id === id);
  const songKey = (s) => (s?.key ? keyName(s.key) : '');
  const teamNames = () => {
    const names = new Map();
    [...people(), ...going(currentId).map((r) => r['Quién']), who()].filter(Boolean).forEach((n) => names.set(normalize(n), n));
    return [...names.values()].sort((a, b) => a.localeCompare(b, 'es'));
  };
  let currentId = '';

  function tabs(e, tab) {
    return `<div class="basesel seg ensayotabs" role="tablist">
      ${TABS.map((t) => `<a role="tab" href="#/agenda/${encodeURIComponent(e.id)}/ensayo/${t.id}" aria-selected="${t.id === tab}"><b>${t.label}</b><small>${t.title}</small></a>`).join('')}
    </div>`;
  }

  function programa(e) {
    const plan = e.plan;
    const total = planMinutes(plan);
    const avail = availableMinutes(e);
    const times = startTimes(e, plan);
    const over = avail && total > avail;
    const prev = pendingTasks(events(), e);
    const sets = allSetlists();
    return `
      <section>
        <div class="plantotal ${over ? 'over' : ''}">
          <strong>${total} min</strong>
          <span>${avail ? `de ${avail} disponibles${over ? ` · te pasas ${total - avail} min` : ` · sobran ${avail - total} min`}` : 'Pon hora de inicio y fin al ensayo para ver si alcanza el tiempo.'}</span>
          ${avail ? `<i style="width:${Math.min(100, Math.round((total / avail) * 100))}%"></i>` : ''}
        </div>
        ${
          plan.items.length
            ? `<ol class="planlist">${plan.items
                .map(
                  (i, n) => `<li data-item="${esc(i.id)}" class="${i.kind}">
                    <span class="ptime">${esc(times[n] || String(n + 1))}</span>
                    <span class="pmain">
                      ${
                        i.kind === 'song'
                          ? `<span class="psong"><a href="#/c/${encodeURIComponent(i.songId)}">🎵 ${esc(i.title)}</a>${i.key ? `<span class="key">${esc(i.key)}</span>` : ''}</span>`
                          : `<input class="ptitle" data-field="title" value="${esc(i.title)}" aria-label="Punto">`
                      }
                      <input class="pnote" data-field="notes" value="${esc(i.notes || '')}" placeholder="${i.kind === 'song' ? 'Qué repasar: entrada, final, armonías…' : 'Detalles'}" aria-label="Detalle">
                    </span>
                    <label class="pmin"><input type="number" min="0" max="240" inputmode="numeric" data-field="minutes" value="${esc(i.minutes)}" aria-label="Minutos"><small>min</small></label>
                    <span class="pmove">
                      <button type="button" class="link" data-move="-1" aria-label="Subir" ${n ? '' : 'disabled'}>↑</button>
                      <button type="button" class="link" data-move="1" aria-label="Bajar" ${n < plan.items.length - 1 ? '' : 'disabled'}>↓</button>
                      <button type="button" class="link danger" data-remove aria-label="Quitar">✕</button>
                    </span>
                  </li>`,
                )
                .join('')}</ol>`
            : '<p class="hint">Agrega las canciones que van a ensayar y los puntos que hay que platicar. Cada uno lleva sus minutos.</p>'
        }
      </section>
      <section class="planadd">
        <h2>Agregar</h2>
        <div class="row">
          <input id="addsong" list="songoptions" placeholder="Canción del repertorio" aria-label="Canción">
          <datalist id="songoptions">${songs().map((s) => `<option value="${esc(s.title)}">`).join('')}</datalist>
          <button type="button" data-action="addsong">+ Canción</button>
        </div>
        <div class="row">
          <input id="addtopic" placeholder="Punto a platicar: oración, avisos, repertorio de la boda…" aria-label="Punto">
          <button type="button" data-action="addtopic">+ Punto</button>
        </div>
        ${
          sets.length
            ? `<div class="row">
                <select id="addset" aria-label="Setlist">${sets.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select>
                <button type="button" data-action="addset">+ Canciones del setlist</button>
              </div>`
            : ''
        }
      </section>
      ${
        prev.length
          ? `<section>
              <h2>Pendientes de ensayos anteriores</h2>
              <ul class="tasks">${prev
                .map(
                  ({ task, event }) => `<li><label><input type="checkbox" data-prevtask="${esc(task.id)}" data-from="${esc(event.id)}"> <span>${esc(task.text)}</span></label>
                    <small>${esc([task.who, event.title].filter(Boolean).join(' · '))}</small></li>`,
                )
                .join('')}</ul>
            </section>`
          : ''
      }
      <section>
        <div class="row">
          <button type="button" data-action="shareprog" ${plan.items.length ? '' : 'disabled'}>Compartir programa</button>
          <a class="button ghost" href="#/agenda/${encodeURIComponent(e.id)}/ensayo/durante">Empezar ensayo ›</a>
        </div>
      </section>`;
  }

  function durante(e) {
    const plan = e.plan;
    if (!plan.items.length) {
      return `<p class="empty">Primero arma el programa en la pestaña Antes.</p>`;
    }
    const t = readTimer(e.id);
    const cur = plan.items.find((i) => i.id === t.current) || plan.items.find((i) => !i.done) || plan.items[0];
    const left = (Number(cur.minutes) || 0) * 60 - spentOn(t, cur.id);
    const song = cur.kind === 'song' ? findSong(cur.songId) : null;
    const done = plan.items.filter((i) => i.done).length;
    const totalSpent = plan.items.reduce((s, i) => s + spentOn(t, i.id), 0);
    return `
      <section class="nowcard ${left < 0 ? 'over' : ''}" data-current="${esc(cur.id)}">
        <span class="label">${cur.kind === 'song' ? 'Canción' : 'Punto'} ${plan.items.indexOf(cur) + 1} de ${plan.items.length}</span>
        <strong class="nowtitle">${esc(cur.title)}${cur.key ? ` <span class="key">${esc(cur.key)}</span>` : ''}</strong>
        <span class="nowclock" data-clock>${clock(left)}</span>
        <span class="hint">${cur.minutes ? `${cur.minutes} min planeados` : 'Sin tiempo asignado'}${song?.bpm ? ` · ${song.bpm} BPM` : ''}</span>
        <div class="row">
          <button type="button" class="primary" data-action="toggle">${t.running && t.current === cur.id ? '⏸ Pausa' : '▶ Iniciar'}</button>
          <button type="button" data-action="done">${cur.done ? '↺ Desmarcar' : '✓ Listo, siguiente'}</button>
        </div>
        ${song ? `<a class="button ghost" href="#/c/${encodeURIComponent(song.id)}">Abrir canción · acordes, Spotify y grabaciones</a>` : ''}
        <label class="field"><span>Notas de este punto</span><textarea rows="2" data-curnote placeholder="Lo que acordamos aquí, lo que falta pulir…">${esc(cur.notes || '')}</textarea></label>
      </section>
      <p class="hint" data-overall>Llevan ${clock(totalSpent)} de ${planMinutes(plan)}:00 · ${done} de ${plan.items.length} cubiertos</p>
      <ol class="planlist compact">${plan.items
        .map(
          (i) => `<li class="${i.id === cur.id ? 'current' : ''} ${i.done ? 'done' : ''}">
            <button type="button" class="link" data-jump="${esc(i.id)}">${i.done ? '✓' : '○'} ${esc(i.title)}</button>
            <small>${clock(spentOn(t, i.id))} / ${esc(i.minutes || 0)} min</small>
          </li>`,
        )
        .join('')}</ol>
      <div class="row"><a class="button ghost" href="#/agenda/${encodeURIComponent(e.id)}/ensayo/minuta">Terminar y hacer la minuta ›</a></div>`;
  }

  function minuta(e) {
    const plan = e.plan;
    const names = teamNames();
    const present = plan.present || going(e.id).map((r) => r['Quién']);
    const all = [...new Map([...names, ...present].map((n) => [normalize(n), n])).values()];
    return `
      <section>
        <h2>¿Quién vino?</h2>
        <div class="chips">${all
          .map((n) => `<button type="button" class="chip toggle" data-present="${esc(n)}" aria-pressed="${present.some((p) => normalize(p) === normalize(n))}">${esc(n)}</button>`)
          .join('')}</div>
        <div class="row"><input id="addperson" placeholder="Agregar a alguien más" aria-label="Nombre"><button type="button" data-action="addperson">+</button></div>
      </section>
      ${
        plan.items.length
          ? `<section>
              <h2>Lo que vimos</h2>
              <ul class="tasks">${plan.items
                .map(
                  (i) => `<li><label><input type="checkbox" data-itemdone="${esc(i.id)}" ${i.done ? 'checked' : ''}> <span>${esc(i.title)}</span></label>
                    ${i.notes ? `<small>${esc(i.notes)}</small>` : ''}</li>`,
                )
                .join('')}</ul>
            </section>`
          : ''
      }
      <section>
        <h2>Acuerdos</h2>
        ${plan.agreements.length ? `<ul class="tasks">${plan.agreements.map((a) => `<li><span>🤝 ${esc(a.text)}</span><button type="button" class="link" data-delagree="${esc(a.id)}" aria-label="Quitar">✕</button></li>`).join('')}</ul>` : '<p class="hint">Por ejemplo: “El domingo llegamos 45 minutos antes para probar sonido”.</p>'}
        <div class="row"><input id="addagree" placeholder="Nuevo acuerdo" aria-label="Acuerdo"><button type="button" data-action="addagree">+</button></div>
      </section>
      <section>
        <h2>Tareas para el próximo ensayo</h2>
        ${
          plan.tasks.length
            ? `<ul class="tasks">${plan.tasks
                .map(
                  (t) => `<li><label><input type="checkbox" data-taskdone="${esc(t.id)}" ${t.done ? 'checked' : ''}> <span>${esc(t.text)}</span></label>
                    <small>${esc(t.who || 'Sin responsable')}</small>
                    <button type="button" class="link" data-deltask="${esc(t.id)}" aria-label="Quitar">✕</button></li>`,
                )
                .join('')}</ul>`
            : '<p class="hint">Lo que quede sin terminar aparece solo en el programa del siguiente ensayo.</p>'
        }
        <div class="row taskadd">
          <input id="addtask" placeholder="Qué hay que hacer" aria-label="Tarea">
          <input id="addwho" list="teamnames" placeholder="Responsable" aria-label="Responsable">
          <datalist id="teamnames">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
          <button type="button" data-action="addtask">+</button>
        </div>
      </section>
      <section><button type="button" data-action="sharemin">Compartir minuta</button></section>`;
  }

  // ---------- pantalla ----------
  function render(id, tab) {
    clearInterval(tick);
    ensure(() => {
      const e = byId(id);
      if (!e) {
        app.innerHTML = `${backHeader('#/agenda', 'Agenda')}<p class="empty">No encontré este evento.</p>`;
        return;
      }
      currentId = e.id;
      e.plan ||= emptyPlan();
      if (!TABS.some((t) => t.id === tab)) {
        // Sin pestaña: antes del día, el programa; ese día, el modo ensayo; después, la minuta.
        const t = deps.today();
        tab = !e.day || e.day > t ? 'programa' : e.day === t ? 'durante' : 'minuta';
      }
      const when = `📅 ${dateRange(e)}${e.time ? `, ${e.time}${e.end ? `–${e.end}` : ''}` : ''}${e.place ? ` · ${e.place}` : ''}`;
      document.title = `${TABS.find((t) => t.id === tab).title} · ${e.title}`;
      app.innerHTML = `
        ${backHeader(`#/agenda/${encodeURIComponent(e.id)}`, e.title)}
        <article class="detail ensayo">
          <h1>${esc(e.title)}</h1>
          <p class="author">${esc(when.slice(3))}</p>
          ${tabs(e, tab)}
          ${tab === 'programa' ? programa(e) : tab === 'durante' ? durante(e) : minuta(e)}
          <p class="hint" id="pmsg"></p>
        </article>`;
      wire(e, tab, when);
    });
  }

  function share(text, msg) {
    (async () => {
      try {
        if (navigator.share) return await navigator.share({ text });
        await navigator.clipboard.writeText(text);
        msg('Copiado. Pégalo en el chat del equipo.');
      } catch (err) {
        if (err?.name !== 'AbortError') msg(text);
      }
    })();
  }

  function wire(e, tab, when) {
    const plan = e.plan;
    const msg = (t) => (app.querySelector('#pmsg').textContent = t);
    const again = () => render(e.id, tab);
    const on = (sel, fn) => app.querySelectorAll(sel).forEach((el) => el.addEventListener('click', () => fn(el)));
    const changed = () => {
      persist(e);
      again();
    };

    if (tab === 'programa') {
      app.querySelectorAll('.planlist [data-field]').forEach((input) =>
        input.addEventListener('input', () => {
          const item = plan.items.find((i) => i.id === input.closest('[data-item]').dataset.item);
          item[input.dataset.field] = input.dataset.field === 'minutes' ? Math.max(0, Number(input.value) || 0) : input.value;
          persist(e);
        }),
      );
      // Al salir del campo de minutos se recalculan horas y total.
      app.querySelectorAll('.planlist [data-field="minutes"]').forEach((input) => input.addEventListener('change', again));
      on('[data-move]', (b) => {
        const i = plan.items.findIndex((x) => x.id === b.closest('[data-item]').dataset.item);
        const j = i + Number(b.dataset.move);
        [plan.items[i], plan.items[j]] = [plan.items[j], plan.items[i]];
        changed();
      });
      on('[data-remove]', (b) => {
        plan.items = plan.items.filter((x) => x.id !== b.closest('[data-item]').dataset.item);
        changed();
      });
      const addSong = (s, key) => plan.items.push({ id: uid(), kind: 'song', songId: s.id, title: s.title, key: key || songKey(s), minutes: SONG_MINUTES, notes: '', done: false });
      on('[data-action="addsong"]', () => {
        const q = normalize(app.querySelector('#addsong').value);
        const s = songs().find((x) => normalize(x.title) === q) || songs().find((x) => q && normalize(x.title).includes(q));
        if (!s) return msg('No encontré esa canción en el repertorio.');
        addSong(s);
        changed();
      });
      on('[data-action="addtopic"]', () => {
        const text = app.querySelector('#addtopic').value.trim();
        if (!text) return;
        plan.items.push({ id: uid(), kind: 'topic', title: text, minutes: TOPIC_MINUTES, notes: '', done: false });
        changed();
      });
      app.querySelector('#addtopic').addEventListener('keydown', (ev) => ev.key === 'Enter' && app.querySelector('[data-action="addtopic"]').click());
      app.querySelector('#addsong').addEventListener('keydown', (ev) => ev.key === 'Enter' && app.querySelector('[data-action="addsong"]').click());
      on('[data-action="addset"]', () => {
        const set = allSetlists().find((s) => s.id === app.querySelector('#addset').value);
        (set?.items || []).forEach((it) => {
          const s = findSong(it.id);
          if (s && !plan.items.some((x) => x.songId === s.id)) addSong(s, it.key);
        });
        changed();
      });
      app.querySelectorAll('[data-prevtask]').forEach((box) =>
        box.addEventListener('change', () => {
          const from = byId(box.dataset.from);
          const task = from?.plan?.tasks.find((t) => t.id === box.dataset.prevtask);
          if (!task) return;
          task.done = true;
          task.doneAt = deps.today();
          persist(from);
          setTimeout(again, 400);
        }),
      );
      on('[data-action="shareprog"]', () => share(programText(e, plan, when), msg));
    }

    if (tab === 'durante' && plan.items.length) {
      const curId = app.querySelector('[data-current]').dataset.current;
      const cur = plan.items.find((i) => i.id === curId);
      const save = (t) => writeTimer(e.id, t);
      on('[data-action="toggle"]', () => {
        const t = readTimer(e.id);
        if (t.running && t.current === curId) pause(t);
        else {
          pause(t);
          t.current = curId;
          t.running = true;
          t.startedAt = Date.now();
        }
        save(t);
        again();
      });
      on('[data-action="done"]', () => {
        cur.done = !cur.done;
        const t = pause(readTimer(e.id));
        if (cur.done) {
          const next = plan.items.slice(plan.items.indexOf(cur) + 1).find((i) => !i.done) || plan.items.find((i) => !i.done);
          // Al pasar al siguiente, su cronómetro arranca solo.
          if (next) Object.assign(t, { current: next.id, running: true, startedAt: Date.now() });
        } else t.current = cur.id;
        save(t);
        changed();
      });
      on('[data-jump]', (b) => {
        const t = pause(readTimer(e.id));
        t.current = b.dataset.jump;
        save(t);
        again();
      });
      app.querySelector('[data-curnote]').addEventListener('input', (ev) => {
        cur.notes = ev.target.value;
        persist(e);
      });
      // Refresca el reloj cada segundo mientras siga en esta pantalla.
      const hash = location.hash;
      tick = setInterval(() => {
        if (location.hash !== hash || !app.querySelector('[data-clock]')) return clearInterval(tick);
        const t = readTimer(e.id);
        const left = (Number(cur.minutes) || 0) * 60 - spentOn(t, cur.id);
        app.querySelector('[data-clock]').textContent = clock(left);
        app.querySelector('.nowcard').classList.toggle('over', left < 0);
        const total = plan.items.reduce((s, i) => s + spentOn(t, i.id), 0);
        app.querySelector('[data-overall]').textContent = `Llevan ${clock(total)} de ${planMinutes(plan)}:00 · ${plan.items.filter((i) => i.done).length} de ${plan.items.length} cubiertos`;
      }, 1000);
    }

    if (tab === 'minuta') {
      on('[data-present]', (b) => {
        const list = plan.present || going(e.id).map((r) => r['Quién']);
        const n = b.dataset.present;
        plan.present = list.some((p) => normalize(p) === normalize(n)) ? list.filter((p) => normalize(p) !== normalize(n)) : [...list, n];
        changed();
      });
      on('[data-action="addperson"]', () => {
        const n = app.querySelector('#addperson').value.trim();
        if (!n) return;
        plan.present = [...(plan.present || going(e.id).map((r) => r['Quién'])), n];
        changed();
      });
      app.querySelectorAll('[data-itemdone]').forEach((box) =>
        box.addEventListener('change', () => {
          plan.items.find((i) => i.id === box.dataset.itemdone).done = box.checked;
          persist(e);
        }),
      );
      on('[data-action="addagree"]', () => {
        const text = app.querySelector('#addagree').value.trim();
        if (!text) return;
        plan.agreements.push({ id: uid(), text });
        changed();
      });
      on('[data-delagree]', (b) => {
        plan.agreements = plan.agreements.filter((a) => a.id !== b.dataset.delagree);
        changed();
      });
      on('[data-action="addtask"]', () => {
        const text = app.querySelector('#addtask').value.trim();
        if (!text) return;
        plan.tasks.push({ id: uid(), text, who: app.querySelector('#addwho').value.trim(), done: false });
        changed();
      });
      app.querySelectorAll('[data-taskdone]').forEach((box) =>
        box.addEventListener('change', () => {
          plan.tasks.find((t) => t.id === box.dataset.taskdone).done = box.checked;
          persist(e);
        }),
      );
      on('[data-deltask]', (b) => {
        plan.tasks = plan.tasks.filter((t) => t.id !== b.dataset.deltask);
        changed();
      });
      ['#addagree', '#addtask', '#addperson'].forEach((sel) =>
        app.querySelector(sel).addEventListener('keydown', (ev) => {
          if (ev.key !== 'Enter') return;
          ev.preventDefault();
          app.querySelector(`[data-action="${sel.slice(1)}"]`).click();
        }),
      );
      on('[data-action="sharemin"]', () => share(minutesText(e, plan, when), msg));
    }
  }

  return { render };
}
