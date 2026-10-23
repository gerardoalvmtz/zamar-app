// Ideas de progresiones para componer: eliges un ánimo y un tono, y salen acordes que
// suelen dar esa sensación, explicados para quien no sabe mucha teoría.
// Las progresiones se escriben en grados (I, vi, ♭VII…) y se pasan al tono elegido.
import { pcName, useFlats, keyName } from './music.js';

const mod = (n) => ((n % 12) + 12) % 12;
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];

/**
 * Ánimos con progresiones para tono mayor y para tono menor.
 * Cada progresión: name, section (dónde suele ir), major / minor (grados), why.
 */
export const MOODS = [
  {
    id: 'alegre',
    name: 'Alegre',
    emoji: '☀️',
    about: 'Acordes mayores, movimiento hacia adelante y el V que empuja de regreso al I. Suena a celebración.',
    bpm: '110–130',
    major: true,
    progressions: [
      { name: 'La de siempre', section: 'Coro', major: 'I V vi IV', minor: 'III VII i VI', why: 'La progresión más usada en worship: fácil de cantar y de recordar.' },
      { name: 'Para arrancar', section: 'Verso', major: 'I IV I V', minor: 'III VI III VII', why: 'Va y viene del I, así el verso se siente estable y deja lugar a la letra.' },
      { name: 'Subiendo', section: 'Pre-coro', major: 'IV V vi V', minor: 'VI VII i VII', why: 'Cada acorde sube un paso: crea ganas de llegar al coro.' },
      { name: 'Celebración', section: 'Puente', major: 'IV I/III ii V', minor: 'VI III iv VII', why: 'El bajo baja por escalones y termina en el V, listo para un último coro con todo.' },
    ],
  },
  {
    id: 'melancolica',
    name: 'Melancólica',
    emoji: '🌧️',
    about: 'Empezar o detenerse en acordes menores (vi, iii) y resolver poco. En tono menor se siente aún más.',
    bpm: '60–76',
    major: false,
    progressions: [
      { name: 'Empezar en menor', section: 'Verso', major: 'vi IV I V', minor: 'i VI III VII', why: 'Es la misma de siempre pero empezando en el menor: cambia toda la sensación.' },
      { name: 'Suspiro', section: 'Verso', major: 'vi iii IV I', minor: 'i v VI III', why: 'Dos menores seguidos y un final que se queda flotando.' },
      { name: 'Nostalgia', section: 'Coro', major: 'IV iv I vi', minor: 'VI iv i V', why: 'El iv menor (prestado) es el acorde “triste” por excelencia; úsalo en la palabra clave.' },
      { name: 'Sin resolver', section: 'Puente', major: 'ii vi IV IV', minor: 'iv i VI VI', why: 'No pasa por el V, así que no “cierra”: deja la pregunta abierta.' },
    ],
  },
  {
    id: 'reflexiva',
    name: 'Reflexiva',
    emoji: '🕯️',
    about: 'Acordes que se quedan, notas que se repiten (sus2, add9) y pocos cambios. Da espacio para pensar en la letra.',
    bpm: '64–80',
    major: true,
    progressions: [
      { name: 'Respirar', section: 'Verso', major: 'Iadd9 IVadd9 Iadd9 IVadd9', minor: 'i VI i VI', why: 'Solo dos acordes con colores suaves: la letra lleva el peso.' },
      { name: 'Pregunta', section: 'Verso', major: 'I iii IV IV', minor: 'i III iv iv', why: 'El iii da un toque pensativo sin volverse triste.' },
      { name: 'Contemplar', section: 'Coro', major: 'IV I/III ii Vsus4', minor: 'VI III iv Vsus4', why: 'Bajo que desciende y un V suspendido que se queda en el aire.' },
      { name: 'Silencio', section: 'Puente', major: 'vi Vsus4 IV I', minor: 'VI VII i i', why: 'Baja despacio hasta el I; ideal para tocar suave o solo con piano.' },
    ],
  },
  {
    id: 'intima',
    name: 'Adoración íntima',
    emoji: '🙏',
    about: 'Acordes con séptima mayor y bajos sostenidos. Suena cálido y cercano, como una oración en voz baja.',
    bpm: '64–76',
    major: true,
    progressions: [
      { name: 'Cercanía', section: 'Verso', major: 'Imaj7 IVmaj7 Imaj7 IVmaj7', minor: 'i7 VImaj7 i7 VImaj7', why: 'La séptima mayor suaviza todo; no cambia mucho, invita a cantar despacio.' },
      { name: 'Entrega', section: 'Coro', major: 'IV I V vi', minor: 'VI III VII i', why: 'Empezar en el IV se siente como “abrir los brazos”.' },
      { name: 'Sobre el mismo bajo', section: 'Puente', major: 'I IV/I V/I IV/I', minor: 'i iv/i VII/i iv/i', why: 'Los acordes cambian arriba pero el bajo se queda en la nota del tono: muy de adoración.' },
      { name: 'Volver a casa', section: 'Final', major: 'ii7 Vsus4 V I', minor: 'iv7 Vsus4 V i', why: 'Cierre clásico y tranquilo para terminar la canción.' },
    ],
  },
  {
    id: 'victoriosa',
    name: 'Victoriosa',
    emoji: '🔥',
    about: 'Acordes mayores fuertes y el ♭VII prestado, que suena a himno y a rock. Para cantar con todo.',
    bpm: '120–140',
    major: true,
    progressions: [
      { name: 'Himno', section: 'Coro', major: 'I ♭VII IV I', minor: 'i VII VI VII', why: 'El ♭VII le da fuerza de estadio; funciona con batería marcada.' },
      { name: 'Marcha', section: 'Verso', major: 'I I IV I', minor: 'i i VI VII', why: 'Pocos cambios y mucho ritmo: deja que la batería y el bajo empujen.' },
      { name: 'Subida al coro', section: 'Pre-coro', major: 'ii IV V V', minor: 'iv VI VII VII', why: 'Se queda dos compases en el V para acumular tensión.' },
      { name: 'Grito de victoria', section: 'Puente', major: 'vi IV I V', minor: 'VI VII i i', why: 'Se repite subiendo de intensidad cada vuelta, hasta explotar en el coro.' },
    ],
  },
  {
    id: 'esperanza',
    name: 'Esperanza',
    emoji: '🌅',
    about: 'Pasar de un acorde menor a uno mayor: la sensación de que algo se abre. Muy útil para letras de “a pesar de…”.',
    bpm: '76–100',
    major: true,
    progressions: [
      { name: 'Amanecer', section: 'Verso', major: 'vi IV I V', minor: 'i VI III VII', why: 'Empieza en menor y termina en mayor en cada vuelta: de la duda a la fe.' },
      { name: 'Levantarse', section: 'Coro', major: 'IV V I vi', minor: 'VI VII III i', why: 'IV–V–I es la resolución más clara que hay; la letra fuerte va en el I.' },
      { name: 'Promesa', section: 'Pre-coro', major: 'ii iii IV V', minor: 'iv v VI VII', why: 'Cuatro acordes subiendo por escalones, como quien se pone de pie.' },
      { name: 'Luz al final', section: 'Puente', major: 'vi V IV V', minor: 'i VII VI VII', why: 'Baja y vuelve a subir al V: prepara un último coro con más fuerza.' },
    ],
  },
  {
    id: 'suplica',
    name: 'Súplica',
    emoji: '🤲',
    about: 'Tono menor, el V mayor que pide resolver y pausas en el acorde de tensión. Para letras de perdón o de pedir.',
    bpm: '60–72',
    major: false,
    progressions: [
      { name: 'Clamor', section: 'Verso', major: 'vi IV V V', minor: 'i iv V V', why: 'Termina en el V y se queda ahí, como esperando una respuesta.' },
      { name: 'Perdón', section: 'Coro', major: 'IV V iii vi', minor: 'VI VII III i', why: 'Pasa por el iii y cae en el vi: humilde, sin triunfalismo.' },
      { name: 'Ten piedad', section: 'Puente', major: 'ii7 V7 vi vi', minor: 'iv V7 i i', why: 'El V7 es el acorde que más “pide” resolver; aquí resuelve al menor.' },
      { name: 'Descanso', section: 'Final', major: 'IV iv I I', minor: 'iv iv i i', why: 'Del mayor al menor prestado y a casa: un final en paz.' },
    ],
  },
];

const NUM_RE = /^([♭b#♯]?)(vii|vi|iv|v|iii|ii|i)(°|ø)?(maj7|m7b5|7|add9|sus4|sus2|sus)?$/i;

/** Un grado ("vi", "♭VII", "Vsus4", "IV/I") → acorde en el tono: { chord, deg, pcs, bass }. */
export function degreeChord(deg, key) {
  const [top, slash] = deg.split('/');
  const m = top.match(NUM_RE);
  if (!m) return null;
  const scale = key.minor ? MINOR : MAJOR;
  const acc = m[1] === '♭' || m[1] === 'b' ? -1 : m[1] ? 1 : 0;
  const idx = ROMAN.indexOf(m[2].toLowerCase());
  const pc = mod(key.pc + scale[idx] + acc);
  const minor = m[2] === m[2].toLowerCase();
  const dim = Boolean(m[3]);
  const ext = (m[4] || '').toLowerCase();
  // ♭VI en Sol se escribe Mi♭, no Re#.
  const flats = acc < 0 || useFlats(key);
  const third = minor || dim ? 3 : 4;
  const fifth = dim ? 6 : 7;
  let pcs = [0, third, fifth];
  let q = dim ? (m[3] === 'ø' ? 'm7b5' : 'dim') : minor ? 'm' : '';
  if (ext === 'maj7') (pcs = [0, third, 7, 11]), (q = (minor ? 'm' : '') + 'maj7');
  else if (ext === '7') (pcs = [0, third, fifth, 10]), (q = (minor ? 'm' : '') + '7');
  else if (ext === 'm7b5') (pcs = [0, 3, 6, 10]), (q = 'm7b5');
  else if (ext === 'add9') (pcs = [0, third, 7, 14]), (q = (minor ? 'm' : '') + 'add9');
  else if (ext === 'sus4' || ext === 'sus') (pcs = [0, 5, 7]), (q = 'sus4');
  else if (ext === 'sus2') (pcs = [0, 2, 7]), (q = 'sus2');
  let chord = pcName(pc, flats) + q;
  let bass = pc;
  if (slash) {
    const b = degreeChord(slash, key);
    if (b) {
      bass = b.bass;
      chord += '/' + pcName(bass, flats);
    }
  }
  return { chord, deg, pcs: pcs.map((i) => pc + i), bass };
}

/** Las progresiones de un ánimo en el tono elegido. */
export function suggest(moodId, key) {
  const mood = MOODS.find((m) => m.id === moodId) || MOODS[0];
  if (!key) return { mood, items: [], tip: '' };
  const items = mood.progressions.map((p) => {
    const degs = (key.minor ? p.minor : p.major).split(' ');
    return { ...p, degrees: degs, chords: degs.map((d) => degreeChord(d, key)).filter(Boolean) };
  });
  let tip = '';
  const rel = { pc: mod(key.pc + (key.minor ? 3 : -3)), minor: !key.minor };
  if (mood.major && key.minor) tip = `Este ánimo suele sonar más natural en tono mayor; prueba ${keyName(rel)}, que usa casi los mismos acordes.`;
  if (!mood.major && !key.minor) tip = `Si lo quieres todavía más ${mood.name.toLowerCase()}, prueba en ${keyName(rel)} (la relativa menor): mismos acordes, otro centro.`;
  return { mood, items, tip };
}

/** Texto ChordPro para pegar en los acordes: {c: Coro · Alegre} y la línea de acordes. */
export function toChordPro(p, mood) {
  return `{c: ${p.section} · ${mood.name} · ${p.name}}\n${p.chords.map((c) => `[${c.chord}]`).join(' ')}\n`;
}

// ---------- escuchar ----------
// Piano de verdad: muestras del Salamander Grand Piano (CC-BY 3.0, ver audio/piano/LEEME.txt)
// cada tres semitonos; las notas de en medio se afinan cambiando un poco la velocidad.
const SAMPLE_NAMES = ['C', 'Ds', 'Fs', 'A'];
const SAMPLES = [];
for (let midi = 36; midi <= 75; midi += 3) SAMPLES.push(midi); // C2 … D#5
const sampleUrl = (midi) => new URL(`../audio/piano/${SAMPLE_NAMES[(midi % 12) / 3]}${Math.floor(midi / 12) - 1}.mp3`, import.meta.url);
const nearest = (midi) => SAMPLES.reduce((a, b) => (Math.abs(b - midi) < Math.abs(a - midi) ? b : a));

let audio = null;
let current = null; // salida de la progresión que está sonando
let playId = 0;
const buffers = {};

function sample(midi) {
  buffers[midi] ||= fetch(sampleUrl(midi))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
    .then((b) => new Promise((ok, bad) => audio.decodeAudioData(b, ok, bad)))
    .catch((err) => {
      delete buffers[midi];
      throw err;
    });
  return buffers[midi];
}

/** Notas del acorde: acorde alrededor del Do central y el bajo una o dos octavas abajo. */
export function voicing(c) {
  if (c.notes) return c.notes; // ya viene con las voces acomodadas (puentes entre tonos)
  return c.pcs.map((pc) => 60 + mod(pc) + (mod(pc) < 5 ? 12 : 0)).concat(36 + mod(c.bass) + (mod(c.bass) < 4 ? 12 : 0));
}

/**
 * En el iPhone el sonido de la web se apaga con el interruptor de silencio, aunque el
 * volumen esté arriba. Pidiendo la sesión de audio de "reproducción" suena como un video.
 * En iOS más viejos (sin navigator.audioSession) se logra tocando un audio mudo a la vez.
 */
let unmuted = false;
let silent = null;
function unmuteIos() {
  if (silent) return silent.play().catch(() => {});
  if (unmuted) return;
  unmuted = true;
  try {
    if (navigator.audioSession) {
      navigator.audioSession.type = 'playback';
      return;
    }
  } catch {
    // sigue con el audio mudo
  }
  if (!/iPad|iPhone|iPod/.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))) return;
  silent = new Audio(SILENCE);
  silent.loop = true;
  silent.setAttribute('playsinline', '');
  silent.play().catch(() => {});
}
// Medio segundo de silencio en WAV (8 kHz, 8 bits).
const SILENCE = (() => {
  const n = 4000;
  const bytes = new Uint8Array(44 + n);
  const v = new DataView(bytes.buffer);
  const str = (o, t) => [...t].forEach((c, i) => (bytes[o + i] = c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, n, true);
  bytes.fill(128, 44);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
})();

/**
 * Toca la progresión en piano, un acorde por compás de 4 tiempos.
 * Devuelve cuántos segundos dura (0 si el teléfono no puede tocar audio).
 */
export async function playProgression(chords, bpm = 80) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return 0;
  // Todo lo que pide permiso para sonar va antes del primer await, todavía dentro del toque.
  stopPlaying();
  const id = ++playId;
  unmuteIos();
  audio ||= new AC();
  const ctx = audio;
  if (ctx.state !== 'running') await ctx.resume().catch(() => {});
  const all = chords.map(voicing);
  const needed = [...new Set(all.flat().map(nearest))];
  const loaded = Object.fromEntries(await Promise.all(needed.map(async (m) => [m, await sample(m)])));
  if (id !== playId) return 0; // se detuvo o se eligió otra mientras cargaba
  const beat = 60 / Math.min(Math.max(bpm, 50), 140);
  const bar = beat * 4;
  const t0 = ctx.currentTime + 0.05;
  const out = ctx.createGain();
  out.gain.value = 1.5;
  out.connect(ctx.destination);
  current = out;
  all.forEach((notes, i) => {
    const start = t0 + i * bar;
    const end = start + bar + (i === all.length - 1 ? 1.5 : 0.1);
    notes.forEach((n, j) => {
      const base = nearest(n);
      const src = ctx.createBufferSource();
      src.buffer = loaded[base];
      src.playbackRate.value = 2 ** ((n - base) / 12);
      const g = ctx.createGain();
      // El bajo va un poquito antes y más fuerte, como al tocar con las dos manos.
      const at = start + (j === notes.length - 1 ? 0 : 0.012 * (j + 1));
      g.gain.setValueAtTime(j === notes.length - 1 ? 0.55 : 0.32, at);
      g.gain.setTargetAtTime(0, end - 0.25, 0.08);
      src.connect(g).connect(out);
      src.start(at);
      src.stop(end + 0.4);
    });
  });
  const secs = chords.length * bar + 1.5;
  setTimeout(() => id === playId && silent?.pause(), (secs + 1) * 1000);
  return secs;
}

export function stopPlaying() {
  playId++;
  silent?.pause();
  if (!current) return;
  current.disconnect();
  current = null;
}
