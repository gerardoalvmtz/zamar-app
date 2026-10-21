// Grabaciones de ensayo en la ficha de cada canción: cómo la tocamos nosotros.
// Viven en la hoja privada (pestaña Ensayos) y los audios en Drive. Escucharlas no pide PIN;
// subirlas y borrarlas sí.
import { setupApi, readBase64 } from './api.js';
import { MAX_AUDIO, audioBlobUrl, recordingName, setupRecorder } from './audio.js';

const CACHE = 'zamar:ensayos';

/** ctx: { app, store, esc } desde app.js */
export function setupRehearsals({ app, store, esc }) {
  const { api, openApi } = setupApi(store);
  let items = store.get(CACHE, []);
  let loading = null;
  const urls = {};

  const of = (songId) =>
    items.filter((r) => String(r['Canción']) === songId).sort((a, b) => String(b.Fecha).localeCompare(String(a.Fecha)));

  const fmt = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  /** Trae la lista de la hoja (una sola vez a la vez) y avisa si cambió. */
  function refresh() {
    loading ||= openApi('listRehearsals')
      .then((res) => {
        const before = JSON.stringify(items);
        items = res.items || [];
        store.set(CACHE, items);
        return JSON.stringify(items) !== before;
      })
      .finally(() => (loading = null));
    return loading;
  }

  function listHtml(songId) {
    const list = of(songId);
    if (!list.length) return '<p class="hint">Todavía no hay grabaciones. Graben un ensayo y súbanlo aquí para tener la referencia de cómo la tocamos.</p>';
    return `<ol class="audios">${list
      .map(
        (r) => `<li class="audio" data-rec="${esc(r.ID)}">
          <div class="song-main">
            <span class="song-title">${esc(r.Etiqueta || 'Ensayo')}</span>
            <span class="song-sub">${esc(fmt(r.Fecha))}${r['Quién'] ? ` · ${esc(r['Quién'])}` : ''}</span>
          </div>
          <div class="row">
            <button type="button" class="button ghost small" data-play="${esc(r.ID)}">▶ Escuchar</button>
            <button type="button" class="link danger" data-delrec="${esc(r.ID)}">Borrar</button>
          </div>
          <audio controls hidden></audio>
        </li>`,
      )
      .join('')}</ol>`;
  }

  /** La sección para la ficha de la canción. */
  function html(song) {
    return `<section class="rehearsals">
      <h2>Grabaciones del equipo</h2>
      <div data-reclist>${listHtml(song.id)}</div>
      <details class="recadd">
        <summary>+ Agregar grabación</summary>
        <div class="recorder">
          <input id="rlabel" placeholder="¿Qué es? Por ejemplo: ensayo 12 oct, versión acústica" aria-label="Etiqueta de la grabación">
          <div class="row">
            <button type="button" id="rrec">● Grabar</button>
            <label class="button ghost filepick">Elegir archivo<input type="file" id="rfile" accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg" hidden></label>
          </div>
          <p class="hint">Subir o borrar pide el PIN del ministerio.</p>
        </div>
      </details>
      <p class="hint" id="rmsg"></p>
    </section>`;
  }

  /** Conecta los botones después de dibujar la ficha. */
  function wire(song) {
    const box = app.querySelector('.rehearsals');
    if (!box) return;
    const msg = (t) => (box.querySelector('#rmsg').textContent = t);
    const label = () => box.querySelector('#rlabel').value.trim();
    const redraw = () => {
      const now = app.querySelector('.rehearsals [data-reclist]');
      if (!now) return;
      now.innerHTML = listHtml(song.id);
      bindList();
    };

    function bindList() {
      box.querySelectorAll('[data-play]').forEach((b) =>
        b.addEventListener('click', async () => {
          const player = b.closest('li').querySelector('audio');
          b.disabled = true;
          b.textContent = 'Cargando…';
          try {
            urls[b.dataset.play] ||= audioBlobUrl(await openApi('getRehearsalAudio', { id: b.dataset.play }));
            player.src = urls[b.dataset.play];
            b.remove();
            player.hidden = false;
            await player.play().catch(() => {});
          } catch (err) {
            b.disabled = false;
            b.textContent = '▶ Escuchar';
            msg(`No pude cargar la grabación (${err.message}).`);
          }
        }),
      );
      box.querySelectorAll('[data-delrec]').forEach((b) =>
        b.addEventListener('click', async () => {
          const r = items.find((x) => x.ID === b.dataset.delrec);
          if (!confirm(`¿Borrar la grabación “${r?.Etiqueta || 'Ensayo'}”? Queda 30 días en la papelera de Drive.`)) return;
          b.disabled = true;
          try {
            await api('deleteRehearsal', { id: b.dataset.delrec });
            items = items.filter((x) => x.ID !== b.dataset.delrec);
            store.set(CACHE, items);
            redraw();
            msg('Grabación borrada.');
          } catch (err) {
            b.disabled = false;
            msg(err.message);
          }
        }),
      );
    }

    async function upload(blob, name) {
      if (blob.size > MAX_AUDIO) return msg('El audio pesa más de 25 MB. Prueba con uno más corto.');
      msg('Subiendo grabación…');
      try {
        const { item } = await api('uploadRehearsal', {
          song: song.id,
          title: song.title,
          label: label(),
          name,
          mimeType: blob.type || 'audio/mpeg',
          data: await readBase64(blob),
        });
        items = [...items, item];
        store.set(CACHE, items);
        box.querySelector('#rlabel').value = '';
        box.querySelector('details.recadd').open = false;
        redraw();
        msg('Listo, ya la puede escuchar todo el equipo.');
      } catch (err) {
        msg(err.message);
      }
    }

    bindList();
    box.querySelector('#rfile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) upload(file, file.name);
    });
    setupRecorder(box.querySelector('#rrec'), msg, (blob, ext) => upload(blob, recordingName(song.title, label(), ext)));
    refresh()
      .then((changed) => changed && redraw())
      .catch(() => {});
  }

  return { html, wire };
}
