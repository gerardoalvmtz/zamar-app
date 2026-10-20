// Puentes entre tonalidades: qué acordes tocar al final de una canción para llegar a la
// siguiente sin que el cambio suene brusco. Usa teoría básica: acordes en común (pivote),
// ii–V y la dominante con sus, que es lo más usado en worship.
import { pcName, useFlats, keyName, keyRelation } from './music.js';

const mod = (n) => ((n % 12) + 12) % 12;

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

const triad = (pc, q) => [pc, pc + (q.startsWith('m') ? 3 : 4), pc + 7].map(mod);

// Acordes de paso preferidos para entrar a la tonalidad nueva (los que "preparan" la V).
const PREP = { ii: 4, IV: 4, iv: 4, vi: 3, VI: 3, iii: 2, III: 2, VII: 1, v: 1, I: 0, i: 0, V: 0 };

/**
 * Caminos de acordes para pasar de una tonalidad a otra.
 * Devuelve { relation, closeness, tip, options: [{ name, why, steps: [{ chord, role }] }] }.
 */
export function bridges(from, to) {
  if (!from || !to) return null;
  const fFlats = useFlats(from);
  const tFlats = useFlats(to);
  const name = (c, flats) => pcName(c.pc, flats) + c.q;
  const tName = keyName(to);
  const start = { chord: name({ pc: from.pc, q: from.minor ? 'm' : '' }, fFlats), role: `${from.minor ? 'i' : 'I'} de ${keyName(from)}`, from: true };
  const end = { chord: name({ pc: to.pc, q: to.minor ? 'm' : '' }, tFlats), role: `${to.minor ? 'i' : 'I'} de ${tName}`, to: true };
  const V7 = { chord: name({ pc: mod(to.pc + 7), q: '7' }, tFlats), role: `V7 de ${tName}` };
  const Vsus = { chord: name({ pc: mod(to.pc + 7), q: 'sus4' }, tFlats), role: `V de ${tName}, suspendido` };

  const fromChords = diatonic(from);
  const toChords = diatonic(to);
  const common = toChords.filter((c) => fromChords.some((f) => f.pc === c.pc && f.q === c.q));
  const relation = keyRelation(from, to).label;
  const closeness = from.pc === to.pc && from.minor === to.minor ? 'same' : common.length >= 4 ? 'near' : common.length >= 2 ? 'mid' : 'far';

  // Nota que suena en los dos acordes: voces o teclado la sostienen mientras cambia el bajo.
  const fromTriad = triad(from.pc, from.minor ? 'm' : '');
  let shared = fromTriad.filter((n) => triad(to.pc, to.minor ? 'm' : '').includes(n));
  let sharedWith = end.chord;
  if (!shared.length) {
    shared = fromTriad.filter((n) => triad(mod(to.pc + 7), '').includes(n));
    sharedWith = V7.chord;
  }
  const tip = shared.length
    ? `Nota puente: ${pcName(shared[0], tFlats)}. Está en ${start.chord} y en ${sharedWith}; el teclado o las voces la pueden sostener mientras cambia el bajo.`
    : `No hay nota en común: deja que el bajo o un pad marque ${V7.chord} un compás completo antes de entrar.`;

  if (closeness === 'same') {
    return {
      relation,
      closeness,
      tip: 'Misma tonalidad: puedes entrar directo o sostener el acorde mientras se presenta la siguiente.',
      options: [{ name: 'Directo', why: 'Las dos canciones están en el mismo tono.', steps: [start, end] }],
    };
  }

  const options = [];
  const pivots = common
    .filter((c) => !(c.pc === from.pc) && !(c.pc === to.pc && c.deg.toLowerCase() === 'i'))
    .sort((a, b) => (PREP[b.deg] ?? 0) - (PREP[a.deg] ?? 0));
  const pivot = pivots[0];
  if (pivot && pivot.deg !== 'V') {
    const inFrom = fromChords.find((f) => f.pc === pivot.pc && f.q === pivot.q).deg;
    options.push({
      name: 'Acorde en común',
      why: `${name(pivot, tFlats)} existe en los dos tonos (${inFrom} de ${keyName(from)} y ${pivot.deg} de ${tName}), así que el oído no siente el cambio hasta la V7.`,
      steps: [start, { chord: name(pivot, tFlats), role: `${inFrom} → ${pivot.deg}` }, V7, end],
    });
  }

  // Cambiar la tónica de mayor a menor (o al revés) suele abrir la puerta al tono nuevo:
  // G → Gm ya es el vi de Bb.
  const flip = { pc: from.pc, q: from.minor ? '' : 'm' };
  const flipIn = toChords.find((c) => c.pc === flip.pc && c.q === flip.q && !(c.pc === to.pc && c.q === (to.minor ? 'm' : '')));
  if (flipIn && flipIn.deg !== 'V' && !(pivot && pivot.pc === flip.pc && pivot.q === flip.q)) {
    options.push({
      name: from.minor ? 'Tónica a mayor' : 'Tónica a menor',
      why: `Cambia ${start.chord} por ${name(flip, tFlats)}: es casi el mismo acorde, pero ya pertenece a ${tName} (es su ${flipIn.deg}).`,
      steps: [start, { chord: name(flip, tFlats), role: `${flipIn.deg} de ${tName}` }, V7, end],
    });
  }

  // Si el acorde en común ya es el ii del tono nuevo, el ii–V sería el mismo camino.
  const ii = to.minor ? { pc: mod(to.pc + 2), q: 'm7b5' } : { pc: mod(to.pc + 2), q: 'm7' };
  if (!options.some((o) => o.name === 'Acorde en común' && pivot.deg === 'ii')) options.push({
    name: 'ii – V',
    why: `Prepara el tono nuevo con su ii y su dominante; funciona aunque los tonos estén lejos.`,
    steps: [start, { chord: name(ii, tFlats), role: `${to.minor ? 'iiø' : 'ii'} de ${tName}` }, V7, end],
  });

  options.push({
    name: 'Dominante con sus',
    why: `El clásico de worship: deja sonar ${Vsus.chord} (puede ser con pad) y resuelve a ${V7.chord}. Es el más corto.`,
    steps: [start, Vsus, V7, end],
  });

  // Subir medio tono o un tono: el "levantón" que se usa en el último coro.
  const up = mod(to.pc - from.pc);
  if (from.minor === to.minor && (up === 1 || up === 2)) {
    options.push({
      name: 'Subida',
      why: `Sube ${up === 1 ? 'medio tono' : 'un tono'}: corta en seco al final de la frase y entra con ${V7.chord} en el último tiempo.`,
      steps: [start, { ...V7, role: `${V7.role}, un tiempo` }, end],
    });
  }

  // Ordena de lo más suave a lo más directo según qué tan lejos están los tonos.
  const rank = (o) => (o.name === 'Acorde en común' ? 0 : o.name.startsWith('Tónica') ? 1 : o.name === 'ii – V' ? 2 : 3);
  options.sort((a, c) => rank(a) - rank(c));
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

/** HTML del mapa: cada opción es una fila de acordes con su función debajo. */
export function bridgeHtml(b, esc, { recommend = true } = {}) {
  if (!b) return '';
  const opts = b.options;
  return `<div class="bridge">
    ${opts
      .map(
        (o, i) => `<div class="route">
          <div class="route-head"><strong>${esc(o.name)}</strong>${recommend && i === 0 ? '<span class="pill ok">Recomendado</span>' : ''}</div>
          <ol class="path">${o.steps
            .map((s) => `<li class="${s.from ? 'from' : s.to ? 'to' : ''}"><b>${esc(s.chord)}</b><small>${esc(s.role)}</small></li>`)
            .join('')}</ol>
          <p class="hint">${esc(o.why)}</p>
        </div>`,
      )
      .join('')}
    ${b.tip ? `<p class="hint tip">💡 ${esc(b.tip)}</p>` : ''}
  </div>`;
}
