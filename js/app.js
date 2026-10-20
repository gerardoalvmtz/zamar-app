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
  duplicateSetlist,
  uploadSetlist,
  addToSetlist,
  encodeSetlist,
  decodeSetlist,
  importSetlist,
  useTeam,
  teamMode,
  refreshTeam,
} from './setlists.js';
import { canEdit, setupApi, readBase64 } from './api.js';
import { setupEditing } from './edit.js';
import { setupCompositions } from './compositions.js';
import { setupAgenda } from './agenda.js';
import { bridges, bridgeHtml, tempoTip, CLOSENESS } from './bridges.js';
import { setlistImage, setlistPdf, shareFile, qrCanvas, qrPoster, fileName } from './setshare.js';

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
    if (state.source === 'refreshing') state.source = 'cache'; // ya se ve la copia: solo falta avisar
    else if (quiet && state.songs.length) return;
    else if (!fromCache()) {
      const snap = await fetch('data/repertorio.json').then((r) => r.json());
      state.songs = attachTexts(rowsToSongs(snap.rows), rowsToTexts(snap.letras));
      state.source = 'snapshot';
      state.updatedAt = new Date(snap.actualizado + 'T12:00:00');
    }
  }
  // Una recarga en segundo plano no debe borrar un formulario, una grabación ni lo que se está escribiendo.
  if (quiet && /^#\/(comp(\/|$)|agenda\/|editar|nueva|importar)/.test(location.hash)) return;
  if (quiet && isTyping()) return;
  render();
}

/** La última copia de la hoja guardada en el teléfono. */
function fromCache() {
  const cached = store.get(CACHE_KEY);
  if (!cached?.rows) return false;
  state.songs = attachTexts(rowsToSongs(cached.rows), rowsToTexts(cached.textRows));
  state.source = 'cache';
  state.updatedAt = new Date(cached.at);
  return true;
}

const isTyping = () => app.contains(document.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);

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
  if (state.source === 'live' || state.source === 'refreshing') return '';
  const msg =
    state.source === 'cache'
      ? `Sin conexión con la hoja. Mostrando la copia guardada del ${fmtDate(state.updatedAt)}`
      : `No se pudo leer la hoja en vivo. Mostrando la copia incluida en la app (${state.updatedAt.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}).`;
  return `<div class="banner">${esc(msg)} <button class="link" data-action="reload">Reintentar</button></div>`;
}

const topBar = () => `<header class="top home">
      <a href="#/" class="brandlink" aria-label="Inicio">${logo('brand', 'img/logo-negro.png', 'img/logo-blanco.png', 'Zamar Adoración')}</a>
      <button class="icon" data-action="reload" aria-label="Actualizar">⟳</button>
    </header>`;

function homeHeader(active) {
  return `${topBar()}
    <nav class="nav">
      <a href="#/canciones" ${active === 'songs' ? 'aria-current="page"' : ''}>Canciones</a>
      <a href="#/sets" ${active === 'sets' ? 'aria-current="page"' : ''}>Setlists</a>
      ${
        canEdit()
          ? `<a href="#/agenda" ${active === 'agenda' ? 'aria-current="page"' : ''}>Agenda</a>
             <a href="#/comp" ${active === 'comps' ? 'aria-current="page"' : ''}>Composiciones</a>`
          : ''
      }
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

// ---------- inicio ----------
function renderHome() {
  document.title = 'Zamar Adoración';
  const sets = allSetlists();
  const last = songById(store.get('zamar:last', ''));
  const ready = state.songs.filter((s) => statusClass(s.status) === 'ok').length;
  const tile = (href, icon, title, sub) =>
    `<a class="tile" href="${href}"><span class="tile-icon" aria-hidden="true">${icon}</span><strong>${title}</strong><small>${esc(sub)}</small></a>`;
  app.innerHTML = `
    ${topBar()}
    ${sourceBanner()}
    <section class="hero">
      <img src="img/equipo-800.jpg" srcset="img/equipo-800.jpg 800w, img/equipo.jpg 1400w" sizes="(max-width: 720px) 100vw, 720px" alt="El equipo de Zamar Adoración">
      <div class="hero-text">
        <strong>Todo lo que respira alabe al Señor</strong>
        <small>Salmo 150, 6</small>
      </div>
    </section>
    ${agenda?.nextBanner() || ''}
    ${
      last
        ? `<a class="nextstrip" href="#/c/${encodeURIComponent(last.id)}"><span aria-hidden="true">🎵</span><span>Seguir con <strong>${esc(last.title)}</strong></span><span aria-hidden="true">›</span></a>`
        : ''
    }
    <div class="tiles">
      ${tile('#/canciones', '🎵', 'Canciones', `${state.songs.length} en el repertorio · ${ready} listas`)}
      ${tile('#/sets', '📋', 'Setlists', sets.length ? `${sets.length} en este teléfono` : 'Arma el de tu próximo evento')}
      ${canEdit() ? tile('#/agenda', '📅', 'Agenda', 'Eventos y quién va') : ''}
      ${canEdit() ? tile('#/comp', '✍️', 'Composiciones', 'Ideas, audios y comentarios') : ''}
    </div>
    <footer class="foot">${state.updatedAt ? `Actualizado ${esc(fmtDate(state.updatedAt))}` : ''}</footer>`;
}

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
    ${
      canEdit()
        ? `<div class="row edittools">
            <a class="button ghost" href="#/nueva">+ Nueva canción</a>
            <a class="button ghost" href="#/importar">Importar .cho</a>
          </div>`
        : ''
    }
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
// Tarjeta de Spotify: portada y nombre (oEmbed de Spotify) con un toque que abre la app.
// El reproductor dentro de la página solo se carga si alguien lo pide, porque en algunos
// teléfonos se queda en blanco.
const spotifyOpen = new Set(); // canciones con el reproductor abierto mientras la app está abierta
const spotifyParts = (url) => String(url).match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist)\/([A-Za-z0-9]+)/);

function spotifyEmbed(url) {
  const m = spotifyParts(url);
  if (!m) return '';
  const ref = `${m[1]}/${m[2]}`;
  const info = store.get('zamar:spotify', {})[ref];
  const player = spotifyOpen.has(ref)
    ? `<iframe class="spotify" src="https://open.spotify.com/embed/${ref}?utm_source=generator" height="152" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" title="Spotify"></iframe>`
    : `<button type="button" class="link spplay" data-spplay="${esc(ref)}">▶ Escuchar aquí</button>`;
  return `<a class="spcard" data-sp="${esc(ref)}" href="${esc(url)}" target="_blank" rel="noopener">
      <img class="spart" alt="" ${info?.img ? `src="${esc(info.img)}"` : 'hidden'}>
      <span class="sptext"><strong>${esc(info?.title || 'Escuchar en Spotify')}</strong><small>Abrir en Spotify</small></span>
      <span class="spicon" aria-hidden="true">↗</span>
    </a>
    ${player}`;
}

/** Trae portada y nombre de Spotify la primera vez y los guarda para las siguientes. */
async function hydrateSpotify(rerender) {
  const card = app.querySelector('.spcard[data-sp]');
  app.querySelector('[data-spplay]')?.addEventListener('click', (e) => {
    spotifyOpen.add(e.currentTarget.dataset.spplay);
    rerender();
  });
  if (!card) return;
  const ref = card.dataset.sp;
  const cache = store.get('zamar:spotify', {});
  if (cache[ref]) return;
  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/${ref}`)}`);
    if (!res.ok) return;
    const j = await res.json();
    cache[ref] = { title: String(j.title || ''), img: /^https:\/\//.test(j.thumbnail_url) ? j.thumbnail_url : '' };
    store.set('zamar:spotify', cache);
    const now = app.querySelector(`.spcard[data-sp="${CSS.escape(ref)}"]`);
    if (!now) return;
    if (cache[ref].title) now.querySelector('strong').textContent = cache[ref].title;
    if (cache[ref].img) Object.assign(now.querySelector('img'), { src: cache[ref].img, hidden: false });
  } catch {
    // Sin conexión o Spotify no respondió: se queda la tarjeta sencilla.
  }
}

/**
 * Dibuja la ficha sin tocar el reproductor de Spotify si sigue siendo la misma canción.
 * Al cambiar de tono o al llegar la hoja nueva se vuelve a dibujar todo, y un iframe que se
 * quita de la página se recarga desde cero; en el teléfono eso lo dejaba en blanco.
 */
function renderKeepingSpotify(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  let n = tpl.content.querySelector('iframe.spotify');
  let o = app.querySelector('iframe.spotify');
  if (!n || !o || n.getAttribute('src') !== o.getAttribute('src')) {
    app.innerHTML = html;
    return;
  }
  // Se cambia todo lo que rodea al reproductor, nivel por nivel, dejando el iframe en su lugar.
  while (o !== app) {
    const op = o.parentNode;
    const np = n.parentNode;
    [...op.childNodes].forEach((c) => c !== o && c.remove());
    let before = true;
    for (const c of [...np.childNodes]) {
      if (c === n) before = false;
      else if (before) op.insertBefore(c, o);
      else op.appendChild(c);
    }
    if (op !== app) for (const a of np.attributes) op.setAttribute(a.name, a.value);
    o = op;
    n = np;
  }
}

/**
 * ctx: { set, index } cuando la canción se abre desde un setlist; entonces el tono
 * viene del setlist y los botones de tono lo cambian ahí.
 */
function renderSong(id, ctx = null, came = null) {
  const song = songById(id);
  const fromSong = came ? songById(came.id) : null;
  const back = ctx
    ? backHeader(`#/set/${ctx.set.id}`, ctx.set.name)
    : fromSong
      ? backHeader(`#/c/${encodeURIComponent(fromSong.id)}`, fromSong.title)
      : backHeader('#/canciones', 'Repertorio');
  if (!song) {
    app.innerHTML = `${back}<p class="empty">No encontré esta canción. Quizá cambió de nombre en la hoja.</p>`;
    return;
  }
  document.title = `${song.title} · Zamar`;
  if (!ctx) store.set('zamar:last', song.id);

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

  const nextItem = ctx ? ctx.set.items[ctx.index + 1] : null;
  const nextSong = nextItem ? songById(nextItem.id) : null;
  const nextKey = nextItem ? parseKey(nextItem.key) || nextSong?.key || null : null;
  const nextBridge = key && nextKey ? bridges(key, nextKey) : null;
  // Puente recomendado y, plegados, los demás caminos.
  const bridgeBlock = (b, bpmA, bpmB) =>
    (b
      ? `<p class="hint">${esc(CLOSENESS[b.closeness])}</p>
         ${bridgeHtml({ ...b, options: b.options.slice(0, 1) }, esc)}
         ${b.options.length > 1 ? `<details class="more"><summary>Ver otros caminos</summary>${bridgeHtml({ ...b, options: b.options.slice(1), tip: '' }, esc, { recommend: false })}</details>` : ''}`
      : '<p class="hint">Falta el tono de alguna de las dos canciones para calcular el puente.</p>') +
    (tempoTip(bpmA, bpmB) ? `<p class="hint tip">🥁 ${esc(tempoTip(bpmA, bpmB))}</p>` : '');

  // Si se llegó desde "Para conectar" de otra canción: cómo pasar de aquella a esta.
  const cameKey = came ? parseKey(came.key) || fromSong?.key || null : null;
  const cameFrom = fromSong
    ? `<section class="nextup camefrom">
        <h2>Para llegar desde</h2>
        <a class="nextsong" href="#/c/${encodeURIComponent(fromSong.id)}">
          <span class="song-title">‹ ${esc(fromSong.title)}</span>
          <span class="song-meta">${cameKey ? `<span class="key">${esc(keyName(cameKey))}</span>` : ''}${fromSong.bpm ? `<span class="bpm">${fromSong.bpm}</span>` : ''}</span>
        </a>
        ${bridgeBlock(cameKey && key ? bridges(cameKey, key) : null, fromSong.bpm, song.bpm)}
      </section>`
    : '';

  const nextUp = nextItem
    ? `<section class="nextup">
        <h2>Para llegar a la siguiente</h2>
        <a class="nextsong" href="#/set/${ctx.set.id}/${ctx.index + 1}">
          <span class="song-title">${esc(nextSong ? nextSong.title : 'Canción no encontrada')}</span>
          <span class="song-meta">${nextKey ? `<span class="key">${esc(keyName(nextKey))}</span>` : ''}${nextSong?.bpm ? `<span class="bpm">${nextSong.bpm}</span>` : ''}</span>
        </a>
        ${bridgeBlock(nextBridge, song.bpm, nextSong?.bpm)}
      </section>`
    : '';

  const nav = ctx
    ? `<div class="setnav">
        ${ctx.index > 0 ? `<a class="button ghost" href="#/set/${ctx.set.id}/${ctx.index - 1}">‹ Anterior</a>` : '<span></span>'}
        <span class="hint">${ctx.index + 1} de ${ctx.set.items.length}</span>
        ${ctx.index < ctx.set.items.length - 1 ? `<a class="button ghost" href="#/set/${ctx.set.id}/${ctx.index + 1}">Siguiente ›</a>` : '<span></span>'}
      </div>`
    : '';

  renderKeepingSpotify(`
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
      <p class="status"><span class="dot ${statusClass(song.status)}"></span> ${esc(song.status || 'Sin estatus')}
        ${canEdit() && !ctx ? `<a class="editlink" href="#/editar/${encodeURIComponent(song.id)}">✎ Editar</a>` : ''}</p>

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

      ${cameFrom}
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

      ${
        song.files?.length
          ? `<section><h2>Archivos</h2><div class="chips">${song.files
              .filter((f) => safeUrl(f.url))
              .map((f) => `<a class="chip" href="${esc(f.url)}" target="_blank" rel="noopener">📎 ${esc(f.name)}</a>`)
              .join('')}</div></section>`
          : ''
      }
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
        ${key ? `<p class="hint"><a href="#/puente/${encodeURIComponent(keyName(key))}">🧭 Ver el puente hacia cualquier tono</a></p>` : ''}
        ${
          !key
            ? '<p class="hint">Sin tonalidad no puedo sugerir canciones.</p>'
            : sugg.length
              ? `<div class="list">${sugg
                  .map(
                    (x) => `<a class="song" href="#/c/${encodeURIComponent(x.song.id)}?de=${encodeURIComponent(song.id)}&tono=${encodeURIComponent(keyName(key))}">
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
      ${nextUp}
    </article>
    ${nav}`);

  const rerender = () => renderSong(song.id, ctx && { set: getSetlist(ctx.set.id) || ctx.set, index: ctx.index }, came);
  hydrateSpotify(rerender);
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
    ${setGroup(sets.filter((s) => !s.local), teamMode() ? 'Del equipo' : '', teamMode() ? 'Todavía no hay setlists del equipo.' : 'Todavía no hay setlists en este teléfono.')}
    ${
      teamMode() && sets.some((s) => s.local)
        ? `<h2 class="setgroup">Solo en este teléfono</h2>
           <p class="hint">Los armaste antes de que los setlists fueran del equipo. Súbelos para que todos los vean.</p>
           ${setGroup(sets.filter((s) => s.local), '', '', true)}`
        : ''
    }
    <p class="hint">${
      teamMode()
        ? 'Los setlists los ve todo el equipo y cualquiera los puede editar; borrarlos pide el PIN.'
        : 'Los setlists se guardan en este teléfono. Para pasarlos al equipo usa “Compartir”.'
    }</p>
    <a class="button ghost bridgelink" href="#/puente">🧭 Puente entre dos tonos</a>`;
  app.querySelectorAll('[data-upload]').forEach((b) =>
    b.addEventListener('click', () => {
      uploadSetlist(b.dataset.upload);
      renderSetlists();
    }),
  );
  app.querySelector('#newset').addEventListener('submit', (e) => {
    e.preventDefault();
    const set = createSetlist(app.querySelector('#setname').value.trim(), app.querySelector('#setdate').value);
    location.hash = `#/set/${set.id}`;
  });
}

function setGroup(sets, title, empty, upload = false) {
  return `${title ? `<h2 class="setgroup">${esc(title)}</h2>` : ''}
    <div class="list">
      ${
        sets.length
          ? sets
              .map(
                (s) => `<div class="song setcard">
                  <a class="song-main" href="#/set/${s.id}">
                    <span class="song-title">${esc(s.name)}</span>
                    <span class="song-sub">${esc(fmtDay(s.date) || 'Sin fecha')} · ${s.items.length} canciones</span>
                  </a>
                  ${upload ? `<button data-upload="${esc(s.id)}">Subir al equipo</button>` : ''}
                </div>`,
              )
              .join('')
          : empty
            ? `<p class="empty">${esc(empty)}</p>`
            : ''
      }
    </div>`;
}

function setItems(set) {
  return set.items.map((item, i) => {
    const song = songById(item.id);
    const key = parseKey(item.key) || song?.key || null;
    const prev = i > 0 ? parseKey(set.items[i - 1].key) || songById(set.items[i - 1].id)?.key : null;
    const rel = prev && key ? keyRelation(prev, key) : null;
    const changes = rel && (prev.pc !== key.pc || prev.minor !== key.minor);
    return { item, i, song, key, transition: rel ? rel.label || 'Cambio de tono' : '', bridge: changes ? bridges(prev, key) : null };
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
  const themes = [...new Set(state.songs.flatMap((s) => s.themes))].sort((a, b) => a.localeCompare(b, 'es'));

  app.innerHTML = `
    ${backHeader('#/sets', 'Setlists')}
    <article class="detail">
      ${
        shared
          ? `<h1>${esc(set.name)}</h1><p class="author">${esc(fmtDay(set.date))}</p>
             <div class="banner">Te compartieron este setlist. <button class="link" data-action="import">${teamMode() ? 'Guardarlo en los setlists del equipo' : 'Guardarlo en mi teléfono'}</button></div>`
          : `<input class="title-input" id="sname" value="${esc(set.name)}" aria-label="Nombre del setlist">
             <input type="date" id="sdate" value="${esc(set.date)}" aria-label="Fecha">
             ${
               teamMode() && set.local
                 ? '<div class="banner">Este setlist solo está en tu teléfono. <button class="link" data-action="upload">Subirlo al equipo</button></div>'
                 : ''
             }`
      }
      <ol class="setlist">
        ${
          rows.length
            ? rows
                .map(
                  ({ item, i, song, key, transition, bridge }) => `<li>
                ${
                  bridge
                    ? `<details class="transition"><summary>${esc(transition)} · <u>ver puente</u></summary>${bridgeHtml(bridge, esc)}</details>`
                    : transition
                      ? `<span class="transition">${esc(transition)}</span>`
                      : ''
                }
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
          : `<section class="addpanel">
              <h2>Agregar canción</h2>
              <input id="addq" type="search" placeholder="Busca por título o autor" autocomplete="off" value="${esc(addState.q)}">
              <select id="addtheme" aria-label="Tema">
                <option value="">Todos los temas</option>
                ${themes.map((t) => `<option ${t === addState.theme ? 'selected' : ''}>${esc(t)}</option>`).join('')}
              </select>
              <ul class="addresults" id="addresults"></ul>
            </section>
            <div class="row actions setactions">
              ${rows.length ? `<a class="button" href="#/set/${set.id}/0">Tocar</a>` : ''}
              <button data-action="share">Compartir link</button>
              ${rows.length ? '<button data-action="image">🖼 Imagen</button><button data-action="pdf">📄 PDF con letras</button>' : ''}
              ${rows.length && openApi ? '<button data-action="qr">🔳 QR con letras</button>' : ''}
              <button data-action="duplicate">Duplicar</button>
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
  setupAddPanel(set, update);
  const fileRows = () =>
    setItems(set).map(({ song, key }) => ({
      title: song ? song.title : 'Canción no encontrada',
      author: song?.author || '',
      key: key ? keyName(key) : '',
      bpm: song?.bpm || '',
      lyrics: song ? song.lyrics || lyricsFromChords(song.chords) : '',
    }));
  const fileAction = (name, label, make, ext, mime) =>
    app.querySelector(`[data-action="${name}"]`)?.addEventListener('click', async (e) => {
      const button = e.currentTarget;
      const msg = document.getElementById('sharemsg');
      button.disabled = true;
      msg.textContent = `Preparando ${label}…`;
      try {
        const how = await shareFile(await make(set, fileRows()), set, ext, mime);
        msg.textContent = how === 'downloaded' ? `Listo: se descargó ${label}.` : '';
      } catch (err) {
        msg.textContent = err.message || `No se pudo generar ${label}.`;
      }
      button.disabled = false;
    });
  fileAction('image', 'la imagen', setlistImage, 'png', 'image/png');
  fileAction('pdf', 'el PDF', setlistPdf, 'pdf', 'application/pdf');
  app.querySelector('[data-action="qr"]')?.addEventListener('click', async (e) => {
    const button = e.currentTarget;
    const msg = document.getElementById('sharemsg');
    if (set.local) return (msg.textContent = 'Primero sube este setlist al equipo.');
    button.disabled = true;
    msg.textContent = 'Generando el PDF y subiéndolo a Drive…';
    try {
      // El PDF para la asamblea va sin tonos ni BPM; se vuelve a subir para que lleve los últimos cambios.
      const pdf = await setlistPdf(set, fileRows(), { audience: true });
      const { url } = await openApi('uploadSetlistPdf', { id: set.id, data: await readBase64(pdf), name: fileName(set, 'pdf') });
      msg.textContent = '';
      await showQr(set, url);
    } catch (err) {
      msg.textContent = err.message || 'No se pudo generar el QR.';
    }
    button.disabled = false;
  });
  app.querySelector('[data-action="upload"]')?.addEventListener('click', () => {
    const up = uploadSetlist(set.id);
    if (up) location.hash = `#/set/${up.id}`;
  });
  app.querySelector('[data-action="duplicate"]').addEventListener('click', () => {
    const copy = duplicateSetlist(set.id);
    if (copy) location.hash = `#/set/${copy.id}`;
  });
  app.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
    const shared = !set.local;
    if (!confirm(shared ? `¿Borrar “${set.name}” para todo el equipo? Se pide el PIN.` : `¿Borrar “${set.name}” de este teléfono?`)) return;
    const button = e.currentTarget;
    button.disabled = true;
    try {
      await deleteSetlist(set.id);
      location.hash = '#/sets';
    } catch (err) {
      alert(err.message);
      button.disabled = false;
    }
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

/** Ventana con el QR del PDF: para proyectarlo, imprimirlo o mandarlo. */
async function showQr(set, url) {
  const dialog = document.createElement('dialog');
  dialog.className = 'qrdialog';
  dialog.innerHTML = `
    <h2>${esc(set.name)}</h2>
    <p class="hint">Quien escanee este código abre el PDF con las letras. Si cambias el setlist, vuelve a generar el QR.</p>
    <div class="qrbox"></div>
    <div class="row actions setactions">
      <button data-q="share">Compartir QR</button>
      <a class="button ghost" href="${esc(url)}" target="_blank" rel="noopener">Abrir PDF</a>
      <button data-q="copy">Copiar link</button>
      <button data-q="close">Cerrar</button>
    </div>
    <p class="hint" data-q="msg"></p>`;
  dialog.querySelector('.qrbox').append(await qrCanvas(url, 520));
  document.body.append(dialog);
  const msg = dialog.querySelector('[data-q="msg"]');
  dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('[data-q="close"]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-q="copy"]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      msg.textContent = 'Link copiado.';
    } catch {
      msg.innerHTML = `Copia este link: <input readonly value="${esc(url)}">`;
    }
  });
  dialog.querySelector('[data-q="share"]').addEventListener('click', async () => {
    const how = await shareFile(await qrPoster(set, url), set, 'png', 'image/png', '-qr');
    if (how === 'downloaded') msg.textContent = 'Se descargó la imagen del QR.';
  });
  dialog.showModal();
}

// Búsqueda para agregar canciones al setlist; se recuerda entre cada cambio de la lista.
const addState = { q: '', theme: '', pick: '' };

function setupAddPanel(set, update) {
  const q = app.querySelector('#addq');
  const theme = app.querySelector('#addtheme');
  const list = app.querySelector('#addresults');
  if (!q) return;
  const inSet = new Set(set.items.map((x) => x.id));
  const draw = () => {
    const words = normalize(addState.q).split(/\s+/).filter(Boolean);
    if (!words.length && !addState.theme) {
      list.innerHTML = '<li class="hint">Escribe un nombre o elige un tema.</li>';
      return;
    }
    const found = sortedSongs(
      state.songs.filter((s) => {
        const text = normalize(`${s.title} ${s.author}`);
        return words.every((w) => text.includes(w)) && (!addState.theme || s.themes.includes(addState.theme));
      }),
    ).slice(0, 40);
    list.innerHTML = found.length
      ? found
          .map((s) => {
            const open = addState.pick === s.id;
            const keys = s.key ? Array.from({ length: 12 }, (_, n) => transposeKey(s.key, n - 5)) : [];
            return `<li class="${open ? 'open' : ''}">
              <button class="addpick" data-pick="${esc(s.id)}">
                <span class="song-main">
                  <span class="song-title">${esc(s.title)}${inSet.has(s.id) ? ' <small class="hint">· ya está</small>' : ''}</span>
                  <span class="song-sub">${esc(s.author || '')}</span>
                </span>
                <span class="song-meta">${s.key ? `<span class="key">${esc(keyName(s.key))}</span>` : ''}${s.bpm ? `<span class="bpm">${s.bpm}</span>` : ''}</span>
              </button>
              ${
                open
                  ? `<div class="row addkey">
                      <label>Tono
                        <select id="addkeysel">${
                          keys.length
                            ? keys.map((k) => `<option value="${esc(keyName(k))}" ${keyName(k) === keyName(s.key) ? 'selected' : ''}>${esc(keyName(k))}${keyName(k) === keyName(s.key) ? (s.keyZamar ? ' (Zamar)' : ' (original)') : ''}</option>`).join('')
                            : '<option value="">Sin tono</option>'
                        }</select>
                      </label>
                      <button data-addsong="${esc(s.id)}">Agregar</button>
                    </div>`
                  : ''
              }
            </li>`;
          })
          .join('')
      : '<li class="hint">No encontré canciones con esa búsqueda.</li>';
    list.querySelectorAll('[data-pick]').forEach((b) =>
      b.addEventListener('click', () => {
        addState.pick = addState.pick === b.dataset.pick ? '' : b.dataset.pick;
        draw();
      }),
    );
    list.querySelector('[data-addsong]')?.addEventListener('click', (e) => {
      const key = list.querySelector('#addkeysel').value;
      const id = e.currentTarget.dataset.addsong;
      addState.pick = '';
      update((s) => s.items.push({ id, key }));
      document.getElementById('sharemsg').textContent = `Agregada: ${songById(id)?.title || ''}`;
    });
  };
  q.addEventListener('input', () => {
    addState.q = q.value;
    addState.pick = '';
    draw();
  });
  theme.addEventListener('change', () => {
    addState.theme = theme.value;
    addState.pick = '';
    draw();
  });
  draw();
}

// ---------- puente entre dos tonos ----------
const ALL_KEYS = [false, true].flatMap((minor) => Array.from({ length: 12 }, (_, pc) => keyName({ pc, minor })));

function renderBridgePage(fromText = '', toText = '') {
  document.title = 'Zamar · Puente entre tonos';
  const from = parseKey(fromText) || parseKey(store.get('zamar:bridgefrom', 'G'));
  const to = parseKey(toText) || parseKey(store.get('zamar:bridgeto', 'A'));
  const opt = (k) => ALL_KEYS.map((n) => `<option ${n === keyName(k) ? 'selected' : ''}>${n}</option>`).join('');
  const b = bridges(from, to);
  app.innerHTML = `
    ${backHeader('#/sets', 'Setlists')}
    <article class="detail">
      <h1>Puente entre tonos</h1>
      <p class="author">Qué tocar al final de una canción para llegar a la siguiente sin que suene brusco.</p>
      <div class="row keypair">
        <label class="field"><span>Termina en</span><select id="bfrom">${opt(from)}</select></label>
        <label class="field"><span>Sigue en</span><select id="bto">${opt(to)}</select></label>
      </div>
      <p class="hint">${esc(CLOSENESS[b.closeness])}${b.relation ? ` · ${esc(b.relation)}` : ''}</p>
      ${bridgeHtml(b, esc)}
    </article>`;
  const go = () => {
    const f = app.querySelector('#bfrom').value;
    const t = app.querySelector('#bto').value;
    store.set('zamar:bridgefrom', f);
    store.set('zamar:bridgeto', t);
    history.replaceState(null, '', `#/puente/${encodeURIComponent(f)}/${encodeURIComponent(t)}`);
    renderBridgePage(f, t);
  };
  app.querySelector('#bfrom').addEventListener('change', go);
  app.querySelector('#bto').addEventListener('change', go);
}

// ---------- navegación ----------
const editing = canEdit() ? setupEditing({ app, state, store, esc, backHeader, songById, loadSongs }) : null;
const comps = canEdit() ? setupCompositions({ app, store, esc, backHeader, homeHeader, loadSongs }) : null;
const agenda = canEdit() ? setupAgenda({ app, store, esc, backHeader, homeHeader, songs: () => state.songs }) : null;

// Setlists del equipo: viven en la hoja privada. Verlos y editarlos no pide PIN; borrarlos sí.
let openApi = null;
if (canEdit()) {
  const team = setupApi(store);
  const { api } = team;
  openApi = team.openApi;
  useTeam({
    list: async () => (await openApi('listSetlists')).setlists,
    save: (set) => openApi('saveSetlist', set),
    remove: (id) => api('deleteSetlist', { id }),
    onError: (err) => {
      alert(`No se pudo guardar el setlist en la hoja: ${err.message}`);
      syncSets();
    },
  });
}

/** Trae los setlists del equipo y repinta si cambiaron, sin interrumpir a quien está escribiendo. */
async function syncSets() {
  try {
    const changed = await refreshTeam();
    if (changed && !isTyping() && /^#\/(sets|set\/[^/]+)?$|^#?\/?$/.test(location.hash)) render();
  } catch {
    /* sin conexión: se queda la última copia */
  }
}

function route() {
  const h = location.hash;
  let m;
  if (editing) {
    if ((m = h.match(/^#\/editar\/(.+)$/))) return () => editing.renderEdit(decodeURIComponent(m[1]));
    if (h === '#/nueva') return () => editing.renderEdit('');
    if (h === '#/importar') return editing.renderImport;
    if (h === '#/comp') return comps.renderList;
    if (h === '#/comp/nueva') return () => comps.renderEdit('');
    if (h === '#/comp/ideas') return comps.renderIdeas;
    if ((m = h.match(/^#\/comp\/([^/]+)\/editar$/))) return () => comps.renderEdit(decodeURIComponent(m[1]));
    if ((m = h.match(/^#\/comp\/([^/]+)$/))) return () => comps.renderOne(decodeURIComponent(m[1]));
    if (h === '#/agenda') return agenda.renderList;
    if (h === '#/agenda/nuevo') return () => agenda.renderEdit('');
    if ((m = h.match(/^#\/agenda\/([^/]+)\/editar$/))) return () => agenda.renderEdit(decodeURIComponent(m[1]));
    if ((m = h.match(/^#\/agenda\/([^/]+)$/))) return () => agenda.renderOne(decodeURIComponent(m[1]));
  }
  if ((m = h.match(/^#\/c\/([^?]+)(?:\?(.*))?$/))) {
    const q = new URLSearchParams(m[2] || '');
    const came = q.get('de') ? { id: q.get('de'), key: q.get('tono') || '' } : null;
    return () => renderSong(decodeURIComponent(m[1]), null, came);
  }
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
  if (h === '#/canciones') return renderList;
  if ((m = h.match(/^#\/puente(?:\/([^/]*))?(?:\/([^/]*))?$/)))
    return () => renderBridgePage(decodeURIComponent(m[1] || ''), decodeURIComponent(m[2] || ''));
  return renderHome;
}

const isList = () => location.hash === '#/canciones';

function render({ navigated = false } = {}) {
  const y = navigated ? (isList() ? state.listScroll || 0 : 0) : window.scrollY;
  route()();
  window.scrollTo(0, y);
}

window.addEventListener('hashchange', () => {
  render({ navigated: true });
  if (/^#\/(sets|set\/[^/]+)$/.test(location.hash)) syncSets();
});
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
  if (document.visibilityState === 'visible') {
    loadSongs({ quiet: true });
    syncSets();
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker:', err));
}

// Abre al instante con la última copia guardada y trae la hoja en segundo plano
// (Google tarda varios segundos en responder). La primera vez sí hay que esperarla.
if (fromCache()) {
  state.source = 'refreshing';
  render();
  loadSongs({ quiet: true });
} else {
  app.innerHTML = '<p class="empty">Cargando repertorio…</p>';
  loadSongs();
}
syncSets();
