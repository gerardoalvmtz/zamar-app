// Hojas de acordes en formato ChordPro (.cho, el que exporta Songbook Pro) o texto con
// líneas de acordes encima de la letra. Dibuja, transpone, y saca la letra o los tabs.
import { isChord, isChordLine, transposeChord, transposeChordLine, parseKey } from './music.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const DIRECTIVE = /^\s*\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/i;

const SECTION_START = {
  soc: 'Coro', start_of_chorus: 'Coro',
  sov: 'Verso', start_of_verse: 'Verso',
  sob: 'Puente', start_of_bridge: 'Puente',
  sot: 'Tab', start_of_tab: 'Tab',
  sog: 'Tab', start_of_grid: 'Tab',
};
const SECTION_END = new Set(['eoc', 'end_of_chorus', 'eov', 'end_of_verse', 'eob', 'end_of_bridge', 'eot', 'end_of_tab', 'eog', 'end_of_grid']);
const COMMENT = new Set(['c', 'comment', 'ci', 'comment_italic', 'cb', 'comment_box', 'highlight']);
const isTabStart = (name) => ['sot', 'start_of_tab', 'sog', 'start_of_grid'].includes(name);

/** Tonalidad en la que está escrita la hoja, si trae {key: X}. */
export function sheetKey(text) {
  for (const line of String(text || '').split('\n')) {
    const m = line.match(DIRECTIVE);
    if (m && m[1].toLowerCase() === 'key') return parseKey(m[2]);
  }
  return null;
}

/** Valores de directivas de cabecera ({title}, {artist}, {key}, {tempo}...) */
export function metadata(text) {
  const meta = {};
  for (const line of String(text || '').split('\n')) {
    const m = line.match(DIRECTIVE);
    if (m && m[2] !== undefined) meta[m[1].toLowerCase()] ??= m[2];
  }
  return meta;
}

function transposeInline(line, shift, flats) {
  return line.replace(/\[([^\]]+)\]/g, (all, inner) => {
    // [*Bb/A] es un acorde marcado como anotación en Songbook Pro: también se transpone.
    const name = inner.trim().replace(/^\*/, '');
    return isChord(name) ? `[${transposeChord(name, shift, flats)}]` : all;
  });
}

/** Dibuja la hoja de acordes como HTML, transpuesta `shift` semitonos. */
export function renderChordSheet(text, shift = 0, flats = false) {
  const out = [];
  let inTab = false;
  let inSection = false;
  for (const raw of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const d = raw.match(DIRECTIVE);
    if (d) {
      const name = d[1].toLowerCase();
      if (SECTION_START[name]) {
        if (inSection) out.push('</div>');
        inTab = isTabStart(name);
        inSection = true;
        const kind = inTab ? ' tab' : SECTION_START[name] === 'Coro' ? ' chorus' : '';
        out.push(`<div class="block${kind}">`);
        out.push(`<span class="section">${esc(d[2] || SECTION_START[name])}</span>`);
      } else if (SECTION_END.has(name)) {
        if (inSection) out.push('</div>');
        inSection = false;
        inTab = false;
      } else if (COMMENT.has(name)) {
        out.push(`<span class="section">${esc(d[2] || '')}</span>`);
      }
      // {title}, {artist}, {key}, {tempo} y demás se muestran en la ficha, no aquí.
      continue;
    }
    if (inTab) {
      out.push(esc(raw));
      continue;
    }
    if (/\[[^\]]+\]/.test(raw)) {
      // Acorde encima de la sílaba donde cae, como en una hoja impresa. Cada palabra va
      // junta (nunca se parte), pero el renglón sí puede partirse entre palabras en
      // pantallas angostas.
      const html = transposeInline(raw, shift, flats)
        .split(/(\s+)/)
        .map((tok) => {
          if (!tok.includes('[')) return esc(tok);
          const parts = tok.split(/\[([^\]]+)\]/);
          let word = esc(parts[0]);
          for (let i = 1; i < parts.length; i += 2) {
            word += `<span class="cp"><span class="chord">${esc(parts[i])}</span><span>${esc(parts[i + 1]) || ' '}</span></span>`;
          }
          return `<span class="w">${word}</span>`;
        })
        .join('');
      out.push(`<span class="cpline">${html}</span>`);
    } else if (isChordLine(raw)) {
      out.push(`<span class="chord">${esc(transposeChordLine(raw, shift, flats))}</span>`);
    } else {
      out.push(esc(raw));
    }
  }
  if (inSection) out.push('</div>');
  // Los bloques ya cierran su propia línea; no agregar saltos alrededor de ellos.
  return out.join('\n').replace(/\n?(<div class="block[^"]*">)\n?/g, '$1').replace(/\n?<\/div>\n?/g, '</div>');
}

/**
 * La hoja de acordes como renglones de texto para imprimir (PDF), transpuesta `shift`
 * semitonos. Los acordes en línea ([G]pala[D]bra) se pasan a un renglón de acordes encima
 * de la letra, alineados por columna. Devuelve [{ type: 'section'|'chords'|'lyric'|'tab'|'blank', text }],
 * y en los pares de acordes con letra, `pair` une ambos renglones para no separarlos.
 */
export function chordSheetLines(text, shift = 0, flats = false) {
  const out = [];
  let inTab = false;
  for (const raw of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const d = raw.match(DIRECTIVE);
    if (d) {
      const name = d[1].toLowerCase();
      if (SECTION_START[name]) {
        inTab = isTabStart(name);
        out.push({ type: 'section', text: d[2] || SECTION_START[name] });
      } else if (SECTION_END.has(name)) {
        inTab = false;
        out.push({ type: 'blank', text: '' });
      } else if (COMMENT.has(name) && d[2]) {
        out.push({ type: 'section', text: d[2] });
      }
      continue;
    }
    if (inTab) out.push({ type: 'tab', text: raw.trimEnd() });
    else if (/\[[^\]]+\]/.test(raw)) {
      let chords = '';
      let lyric = '';
      const parts = transposeInline(raw, shift, flats).split(/\[([^\]]+)\]/);
      for (let n = 0; n < parts.length; n++) {
        if (n % 2 === 0) {
          lyric += parts[n];
          continue;
        }
        // Si el acorde anterior todavía no termina, se recorre la letra: con guiones si es a
        // media palabra (Se--ñor), con espacios si no.
        if (chords.length > lyric.length) {
          const midWord = /\S$/.test(lyric) && /^\S/.test(parts[n + 1] || '');
          lyric = lyric.padEnd(chords.length, midWord ? '-' : ' ');
        }
        chords = chords.padEnd(lyric.length) + parts[n] + ' ';
      }
      out.push({ type: 'chords', text: chords.trimEnd(), pair: true }, { type: 'lyric', text: lyric.trimEnd() });
    } else if (isChordLine(raw)) out.push({ type: 'chords', text: transposeChordLine(raw, shift, flats).trimEnd() });
    else if (!raw.trim()) out.push({ type: 'blank', text: '' });
    else out.push({ type: 'lyric', text: raw.trimEnd() });
  }
  // Sin renglones vacíos repetidos ni al principio o al final.
  return out
    .filter((l, i, all) => l.type !== 'blank' || (i > 0 && all[i - 1].type !== 'blank'))
    .filter((l, i, all) => l.type !== 'blank' || (i > 0 && i < all.length - 1));
}

/** Solo la letra: quita acordes, directivas y tabs. Sirve cuando no hay letra cargada aparte. */
export function lyricsFromChords(text) {
  const out = [];
  let inTab = false;
  for (const raw of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const d = raw.match(DIRECTIVE);
    if (d) {
      const name = d[1].toLowerCase();
      if (isTabStart(name)) inTab = true;
      else if (SECTION_END.has(name)) inTab = false;
      else if (SECTION_START[name] && d[2]) out.push(`[[${d[2]}]]`);
      else if (COMMENT.has(name) && d[2]) out.push(`[[${d[2]}]]`);
      continue;
    }
    if (inTab || isChordLine(raw)) continue;
    out.push(raw.replace(/\[[^\]]*\]/g, ''));
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Bloques de tab ({sot}…{eot}) dentro de una hoja ChordPro. */
export function tabsFromChords(text) {
  const out = [];
  let inTab = false;
  for (const raw of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const d = raw.match(DIRECTIVE);
    if (d && isTabStart(d[1].toLowerCase())) {
      inTab = true;
      if (d[2]) out.push(d[2]);
      continue;
    }
    if (d && SECTION_END.has(d[1].toLowerCase())) {
      if (inTab) out.push('');
      inTab = false;
      continue;
    }
    if (inTab) out.push(raw);
  }
  return out.join('\n').trim();
}

/** Letra lista para mostrar: los títulos de sección [[Coro]] se resaltan. */
export function renderLyrics(text) {
  return esc(text).replace(/\[\[([^\]]+)\]\]/g, '<span class="section">$1</span>');
}
