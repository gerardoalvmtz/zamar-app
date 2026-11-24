// Diagramas de acordes de guitarra. Las digitaciones no vienen de una tabla: se buscan en el
// brazo (afinación estándar) para cualquier acorde que entienda la app, así siguen al tono
// cuando se transporta. Se prefieren formas que un guitarrista reconoce: bajo en la nota
// correcta, cuerdas al aire cerca del inicio, cejillas de un dedo y nada de estirar de más.

const TUNING = [40, 45, 50, 55, 59, 64]; // Mi grave … Mi agudo (MIDI)
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const CHORD_RE = /^([A-G])([#♯b♭]?)([^/\s]*)(?:\/([A-G])([#♯b♭]?))?$/;
const mod = (n) => ((n % 12) + 12) % 12;
const acc = (a) => (a === '#' || a === '♯' ? 1 : a === 'b' || a === '♭' ? -1 : 0);

// Lo que puede venir después de la raíz, de lo más largo a lo más corto.
const TOKEN_RE = /^(maj13|maj11|maj9|maj7|maj|dim7|dim|aug|sus2|sus4|sus|add11|add9|add4|add2|madd9|b5|#5|b9|#9|#11|b13|13|11|9|7|6|5|4|2|\+)/;

/**
 * Lee un acorde ("F#m7", "Bb/D", "Gsus4", "Cadd9") y devuelve sus notas:
 * { root, bass, tones: [pcs], required: [pcs] } o null si no lo entiende.
 */
export function parseChord(name) {
  const m = String(name || '').trim().match(CHORD_RE);
  if (!m) return null;
  const root = mod(LETTER_PC[m[1]] + acc(m[2]));
  const bass = m[4] ? mod(LETTER_PC[m[4]] + acc(m[5])) : root;
  let q = m[3]
    .replace(/[()]/g, '')
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/^M7/, 'maj7')
    .replace(/^M9/, 'maj9')
    .replace(/Δ/g, 'maj7')
    .replace(/[º°]/g, 'dim')
    .replace(/ø7?/g, 'm7b5')
    .replace(/^min/, 'm')
    .replace(/^-/, 'm');
  let third = 4;
  let fifth = 7;
  let seventh = null;
  let sus = null;
  let altered = false;
  const extras = new Set();
  if (/^m(?!aj)/.test(q)) {
    third = 3;
    q = q.slice(1);
  }
  while (q) {
    const t = q.match(TOKEN_RE);
    if (!t) return null;
    q = q.slice(t[1].length);
    switch (t[1]) {
      case 'maj': break;
      case 'maj7': seventh = 11; break;
      case 'maj9': seventh = 11; extras.add(2); break;
      case 'maj11': seventh = 11; extras.add(5); break;
      case 'maj13': seventh = 11; extras.add(9); break;
      case 'dim': third = 3; fifth = 6; altered = true; break;
      case 'dim7': third = 3; fifth = 6; seventh = 9; altered = true; break;
      case 'aug': case '+': case '#5': fifth = 8; altered = true; break;
      case 'b5': fifth = 6; altered = true; break;
      case 'sus2': sus = 2; break;
      case 'sus4': case 'sus': case '4': sus = 5; break;
      case 'add9': case 'add2': case '2': extras.add(2); break;
      case 'madd9': third = 3; extras.add(2); break;
      case 'add11': case 'add4': extras.add(5); break;
      case '7': seventh ??= 10; break;
      case '9': seventh ??= 10; extras.add(2); break;
      case '11': seventh ??= 10; extras.add(5); break;
      case '13': seventh ??= 10; extras.add(9); break;
      case '6': extras.add(9); break;
      case 'b9': extras.add(1); break;
      case '#9': extras.add(3); break;
      case '#11': extras.add(6); break;
      case 'b13': extras.add(8); break;
      case '5': third = null; break;
    }
  }
  const mid = sus ?? third;
  const rel = [0, mid, fifth, seventh, ...extras].filter((x) => x !== null);
  // La quinta se puede omitir salvo que sea la que le da carácter al acorde.
  const req = [0, mid, seventh, ...extras, altered || mid === null ? fifth : null].filter((x) => x !== null);
  return {
    root,
    bass,
    tones: [...new Set(rel.map((i) => mod(root + i)).concat(bass))],
    required: [...new Set(req.map((i) => mod(root + i)).concat(bass))],
    third: mid === null ? null : mod(root + mid),
    fifth: mod(root + fifth),
  };
}

/** Dedos que pide una digitación y si usa cejilla. */
function fingering(frets) {
  const fretted = frets.map((f, i) => [f, i]).filter(([f]) => f > 0);
  if (!fretted.length) return { fingers: 0, barre: null };
  const minF = Math.min(...fretted.map(([f]) => f));
  const atMin = fretted.filter(([f]) => f === minF).map(([, i]) => i);
  let barre = null;
  // Solo se dibuja cejilla cuando hace falta: si no, cada nota con su dedo.
  if (atMin.length >= 2 && fretted.length > 4) {
    const from = atMin[0];
    const to = atMin[atMin.length - 1];
    // La cejilla aprieta todas las cuerdas entre la primera y la última: ninguna puede ir al aire o apagada.
    const ok = frets.slice(from, to + 1).every((f) => f !== null && f >= minF);
    if (ok) barre = { fret: minF, from, to };
  }
  const fingers = barre ? 1 + fretted.filter(([f]) => f > minF).length : fretted.length;
  return { fingers, barre };
}

function score(frets, chord) {
  const played = frets.map((f, i) => (f === null ? null : mod(TUNING[i] + f)));
  const strings = played.filter((p) => p !== null).length;
  const fretted = frets.filter((f) => f !== null && f > 0);
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const { fingers, barre } = fingering(frets);
  const first = frets.findIndex((f) => f !== null);
  const last = 5 - [...frets].reverse().findIndex((f) => f !== null);
  const inner = frets.slice(first, last + 1).filter((f) => f === null).length;
  const opens = frets.filter((f) => f === 0).length;
  let s = strings * 2 - fingers * 0.5;
  // Cejilla que no empieza en la nota apretada más grave: forma rara.
  if (barre) s -= barre.from === frets.findIndex((f) => f > 0) ? 1 : 3;
  if (maxF - minF === 3) s -= 1.5;
  if (inner) s -= 6 * inner;
  if (last < 5) s -= 0.5;
  if (played.includes(chord.fifth)) s += 1;
  if (chord.third !== null && played.filter((p) => p === chord.third).length > 1) s -= 0.25;
  if (opens && maxF <= 3) s += 1; // acorde abierto clásico
  if (frets.some((f, i) => f === 0 && i !== first) && maxF >= 4) s -= 2; // al aire con la mano estirada
  s -= minF * 0.1;
  return s;
}

/** Revisa que la digitación sirva: bajo correcto, notas necesarias y dedos suficientes. */
function valid(frets, chord) {
  const idx = frets.map((f, i) => i).filter((i) => frets[i] !== null);
  if (idx.length < 4) return false;
  if (mod(TUNING[idx[0]] + frets[idx[0]]) !== chord.bass) return false;
  const pcs = new Set(idx.map((i) => mod(TUNING[i] + frets[i])));
  if (!chord.required.every((p) => pcs.has(p))) return false;
  const first = idx[0];
  const last = idx[idx.length - 1];
  if (frets.slice(first, last + 1).filter((f) => f === null).length > 1) return false;
  // Cuerdas al aire con la mano lejos del inicio suenan raro; solo se permite el bajo al aire.
  const maxF = Math.max(0, ...frets.filter((f) => f !== null));
  if (maxF > 4 && frets.some((f, i) => f === 0 && i !== first)) return false;
  return fingering(frets).fingers <= 4;
}

const cache = new Map();

/**
 * Todas las buenas digitaciones de un acorde, una por zona del brazo, ordenadas de la más
 * cercana al inicio a la más alta. Cada una: { frets: [6 valores, null = no tocar], base, barre, score }.
 */
export function voicings(name) {
  if (cache.has(name)) return cache.get(name);
  const chord = parseChord(name);
  const found = new Map();
  if (chord) {
    for (let s = 0; s <= 12; s++) {
      const lo = Math.max(1, s);
      const hi = s + 3;
      const options = TUNING.map((open) => {
        const o = [null];
        for (const f of [0, ...Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)]) {
          if (chord.tones.includes(mod(open + f))) o.push(f);
        }
        return o;
      });
      const frets = [];
      const walk = (i) => {
        if (i === 6) {
          if (valid(frets, chord)) {
            const key = frets.join(',');
            if (!found.has(key)) found.set(key, { frets: [...frets], score: score(frets, chord) });
          }
          return;
        }
        for (const f of options[i]) {
          frets[i] = f;
          walk(i + 1);
        }
      };
      walk(0);
    }
  }
  // La mejor de cada zona (traste más bajo que se aprieta), y luego zonas separadas entre sí.
  const all = [...found.values()].map((v) => {
    const fretted = v.frets.filter((f) => f !== null && f > 0);
    const minF = fretted.length ? Math.min(...fretted) : 0;
    const maxF = fretted.length ? Math.max(...fretted) : 0;
    return { ...v, minF, maxF, open: v.frets.includes(0) && maxF <= 3 };
  });
  all.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const v of all) {
    const zone = v.open ? 0 : v.minF;
    if (picked.some((p) => Math.abs((p.open ? 0 : p.minF) - zone) < 2)) continue;
    picked.push(v);
  }
  // Las digitaciones flojas solo se quedan si no hay suficientes buenas.
  const good = picked.filter((v, i) => i < 2 || v.score >= 5);
  const out = good
    .sort((a, b) => (a.open ? 0 : a.minF) - (b.open ? 0 : b.minF))
    .map((v) => ({ frets: v.frets, score: v.score, barre: fingering(v.frets).barre, zone: v.open ? 0 : v.minF }));
  cache.set(name, out);
  return out;
}

/** Hasta 5 posiciones de un acorde, de abajo hacia arriba del brazo, como en un cancionero. */
export function positions(name, max = 5) {
  const all = voicings(name);
  if (all.length <= max) return all;
  // Se quedan las mejores, pero repartidas por todo el brazo.
  const best = [...all].sort((a, b) => b.score - a.score).slice(0, max);
  return all.filter((v) => best.includes(v));
}

/**
 * Para tocar una progresión sin brincar por todo el brazo: la digitación de cada acorde que
 * queda más cerca de `zone` (traste donde está la mano).
 */
export function nearZone(name, zone) {
  const all = voicings(name);
  if (!all.length) return null;
  return all.reduce((best, v) => {
    const cost = (x) => Math.abs(x.zone - zone) * 2 - x.score * 0.25;
    return cost(v) < cost(best) ? v : best;
  });
}

/** Zonas de mano para las posiciones 1-5 a partir del acorde del tono (el I). */
export function handZones(tonicChord) {
  // La posición 1 siempre es la de acordes abiertos, aunque el acorde del tono no tenga forma abierta.
  const zones = positions(tonicChord).map((v) => v.zone);
  return (zones[0] === 0 ? zones : [0, ...zones]).slice(0, 5);
}

/** El diagrama como SVG (usa currentColor, así sirve en tema claro y oscuro). */
export function diagramSvg(v, label = '') {
  const W = 96;
  const H = 124;
  const left = 18;
  const top = 34;
  const gap = 13;
  const rowH = 17;
  const rows = 5;
  if (!v) {
    return `<svg class="gdiag" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}: sin diagrama"><text x="${W / 2}" y="16" class="gname">${label}</text><text x="${W / 2}" y="${H / 2 + 10}" class="gnone">—</text></svg>`;
  }
  const fretted = v.frets.filter((f) => f !== null && f > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const start = maxF <= rows ? 1 : minF;
  const x = (i) => left + i * gap;
  const y = (f) => top + (f - start + 0.5) * rowH;
  const parts = [];
  parts.push(`<text x="${x(2.5)}" y="14" class="gname">${label}</text>`);
  for (let i = 0; i < 6; i++) parts.push(`<line x1="${x(i)}" y1="${top}" x2="${x(i)}" y2="${top + rows * rowH}" class="gline"/>`);
  for (let r = 0; r <= rows; r++) parts.push(`<line x1="${x(0)}" y1="${top + r * rowH}" x2="${x(5)}" y2="${top + r * rowH}" class="gline"/>`);
  if (start === 1) parts.push(`<rect x="${x(0) - 1}" y="${top - 3}" width="${gap * 5 + 2}" height="4" class="gnut"/>`);
  else parts.push(`<text x="${x(0) - 5}" y="${top + rowH * 0.5 + 4}" class="gfret">${start}</text>`);
  v.frets.forEach((f, i) => {
    if (f === null) parts.push(`<text x="${x(i)}" y="${top - 7}" class="gmark">×</text>`);
    else if (f === 0) parts.push(`<circle cx="${x(i)}" cy="${top - 11}" r="3.6" class="gopen"/>`);
  });
  if (v.barre) {
    const { fret, from, to } = v.barre;
    parts.push(`<rect x="${x(from) - 5}" y="${y(fret) - 5}" width="${x(to) - x(from) + 10}" height="10" rx="5" class="gdot"/>`);
  }
  v.frets.forEach((f, i) => {
    if (f > 0 && !(v.barre && f === v.barre.fret && i >= v.barre.from && i <= v.barre.to)) {
      parts.push(`<circle cx="${x(i)}" cy="${y(f)}" r="5" class="gdot"/>`);
    }
  });
  const desc = v.frets.map((f) => (f === null ? 'x' : f)).join(' ');
  return `<svg class="gdiag" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}: ${desc}">${parts.join('')}</svg>`;
}
