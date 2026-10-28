// Puentes entre tonalidades: qué acordes tocar al final de una canción para llegar a la
// siguiente sin que el cambio suene brusco.
//
// La idea central viene de "Armonía Ilustrada" (Brian Callipari): lo que pega dos acordes son
// las notas que comparten (el "glue mágico") y qué tan poco se mueven las demás. Por eso cada
// camino se mide nota por nota y se recomienda el que menos salta. Además de los recursos de
// siempre (acorde pivote, ii–V, dominante con sus) se prueban los de los libros: cadenas de
// acordes que comparten dos notas (transformaciones P, R y L), el IV que se vuelve menor, el
// disminuido de paso, el aumentado como portal y el sustituto tritonal.
import { pcName, useFlats, keyName, keyRelation } from './music.js';

const mod = (n) => ((n % 12) + 12) % 12;

// Intervalos de cada tipo de acorde y cómo se escribe.
const QUAL = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  7: [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
};
const SYMBOL = { dim7: '°7', aug: '+' };

export const pcsOf = (c) => QUAL[c.q].map((i) => mod(c.pc + i));

/** Acordes de la tonalidad con su grado. En menor se incluye la V mayor (armónica). */
function diatonic(key) {
  const t = key.pc;
  return key.minor
    ? [
        { pc: t, q: 'm', deg: 'i' },
        { pc: t + 3, q: '', deg: 'III' },
        { pc: t + 5, q: 'm', deg: 'iv' },
        { pc: t + 7, q: '', deg: 'V' },
        { pc: t + 7, q: 'm', deg: 'v' },
        { pc: t + 8, q: '', deg: 'VI' },
        { pc: t + 10, q: '', deg: 'VII' },
      ].map((c) => ({ ...c, pc: mod(c.pc) }))
    : [
        { pc: t, q: '', deg: 'I' },
        { pc: t + 2, q: 'm', deg: 'ii' },
        { pc: t + 4, q: 'm', deg: 'iii' },
        { pc: t + 5, q: '', deg: 'IV' },
        { pc: t + 7, q: '', deg: 'V' },
        { pc: t + 9, q: 'm', deg: 'vi' },
      ].map((c) => ({ ...c, pc: mod(c.pc) }));
}

// Acordes de paso preferidos para entrar a la tonalidad nueva (los que "preparan" la V).
const PREP = { ii: 4, IV: 4, iv: 4, vi: 3, VI: 3, iii: 2, III: 2, VII: 1, v: 1, I: 0, i: 0, V: 0 };

// Distancia más corta entre dos notas (0 a 6 semitonos).
const dist = (a, b) => Math.min(mod(a - b), mod(b - a));

/**
 * Qué tanto se mueven las voces para pasar de un acorde a otro: cada nota busca la más
 * cercana del otro acorde. Las notas en común cuestan 0; un semitono, 1. Así C → Em cuesta
 * poco (dos notas se quedan) y C → F#7 cuesta mucho.
 */
export function motion(a, b) {
  const A = pcsOf(a);
  const B = pcsOf(b);
  const near = (from, to) => from.reduce((s, n) => s + Math.min(...to.map((m) => dist(n, m))), 0);
  return near(A, B) + near(B, A);
}

const shared = (a, b) => pcsOf(a).filter((n) => pcsOf(b).includes(n));

// Transformaciones de la teoría neoriemanniana: cada una deja dos notas en su lugar.
const PRL = (c) =>
  c.q === ''
    ? [
        { pc: c.pc, q: 'm', op: 'P' },
        { pc: mod(c.pc + 9), q: 'm', op: 'R' },
        { pc: mod(c.pc + 4), q: 'm', op: 'L' },
      ]
    : [
        { pc: c.pc, q: '', op: 'P' },
        { pc: mod(c.pc + 3), q: '', op: 'R' },
        { pc: mod(c.pc + 8), q: '', op: 'L' },
      ];

const same = (a, b) => a.pc === b.pc && a.q === b.q;

// Un puente puede tener hasta 6 acordes contando el de salida y el de llegada.
export const MAX_CHORDS = 6;


/** Camino más corto de transformaciones P, R y L desde `start` hasta algún acorde de `goals`. */
function prlPath(start, goals, maxDepth = 3) {
  let frontier = [[start]];
  const seen = new Set([`${start.pc}${start.q}`]);
  for (let depth = 0; depth < maxDepth; depth++) {
    const next = [];
    const hits = [];
    for (const path of frontier) {
      for (const n of PRL(path[path.length - 1])) {
        const id = `${n.pc}${n.q}`;
        if (seen.has(id)) continue;
        const p = [...path, n];
        if (goals.some((g) => same(g, n))) hits.push(p);
        else next.push(p);
      }
    }
    if (hits.length) {
      // Entre los más cortos, el que llega al acorde que mejor prepara la V.
      const score = (p) => PREP[goals.find((g) => same(g, p[p.length - 1])).deg] ?? 0;
      return hits.sort((a, b) => score(b) - score(a))[0];
    }
    next.forEach((p) => seen.add(`${p[p.length - 1].pc}${p[p.length - 1].q}`));
    frontier = next;
  }
  return null;
}

// ---------- voces para el teclado ----------
const NOTE_LO = 55; // G3
const NOTE_HI = 77; // F5
const BASS_LO = 36; // C2
const BASS_HI = 50; // D3

/** Todas las formas cerradas (inversiones) de un acorde dentro del rango de la mano derecha. */
function closeVoicings(pcs) {
  const out = [];
  for (let low = NOTE_LO; low <= NOTE_HI - 7; low++) {
    if (!pcs.includes(mod(low))) continue;
    const notes = [low];
    let ok = true;
    for (let i = 1; i < pcs.length; i++) {
      let n = notes[notes.length - 1] + 1;
      while (!pcs.includes(mod(n)) || notes.some((x) => mod(x) === mod(n))) n++;
      if (n > NOTE_HI) ok = false;
      notes.push(n);
    }
    if (ok) out.push(notes);
  }
  return out;
}

const moveCost = (prev, next) =>
  next.reduce((s, n) => s + Math.min(...prev.map((p) => Math.abs(n - p))), 0) +
  prev.reduce((s, p) => s + Math.min(...next.map((n) => Math.abs(n - p))), 0);

/**
 * Elige la inversión de cada acorde que menos mueve las manos (conducción de voces) y una
 * línea de bajo que camine por pasos cuando se puede. Devuelve, por acorde,
 * { notes: [midi mano derecha], bass: midi, slash: pc | null }.
 */
export function voiceLead(chords) {
  const out = [];
  chords.forEach((c, i) => {
    const pcs = pcsOf(c);
    const options = closeVoicings(pcs);
    let notes;
    if (!i) {
      // Primer acorde: cerca del centro del teclado, como se toca al final de una canción.
      notes = options.sort((a, b) => Math.abs(a[1] - 66) - Math.abs(b[1] - 66))[0];
    } else {
      const prev = out[i - 1].notes;
      const center = (v) => Math.abs(v.reduce((s, n) => s + n, 0) / v.length - 66) * 0.15;
      notes = options.sort((a, b) => moveCost(prev, a) + center(a) - (moveCost(prev, b) + center(b)))[0];
    }
    // Bajo: la raíz en la octava más cercana al bajo anterior.
    const near = (pc, from) => {
      let best = null;
      for (let n = BASS_LO; n <= BASS_HI; n++) if (mod(n) === pc && (best === null || Math.abs(n - from) < Math.abs(best - from))) best = n;
      return best;
    };
    const prevBass = i ? out[i - 1].bass : 43;
    let bass = near(c.pc, prevBass);
    let slash = null;
    // En los acordes mayores de paso (ni el primero, ni el último, ni la dominante) se pone la
    // tercera en el bajo si así el bajo camina por pasos en vez de saltar (G → D/F# → Em).
    const passing = i > 0 && i < chords.length - 1 && c.q === '';
    if (passing && Math.abs(bass - prevBass) > 2) {
      const third = mod(c.pc + 4);
      const alt = near(third, prevBass);
      if (Math.abs(alt - prevBass) <= 2) {
        bass = alt;
        slash = third;
      }
    }
    out.push({ notes, bass, slash });
  });
  return out;
}

// ---------- caminos ----------
export function bridges(from, to) {
  if (!from || !to) return null;
  const fFlats = useFlats(from);
  const tFlats = useFlats(to);
  const tName = keyName(to);
  const fName = keyName(from);
  const tonic = (k) => ({ pc: k.pc, q: k.minor ? 'm' : '' });
  const S = { ...tonic(from), role: `${from.minor ? 'i' : 'I'} de ${fName}`, from: true };
  const E = { ...tonic(to), role: `${to.minor ? 'i' : 'I'} de ${tName}`, to: true };
  const V7 = { pc: mod(to.pc + 7), q: '7', role: `V7 de ${tName}` };
  const Vsus = { pc: mod(to.pc + 7), q: 'sus4', role: `V de ${tName}, suspendido` };
  const name = (c) => pcName(c.pc, c.from || c.fromName ? fFlats : tFlats) + (SYMBOL[c.q] ?? c.q);

  const fromChords = diatonic(from);
  const toChords = diatonic(to);
  const common = toChords.filter((c) => fromChords.some((f) => same(f, c)));
  const relation = keyRelation(from, to).label;

  // Qué tan brusco se siente cada cambio: lo que se mueven las voces (al cuadrado, para que un
  // salto pese más que dos pasos chicos), a la mitad si la raíz cae una quinta (V → I, ii → V:
  // el oído lo espera), y más si los dos acordes no caben juntos en ninguno de los dos tonos.
  // El camino se califica por su paso promedio y por su paso más brusco, no por el total, así
  // que uno de 6 acordes que se mueve poco le gana a uno de 3 con un brinco.
  const inKey = (c, chords) => chords.some((x) => x.pc === c.pc && (x.q === c.q || (x.q === '' && (c.q === '7' || c.q === 'sus4')) || (x.q === 'm' && c.q === 'm7')));
  const together = (a, b) => (inKey(a, fromChords) && inKey(b, fromChords)) || (inKey(a, toChords) && inKey(b, toChords));
  const stepCost = (a, b) => {
    let c = motion(a, b) ** 2 / 4;
    if (mod(a.pc - b.pc) === 7 || (a.pc === b.pc && a.q === 'sus4')) c /= 2;
    return c + (together(a, b) ? 0 : 3);
  };
  const routeCost = (steps, penalty = 0) => {
    const each = steps.slice(1).map((c, i) => stepCost(steps[i], c));
    return each.reduce((s, x) => s + x, 0) / each.length + Math.max(...each) / 2 + penalty;
  };
  const closeness = same(S, E) ? 'same' : common.length >= 4 ? 'near' : common.length >= 2 ? 'mid' : 'far';

  // Nombre de cada nota según el acorde al que pertenece: la tercera menor de C es Eb, no D#.
  const spell = (c, n) => {
    const root = name(c);
    if (root[1] === '#') return pcName(n, false);
    if (root[1] === 'b') return pcName(n, true);
    const i = mod(n - c.pc);
    return pcName(n, [3, 6, 9, 10].includes(i) || (i === 5 && root[0] === 'F'));
  };

  const finish = (o) => {
    const voices = voiceLead(o.steps);
    const steps = o.steps.map((c, i) => {
      const v = voices[i];
      const prev = o.steps[i - 1];
      const glue = prev ? shared(prev, c).map((n) => spell(c, n)) : [];
      return {
        chord: name(c) + (v.slash !== null ? `/${spell(c, v.slash)}` : ''),
        role: c.role,
        ...(c.from ? { from: true } : {}),
        ...(c.to ? { to: true } : {}),
        glue,
        notes: v.notes,
        bass: v.bass,
        keys: v.notes.map((n) => spell(c, n)).join('-'),
      };
    });
    const moves = o.steps.slice(1).reduce((s, c, i) => s + motion(o.steps[i], c), 0);
    const dominant = o.steps.some((c) => c.q === '7' && c.pc === V7.pc);
    return { name: o.name, why: o.why, steps, moves, dominant, cost: routeCost(o.steps, o.penalty) };
  };

  if (closeness === 'same') {
    return {
      relation,
      closeness,
      tip: 'Misma tonalidad: puedes entrar directo o sostener el acorde mientras se presenta la siguiente.',
      options: [finish({ name: 'Directo', why: 'Las dos canciones están en el mismo tono.', steps: [S, E] })],
    };
  }

  const routes = [];
  const add = (o) => {
    const key = o.steps.map((c) => `${c.pc}${c.q}`).join(' ');
    if (!routes.some((r) => r.key === key)) routes.push({ ...o, key });
  };
  const degIn = (c, chords) => chords.find((x) => same(x, c))?.deg;
  const roleOf = (c) => {
    const t = degIn(c, toChords);
    const f = degIn(c, fromChords);
    return t ? `${t} de ${tName}` : f ? `${f} de ${fName}` : 'de paso';
  };

  // 1. Acorde en común: existe en los dos tonos, así que el oído no siente el cambio hasta la V7.
  const pivots = common
    .filter((c) => c.pc !== from.pc && !same(c, E) && c.deg !== 'V')
    .sort((a, b) => (PREP[b.deg] ?? 0) - (PREP[a.deg] ?? 0));
  if (pivots[0]) {
    const p = pivots[0];
    const inFrom = degIn(p, fromChords);
    add({
      name: 'Acorde en común',
      why: `${name(p)} existe en los dos tonos (${inFrom} de ${fName} y ${p.deg} de ${tName}), así que el oído no siente el cambio hasta la V7.`,
      steps: [S, { ...p, role: `${inFrom} → ${p.deg}` }, V7, E],
    });
  }

  // 2. Tónica a menor (o a mayor): G → Gm ya es el vi de Bb.
  const flip = { pc: from.pc, q: from.minor ? '' : 'm' };
  const flipDeg = degIn(flip, toChords);
  if (flipDeg && !same(flip, E) && flipDeg !== 'V') {
    add({
      name: from.minor ? 'Tónica a mayor' : 'Tónica a menor',
      why: `Cambia ${name(S)} por ${name(flip)}: solo se mueve una nota y ya pertenece a ${tName} (es su ${flipDeg}).`,
      steps: [S, { ...flip, role: `${flipDeg} de ${tName}` }, V7, E],
    });
  }

  // 3. Notas en común: acordes que comparten dos notas con el anterior (P, R y L) hasta
  //    llegar a uno que prepare la V del tono nuevo.
  const goals = toChords.filter((c) => (PREP[c.deg] ?? 0) >= 2);
  const chain = prlPath(tonic(from), goals);
  if (chain && chain.length >= 2) {
    const mid = chain.slice(1).map((c) => ({ ...c, role: roleOf(c) }));
    add({
      name: 'Notas en común',
      why: `Cada acorde comparte dos notas con el anterior, así que siempre hay algo que se sostiene mientras el resto se mueve un paso. Cuando llegas a ${name(mid[mid.length - 1])} ya estás en ${tName}.`,
      steps: [S, ...mid, V7, E],
    });
  }

  // 4. El IV que se vuelve menor (F → Fm → C): la cadencia más tierna para llegar a un tono mayor.
  if (!to.minor) {
    const IV = { pc: mod(to.pc + 5), q: '', role: `IV de ${tName}` };
    const iv = { pc: mod(to.pc + 5), q: 'm', role: `iv de ${tName} (prestado)` };
    const steps = same(IV, S) ? [S, iv, E] : [S, IV, iv, E];
    if (steps.length === 3 || shared(S, IV).length) {
      add({
        penalty: steps.length === 3 ? 0 : 2,
        name: 'Cuarto menor',
        why: `${name(IV)} → ${name(iv)} → ${name(E)}: el IV se vuelve menor y cae al tono nuevo sin pasar por la dominante. Es suave y muy emotivo, de balada de adoración.`,
        steps,
      });
    }
  }

  // 5. Disminuido de paso: la sensible del tono nuevo como °7. Sus notas están a medio tono del
  //    acorde de llegada. Si los tonos están a terceras menores, el mismo °7 sirve para los dos.
  const dim = { pc: mod(to.pc - 1), q: 'dim7', role: `vii°7 de ${tName}` };
  const symmetric = mod(to.pc - from.pc) % 3 === 0;
  add({
    name: 'Disminuido de paso',
    why: symmetric
      ? `${name(dim)} es simétrico: tiene las mismas notas que el disminuido de ${fName}, así que funciona de puerta entre los dos tonos. Todas sus notas caen a medio tono de ${name(E)}.`
      : `${name(dim)} es la sensible de ${tName}: casi todas sus notas están a medio tono de ${name(E)}, así que resuelve solo. Funciona bien con pad o piano sostenido.`,
    steps: [S, dim, E],
    penalty: 3,
  });

  // 6. Aumentado como portal: si los tonos están a tercera mayor, C+ = E+ = G#+.
  const up = mod(to.pc - from.pc);
  if (!from.minor && !to.minor && (up === 4 || up === 8)) {
    const aug = { pc: from.pc, q: 'aug', fromName: true, role: `${name(S)} aumentado` };
    add({
      name: 'Aumentado',
      why: `${name(aug)} tiene las mismas notas que el aumentado de ${tName}: sube una sola nota medio tono y ya estás en el tono nuevo. Suena a película; déjalo sonar un compás.`,
      steps: [S, aug, E],
      penalty: 5,
    });
  }

  // 7. ii – V: funciona aunque los tonos estén lejos.
  const ii = { pc: mod(to.pc + 2), q: to.minor ? 'm7b5' : 'm7', role: `${to.minor ? 'iiø' : 'ii'} de ${tName}` };
  add({
    name: 'ii – V',
    why: `Prepara el tono nuevo con su ii y su dominante; funciona aunque los tonos estén lejos.`,
    steps: [S, ii, V7, E],
  });

  // 8. Dominante con sus: el clásico de worship, el más corto.
  add({
    name: 'Dominante con sus',
    why: `El clásico de worship: deja sonar ${name(Vsus)} (puede ser con pad) y resuelve a ${name(V7)}.`,
    steps: [S, Vsus, V7, E],
  });

  // 9. Sustituto tritonal: en vez de la V7, la dominante que está a medio tono arriba del destino.
  const sub = { pc: mod(to.pc + 1), q: '7', role: `sustituto de ${name(V7)}` };
  add({
    name: 'Sustituto tritonal',
    why: `${name(sub)} comparte con ${name(V7)} las dos notas que piden resolver, pero baja medio tono a ${name(E)}. Suena más moderno; úsalo con cuidado.`,
    steps: [S, sub, E],
    penalty: 5,
  });

  // 10. Subida de medio tono o un tono: el "levantón" del último coro.
  if (from.minor === to.minor && (up === 1 || up === 2)) {
    add({
      name: 'Subida',
      why: `Sube ${up === 1 ? 'medio tono' : 'un tono'}: corta en seco al final de la frase y entra con ${name(V7)} en el último tiempo.`,
      steps: [S, { ...V7, role: `${V7.role}, un tiempo` }, E],
      penalty: 6,
    });
  }

  // 11. Camino suave: entre los acordes de los dos tonos, la ruta de hasta 6 acordes en la que
  //     cada paso mueve lo menos posible. Una vez que entra a acordes del tono nuevo ya no
  //     regresa al anterior.
  const pool = [];
  for (const c of [...fromChords, ...toChords]) {
    if ((c.q !== '' && c.q !== 'm') || same(c, S) || same(c, E) || pool.some((p) => same(p, c))) continue;
    if (c.pc === V7.pc && c.q === '') continue; // la V del tono nuevo entra como V7 al final
    if (c.deg === 'V' && from.minor && degIn(c, fromChords) === 'V') continue; // pide volver a la tónica vieja
    const old = !degIn(c, toChords);
    pool.push({ pc: c.pc, q: c.q, role: roleOf(c), newKey: !degIn(c, fromChords), ...(old ? { fromName: true } : {}) });
  }
  const endings = [[V7, E], [Vsus, V7, E]];
  let smooth = null;
  const walk = (path) => {
    for (const end of endings) {
      const steps = [...path, ...end];
      if (steps.length > MAX_CHORDS || steps.length < 5) continue;
      const cost = routeCost(steps);
      if (!smooth || cost < smooth.cost) smooth = { steps, cost };
    }
    if (path.length + 2 >= MAX_CHORDS) return;
    const last = path[path.length - 1];
    for (const c of pool) {
      if (path.includes(c) || (last.newKey && !c.newKey)) continue;
      walk([...path, c]);
    }
  };
  walk([S]);
  if (smooth) {
    const mid = smooth.steps.slice(1, -2).filter((c) => c !== Vsus);
    add({
      name: 'Camino suave',
      why: `Pasa por ${mid.map(name).join(', ')}: acordes de los dos tonos escogidos para que cada cambio mueva lo menos posible. Es más largo, pero ningún paso brinca; dale un compás a cada acorde.`,
      steps: smooth.steps,
    });
  }

  // Del camino que menos mueve las voces al que más.
  // A igual costo gana el que pasa por la V7, que confirma mejor el tono nuevo.
  const options = routes.map(finish).sort((a, b) => a.cost - b.cost || b.dominant - a.dominant);

  // Nota puente: la que más tiempo se puede sostener en el camino recomendado.
  const best = options[0].steps;
  let tip = '';
  for (const pcN of pcsOf(S)) {
    let n = 1;
    while (n < best.length && best[n].notes.some((x) => mod(x) === pcN)) n++;
    if (n > 1 && (!tip || n > tip.n)) tip = { n, pc: pcN };
  }
  tip = tip
    ? `Nota puente: ${pcName(tip.pc, tFlats)}. Se queda sonando en ${best.slice(0, tip.n).map((s) => s.chord).join(', ')}; las voces o el teclado la pueden sostener mientras cambia lo demás.`
    : `No hay nota que se quede: que el teclado mueva cada voz solo un paso (abajo verás las notas) y el bajo marque ${name(V7)} un compás completo.`;

  return { relation, closeness, tip, options };
}

export const CLOSENESS = {
  same: 'Mismo tono',
  near: 'Tonos vecinos: el cambio es natural',
  mid: 'Tonos algo lejanos: usa un puente',
  far: 'Tonos lejanos: dale tiempo al puente',
};

/** Consejo de tempo cuando las dos canciones van a velocidades muy distintas. */
export function tempoTip(a, b) {
  if (!a || !b) return '';
  const d = b - a;
  if (Math.abs(d) <= 8) return '';
  return d > 0
    ? `La siguiente va más rápido (${a} → ${b} BPM): entra con la batería o un conteo en el tempo nuevo después de la V7.`
    : `La siguiente va más lento (${a} → ${b} BPM): deja que el puente se alargue y baja la intensidad antes de entrar.`;
}

/** Qué tan suave es el camino, en palabras. */
function smoothLabel(o) {
  const per = o.moves / (o.steps.length - 1);
  return per <= 4 ? 'Muy suave' : per <= 6 ? 'Suave' : 'Con más movimiento';
}

/** HTML del mapa: cada opción es una fila de acordes con su función debajo. */
export function bridgeHtml(b, esc, { recommend = true, bpm = 0 } = {}) {
  if (!b) return '';
  const opts = b.options;
  return `<div class="bridge">
    ${opts
      .map(
        (o, i) => `<div class="route">
          <div class="route-head"><strong>${esc(o.name)}</strong>${recommend && i === 0 ? '<span class="pill ok">Recomendado</span>' : `<span class="pill">${smoothLabel(o)}</span>`}</div>
          <ol class="path">${o.steps
            .map(
              (s, j) => `<li class="${s.from ? 'from' : s.to ? 'to' : ''}">${
                j ? `<span class="glue">${s.glue.length ? `🔗 ${esc(s.glue.join(' · '))}` : '↕ por pasos'}</span>` : ''
              }<b>${esc(s.chord)}</b><small>${esc(s.role)}</small></li>`,
            )
            .join('')}</ol>
          <p class="hint">${esc(o.why)}</p>
          <p class="hint keys">🎹 ${o.steps.map((s) => esc(s.keys)).join(' → ')}</p>
          <div class="row"><button type="button" class="button ghost small" data-bpm="${bpm || ''}" data-bridgeplay="${esc(JSON.stringify(o.steps.map((s) => [...s.notes, s.bass])))}">▶ Escuchar</button></div>
        </div>`,
      )
      .join('')}
    ${b.tip ? `<p class="hint tip">💡 ${esc(b.tip)}</p>` : ''}
  </div>`;
}
