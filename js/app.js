import { sheetCsvUrl, LYRICS_GID } from './config.js';
import { parseCsv, rowsToSongs, rowsToTexts, attachTexts, suggestions, normalize } from './songs.js';
import {
  keyName,
  transposeKey,
  transposeText,
  useFlats,
  isChordLine,
  semitonesBetween,
} from './music.js';

const CACHE_KEY = 'zamar:repertorio';
const app = document.getElementById('app');
const state = {
  songs: [],
  source: '', // 'live' | 'cache' | 'snapshot'
  updatedAt: null,
  filters: { q: '', theme: '', status: '', catholic: false, key: '' },
};

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
      state.songs = rowsToSongs(snap.rows);
      state.source = 'snapshot';
      state.updatedAt = new Date(snap.actualizado + 'T12:00:00');
    }
  }
  state.songs.sort((a, b) => a.title.localeCompare(b.title, 'es'));
  render();
}

// ---------- utilidades de vista ----------
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const logo = (cls, light, dark, alt) =>
  `<picture class="${cls}"><source srcset="${dark}" media="(prefers-color-scheme: dark)"><img src="${light}" alt="${alt}"></picture>`;

const fmtDate = (d) =>
  d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

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

const allThemes = () =>
  [...new Set(state.songs.flatMap((s) => s.themes))].sort((a, b) => a.localeCompare(b, 'es'));
const allStatuses = () => [...new Set(state.songs.map((s) => s.status).filter(Boolean))].sort();
const allKeys = () =>
  [...new Set(state.songs.filter((s) => s.key).map((s) => keyName(s.key)))].sort();

// ---------- lista ----------
function filteredSongs() {
  const f = state.filters;
  const q = normalize(f.q);
  return state.songs.filter(
    (s) =>
      (!q || normalize(`${s.title} ${s.author}`).includes(q)) &&
      (!f.theme || s.themes.includes(f.theme)) &&
      (!f.status || s.status === f.status) &&
      (!f.catholic || s.catholic) &&
      (!f.key || (s.key && keyName(s.key) === f.key)),
  );
}

function songRow(s) {
  const key = s.key ? keyName(s.key) : '';
  return `<a class="song" href="#/c/${encodeURIComponent(s.id)}">
    <span class="song-main">
      <span class="song-title">${esc(s.title)}</span>
      <span class="song-sub">${esc(s.author || 'Autor sin registrar')} · ${esc(s.themes.join(', '))}</span>
    </span>
    <span class="song-meta">
      ${key ? `<span class="key">${esc(key)}</span>` : ''}
      ${s.bpm ? `<span class="bpm">${s.bpm}</span>` : ''}
      <span class="dot ${statusClass(s.status)}" title="${esc(s.status)}"></span>
    </span>
  </a>`;
}

function options(values, selected, empty) {
  return [`<option value="">${esc(empty)}</option>`]
    .concat(values.map((v) => `<option ${v === selected ? 'selected' : ''}>${esc(v)}</option>`))
    .join('');
}

function renderList() {
  const f = state.filters;
  document.title = 'Zamar · Repertorio';
  app.innerHTML = `
    <header class="top home">
      ${logo('brand', 'img/logo-negro.png', 'img/logo-blanco.png', 'Zamar Adoración')}
      <button class="icon" data-action="reload" aria-label="Actualizar">⟳</button>
    </header>
    <h1 class="eyebrow">Repertorio</h1>
    ${sourceBanner()}
    <div class="filters">
      <input type="search" id="q" placeholder="Buscar canción o autor" value="${esc(f.q)}" autocomplete="off">
      <div class="row">
        <select id="theme" aria-label="Tema">${options(allThemes(), f.theme, 'Todos los temas')}</select>
        <select id="key" aria-label="Tonalidad">${options(allKeys(), f.key, 'Todo tono')}</select>
      </div>
      <div class="row">
        <select id="status" aria-label="Estatus">${options(allStatuses(), f.status, 'Todo estatus')}</select>
        <label class="check"><input type="checkbox" id="catholic" ${f.catholic ? 'checked' : ''}> Católicas</label>
      </div>
    </div>
    <p class="count" id="count"></p>
    <div class="list" id="list"></div>
    <footer class="foot">${state.updatedAt ? `Actualizado ${esc(fmtDate(state.updatedAt))}` : ''}</footer>`;
  renderResults();
}

function renderResults() {
  const list = filteredSongs();
  document.getElementById('count').textContent = `${list.length} de ${state.songs.length} canciones`;
  document.getElementById('list').innerHTML = list.length
    ? list.map(songRow).join('')
    : '<p class="empty">No hay canciones con esos filtros.</p>';
}

// ---------- ficha de canción ----------
function renderChordText(text, shift, flats) {
  const out = transposeText(text, shift, flats);
  return out
    .split('\n')
    .map((line) => {
      if (/^\s*\{(c|comment|ci|comment_italic):\s*(.*)\}\s*$/i.test(line)) {
        return `<span class="section">${esc(line.replace(/^\s*\{[^:]+:\s*|\}\s*$/g, ''))}</span>`;
      }
      if (/^\s*\{.*\}\s*$/.test(line)) return null; // otras directivas ChordPro
      if (/\[[^\]]+\]/.test(line)) {
        // Acorde encima de la sílaba donde cae, como en una hoja impresa.
        const parts = line.split(/\[([^\]]+)\]/);
        let html = esc(parts[0]);
        for (let i = 1; i < parts.length; i += 2) {
          html += `<span class="cp"><span class="chord">${esc(parts[i])}</span><span>${esc(parts[i + 1]) || ' '}</span></span>`;
        }
        return `<span class="cpline">${html}</span>`;
      }
      if (isChordLine(line)) return `<span class="chord">${esc(line)}</span>`;
      return esc(line);
    })
    .filter((l) => l !== null)
    .join('\n');
}

const songHeader = () => `<header class="top">
    <a class="back" href="#/">‹ Repertorio</a>
    ${logo('mark', 'img/simbolo-negro.png', 'img/simbolo-blanco.png', '')}
  </header>`;

const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '');

function renderSong(id) {
  const song = state.songs.find((s) => s.id === id);
  if (!song) {
    app.innerHTML = `${songHeader()}
      <p class="empty">No encontré esta canción. Quizá cambió de nombre en la hoja.</p>`;
    return;
  }
  document.title = `${song.title} · Zamar`;
  const shift = store.get(`zamar:shift:${song.id}`, 0);
  const key = transposeKey(song.key, shift);
  const flats = useFlats(key);
  const notes = store.get(`zamar:notes:${song.id}`, '');
  const sugg = suggestions(song, key, state.songs);
  const view = store.get('zamar:view', 'letra');

  const keyOptions = song.key
    ? Array.from({ length: 12 }, (_, i) => {
        const k = transposeKey(song.key, i);
        const d = semitonesBetween(song.key, k);
        return `<option value="${d}" ${d === shift ? 'selected' : ''}>${esc(keyName(k))}${d === 0 ? ' (original)' : ''}</option>`;
      }).join('')
    : '';

  app.innerHTML = `
    ${songHeader()}
    ${sourceBanner()}
    <article class="detail">
      <h1>${esc(song.title)}</h1>
      <p class="author">${esc(song.author || 'Autor sin registrar')}</p>
      <p class="chips">
        ${song.themes.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}
        ${song.catholic ? '<span class="chip catholic">Católica</span>' : ''}
        ${song.voice ? `<span class="chip">Voz: ${esc(song.voice)}</span>` : ''}
        ${song.propresenter ? '<span class="chip">Letra en ProPresenter</span>' : ''}
      </p>
      <p class="status"><span class="dot ${statusClass(song.status)}"></span> ${esc(song.status || 'Sin estatus')}</p>

      <section class="card keybox">
        ${
          song.key
            ? `<div class="keynow">
                 <span class="label">Tono</span>
                 <span class="big">${esc(keyName(key))}</span>
                 ${shift ? `<span class="orig">original ${esc(keyName(song.key))}</span>` : ''}
               </div>
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

      <section>
        <div class="tabs" role="tablist">
          <button role="tab" data-view="letra" aria-selected="${view === 'letra'}">Letra</button>
          <button role="tab" data-view="acordes" aria-selected="${view === 'acordes'}">Acordes</button>
        </div>
        ${
          view === 'acordes'
            ? song.chords
              ? `<pre class="sheet">${renderChordText(song.chords, shift, flats)}</pre>`
              : '<p class="hint">Aún no hay hoja de acordes para esta canción.</p>'
            : song.lyrics
              ? `<div class="sheet lyrics">${esc(song.lyrics)}</div>`
              : '<p class="hint">Aún no hay letra cargada para esta canción.</p>'
        }
      </section>

      ${song.notes ? `<section><h2>Notas del equipo</h2><p class="teamnotes">${esc(song.notes)}</p></section>` : ''}
      ${safeUrl(song.link) ? `<section><a class="button" href="${esc(song.link)}" target="_blank" rel="noopener">Escuchar referencia</a></section>` : ''}

      <section>
        <h2>Mis notas</h2>
        <textarea id="notes" rows="4" placeholder="Solo se guardan en este teléfono">${esc(notes)}</textarea>
        <p class="hint" id="saved"></p>
      </section>

      <section>
        <h2>Para conectar${song.key ? ` desde ${esc(keyName(key))}` : ''}</h2>
        ${
          !song.key
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
    </article>`;

  const setShift = (d) => {
    let v = ((d % 12) + 12) % 12;
    if (v > 6) v -= 12;
    store.set(`zamar:shift:${song.id}`, v);
    renderSong(song.id);
  };
  app.querySelectorAll('[data-shift]').forEach((b) =>
    b.addEventListener('click', () => setShift(shift + Number(b.dataset.shift))),
  );
  app.querySelectorAll('[data-view]').forEach((b) =>
    b.addEventListener('click', () => {
      store.set('zamar:view', b.dataset.view);
      renderSong(song.id);
    }),
  );
  app.querySelector('#keysel')?.addEventListener('change', (e) => setShift(Number(e.target.value)));
  let t;
  app.querySelector('#notes').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => {
      store.set(`zamar:notes:${song.id}`, e.target.value);
      document.getElementById('saved').textContent = 'Guardado en este teléfono';
    }, 400);
  });
}

// ---------- navegación ----------
function render({ navigated = false } = {}) {
  const m = location.hash.match(/^#\/c\/(.+)$/);
  const y = navigated ? (m ? 0 : state.listScroll || 0) : window.scrollY;
  if (m) renderSong(decodeURIComponent(m[1]));
  else renderList();
  window.scrollTo(0, y);
}

window.addEventListener('hashchange', () => render({ navigated: true }));
window.addEventListener('scroll', () => {
  if (!location.hash.startsWith('#/c/')) state.listScroll = window.scrollY;
});

app.addEventListener('input', (e) => {
  const id = e.target.id;
  if (!['q', 'theme', 'status', 'key', 'catholic'].includes(id)) return;
  state.filters[id] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  renderResults();
});

app.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action="reload"]');
  if (!btn) return;
  btn.disabled = true;
  await loadSongs();
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
