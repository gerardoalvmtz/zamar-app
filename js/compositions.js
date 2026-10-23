// Composiciones del ministerio: letra, acordes y audios de referencia de cada etapa.
// No están en la hoja pública; se leen y guardan a través del Apps Script con el PIN.
import { setupApi, readBase64 } from './api.js';
import { MAX_AUDIO, audioBlobUrl, recordingName, setupRecorder } from './audio.js';
import { keyName, parseKey, transposeKey, semitonesBetween, useFlats } from './music.js';
import { MOODS, suggest, toChordPro, playProgression, stopPlaying } from './progressions.js';
import { renderChordSheet, renderLyrics, lyricsFromChords, sheetKey, metadata } from './chordpro.js';

export const STAGES = ['Idea', 'En proceso', 'Terminada', 'En repertorio'];
const ALL_KEYS = [false, true].flatMap((minor) => Array.from({ length: 12 }, (_, pc) => ({ pc, minor })));

/** ctx: { app, store, esc, backHeader, homeHeader, loadSongs } desde app.js */
export function setupCompositions(ctx) {
  const { app, store, esc, backHeader, homeHeader, loadSongs } = ctx;
  const { api, who } = setupApi(store);
  const data = { items: null, audios: [], comments: [], error: '' };
  const shifts = {}; // transposición por composición, solo mientras la app está abierta

  const toComp = (r) => ({
    id: String(r.ID),
    title: String(r['Título'] || ''),
    authors: String(r.Autores || ''),
    stage: String(r.Estado || 'Idea'),
    key: parseKey(String(r.Tono || '')),
    bpm: parseInt(r.BPM, 10) || null,
    lyrics: String(r.Letra || ''),
    chords: String(r.Acordes || ''),
    notes: String(r.Notas || ''),
    updated: r.Actualizada || r.Creada || '',
  });

  async function load() {
    try {
      const res = await api('listCompositions');
      data.items = res.items.map(toComp).filter((c) => c.id && c.title);
      data.audios = res.audios;
      data.comments = res.comments || [];
      data.error = '';
    } catch (err) {
      data.error = err.message;
    }
  }

  const byId = (id) => data.items?.find((c) => c.id === id);
  const audiosOf = (id) =>
    data.audios.filter((a) => String(a['Composición']) === id).sort((a, b) => String(b.Fecha).localeCompare(String(a.Fecha)));

  // Comentarios generales (sin audio) o de un audio en particular, del más viejo al más nuevo.
  const commentsOf = (id, audio = '') =>
    data.comments
      .filter((m) => String(m['Composición']) === id && String(m.Audio || '') === audio)
      .sort((a, b) => String(a.Fecha).localeCompare(String(b.Fecha)));

  const fmt = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const stageClass = (s) => ({ Idea: 'none', 'En proceso': 'warn', Terminada: 'ok', 'En repertorio': 'ok' })[s] || 'none';

  /** Link de Drive → archivo directo para el reproductor del teléfono. */
  const driveId = (url) => (String(url).match(/\/d\/([A-Za-z0-9_-]+)/) || String(url).match(/[?&]id=([A-Za-z0-9_-]+)/) || [])[1];

  // Primera visita: hay que pedir el PIN antes de mostrar nada.
  async function ensure(then) {
    if (data.items) return then();
    app.innerHTML = `${homeHeader('comps')}<p class="empty">Cargando composiciones…</p>`;
    await load();
    if (!data.items) {
      app.innerHTML = `${homeHeader('comps')}
        <article class="detail">
          <p class="empty">${esc(data.error || 'No se pudieron cargar las composiciones.')}</p>
          <button data-action="comp-retry">Intentar de nuevo</button>
        </article>`;
      app.querySelector('[data-action="comp-retry"]').addEventListener('click', () => ensure(then));
      return;
    }
    then();
  }

  // ---------- lista ----------
  function renderList() {
    document.title = 'Zamar · Composiciones';
    ensure(() => {
      const items = [...data.items].sort(
        (a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || String(b.updated).localeCompare(String(a.updated)),
      );
      app.innerHTML = `
        ${homeHeader('comps')}
        <div class="row edittools">
          <a class="button ghost" href="#/comp/nueva">+ Nueva idea</a>
          <button class="button ghost" data-action="comp-reload">⟳ Actualizar</button>
        </div>
        <a class="ideaslink" href="#/comp/ideas">💡 <span><strong>Ideas de progresiones</strong><small>Dime el ánimo y el tono, y te sugiero acordes</small></span></a>
        <div class="list">
          ${
            items.length
              ? items
                  .map((c) => {
                    const n = audiosOf(c.id).length;
                    const k = data.comments.filter((m) => String(m['Composición']) === c.id).length;
                    return `<a class="song" href="#/comp/${encodeURIComponent(c.id)}">
                      <span class="song-main">
                        <span class="song-title">${esc(c.title)}</span>
                        <span class="song-sub">${esc(c.authors || 'Sin autores')} · ${esc(c.stage)}${n ? ` · ${n} audio${n > 1 ? 's' : ''}` : ''}${k ? ` · 💬 ${k}` : ''}</span>
                      </span>
                      <span class="song-meta">
                        ${c.key ? `<span class="key">${esc(keyName(c.key))}</span>` : ''}
                        ${c.bpm ? `<span class="bpm">${c.bpm}</span>` : ''}
                        <span class="dot ${stageClass(c.stage)}" title="${esc(c.stage)}"></span>
                      </span>
                    </a>`;
                  })
                  .join('')
              : '<p class="empty">Todavía no hay composiciones. Empieza con una idea, aunque sea un audio de 20 segundos.</p>'
          }
        </div>
        <p class="hint">Solo las ve quien tiene el PIN del ministerio.</p>`;
      app.querySelector('[data-action="comp-reload"]').addEventListener('click', async (e) => {
        e.target.disabled = true;
        await load();
        renderList();
      });
    });
  }

  // ---------- una composición ----------
  function renderOne(id) {
    ensure(() => {
      const c = byId(id);
      if (!c) {
        app.innerHTML = `${backHeader('#/comp', 'Composiciones')}<p class="empty">No encontré esta composición.</p>`;
        return;
      }
      document.title = `${c.title} · Composiciones`;
      const shift = shifts[c.id] || 0;
      const key = c.key ? transposeKey(c.key, shift) : null;
      const written = sheetKey(c.chords) || c.key;
      const chordShift = key && written ? semitonesBetween(written, key) : 0;
      const lyrics = c.lyrics || lyricsFromChords(c.chords);
      let view = store.get('zamar:compview', 'letra');
      const audios = audiosOf(c.id);

      app.innerHTML = `
        ${backHeader('#/comp', 'Composiciones')}
        <article class="detail">
          <h1>${esc(c.title)}</h1>
          <p class="author">${esc(c.authors || 'Sin autores')}</p>
          <p class="status"><span class="dot ${stageClass(c.stage)}"></span> ${esc(c.stage)}
            <a class="editlink" href="#/comp/${encodeURIComponent(c.id)}/editar">✎ Editar</a></p>

          <section class="card keybox">
            <div class="keynow"><span class="label">Tono</span><span class="big ${key ? '' : 'muted'}">${key ? esc(keyName(key)) : '—'}</span>
              ${shift ? `<span class="orig">escrita: ${esc(keyName(c.key))}</span>` : ''}</div>
            ${key ? `<div class="keyctl two"><button data-shift="-1" aria-label="Bajar medio tono">−½</button><button data-shift="1" aria-label="Subir medio tono">+½</button></div>` : ''}
            <div class="keynow"><span class="label">BPM</span><span class="big ${c.bpm ? '' : 'muted'}">${c.bpm || '—'}</span></div>
          </section>

          <section>
            <h2>Audios</h2>
            <div class="recorder">
              <input id="alabel" placeholder="¿Qué es? Por ejemplo: idea del coro, versión piano" aria-label="Etiqueta del audio">
              <div class="row">
                <button data-action="rec" id="recbtn">● Grabar</button>
                <label class="button ghost filepick">Elegir archivo<input type="file" id="afile" accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg" hidden></label>
              </div>
              <p class="hint" id="amsg"></p>
            </div>
            <ol class="audios">
              ${
                audios.length
                  ? audios
                      .map((a) => {
                        const fid = driveId(a.Link);
                        return `<li class="audio">
                          <div class="song-main">
                            <span class="song-title">${esc(a.Etiqueta || a.Archivo)}</span>
                            <span class="song-sub">${esc(fmt(a.Fecha))}${a['Quién'] ? ` · ${esc(a['Quién'])}` : ''}</span>
                          </div>
                          ${fid ? `<button type="button" class="button ghost small" data-listen="${esc(fid)}">▶ Escuchar</button><audio controls hidden></audio>` : ''}
                          ${/^https:\/\//.test(a.Link) ? `<a class="hint" href="${esc(a.Link)}" target="_blank" rel="noopener">Abrir en Drive</a>` : ''}
                          ${thread(c.id, String(a.Link || ''), 'Comenta este audio')}
                        </li>`;
                      })
                      .join('')
                  : '<p class="hint">Aún no hay audios. Graba la idea tal cual salga; aquí queda la historia de la canción.</p>'
              }
            </ol>
          </section>

          <section>
            <div class="tabs" role="tablist" style="grid-template-columns: repeat(2, 1fr)">
              <button role="tab" data-view="letra" aria-selected="${view === 'letra'}">Letra</button>
              <button role="tab" data-view="acordes" aria-selected="${view === 'acordes'}">Acordes</button>
            </div>
            ${
              view === 'acordes'
                ? c.chords
                  ? `<div class="sheet">${renderChordSheet(c.chords, chordShift, useFlats(key))}</div>`
                  : '<p class="hint">Aún no hay acordes.</p>'
                : lyrics
                  ? `<div class="sheet lyrics">${renderLyrics(lyrics)}</div>`
                  : '<p class="hint">Aún no hay letra.</p>'
            }
          </section>

          <details class="ideas"><summary>💡 Ideas de progresiones</summary><div data-ideas></div></details>

          ${c.notes ? `<section><h2>Notas</h2><p class="teamnotes">${esc(c.notes)}</p></section>` : ''}

          <section>
            <h2>Comentarios del equipo</h2>
            ${thread(c.id, '', '¿Qué te parece la canción? Letra, melodía, ideas…', true)}
          </section>

          ${
            c.stage === 'Terminada'
              ? `<section><button class="primary" data-action="promote">Pasar al repertorio</button>
                 <p class="hint" id="pmsg">Se agrega a la lista de canciones con su letra y acordes.</p></section>`
              : ''
          }
          <p class="hint">Actualizada ${esc(fmt(c.updated))}</p>
        </article>`;

      app.querySelectorAll('[data-shift]').forEach((b) =>
        b.addEventListener('click', () => {
          shifts[c.id] = (((shift + Number(b.dataset.shift)) % 12) + 12) % 12;
          if (shifts[c.id] > 6) shifts[c.id] -= 12;
          renderOne(c.id);
        }),
      );
      app.querySelectorAll('[data-view]').forEach((b) =>
        b.addEventListener('click', () => {
          store.set('zamar:compview', b.dataset.view);
          renderOne(c.id);
        }),
      );
      setupAudio(c);
      setupComments(c);
      ideas(app.querySelector('[data-ideas]'), { key, bpm: c.bpm });
      app.querySelector('[data-action="promote"]')?.addEventListener('click', async (e) => {
        if (!confirm(`¿Agregar “${c.title}” al repertorio?`)) return;
        e.target.disabled = true;
        const msg = app.querySelector('#pmsg');
        msg.textContent = 'Agregando…';
        try {
          await api('promoteComposition', { id: c.id });
          c.stage = 'En repertorio';
          setTimeout(() => loadSongs({ quiet: true }), 4000);
          renderOne(c.id);
        } catch (err) {
          msg.textContent = err.message;
          e.target.disabled = false;
        }
      });
    });
  }

  // ---------- ideas de progresiones ----------
  /** Panel de ánimo + tono → progresiones. insert(texto) si se pueden pegar en los acordes. */
  function ideas(box, { key, bpm, insert, title } = {}) {
    if (!box) return;
    let moodId = store.get('zamar:mood', MOODS[0].id);
    let k = key || ALL_KEYS.find((x) => keyName(x) === store.get('zamar:moodkey', 'G')) || ALL_KEYS[7];
    const draw = () => {
      const { mood, items, tip } = suggest(moodId, k);
      box.innerHTML = `
        ${title ? `<p class="hint">${title}</p>` : ''}
        <div class="moods" role="radiogroup" aria-label="Ánimo de la canción">
          ${MOODS.map((m) => `<button type="button" role="radio" data-mood="${m.id}" aria-checked="${m.id === mood.id}">${m.emoji} ${esc(m.name)}</button>`).join('')}
        </div>
        <label class="field inline"><span>Tono</span><select data-ideakey>${ALL_KEYS.map(
          (x) => `<option ${keyName(x) === keyName(k) ? 'selected' : ''}>${keyName(x)}</option>`,
        ).join('')}</select></label>
        <p class="moodabout">${esc(mood.about)} <span class="muted">Tempo sugerido: ${mood.bpm} BPM.</span></p>
        <div class="bridge">
          ${items
            .map(
              (p, i) => `<div class="route">
                <div class="route-head"><strong>${esc(p.name)}</strong><span class="pill">${esc(p.section)}</span></div>
                <ol class="path">${p.chords.map((c) => `<li><b>${esc(c.chord)}</b><small>${esc(c.deg)}</small></li>`).join('')}</ol>
                <p class="hint">${esc(p.why)}</p>
                <div class="row">
                  <button type="button" class="button ghost small" data-play="${i}">▶ Escuchar</button>
                  ${insert ? `<button type="button" class="button ghost small" data-insert="${i}">+ Agregar a acordes</button>` : ''}
                </div>
              </div>`,
            )
            .join('')}
          ${tip ? `<p class="hint tip">💡 ${esc(tip)}</p>` : ''}
          <p class="hint">Cada acorde dura un compás. Repite la progresión 2 o 4 veces por sección; los números (I, IV, vi…) dicen qué lugar ocupa cada acorde en el tono, así funciona igual si luego cambias de tono.</p>
        </div>`;
      box.querySelectorAll('[data-mood]').forEach((b) =>
        b.addEventListener('click', () => {
          moodId = b.dataset.mood;
          store.set('zamar:mood', moodId);
          stopPlaying();
          draw();
        }),
      );
      box.querySelector('[data-ideakey]').addEventListener('change', (e) => {
        k = ALL_KEYS.find((x) => keyName(x) === e.target.value);
        store.set('zamar:moodkey', e.target.value);
        stopPlaying();
        draw();
      });
      box.querySelectorAll('[data-play]').forEach((b) =>
        b.addEventListener('click', async () => {
          stopPlaying();
          box.querySelectorAll('[data-play]').forEach((x) => {
            clearTimeout(x._t);
            x.textContent = '▶ Escuchar';
          });
          b.textContent = 'Cargando piano…';
          try {
            const secs = await playProgression(items[b.dataset.play].chords, bpm || 72);
            if (!secs) return void (b.textContent = '▶ Escuchar');
            b.textContent = '♪ Sonando…';
            b._t = setTimeout(() => (b.textContent = '▶ Escuchar'), secs * 1000);
          } catch {
            b.textContent = '▶ Escuchar';
            alert('No pude cargar el sonido del piano. Revisa tu conexión e intenta otra vez.');
          }
        }),
      );
      box.querySelectorAll('[data-insert]').forEach((b) =>
        b.addEventListener('click', () => {
          insert(toChordPro(items[b.dataset.insert], mood));
          b.textContent = '✓ Agregada';
        }),
      );
    };
    draw();
  }

  function renderIdeas() {
    document.title = 'Ideas de progresiones · Zamar';
    stopPlaying();
    app.innerHTML = `${backHeader('#/comp', 'Composiciones')}
      <article class="detail">
        <h1>Ideas de progresiones</h1>
        <p class="author">Elige cómo quieres que se sienta la canción y en qué tono. Escucha las opciones y quédate con la que te inspire.</p>
        <div data-ideas></div>
        <p><a class="button ghost" href="#/comp/nueva">+ Empezar una idea nueva</a></p>
      </article>`;
    ideas(app.querySelector('[data-ideas]'));
  }

  // ---------- comentarios ----------
  /** Lista de comentarios con su caja para escribir. Plegada en cada audio, abierta en la general. */
  function thread(id, audio, placeholder, open = false) {
    const list = commentsOf(id, audio);
    const body = `<ul class="comments">${list
      .map(
        (m) => `<li>
          <div class="comment-head"><strong>${esc(m['Quién'] || 'Alguien')}</strong><small>${esc(fmt(m.Fecha))}</small>
            ${m.ID ? `<button class="link" data-uncomment="${esc(m.ID)}" aria-label="Borrar comentario">✕</button>` : ''}</div>
          <p>${esc(m.Comentario)}</p>
        </li>`,
      )
      .join('')}</ul>
      <form class="commentform" data-audio="${esc(audio)}">
        <textarea name="text" rows="2" placeholder="${esc(placeholder)}" required></textarea>
        <button type="submit">Enviar</button>
      </form>`;
    if (open) return body;
    return `<details class="thread" ><summary>💬 ${list.length ? `${list.length} comentario${list.length > 1 ? 's' : ''}` : 'Comentar'}</summary>${body}</details>`;
  }

  function setupComments(c) {
    app.querySelectorAll('.commentform').forEach((form) =>
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = form.elements.text.value.trim();
        if (!text) return;
        const button = form.querySelector('button');
        button.disabled = true;
        try {
          const { comment } = await api('addComment', { id: c.id, audio: form.dataset.audio, text });
          data.comments.push(comment);
          const open = [...app.querySelectorAll('details.thread')].map((d) => d.open);
          renderOne(c.id);
          // Deja abiertos los hilos que estaban abiertos.
          app.querySelectorAll('details.thread').forEach((d, i) => (d.open = open[i] || false));
        } catch (err) {
          alert(err.message);
          button.disabled = false;
        }
      }),
    );
    app.querySelectorAll('[data-uncomment]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('¿Borrar este comentario?')) return;
        try {
          await api('deleteComment', { commentId: b.dataset.uncomment });
          data.comments = data.comments.filter((m) => m.ID !== b.dataset.uncomment);
          renderOne(c.id);
        } catch (err) {
          alert(err.message);
        }
      }),
    );
  }

  // ---------- escuchar audios ----------
  // El link directo de Drive falla seguido en el teléfono (sobre todo en iPhone), así que el
  // audio se pide al Apps Script y se toca desde la memoria. Si el Apps Script todavía no tiene
  // esa acción, se usa el link de Drive como antes.
  const audioUrls = {};
  async function audioUrl(fileId) {
    if (audioUrls[fileId]) return audioUrls[fileId];
    let url;
    try {
      url = audioBlobUrl(await api('getAudio', { fileId }));
    } catch (err) {
      if (!/acción|action|desconocid|unknown/i.test(err.message)) throw err;
      url = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
    }
    return (audioUrls[fileId] = url);
  }

  // ---------- grabar o subir audio ----------
  function setupAudio(c) {
    const msg = (t) => (app.querySelector('#amsg').textContent = t);
    const label = () => app.querySelector('#alabel').value.trim();

    async function upload(blob, name) {
      if (blob.size > MAX_AUDIO) return msg('El audio pesa más de 25 MB. Prueba con uno más corto.');
      msg('Subiendo audio…');
      try {
        const { audio } = await api('uploadAudio', {
          id: c.id,
          label: label(),
          name,
          mimeType: blob.type || 'audio/mpeg',
          data: await readBase64(blob),
        });
        data.audios.push(audio);
        renderOne(c.id);
      } catch (err) {
        msg(err.message);
      }
    }

    app.querySelectorAll('[data-listen]').forEach((b) =>
      b.addEventListener('click', async () => {
        const player = b.nextElementSibling;
        b.disabled = true;
        b.textContent = 'Cargando audio…';
        try {
          player.src = await audioUrl(b.dataset.listen);
          b.remove();
          player.hidden = false;
          await player.play().catch(() => {});
        } catch (err) {
          b.disabled = false;
          b.textContent = '▶ Escuchar';
          msg(`No pude cargar el audio (${err.message}). Prueba con “Abrir en Drive”.`);
        }
      }),
    );

    app.querySelector('#afile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) upload(file, file.name);
    });

    setupRecorder(app.querySelector('#recbtn'), msg, (blob, ext) => upload(blob, recordingName(c.title, label(), ext)));
  }

  // ---------- crear y editar ----------
  /** Achica la foto (lado mayor de 2000 px, JPEG) para que suba rápido; el texto se lee igual. */
  async function shrinkPhoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, bad) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => bad(new Error('No pude abrir la foto. Prueba con otra en JPG o PNG.'));
        i.src = url;
      });
      const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
      if (scale === 1 && /jpe?g/i.test(file.type) && file.size < 3e6) return file;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function renderEdit(id) {
    ensure(() => {
      const c = id ? byId(id) : null;
      if (id && !c) {
        app.innerHTML = `${backHeader('#/comp', 'Composiciones')}<p class="empty">No encontré esta composición.</p>`;
        return;
      }
      const v = c || { title: '', authors: who(), stage: 'Idea', key: null, bpm: null, lyrics: '', chords: '', notes: '' };
      const back = c ? `#/comp/${encodeURIComponent(c.id)}` : '#/comp';
      document.title = `${c ? 'Editar' : 'Nueva'} composición · Zamar`;
      app.innerHTML = `
        ${backHeader(back, c ? c.title : 'Composiciones')}
        <form class="detail editor" id="editor">
          <h1>${c ? 'Editar composición' : 'Nueva composición'}</h1>
          <label class="field"><span>Título</span><input name="Título" value="${esc(v.title)}" required placeholder="Aunque sea provisional"></label>
          <label class="field"><span>Autores</span><input name="Autores" value="${esc(v.authors)}"></label>
          <div class="row three">
            <label class="field"><span>Etapa</span><select name="Estado">${STAGES.map((s) => `<option ${s === v.stage ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
            <label class="field"><span>Tono</span><input name="Tono" value="${esc(v.key ? keyName(v.key) : '')}" placeholder="G, Bb, F#m…"></label>
            <label class="field"><span>BPM</span><input name="BPM" value="${esc(v.bpm || '')}" inputmode="numeric" pattern="[0-9]*"></label>
          </div>
          <label class="field"><span>Letra <button type="button" class="link" data-pick="photo">📷 Transcribir foto</button></span>
            <textarea name="Letra" rows="8" spellcheck="true" class="prose">${esc(v.lyrics)}</textarea></label>
          <input type="file" id="photofile" accept="image/*" hidden>
          <label class="field"><span>Acordes (ChordPro) <button type="button" class="link" data-pick="cho">Cargar .cho</button></span>
            <textarea name="Acordes" rows="10" spellcheck="false" placeholder="[G]Primera [D]línea del coro…">${esc(v.chords)}</textarea></label>
          <details class="ideas"><summary>💡 ¿No sabes qué acordes usar? Ideas de progresiones</summary><div data-ideas></div></details>
          <input type="file" id="chofile" accept=".cho,.chopro,.chordpro,.crd,.txt,text/plain" hidden>
          <label class="field"><span>Notas</span><textarea name="Notas" rows="4" spellcheck="true" class="prose" placeholder="Ideas pendientes, estructura, quién hace qué…">${esc(v.notes)}</textarea></label>
          <p class="hint" id="editmsg"></p>
          <div class="row actions">
            <button type="submit" class="primary">Guardar</button>
            <a class="button ghost" href="${back}">Cancelar</a>
          </div>
          ${c ? '<button type="button" class="button ghost danger delcomp" data-action="delcomp">🗑 Borrar composición</button>' : ''}
        </form>`;
      const form = app.querySelector('#editor');
      const msg = (t) => (app.querySelector('#editmsg').textContent = t);
      const ideasBox = app.querySelector('[data-ideas]');
      const ideasHere = () =>
        ideas(ideasBox, {
          key: parseKey(form.elements.Tono.value),
          bpm: parseInt(form.elements.BPM.value, 10) || null,
          insert: (text) => {
            const t = form.elements.Acordes;
            t.value = (t.value.trim() ? t.value.replace(/\s*$/, '\n\n') : '') + text;
            msg('Agregué la progresión al final de los acordes. Toca Guardar para conservarla.');
          },
        });
      ideasHere();
      form.elements.Tono.addEventListener('change', ideasHere);
      // Foto de la hoja escrita → texto en la letra, para revisarlo antes de guardar.
      app.querySelector('[data-pick="photo"]').addEventListener('click', () => app.querySelector('#photofile').click());
      app.querySelector('#photofile').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const b = app.querySelector('[data-pick="photo"]');
        b.disabled = true;
        msg('Leyendo la foto… puede tardar unos segundos.');
        try {
          const photo = await shrinkPhoto(file);
          const { text } = await api('transcribe', { data: await readBase64(photo), mimeType: photo.type });
          if (!text) {
            msg('No encontré texto en la foto. Prueba con más luz y la hoja derecha.');
          } else {
            const t = form.elements.Letra;
            t.value = (t.value.trim() ? t.value.replace(/\s*$/, '\n\n') : '') + text;
            t.focus();
            msg('Listo: agregué el texto a la letra. Revísalo (la letra a mano no siempre sale perfecta) y toca Guardar.');
          }
        } catch (err) {
          msg(err.message);
        }
        b.disabled = false;
      });
      app.querySelector('[data-pick="cho"]').addEventListener('click', () => app.querySelector('#chofile').click());
      app.querySelector('#chofile').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        form.elements.Acordes.value = text;
        const meta = metadata(text);
        if (meta.key && !form.elements.Tono.value && parseKey(meta.key)) form.elements.Tono.value = meta.key;
        if (meta.tempo && !form.elements.BPM.value) form.elements.BPM.value = Math.round(parseFloat(meta.tempo)) || '';
        msg(`Cargué ${file.name}. Revisa y toca Guardar.`);
      });

      app.querySelector('[data-action="delcomp"]')?.addEventListener('click', async (e) => {
        const b = e.currentTarget;
        const n = audiosOf(c.id).length;
        const extra = n ? ` y sus ${n} audio${n > 1 ? 's' : ''} (quedan 30 días en la papelera de Drive)` : '';
        if (!confirm(`¿Borrar “${c.title}”${extra}? Se borran también sus comentarios. No se puede deshacer desde la app.`)) return;
        b.disabled = true;
        msg('Borrando…');
        try {
          await api('deleteComposition', { id: c.id });
          data.items = data.items.filter((x) => x.id !== c.id);
          data.audios = data.audios.filter((a) => String(a['Composición']) !== c.id);
          data.comments = data.comments.filter((m) => String(m['Composición']) !== c.id);
          location.hash = '#/comp';
        } catch (err) {
          msg(err.message);
          b.disabled = false;
        }
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fields = {};
        for (const n of ['Título', 'Autores', 'Estado', 'Tono', 'BPM', 'Letra', 'Acordes', 'Notas']) {
          fields[n] = form.elements[n].value.replace(/\s+$/, '');
        }
        fields['Título'] = fields['Título'].trim();
        if (fields.Tono && !parseKey(fields.Tono)) return msg(`No reconozco el tono "${fields.Tono}". Usa algo como G, Bb o F#m.`);
        const button = form.querySelector('[type="submit"]');
        button.disabled = true;
        msg('Guardando…');
        try {
          const res = await api('saveComposition', { id: c?.id || '', fields });
          const row = { ID: res.id, ...fields, Actualizada: new Date().toISOString() };
          const updated = toComp(row);
          if (c) Object.assign(c, updated);
          else data.items.push(updated);
          location.hash = `#/comp/${encodeURIComponent(res.id)}`;
        } catch (err) {
          msg(err.message);
          button.disabled = false;
        }
      });
    });
  }

  return { renderList, renderOne, renderEdit, renderIdeas };
}
