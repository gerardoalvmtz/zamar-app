// Biblioteca de progresiones: las progresiones más comunes del pop y del worship, en
// cualquier tono, con versión sencilla y con color, diagramas de guitarra en 5 posiciones
// y las canciones del repertorio que ya las usan.
import { keyName, parseKey, isChord, isChordLine } from './music.js';
import { degreeChord, playProgression, stopPlaying } from './progressions.js';
import { chordsInSheet, sheetKey } from './chordpro.js';
import { parseChord, positions, nearZone, handZones, diagramSvg } from './guitar.js';

const mod = (n) => ((n % 12) + 12) % 12;

/** Las 18 progresiones. Todas en grados del tono mayor (vi = la relativa menor). */
export const CATALOG = [
  { id: 'I-vi-IV-V', group: 'mayor', about: 'Sube y baja con calma; muy fácil de cantar. Clásica de las baladas de los 50 y de muchos cantos de comunión.' },
  { id: 'I-V-vi-IV', group: 'mayor', about: 'La más usada en worship y pop. Funciona en casi cualquier coro y todo el mundo la reconoce.' },
  { id: 'I-IV-V', group: 'mayor', about: 'Lo esencial: tres acordes mayores, firme y alegre. Base de himnos y cantos de asamblea.' },
  { id: 'I-vi-ii-V', group: 'mayor', about: 'Da la vuelta completa y regresa al I con naturalidad. Buena para versos y para cerrar.' },
  { id: 'I-IV-vi-V', group: 'mayor', about: 'Como la de siempre, pero el menor en tercer lugar la hace más emotiva.' },
  { id: 'I-IV-I-V', group: 'mayor', about: 'Va y viene del I: estable y sin prisa, deja todo el espacio a la letra. Ideal para versos.' },
  { id: 'I-V-vi-iii', group: 'mayor', about: 'Desciende suave y el iii le da un toque nostálgico. Es el arranque de la famosa del “canon”.' },
  { id: 'I-IV-ii-V', group: 'mayor', about: 'El ii prepara al V y suena más redonda que I IV V. Útil justo antes de volver al coro.' },
  { id: 'I-iii-IV-V', group: 'mayor', about: 'Sube escalón por escalón hasta el V: crea ganas de llegar. Funciona en pre-coros.' },
  { id: 'vi-iii-IV-V', group: 'menor', about: 'Empieza pensativa en dos menores y se abre hacia el V. Para versos que van creciendo.' },
  { id: 'vi-ii-IV-V', group: 'menor', about: 'Dos menores seguidos y luego sube: reflexiva al principio, con esperanza al final.' },
  { id: 'vi-IV-V', group: 'menor', about: 'Tres acordes con sabor menor: sencilla y con fuerza, se repite sin cansar.' },
  { id: 'vi-V-IV-ii', group: 'menor', about: 'Va bajando y no resuelve: melancólica, deja la frase abierta.' },
  { id: 'vi-IV-I-V', group: 'menor', about: 'La de siempre empezando en el menor: más íntima. Muy común en coros de adoración.' },
  { id: 'ii-vi-I-V', group: 'menor', about: 'Empieza “en el aire” y llega a casa en el tercer acorde. Buena para puentes.' },
  { id: 'ii-IV-I-V', group: 'menor', about: 'Suave y abierta; sirve para versos o puentes que no quieren empezar en el I.' },
  { id: 'ii-V-vi', group: 'menor', about: 'Parece que va a resolver al I pero cae en el vi: un giro emotivo, ideal antes de un silencio.' },
  { id: 'iii-IV-V-vi', group: 'menor', about: 'Sube por la escala y termina en menor. Crece mucho: perfecta para un puente.' },
].map((p) => ({ ...p, degrees: p.id.split('-') }));

/** Versión con color de cada grado: novenas, séptimas y suspendidos. */
export const COLOR = { I: 'Iadd9', ii: 'ii7', iii: 'iii7', IV: 'IVmaj7', V: 'Vsus4', vi: 'vi7' };

export const pretty = (p) => p.degrees.join(' – ');

/** Los acordes de una progresión en un tono mayor. */
export function chordsFor(p, key, color = false) {
  return p.degrees.map((d) => degreeChord(color ? COLOR[d] : d, key)).filter(Boolean);
}

// Grado de cada acorde dentro del tono mayor: intervalo desde el I → grado y si es menor.
const DEG_OF = { 0: ['I', false], 2: ['ii', true], 4: ['iii', true], 5: ['IV', false], 7: ['V', false], 9: ['vi', true] };

/** Pasa los acordes de una hoja a grados ('I', 'vi'… o '?' si no son del tono), sin repetir seguidos. */
export function sheetDegrees(text, key) {
  if (!key) return [];
  const tonic = key.minor ? mod(key.pc + 3) : key.pc; // en tono menor se cuenta desde su relativa mayor
  const out = [];
  for (const name of chordsInSheet(text)) {
    const c = parseChord(name);
    let deg = '?';
    if (c) {
      const hit = DEG_OF[mod(c.root - tonic)];
      // Suspendidos y quintas no dicen si son mayores o menores: valen como el grado del tono.
      const minor = c.third === null || c.third === mod(c.root + 5) || c.third === mod(c.root + 2) ? null : c.third === mod(c.root + 3);
      if (hit && (minor === null || minor === hit[1])) deg = hit[0];
    }
    if (out[out.length - 1] !== deg) out.push(deg);
  }
  return out;
}

const count = (seq, degs) => {
  let n = 0;
  let firstAt = -1;
  for (let i = 0; i + degs.length <= seq.length; i++) {
    if (degs.every((d, j) => seq[i + j] === d)) {
      n++;
      if (firstAt < 0) firstAt = i;
    }
  }
  return { n, firstAt };
};
const isRotation = (a, b) => a.length === b.length && a.some((_, i) => a.slice(i).concat(a.slice(0, i)).join() === b.join());

/**
 * Las progresiones del catálogo que usa una canción (que aparecen al menos 2 veces).
 * Si dos son la misma vuelta empezando en otro acorde, se queda la que empieza como la canción.
 */
export function songProgressions(text, key) {
  const seq = sheetDegrees(text, key);
  const hits = CATALOG.map((p) => ({ p, ...count(seq, p.degrees) })).filter((h) => h.n >= 2);
  const kept = hits.filter(
    (h) => !hits.some((o) => o !== h && isRotation(o.p.degrees, h.p.degrees) && (o.n > h.n || (o.n === h.n && o.firstAt < h.firstAt))),
  );
  return kept.sort((a, b) => b.n - a.n || a.firstAt - b.firstAt).map((h) => ({ id: h.p.id, progression: h.p, count: h.n }));
}

/** Tono mayor desde el que se cuentan los grados de una canción (la relativa si es menor). */
export const majorOf = (key) => (key ? (key.minor ? { pc: mod(key.pc + 3), minor: false } : key) : null);

// ---------- darle color a una canción ----------
const SUFFIX = { I: 'add9', ii: '7', iii: '7', IV: 'maj7', V: 'sus4', vi: '7' };
const PLAIN = /^([A-G][#♯b♭]?)(m?)(\/[A-G][#♯b♭]?)?$/;

/**
 * La versión con color de un acorde dentro de un tono: solo cambian los acordes sencillos
 * (mayores o menores, con o sin bajo) que son del tono. Ej. en Sol: G → Gadd9, C → Cmaj7,
 * D → Dsus4, Em → Em7, G/B → Gadd9/B. Lo demás se queda igual.
 */
export function colorChord(name, key) {
  const m = String(name).match(PLAIN);
  if (!m || !key) return name;
  const c = parseChord(name);
  const tonic = majorOf(key).pc;
  const hit = DEG_OF[mod(c.root - tonic)];
  if (!hit || hit[1] !== (m[2] === 'm')) return name;
  if (m[3] && SUFFIX[hit[0]] === 'sus4') return name; // D/F# lleva la tercera en el bajo: suspendido chocaría
  return m[1] + m[2] + SUFFIX[hit[0]] + (m[3] || '');
}

/** Cambia los acordes de una línea de acordes cuidando que sigan alineados con la letra. */
function mapChordLine(line, fn) {
  let out = '';
  let debt = 0;
  for (const part of line.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      const keep = Math.max(1, part.length - debt);
      debt -= part.length - keep;
      out += ' '.repeat(keep);
      continue;
    }
    const bare = part.replace(/^\(|\)$/g, '');
    const next = isChord(bare) ? part.replace(bare, fn(bare)) : part;
    debt += next.length - part.length;
    if (debt < 0) {
      out += next + ' '.repeat(-debt);
      debt = 0;
    } else out += next;
  }
  return out;
}

/** La hoja completa con color, en el mismo formato. No cambia nada en la hoja original. */
export function colorSheet(text, key) {
  if (!key) return text;
  const fn = (c) => colorChord(c, key);
  let inTab = false;
  return String(text || '')
    .split('\n')
    .map((line) => {
      const d = line.match(/^\s*\{\s*([a-z_]+)/i);
      if (d) {
        const n = d[1].toLowerCase();
        if (/^(sot|sog|start_of_tab|start_of_grid)$/.test(n)) inTab = true;
        if (/^(eot|eog|end_of_tab|end_of_grid)$/.test(n)) inTab = false;
        return line;
      }
      if (inTab) return line;
      if (/\[[^\]]+\]/.test(line)) return line.replace(/\[(\*?)([^\]]+)\]/g, (all, star, c) => (isChord(c.trim()) ? `[${star}${fn(c.trim())}]` : all));
      return isChordLine(line) ? mapChordLine(line, fn) : line;
    })
    .join('\n');
}

// ---------- diagramas de guitarra ----------

/** Diagramas de una lista de acordes, todos cerca de la misma zona del brazo (posición 1-5). */
export function diagramsHtml(chords, tonic, pos = 1) {
  const zones = handZones(tonic);
  const zone = zones[Math.min(pos, zones.length) - 1] ?? 0;
  return `<div class="gdiags">${chords
    .map((c) => `<button type="button" class="gcell" data-gchord="${c.replace(/"/g, '')}">${diagramSvg(nearZone(c, zone), c)}</button>`)
    .join('')}</div>`;
}

export function positionPicker(pos, attr = 'data-gpos') {
  return `<div class="gpos" role="radiogroup" aria-label="Posición en el brazo">
    <span class="hint">Posición</span>
    ${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" ${attr}="${n}" aria-checked="${n === pos}">${n}</button>`).join('')}
  </div>`;
}

/** Ventana con un acorde y todas sus posiciones, de la más baja a la más alta. */
export function showChord(name) {
  const all = positions(name);
  let i = 0;
  const dialog = document.createElement('dialog');
  dialog.className = 'qrdialog chorddialog';
  const draw = () => {
    dialog.innerHTML = `
      <div class="chordbig">${diagramSvg(all[i] || null, name)}</div>
      ${
        all.length > 1
          ? `<div class="row chordnav"><button data-g="prev" aria-label="Posición anterior">‹</button><span class="hint">Posición ${i + 1} de ${all.length}</span><button data-g="next" aria-label="Siguiente posición">›</button></div>`
          : all.length
            ? ''
            : '<p class="hint">No encontré una digitación cómoda para este acorde.</p>'
      }
      <div class="row actions"><button data-g="close">Cerrar</button></div>`;
    dialog.querySelector('[data-g="prev"]')?.addEventListener('click', () => ((i = (i + all.length - 1) % all.length), draw()));
    dialog.querySelector('[data-g="next"]')?.addEventListener('click', () => ((i = (i + 1) % all.length), draw()));
    dialog.querySelector('[data-g="close"]').addEventListener('click', () => dialog.close());
  };
  draw();
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());
  dialog.showModal();
}

// ---------- página ----------
const MAJOR_KEYS = Array.from({ length: 12 }, (_, pc) => ({ pc, minor: false }));
const relMinor = (k) => keyName({ pc: mod(k.pc + 9), minor: true });

export function setupLibrary({ app, store, esc, backHeader, songs }) {
  const opened = new Set(); // qué paneles dejó abiertos la persona al cambiar de tono o posición
  let usage = null;
  let usageFor = null;

  /** Qué canciones usan cada progresión (se calcula una vez por versión del repertorio). */
  function songsUsing() {
    const list = songs();
    if (usageFor === list) return usage;
    usage = Object.fromEntries(CATALOG.map((p) => [p.id, []]));
    for (const s of list) {
      if (!s.chords) continue;
      const key = sheetKey(s.chords) || s.key;
      for (const h of songProgressions(s.chords, key)) usage[h.id].push({ song: s, count: h.count });
    }
    usageFor = list;
    return usage;
  }

  function render(params = new URLSearchParams()) {
    document.title = 'Progresiones · Zamar';
    stopPlaying();
    const asked = parseKey(params.get('tono') || '');
    if (asked) store.set('zamar:libkey', keyName(majorOf(asked)));
    const key = majorOf(parseKey(store.get('zamar:libkey', 'G'))) || { pc: 7, minor: false };
    const color = store.get('zamar:libcolor', false) === true;
    const pos = Number(store.get('zamar:gtrpos', 1)) || 1;
    const focus = params.get('p');
    if (focus) opened.add(`songs:${focus}`);
    const used = songsUsing();
    const tonic = keyName(key);

    const card = (p, i) => {
      const chords = chordsFor(p, key, color);
      const list = used[p.id];
      return `<div class="route${focus === p.id ? ' focus' : ''}" id="prog-${p.id}">
        <div class="route-head"><strong class="degs">${esc(pretty(p))}</strong>${list.length ? `<span class="pill">${list.length} ${list.length === 1 ? 'canción' : 'canciones'}</span>` : ''}</div>
        <ol class="path">${chords.map((c) => `<li><b>${esc(c.chord)}</b><small>${esc(c.deg)}</small></li>`).join('')}</ol>
        <p class="hint">${esc(p.about)}</p>
        <div class="row">
          <button type="button" class="button ghost small" data-libplay="${i}">▶ Escuchar</button>
        </div>
        <details class="gtr" data-open="gtr:${p.id}" ${opened.has(`gtr:${p.id}`) ? 'open' : ''}>
          <summary>🎸 Diagramas</summary>
          ${diagramsHtml(chords.map((c) => c.chord), tonic, pos)}
        </details>
        ${
          list.length
            ? `<details class="gtr" data-open="songs:${p.id}" ${opened.has(`songs:${p.id}`) ? 'open' : ''}>
                <summary>🎵 Canciones del repertorio que la usan</summary>
                <div class="list">${list
                  .map(
                    ({ song, count: n }) => `<a class="song" href="#/c/${encodeURIComponent(song.id)}">
                      <span class="song-main"><span class="song-title">${esc(song.title)}</span>
                      <span class="song-sub">${n} veces en la hoja de acordes</span></span>
                      <span class="song-meta">${song.key ? `<span class="key">${esc(keyName(song.key))}</span>` : ''}</span>
                    </a>`,
                  )
                  .join('')}</div>
              </details>`
            : ''
        }
      </div>`;
    };
    const group = (g) =>
      CATALOG.map((p, i) => [p, i])
        .filter(([p]) => p.group === g)
        .map(([p, i]) => card(p, i))
        .join('');

    app.innerHTML = `
      ${backHeader('#/', 'Inicio')}
      <article class="detail library">
        <h1>Progresiones</h1>
        <p class="author">Las vueltas de acordes más comunes, en el tono que quieras. Los números (I, IV, vi…) dicen qué lugar ocupa cada acorde en el tono, así sirven para cualquier canción.</p>
        <section class="card keybox libctl">
          <label class="field inline"><span>Tono</span><select id="libkey">${MAJOR_KEYS.map(
            (k) => `<option value="${keyName(k)}" ${k.pc === key.pc ? 'selected' : ''}>${keyName(k)} · ${relMinor(k)}</option>`,
          ).join('')}</select></label>
          <div class="basesel seg" role="tablist">
            <button data-libcolor="0" aria-selected="${!color}">Sencillos</button>
            <button data-libcolor="1" aria-selected="${color}">Con color</button>
          </div>
          ${positionPicker(pos)}
          <p class="hint">${
            color
              ? 'Con color: el I con novena, el IV con séptima mayor, el V suspendido y los menores con séptima. Mismos grados, sonido más abierto.'
              : 'Posición 1 es la más cercana al inicio del brazo; las demás van subiendo y cada acorde queda cerca del anterior.'
          }</p>
        </section>
        <h2>Empiezan en el I</h2>
        <p class="hint">Suenan a tono mayor: ${esc(tonic)}.</p>
        <div class="bridge">${group('mayor')}</div>
        <h2>Empiezan en un acorde menor</h2>
        <p class="hint">Mismos acordes, pero el centro se siente en ${esc(relMinor(key))} (la relativa menor de ${esc(tonic)}) o en otro menor.</p>
        <div class="bridge">${group('menor')}</div>
      </article>`;

    const rerender = () => {
      const y = window.scrollY;
      render(new URLSearchParams());
      window.scrollTo(0, y);
    };
    app.querySelector('#libkey').addEventListener('change', (e) => {
      store.set('zamar:libkey', e.target.value);
      history.replaceState(null, '', '#/progresiones');
      rerender();
    });
    app.querySelectorAll('[data-libcolor]').forEach((b) =>
      b.addEventListener('click', () => {
        store.set('zamar:libcolor', b.dataset.libcolor === '1');
        rerender();
      }),
    );
    app.querySelectorAll('[data-gpos]').forEach((b) =>
      b.addEventListener('click', () => {
        store.set('zamar:gtrpos', Number(b.dataset.gpos));
        rerender();
      }),
    );
    app.querySelectorAll('details[data-open]').forEach((d) =>
      d.addEventListener('toggle', () => (d.open ? opened.add(d.dataset.open) : opened.delete(d.dataset.open))),
    );
    app.querySelectorAll('[data-libplay]').forEach((b) =>
      b.addEventListener('click', async () => {
        const was = b._playing;
        stopPlaying();
        app.querySelectorAll('[data-libplay]').forEach((x) => {
          clearTimeout(x._t);
          x.textContent = '▶ Escuchar';
          x._playing = false;
        });
        if (was) return;
        b.textContent = 'Cargando piano…';
        try {
          const secs = await playProgression(chordsFor(CATALOG[b.dataset.libplay], key, color), 76);
          if (!secs) return void (b.textContent = '▶ Escuchar');
          b.textContent = '■ Detener';
          b._playing = true;
          b._t = setTimeout(() => ((b.textContent = '▶ Escuchar'), (b._playing = false)), secs * 1000);
        } catch {
          b.textContent = '▶ Escuchar';
          alert('No pude cargar el sonido del piano. Revisa tu conexión e intenta otra vez.');
        }
      }),
    );
    if (focus) app.querySelector(`#prog-${CSS.escape(focus)}`)?.scrollIntoView({ block: 'start' });
  }

  return { render };
}

