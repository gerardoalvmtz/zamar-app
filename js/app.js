import { sheetCsvUrl, LYRICS_GID } from './config.js';
import { parseCsv, rowsToSongs, rowsToTexts, attachTexts, suggestions, normalize } from './songs.js';
import { keyName, transposeKey, useFlats, semitonesBetween, parseKey, keyRelation } from './music.js';
import { renderChordSheet, lyricsFromChords, tabsFromChords, renderLyrics, sheetKey } from './chordpro.js';
import {
  allSetlists,
  getSetlist,
  saveSetlist,
  createSetlist,
  deleteSetlist,
  addToSetlist,
  encodeSetlist,
  decodeSetlist,
  importSetlist,
} from './setlists.js';

const CACHE_KEY = 'zamar:repertorio';
const app = document.getElementById('app');

// ---------- almacenamiento local (puede fallar en modo privado) ----------
const store = {
  get(k, fallback = null) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try {
      if (v === null || v === '' || v === 0) localStorage.removeItem(k);
      else localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* sin almacenamiento: la app sigue funcionando */
    }
  },
};

const FILTER_GROUPS = ['themes', 'voices', 'keys', 'statuses'];
const savedFilters = store.get('zamar:filters', {});
const state = {
  songs: [],
  source: '', // 'live' | 'cache' | 'snapshot'
  updatedAt: null,
  showFilters: false,
  filters: {
    q: '',
    sort: savedFilters.sort || 'title',
    catholic: Boolean(savedFilters.catholic),
    ...Object.fromEntries(FILTER_GROUPS.map((g) => [g, new Set(savedFilters[g] || [])])),
  },
};

function saveFilters() {
  const f = state.filters;
  store.set('zamar:filters', {
    sort: f.sort,
    catholic: f.catholic,
    ...Object.fromEntries(FILTER_GROUPS.map((g) => [g, [...f[g]]])),
  });
}

// ---------- datos ----------
async function fetchSheet(gid) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(sheetCsvUrl(gid), { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    // Si la hoja no es pública, Google responde con una página de inicio de sesión.
    if (/^\s*</.test(text)) throw new Error('La hoja no es pública');
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error('Hoja vacía');
    return rows;
  } finally {
    clearTimeout(timer);
  }
}

async function loadSongs({ quiet = false } = {}) {
  try {
    const [rows, textRows] = await Promise.all([
      fetchSheet(),
      fetchSheet(LYRICS_GID).catch(() => null), // la pestaña de letras es opcional
    ]);
    state.songs = attachTexts(rowsToSongs(rows), rowsToTexts(textRows));
    state.source = 'live';
    state.updatedAt = new Date();
    store.set(CACHE_KEY, { rows, textRows, at: state.updatedAt.toISOString() });
  } catch (err) {
    console.warn('No se pudo leer la hoja:', err);
    if (quiet && state.songs.length) return;
    const cached = store.get(CACHE_KEY);
    if (cached?.rows) {
      state.songs = attachTexts(rowsToSongs(cached.rows), rowsToTexts(cached.textRows));
      state.source = 'cache';
      state.updatedAt = new Date(cached.at);
    } else {
      const snap = await fetch('data/repertorio.json').then((r) => r.json());
      state.songs = attachTexts(rowsToSongs(snap.rows), rowsToTexts(snap.letras));
      state.source = 'snapshot';
      state.updatedAt = new Date(snap.actualizado + 'T12:00:00');
    }
  }
  render();
}

const songById = (id) => state.songs.find((s) => s.id === id);

// ---------- utilidades de vista ----------
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const logo = (cls, light, dark, alt) =>
  `<picture class="${cls}"><source srcset="${dark}" media="(prefers-color-scheme: dark)"><img src="${light}" alt="${alt}"></picture>`;

const fmtDate = (d) =>
  d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const fmtDay = (iso) =>
  iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }) : '';

const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '');

function statusClass(status) {
  const s = normalize(status);
  if (s.startsWith('lista')) return 'ok';
  if (s.includes('repaso')) return 'warn';
  if (s.includes('estructura') || s.includes('ensayo')) return 'bad';
  return 'none';
}

function sourceBanner() {
  if (state.source === 'live') return '';
  const msg =
    state.source === 'cache'
      ? `Sin conexión con la hoja. Mostrando la copia guardada del ${fmtDate(state.updatedAt)}`
      : `No se pudo leer la hoja en vivo. Mostrando la copia incluida en la app (${state.updatedAt.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}).`;
  return `<div class="banner">${esc(msg)} <button class="link" data-action="reload">Reintentar</button></div>`;
}

function homeHeader(active) {
  return `<header class="top home">
      ${logo('brand', 'img/logo-negro.png', 'img/logo-blanco.png', 'Zamar Adoración')}
      <button class="icon" data-action="reload" aria-label="Actualizar">⟳</button>
    </header>
    <nav class="nav">
      <a href="#/" ${active === 'songs' ? 'aria-current="page"' : ''}>Canciones</a>
      <a href="#/sets" ${active === 'sets' ? 'aria-current="page"' : ''}>Setlists</a>
    </nav>`;
}

const backHeader = (href, label) => `<header class="top">
    <a class="back" href="${href}">‹ ${esc(label)}</a>
    ${logo('mark', 'img/simbolo-negro.png', 'img/simbolo-blanco.png', '')}
  </header>`;

const uniq = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

const groupValues = {
  themes: () => uniq(state.songs.flatMap((s) => s.themes)),
  voices: () => uniq(state.songs.map((s) => s.voice)),
  keys: () => uniq(state.songs.filter((s) => s.key).map((s) => keyName(s.key))),
  statuses: () => uniq(state.songs.map((s) => s.status)),
};
const GROUP_LABEL = { themes: 'Tema', voices: 'Voz principal', keys: 'Tono', statuses: 'Estatus' };

// ---------- lista de canciones ----------
function matches(s) {
  const f = state.filters;
  const q = normalize(f.q);
  // Dentro de un grupo basta con que coincida una opción; entre grupos deben coincidir todos.
  return (
    (!q || normalize(`${s.title} ${s.author}`).includes(q)) &&
    (!f.themes.size || s.themes.some((t) => f.themes.has(t))) &&
    (!f.voices.size || f.voices.has(s.voice)) &&
    (!f.keys.size || (s.key && f.keys.has(keyName(s.key)))) &&
    (!f.statuses.size || f.statuses.has(s.status)) &&
    (!f.catholic || s.catholic)
  );
}

function sortedSongs(list) {
  const by = state.filters.sort;
  const cmp = (a, b) =>
    by === 'author'
      ? !a.author - !b.author || a.author.localeCompare(b.author, 'es') || a.title.localeCompare(b.title, 'es')
      : a.title.localeCompare(b.title, 'es');
  return [...list].sort(cmp);
}

function songRow(s, href = `#/c/${encodeURIComponent(s.id)}`) {
  const key = s.key ? keyName(s.key) : '';
  const sub = state.filters.sort === 'author' ? [s.author || 'Autor sin registrar', s.title] : [s.author || 'Autor sin registrar'];
  return `<a class="song" href="${href}">
    <span class="song-main">
      <span class="song-title">${esc(s.title)}</span>
      <span class="song-sub">${esc(sub[0])}${s.voice ? ` · ${esc(s.voice)}` : ''} · ${esc(s.themes.join(', '))}</span>
    </span>
    <span class="song-meta">
      ${key ? `<span class="key">${esc(key)}</span>` : ''}
      ${s.bpm ? `<span class="bpm">${s.bpm}</span>` : ''}
      <span class="dot ${statusClass(s.status)}" title="${esc(s.status)}"></span>
    </span>
  </a>`;
}

const activeCount = () =>
  FILTER_GROUPS.reduce((n, g) => n + state.filters[g].size, 0) + (state.filters.catholic ? 1 : 0);

function filterPanel() {
  const f = state.filters;
  return `<div class="panel">
    ${FILTER_GROUPS.map((g) => {
      const values = groupValues[g]();
      if (!values.length) return '';
      return `<fieldset><legend>${GROUP_LABEL[g]}</legend><div class="chips">${values
        .map(
          (v) =>
            `<button class="chip toggle" data-group="${g}" data-value="${esc(v)}" aria-pressed="${f[g].has(v)}">${esc(v)}</button>`,
        )
        .join('')}</div></fieldset>`;
    }).join('')}
    <fieldset><legend>Otros</legend><div class="chips">
      <button class="chip toggle" data-group="catholic" aria-pressed="${f.catholic}">Solo católicas</button>
    </div></fieldset>
    ${activeCount() ? '<button class="link" data-action="clear">Quitar filtros</button>' : ''}
  </div>`;
}

function renderList() {
  const f = state.filters;
  document.title = 'Zamar · Repertorio';
  const n = activeCount();
  app.innerHTML = `
    ${homeHeader('songs')}
    ${sourceBanner()}
    <div class="filters">
      <input type="search" id="q" placeholder="Buscar canción o autor" value="${esc(f.q)}" autocomplete="off">
      <div class="row">
        <button class="filter-toggle" data-action="filters" aria-expanded="${state.showFilters}">Filtros${n ? ` (${n})` : ''}</button>
        <select id="sort" aria-label="Ordenar">
          <option value="title" ${f.sort === 'title' ? 'selected' : ''}>Orden: canción</option>
          <option value="author" ${f.sort === 'author' ? 'selected' : ''}>Orden: autor</option>
        </select>
      </div>
      ${state.showFilters ? filterPanel() : ''}
    </div>
    <p class="count" id="count"></p>
    <div class="list" id="list"></div>
    <footer class="foot">${state.updatedAt ? `Actualizado ${esc(fmtDate(state.updatedAt))}` : ''}</footer>`;
  renderResults();
}

function renderResults() {
  const list = sortedSongs(state.songs.filter(matches));
  document.getElementById('count').textContent = `${list.length} de ${state.songs.length} canciones`;
  document.getElementById('list').innerHTML = list.length
    ? list.map((s) => songRow(s)).join('')
    : '<p class="empty">No hay canciones con esos filtros.</p>';
}

// ---------- ficha de canción ----------
function spotifyEmbed(url) {
  const m = String(url).match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist)\/([A-Za-z0-9]+)/);
  if (!m) return '';
  return `<iframe class="spotify" src="https://open.spotify.com/embed/${m[1]}/${m[2]}" height="${m[1] === 'track' ? 80 : 152}" loading="lazy" allow="encrypted-media" title="Spotify"></iframe>`;
}

/**
 * ctx: { set, index } cuando la canción se abre desde un setlist; entonces el tono
 * viene del setlist y los botones de tono lo cambian ahí.
 */
function renderSong(id, ctx = null) {
  const song = songById(id);
  const back = ctx ? backHeader(`#/set/${ctx.set.id}`, ctx.set.name) : backHeader('#/', 'Repertorio');
  if (!song) {
    app.innerHTML = `${back}<p class="empty">No encontré esta canción. Quizá cambió de nombre en la hoja.</p>`;
    return;
  }
  document.title = `${song.title} · Zamar`;

  // Tono base: el de Zamar o el original, a elección de cada quien.
  const hasBoth = Boolean(song.keyZamar && song.keyOriginal);
  const baseChoice = hasBoth ? store.get('zamar:base', 'zamar') : song.keyZamar ? 'zamar' : 'original';
  const baseKey = baseChoice === 'zamar' ? song.keyZamar || song.keyOriginal : song.keyOriginal || song.keyZamar;
  let key;
  let shift = 0;
  if (ctx) {
    key = parseKey(ctx.set.items[ctx.index].key) || baseKey;
  } else {
    shift = store.get(`zamar:shift:${song.id}:${baseChoice}`, 0);
    key = transposeKey(baseKey, shift);
  }
  // Las hojas de Songbook Pro traen {key: X}; si no, se asume que están en el tono que toca Zamar.
  const written = sheetKey(song.chords) || song.key;
  const chordShift = key && written ? semitonesBetween(written, key) : 0;
  const flats = useFlats(key);

  const lyrics = song.lyrics || lyricsFromChords(song.chords);
  const tabs = song.tabs || tabsFromChords(song.chords);
  const views = ['letra', 'acordes', ...(tabs ? ['tabs'] : [])];
  let view = store.get('zamar:view', 'letra');
  if (!views.includes(view)) view = 'letra';
  const notes = store.get(`zamar:notes:${song.id}`, '');
  const sugg = suggestions(song, key, state.songs);
  const sets = allSetlists();

  const keyOptions = key
    ? Array.from({ length: 12 }, (_, pc) => {
        const k = { pc, minor: key.minor };
        const d = semitonesBetween(key, k);
        const isBase = baseKey && pc === baseKey.pc;
        return `<option value="${d}" ${d === 0 ? 'selected' : ''}>${esc(keyName(k))}${isBase ? ' (base)' : ''}</option>`;
      }).join('')
    : '';

  const viewBody = {
    letra: lyrics
      ? `<div class="sheet lyrics">${renderLyrics(lyrics)}</div>`
      : '<p class="hint">Aún no hay letra cargada para esta canción.</p>',
    acordes: song.chords
      ? `<div class="sheet">${renderChordSheet(song.chords, chordShift, flats)}</div>`
      : '<p class="hint">Aún no hay hoja de acordes para esta canción.</p>',
    tabs: `<pre class="sheet">${esc(tabs)}</pre>`,
  };

  const nav = ctx
    ? `<div class="setnav">
        ${ctx.index > 0 ? `<a class="button ghost" href="#/set/${ctx.set.id}/${ctx.index - 1}">‹ Anterior</a>` : '<span></span>'}
        <span class="hint">${ctx.index + 1} de ${ctx.set.items.length}</span>
        ${ctx.index < ctx.set.items.length - 1 ? `<a class="button ghost" href="#/set/${ctx.set.id}/${ctx.index + 1}">Siguiente ›</a>` : '<span></span>'}
      </div>`
    : '';

  app.innerHTML = `
    ${back}
    ${sourceBanner()}
    ${nav}
    <article class="detail">
      <h1>${esc(song.title)}</h1>
      <p class="author">${esc(song.author || 'Autor sin registrar')}</p>
      ${song.voice ? `<p class="voice">Voz principal: <strong>${esc(song.voice)}</strong></p>` : ''}
      <p class="chips">
        ${song.themes.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}
        ${song.catholic ? '<span class="chip catholic">Católica</span>' : ''}
      </p>
      <p class="status"><span class="dot ${statusClass(song.status)}"></span> ${esc(song.status || 'Sin estatus')}</p>

      <section class="card keybox">
        ${
          key
            ? `<div class="keynow">
                 <span class="label">${ctx ? 'Tono del setlist' : hasBoth ? 'Tono' : baseChoice === 'zamar' ? 'Tono Zamar' : 'Tono original'}</span>
                 <span class="big">${esc(keyName(key))}</span>
                 ${!ctx && shift ? `<span class="orig">${baseChoice === 'zamar' ? 'Zamar' : 'original'}: ${esc(keyName(baseKey))}</span>` : ''}
                 ${ctx && baseKey && baseKey.pc !== key.pc ? `<span class="orig">Zamar: ${esc(keyName(baseKey))}</span>` : ''}
               </div>
               ${
                 hasBoth && !ctx
                   ? `<div class="basesel" role="tablist">
                        <button data-base="zamar" aria-selected="${baseChoice === 'zamar'}">Zamar · ${esc(keyName(song.keyZamar))}</button>
                        <button data-base="original" aria-selected="${baseChoice === 'original'}">Original · ${esc(keyName(song.keyOriginal))}</button>
                      </div>`
                   : ''
               }
               <div class="keyctl">
                 <button data-shift="-1" aria-label="Bajar medio tono">−½</button>
                 <select id="keysel" aria-label="Elegir tono">${keyOptions}</select>
                 <button data-shift="1" aria-label="Subir medio tono">+½</button>
               </div>`
            : `<div class="keynow"><span class="label">Tono</span><span class="big muted">—</span></div>
               <p class="hint">Agrega la tonalidad en la hoja para poder transponer y ver sugerencias.</p>`
        }
        <div class="keynow"><span class="label">BPM</span><span class="big ${song.bpm ? '' : 'muted'}">${song.bpm || '—'}</span></div>
      </section>

      ${safeUrl(song.spotify) ? `<section class="listen">${spotifyEmbed(song.spotify) || `<a class="button" href="${esc(song.spotify)}" target="_blank" rel="noopener">Escuchar en Spotify</a>`}</section>` : ''}
      ${safeUrl(song.link) ? `<section class="listen"><a class="button ghost" href="${esc(song.link)}" target="_blank" rel="noopener">Escuchar referencia</a></section>` : ''}

      <section>
        <div class="tabs" role="tablist" style="grid-template-columns: repeat(${views.length}, 1fr)">
          ${views
            .map((v) => `<button role="tab" data-view="${v}" aria-selected="${view === v}">${{ letra: 'Letra', acordes: 'Acordes', tabs: 'Tabs' }[v]}</button>`)
            .join('')}
        </div>
        ${viewBody[view]}
      </section>

      ${song.notes ? `<section><h2>Notas del equipo</h2><p class="teamnotes">${esc(song.notes)}</p></section>` : ''}

      ${
        ctx
          ? ''
          : `<section>
        <h2>Agregar a setlist</h2>
        <div class="row addset">
          <select id="setsel" aria-label="Setlist">
            ${sets.map((s) => `<option value="${s.id}">${esc(s.name)}${s.date ? ` · ${esc(fmtDay(s.date))}` : ''}</option>`).join('')}
            <option value="new">+ Nuevo setlist</option>
          </select>
          <button data-action="addset">Agregar en ${esc(key ? keyName(key) : 'su tono')}</button>
        </div>
        <p class="hint" id="addmsg"></p>
      </section>`
      }

      <section>
        <h2>Mis notas</h2>
        <textarea id="notes" rows="4" placeholder="Solo se guardan en este teléfono">${esc(notes)}</textarea>
        <p class="hint" id="saved"></p>
      </section>

      <section>
        <h2>Para conectar${key ? ` desde ${esc(keyName(key))}` : ''}</h2>
        ${
          !key
            ? '<p class="hint">Sin tonalidad no puedo sugerir canciones.</p>'
            : sugg.length
              ? `<div class="list">${sugg
                  .map(
                    (x) => `<a class="song" href="#/c/${encodeURIComponent(x.song.id)}">
                      <span class="song-main">
                        <span class="song-title">${esc(x.song.title)}</span>
                        <span class="song-sub">${x.reasons.map(esc).join(' · ')}</span>
                      </span>
                      <span class="song-meta">
                        <span class="key">${esc(keyName(x.song.key))}</span>
                        ${x.song.bpm ? `<span class="bpm">${x.song.bpm}</span>` : ''}
                      </span>
                    </a>`,
                  )
                  .join('')}</div>`
              : '<p class="hint">Todavía no hay canciones con tonalidad compatible.</p>'
        }
      </section>
    </article>
    ${nav}`;

  const rerender = () => renderSong(song.id, ctx && { set: getSetlist(ctx.set.id) || ctx.set, index: ctx.index });
  const moveKey = (d) => {
    if (ctx) {
      ctx.set.items[ctx.index].key = keyName(transposeKey(key, d));
      saveSetlist(ctx.set);
    } else {
      let v = (((shift + d) % 12) + 12) % 12;
      if (v > 6) v -= 12;
      store.set(`zamar:shift:${song.id}:${baseChoice}`, v);
    }
    rerender();
  };
  app.querySelectorAll('[data-shift]').forEach((b) => b.addEventListener('click', () => moveKey(Number(b.dataset.shift))));
  app.querySelector('#keysel')?.addEventListener('change', (e) => moveKey(Number(e.target.value)));
  app.querySelectorAll('[data-base]').forEach((b) =>
    b.addEventListener('click', () => {
      store.set('zamar:base', b.dataset.base);
      rerender();
    }),
  );
  app.querySelectorAll('[data-view]').forEach((b) =>
    b.addEventListener('click', () => {
      store.set('zamar:view', b.dataset.view);
      rerender();
    }),
  );
  app.querySelector('[data-action="addset"]')?.addEventListener('click', () => {
    let setId = app.querySelector('#setsel').value;
    if (setId === 'new') {
      const name = prompt('Nombre del setlist (por ejemplo, Misa domingo):');
      if (!name) return;
      setId = createSetlist(name.trim(), '').id;
    }
    const set = addToSetlist(setId, song.id, key ? keyName(key) : '');
    document.getElementById('addmsg').innerHTML = `Agregada a <a href="#/set/${set.id}">${esc(set.name)}</a>.`;
  });
  let t;
  app.querySelector('#notes').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => {
      store.set(`zamar:notes:${song.id}`, e.target.value);
      document.getElementById('saved').textContent = 'Guardado en este teléfono';
    }, 400);
  });
}

// ---------- setlists ----------
function renderSetlists() {
  document.title = 'Zamar · Setlists';
  const sets = allSetlists();
  app.innerHTML = `
    ${homeHeader('sets')}
    <form class="card newset" id="newset">
      <h2>Nuevo setlist</h2>
      <input id="setname" placeholder="Nombre, por ejemplo Misa domingo" required>
      <div class="row">
        <input id="setdate" type="date" aria-label="Fecha">
        <button type="submit">Crear</button>
      </div>
    </form>
    <div class="list">
      ${
        sets.length
          ? sets
              .map(
                (s) => `<a class="song" href="#/set/${s.id}">
                  <span class="song-main">
                    <span class="song-title">${esc(s.name)}</span>
                    <span class="song-sub">${esc(fmtDay(s.date) || 'Sin fecha')} · ${s.items.length} canciones</span>
                  </span>
                </a>`,
              )
              .join('')
          : '<p class="empty">Todavía no hay setlists en este teléfono.</p>'
      }
    </div>
    <p class="hint">Los setlists se guardan en este teléfono. Para pasarlos al equipo usa “Compartir”.</p>`;
  app.querySelector('#newset').addEventListener('submit', (e) => {
    e.preventDefault();
    const set = createSetlist(app.querySelector('#setname').value.trim(), app.querySelector('#setdate').value);
    location.hash = `#/set/${set.id}`;
  });
}

function setItems(set) {
  return set.items.map((item, i) => {
    const song = songById(item.id);
    const key = parseKey(item.key) || song?.key || null;
    const prev = i > 0 ? parseKey(set.items[i - 1].key) || songById(set.items[i - 1].id)?.key : null;
    const rel = prev && key ? keyRelation(prev, key) : null;
    return { item, i, song, key, transition: rel ? rel.label || 'Cambio de tono' : '' };
  });
}

function renderSetlist(id, shared = null) {
  const set = shared || getSetlist(id);
  if (!set) {
    app.innerHTML = `${backHeader('#/sets', 'Setlists')}<p class="empty">No encontré este setlist en este teléfono.</p>`;
    return;
  }
  document.title = `${set.name} · Zamar`;
  const rows = setItems(set);
  const songOptions = sortedSongs(state.songs)
    .map((s) => `<option value="${esc(s.id)}">${esc(s.title)}${s.key ? ` (${esc(keyName(s.key))})` : ''}</option>`)
    .join('');

  app.innerHTML = `
    ${backHeader('#/sets', 'Setlists')}
    <article class="detail">
      ${
        shared
          ? `<h1>${esc(set.name)}</h1><p class="author">${esc(fmtDay(set.date))}</p>
             <div class="banner">Te compartieron este setlist. <button class="link" data-action="import">Guardarlo en mi teléfono</button></div>`
          : `<input class="title-input" id="sname" value="${esc(set.name)}" aria-label="Nombre del setlist">
             <input type="date" id="sdate" value="${esc(set.date)}" aria-label="Fecha">`
      }
      <ol class="setlist">
        ${
          rows.length
            ? rows
                .map(
                  ({ item, i, song, key, transition }) => `<li>
                ${transition ? `<span class="transition">${esc(transition)}</span>` : ''}
                <div class="setrow">
                  <span class="num">${i + 1}</span>
                  <a class="song-main" href="${shared ? (song ? `#/c/${encodeURIComponent(song.id)}` : '#') : `#/set/${set.id}/${i}`}">
                    <span class="song-title">${esc(song ? song.title : 'Canción no encontrada')}</span>
                    <span class="song-sub">${esc(song?.author || '')}${song?.voice ? ` · ${esc(song.voice)}` : ''}</span>
                  </a>
                  <span class="song-meta">
                    ${key ? `<span class="key">${esc(keyName(key))}</span>` : ''}
                    ${song?.bpm ? `<span class="bpm">${song.bpm}</span>` : ''}
                  </span>
                  ${
                    shared
                      ? ''
                      : `<span class="setctl">
                          <button data-move="${i}" data-dir="-1" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
                          <button data-move="${i}" data-dir="1" aria-label="Bajar" ${i === rows.length - 1 ? 'disabled' : ''}>↓</button>
                          <button data-remove="${i}" aria-label="Quitar">✕</button>
                        </span>`
                  }
                </div>
              </li>`,
                )
                .join('')
            : '<p class="empty">Aún no hay canciones. Agrégalas aquí abajo o desde la ficha de cada canción.</p>'
        }
      </ol>
      ${
        shared
          ? ''
          : `<div class="row addset">
              <select id="addsong" aria-label="Canción">${songOptions}</select>
              <button data-action="addsong">Agregar</button>
            </div>
            <div class="row actions">
              ${rows.length ? `<a class="button" href="#/set/${set.id}/0">Tocar</a>` : ''}
              <button data-action="share">Compartir</button>
              <button class="danger" data-action="delete">Borrar</button>
            </div>
            <p class="hint" id="sharemsg"></p>`
      }
    </article>`;

  if (shared) {
    app.querySelector('[data-action="import"]').addEventListener('click', () => {
      location.hash = `#/set/${importSetlist(shared).id}`;
    });
    return;
  }
  const update = (fn) => {
    fn(set);
    saveSetlist(set);
    renderSetlist(set.id);
  };
  app.querySelector('#sname').addEventListener('change', (e) => update((s) => (s.name = e.target.value.trim() || 'Setlist')));
  app.querySelector('#sdate').addEventListener('change', (e) => update((s) => (s.date = e.target.value)));
  app.querySelectorAll('[data-move]').forEach((b) =>
    b.addEventListener('click', () =>
      update((s) => {
        const i = Number(b.dataset.move);
        const j = i + Number(b.dataset.dir);
        [s.items[i], s.items[j]] = [s.items[j], s.items[i]];
      }),
    ),
  );
  app.querySelectorAll('[data-remove]').forEach((b) =>
    b.addEventListener('click', () => update((s) => s.items.splice(Number(b.dataset.remove), 1))),
  );
  app.querySelector('[data-action="addsong"]').addEventListener('click', () => {
    const song = songById(app.querySelector('#addsong').value);
    if (song) update((s) => s.items.push({ id: song.id, key: song.key ? keyName(song.key) : '' }));
  });
  app.querySelector('[data-action="delete"]').addEventListener('click', () => {
    if (!confirm(`¿Borrar “${set.name}” de este teléfono?`)) return;
    deleteSetlist(set.id);
    location.hash = '#/sets';
  });
  app.querySelector('[data-action="share"]').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#/compartido/${encodeSetlist(set)}`;
    const text = `${set.name}${set.date ? ` · ${fmtDay(set.date)}` : ''}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: text, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      document.getElementById('sharemsg').textContent = 'Link copiado. Pégalo en el chat del equipo.';
    } catch {
      document.getElementById('sharemsg').innerHTML = `Copia este link: <input readonly value="${esc(url)}">`;
    }
  });
}

// ---------- navegación ----------
function route() {
  const h = location.hash;
  let m;
  if ((m = h.match(/^#\/c\/(.+)$/))) return () => renderSong(decodeURIComponent(m[1]));
  if ((m = h.match(/^#\/set\/([^/]+)\/(\d+)$/))) {
    const set = getSetlist(m[1]);
    const index = Number(m[2]);
    if (set && set.items[index]) return () => renderSong(set.items[index].id, { set, index });
    return () => renderSetlist(m[1]);
  }
  if ((m = h.match(/^#\/set\/([^/]+)$/))) return () => renderSetlist(m[1]);
  if ((m = h.match(/^#\/compartido\/(.+)$/))) {
    const shared = decodeSetlist(m[1]);
    if (shared) return () => renderSetlist('', shared);
  }
  if (h === '#/sets') return renderSetlists;
  return renderList;
}

const isList = () => !location.hash || location.hash === '#/' || location.hash === '#';

function render({ navigated = false } = {}) {
  const y = navigated ? (isList() ? state.listScroll || 0 : 0) : window.scrollY;
  route()();
  window.scrollTo(0, y);
}

window.addEventListener('hashchange', () => render({ navigated: true }));
window.addEventListener('scroll', () => {
  if (isList()) state.listScroll = window.scrollY;
});

app.addEventListener('input', (e) => {
  if (e.target.id === 'q') {
    state.filters.q = e.target.value;
    renderResults();
  } else if (e.target.id === 'sort') {
    state.filters.sort = e.target.value;
    saveFilters();
    renderResults();
  }
});

app.addEventListener('click', async (e) => {
  const chip = e.target.closest('[data-group]');
  if (chip) {
    const g = chip.dataset.group;
    if (g === 'catholic') state.filters.catholic = !state.filters.catholic;
    else if (state.filters[g].has(chip.dataset.value)) state.filters[g].delete(chip.dataset.value);
    else state.filters[g].add(chip.dataset.value);
    saveFilters();
    renderList();
    return;
  }
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'filters') {
    state.showFilters = !state.showFilters;
    renderList();
  } else if (action === 'clear') {
    FILTER_GROUPS.forEach((g) => state.filters[g].clear());
    state.filters.catholic = false;
    saveFilters();
    renderList();
  } else if (action === 'reload') {
    e.target.disabled = true;
    await loadSongs();
  }
});

// Al volver a la app, trae los cambios de la hoja sin molestar.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadSongs({ quiet: true });
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker:', err));
}

app.innerHTML = '<p class="empty">Cargando repertorio…</p>';
loadSongs();
