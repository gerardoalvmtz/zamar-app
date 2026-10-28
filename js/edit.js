// Edición desde la app: manda los cambios al programa de Apps Script de la hoja,
// que los guarda en el Sheets. Pide un PIN que el ministerio comparte entre quienes editan.
import { setupApi, readBase64 } from './api.js';
import { normalize } from './songs.js';
import { parseKey, keyName } from './music.js';
import { metadata } from './chordpro.js';

const VOICES = ['', 'Hombre', 'Mujer', 'Ambos'];

/** ctx: { app, state, store, esc, backHeader, songById, loadSongs } desde app.js */
export function setupEditing(ctx) {
  const { app, state, store, esc, backHeader, songById, loadSongs } = ctx;

  const { api } = setupApi(store);

  const readText = (file) => file.text();

  const statuses = () => [...new Set(state.songs.map((s) => s.status).filter(Boolean))].sort();

  const field = (label, name, value, attrs = '') =>
    `<label class="field"><span>${label}</span><input name="${name}" value="${esc(value)}" ${attrs}></label>`;

  const select = (label, name, values, value) =>
    `<label class="field"><span>${label}</span><select name="${name}">${[...new Set([value, ...values])]
      .map((v) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(v || '—')}</option>`)
      .join('')}</select></label>`;

  const area = (label, name, value, rows, extra = '') =>
    `<label class="field"><span>${label}${extra}</span><textarea name="${name}" rows="${rows}" spellcheck="false">${esc(value)}</textarea></label>`;

  /** Formulario de edición; con id vacío agrega una canción nueva. back: a dónde regresar. */
  function renderEdit(id, back = '') {
    const song = id ? songById(id) : null;
    if (id && !song) {
      app.innerHTML = `${backHeader('#/canciones', 'Repertorio')}<p class="empty">No encontré esta canción.</p>`;
      return;
    }
    const s = song || { title: '', author: '', themes: [], voice: '', catholic: false, status: '', spotify: '' };
    const main = {
      'Canción': s.title,
      Autor: s.author,
      Temas: s.themes.join(' / '),
      'Voz Principal': s.voice,
      'Católica?': s.catholic ? 'Sí' : song ? 'No' : '',
      'Tonalidad Original': s.keyOriginal ? keyName(s.keyOriginal) : '',
      'Tonalidad Zamar': s.keyZamar ? keyName(s.keyZamar) : '',
      BPM: s.bpm ? String(s.bpm) : '',
      Estatus: s.status,
      Spotify: s.spotify,
    };
    const texts = { Letra: s.lyrics || '', Acordes: s.chords || '', Tabs: s.tabs || '' };
    const done = back || (song ? `#/c/${encodeURIComponent(song.id)}` : '#/');
    document.title = `${song ? 'Editar' : 'Nueva canción'} · Zamar`;
    app.innerHTML = `
      ${backHeader(done, song ? song.title : 'Repertorio')}
      <form class="detail editor" id="editor">
        <h1>${song ? 'Editar canción' : 'Nueva canción'}</h1>
        ${song ? '' : field('Canción', 'Canción', '', 'required')}
        ${field('Autor', 'Autor', main.Autor)}
        ${field('Temas (separados con / )', 'Temas', main.Temas)}
        <div class="row">
          ${select('Voz principal', 'Voz Principal', VOICES, main['Voz Principal'])}
          ${select('¿Católica?', 'Católica?', ['', 'Sí', 'No'], main['Católica?'])}
        </div>
        <div class="row">
          ${field('Tono original', 'Tonalidad Original', main['Tonalidad Original'], 'placeholder="G, Bb, Em…"')}
          ${field('Tono Zamar', 'Tonalidad Zamar', main['Tonalidad Zamar'], 'placeholder="A, F#m…"')}
        </div>
        <div class="row">
          ${field('BPM', 'BPM', main.BPM, 'inputmode="numeric" pattern="[0-9]*"')}
          ${select('Estatus', 'Estatus', ['', ...statuses()], main.Estatus)}
        </div>
        ${field('Link de Spotify', 'Spotify', main.Spotify, 'type="url" placeholder="https://open.spotify.com/track/…"')}
        ${
          song
            ? `${area('Letra', 'Letra', texts.Letra, 8)}
               ${area('Acordes (ChordPro)', 'Acordes', texts.Acordes, 10, ' <button type="button" class="link" data-pick="cho">Cargar .cho</button>')}
               ${area('Tabs', 'Tabs', texts.Tabs, 6)}
               <input type="file" id="chofile" accept=".cho,.chopro,.chordpro,.crd,.txt,text/plain" hidden>
               <section>
                 <h2>Adjuntar archivo</h2>
                 <p class="hint">Por ejemplo un PDF o una foto de los tabs. Se guarda en el Drive del ministerio.</p>
                 <div class="row addset">
                   <input type="file" id="attach" accept="application/pdf,image/*,.gp,.gp5,.gpx,.txt">
                   <button type="button" data-action="upload">Subir</button>
                 </div>
               </section>`
            : ''
        }
        <p class="hint" id="editmsg"></p>
        <div class="row actions">
          <button type="submit" class="primary">Guardar</button>
          <a class="button ghost" href="${done}">Cancelar</a>
        </div>
      </form>`;

    const form = app.querySelector('#editor');
    const msg = (t) => (app.querySelector('#editmsg').textContent = t);

    app.querySelector('[data-pick="cho"]')?.addEventListener('click', () => app.querySelector('#chofile').click());
    app.querySelector('#chofile')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await readText(file);
      form.elements['Acordes'].value = text;
      const meta = metadata(text);
      if (meta.tempo && !form.elements.BPM.value) form.elements.BPM.value = Math.round(parseFloat(meta.tempo)) || '';
      if (meta.key && !form.elements['Tonalidad Zamar'].value && parseKey(meta.key)) form.elements['Tonalidad Zamar'].value = meta.key;
      msg(`Cargué ${file.name}. Revisa y toca Guardar.`);
    });

    app.querySelector('[data-action="upload"]')?.addEventListener('click', async (e) => {
      const file = app.querySelector('#attach').files[0];
      if (!file) return msg('Elige un archivo primero.');
      if (file.size > 10 * 1024 * 1024) return msg('El archivo pesa más de 10 MB.');
      e.target.disabled = true;
      msg('Subiendo…');
      try {
        const { url } = await api('upload', { title: song.title, name: file.name, mimeType: file.type, data: await readBase64(file) });
        song.files = [...(song.files || []), { name: file.name, url }];
        msg(`Listo, ${file.name} quedó adjunto.`);
      } catch (err) {
        msg(err.message);
      } finally {
        e.target.disabled = false;
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const value = (n) => (form.elements[n] ? form.elements[n].value.trim() : undefined);
      for (const n of ['Tonalidad Original', 'Tonalidad Zamar']) {
        if (value(n) && !parseKey(value(n))) return msg(`No reconozco el tono "${value(n)}". Usa algo como G, Bb o F#m.`);
      }
      const mainChanges = {};
      for (const n of Object.keys(main)) {
        if (n === 'Canción' && song) continue;
        if (value(n) !== undefined && value(n) !== main[n]) mainChanges[n] = value(n);
      }
      const textChanges = {};
      for (const n of Object.keys(texts)) {
        const v = form.elements[n] ? form.elements[n].value.replace(/\s+$/, '') : undefined;
        if (v !== undefined && v !== texts[n]) textChanges[n] = v;
      }
      if (!Object.keys(mainChanges).length && !Object.keys(textChanges).length) return msg('No hay cambios.');
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      msg('Guardando…');
      try {
        if (!song) await api('addSong', { fields: { 'Canción': value('Canción'), ...mainChanges } });
        else {
          if (Object.keys(mainChanges).length) await api('updateSong', { title: song.title, fields: mainChanges });
          if (Object.keys(textChanges).length) await api('updateTexts', { title: song.title, fields: textChanges });
        }
        msg('Guardado. Puede tardar un minuto en aparecer en los teléfonos de los demás.');
        // La hoja tarda un poco en publicar el cambio; se vuelve a leer en segundo plano.
        setTimeout(() => loadSongs({ quiet: true }), 4000);
        if (song) applyLocal(song, mainChanges, textChanges);
        location.hash = done;
      } catch (err) {
        msg(err.message);
        button.disabled = false;
      }
    });
  }

  /** Refleja el cambio en este teléfono sin esperar a que la hoja se publique. */
  function applyLocal(song, main, texts) {
    if ('Autor' in main) song.author = main.Autor;
    if ('Temas' in main) song.themes = main.Temas.split(/\s*[/,;]\s*/).filter(Boolean);
    if ('Voz Principal' in main) song.voice = main['Voz Principal'];
    if ('Católica?' in main) song.catholic = main['Católica?'] === 'Sí';
    if ('Tonalidad Original' in main) song.keyOriginal = parseKey(main['Tonalidad Original']);
    if ('Tonalidad Zamar' in main) song.keyZamar = parseKey(main['Tonalidad Zamar']);
    song.key = song.keyZamar || song.keyOriginal;
    if ('BPM' in main) song.bpm = parseInt(main.BPM, 10) || null;
    if ('Estatus' in main) song.status = main.Estatus;
    if ('Spotify' in main) song.spotify = main.Spotify;
    if ('Letra' in texts) song.lyrics = texts.Letra;
    if ('Acordes' in texts) song.chords = texts.Acordes;
    if ('Tabs' in texts) song.tabs = texts.Tabs;
  }

  // ---------- importar varias hojas .cho de Songbook Pro ----------
  function guessSong(fileName, text) {
    const meta = metadata(text);
    const candidates = [meta.title, fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')].filter(Boolean).map(normalize);
    for (const c of candidates) {
      const exact = state.songs.find((s) => normalize(s.title) === c);
      if (exact) return exact;
    }
    for (const c of candidates) {
      const loose = state.songs.find((s) => normalize(s.title).includes(c) || c.includes(normalize(s.title)));
      if (loose) return loose;
    }
    return null;
  }

  function renderImport() {
    document.title = 'Importar .cho · Zamar';
    app.innerHTML = `
      ${backHeader('#/canciones', 'Repertorio')}
      <article class="detail">
        <h1>Importar desde Songbook Pro</h1>
        <p class="hint">En Songbook Pro exporta las canciones como ChordPro (.cho) y elígelas aquí. Puedes elegir varias a la vez.</p>
        <input type="file" id="chos" multiple accept=".cho,.chopro,.chordpro,.crd,.txt,text/plain">
        <label class="check"><input type="checkbox" id="fill" checked> Completar BPM y tono Zamar vacíos con los del archivo</label>
        <div id="preview"></div>
      </article>`;
    let items = [];
    const preview = app.querySelector('#preview');
    const options = (selected) =>
      ['<option value="">(no importar)</option>']
        .concat(state.songs.map((s) => `<option value="${esc(s.id)}" ${s.id === selected ? 'selected' : ''}>${esc(s.title)}</option>`))
        .join('');

    app.querySelector('#chos').addEventListener('change', async (e) => {
      items = await Promise.all(
        [...e.target.files].map(async (file) => {
          const text = await readText(file);
          return { file: file.name, text, meta: metadata(text), songId: guessSong(file.name, text)?.id || '' };
        }),
      );
      preview.innerHTML = `
        <ol class="importlist">${items
          .map(
            (it, i) => `<li>
              <span class="song-sub">${esc(it.file)}${it.meta.key ? ` · ${esc(it.meta.key)}` : ''}${it.meta.tempo ? ` · ${esc(it.meta.tempo)} BPM` : ''}</span>
              <select data-item="${i}">${options(it.songId)}</select>
            </li>`,
          )
          .join('')}</ol>
        <button class="primary" data-action="import">Importar</button>
        <p class="hint" id="importmsg"></p>`;
      preview.querySelectorAll('[data-item]').forEach((sel) =>
        sel.addEventListener('change', () => (items[Number(sel.dataset.item)].songId = sel.value)),
      );
      preview.querySelector('[data-action="import"]').addEventListener('click', runImport);
    });

    async function runImport(e) {
      const msg = preview.querySelector('#importmsg');
      const todo = items.filter((it) => it.songId);
      if (!todo.length) return (msg.textContent = 'No hay archivos asignados a una canción.');
      e.target.disabled = true;
      const fill = app.querySelector('#fill').checked;
      let done = 0;
      const failed = [];
      for (const it of todo) {
        const song = songById(it.songId);
        msg.textContent = `Importando ${done + 1} de ${todo.length}: ${song.title}…`;
        try {
          await api('updateTexts', { title: song.title, fields: { Acordes: it.text.trim() } });
          const extra = {};
          const bpm = Math.round(parseFloat(it.meta.tempo));
          if (fill && bpm && !song.bpm) extra.BPM = String(bpm);
          if (fill && parseKey(it.meta.key) && !song.keyZamar) extra['Tonalidad Zamar'] = keyName(parseKey(it.meta.key));
          if (Object.keys(extra).length) await api('updateSong', { title: song.title, fields: extra });
          applyLocal(song, extra, { Acordes: it.text.trim() });
          done++;
        } catch (err) {
          failed.push(`${song.title}: ${err.message}`);
          if (/PIN/.test(err.message)) break;
        }
      }
      msg.textContent = `Importé ${done} de ${todo.length}.${failed.length ? ` No se pudo: ${failed.join('; ')}` : ''}`;
      e.target.disabled = false;
      setTimeout(() => loadSongs({ quiet: true }), 4000);
    }
  }

  return { renderEdit, renderImport };
}
