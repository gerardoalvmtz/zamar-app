// Modo escenario: para tocar en vivo con el teléfono en el atril.
// - La pantalla no se apaga mientras está activo (Wake Lock).
// - Metrónomo al BPM de la canción: destello en pantalla y, si se quiere, click.
// - Desplazamiento automático de la hoja, con velocidad que se recuerda por canción.
// Sigue activo al pasar de una canción a otra (setlist, ensayo) y se apaga al salir de las canciones.
import { unmuteIos } from './progressions.js';

const SPEEDS = [6, 8, 11, 14, 18, 23, 29, 37, 47, 60]; // píxeles por segundo, niveles 1 a 10
const METERS = [4, 3, 6, 2];
const SONG_ROUTE = /^#\/(c\/|set\/[^/]+\/\d+$|agenda\/[^/]+\/ensayo\/cancion\/\d+$)/;

let store = null;
let on = false;
let songId = null;
let lock = null;
let lockFailed = false;
const metro = { running: false, bpm: 72, beats: 4, sound: false, beat: 0, next: 0, timer: 0, ac: null };
const scroll = { running: false, level: 3, raf: 0, last: 0, carry: 0, holdUntil: 0 };

export function setupStage(s) {
  store = s;
  metro.sound = Boolean(store.get('zamar:clicksound', false));
  metro.beats = Number(store.get('zamar:meter', 4)) || 4;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && on) keepAwake();
  });
  // Mientras el dedo está en la pantalla no se desplaza, para poder regresar o adelantar a mano.
  const hold = () => (scroll.holdUntil = Infinity);
  const release = () => (scroll.holdUntil = performance.now() + 1500);
  window.addEventListener('touchstart', hold, { passive: true });
  window.addEventListener('touchend', release, { passive: true });
  window.addEventListener('touchcancel', release, { passive: true });
  window.addEventListener('wheel', release, { passive: true });
}

export const stageOn = () => on;

/** Al cambiar de página: se detienen metrónomo y desplazamiento; fuera de las canciones se sale. */
export function stageNavigate(hash) {
  stopMetro();
  stopScroll();
  if (on && !SONG_ROUTE.test(hash)) exitStage();
}

async function keepAwake() {
  if (lock || !navigator.wakeLock) {
    lockFailed = !navigator.wakeLock;
    return;
  }
  try {
    lock = await navigator.wakeLock.request('screen');
    lockFailed = false;
    lock.addEventListener('release', () => (lock = null));
  } catch {
    lockFailed = true;
  }
  paint();
}

function enterStage() {
  on = true;
  document.body.classList.add('stage');
  keepAwake();
}

function exitStage() {
  on = false;
  stopMetro();
  stopScroll();
  document.body.classList.remove('stage');
  lock?.release().catch(() => {});
  lock = null;
}

// ---------- metrónomo ----------
// El reloj del audio es el que marca el tiempo (los timers de JavaScript se atrasan); se
// programan los tiempos un poco antes y el destello se sincroniza con cada uno.
function startMetro() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (metro.sound) unmuteIos();
  metro.ac ||= new AC();
  if (metro.ac.state !== 'running') metro.ac.resume().catch(() => {});
  metro.running = true;
  metro.beat = 0;
  metro.next = metro.ac.currentTime + 0.08;
  clearInterval(metro.timer);
  metro.timer = setInterval(schedule, 25);
  schedule();
}

function stopMetro() {
  metro.running = false;
  clearInterval(metro.timer);
  document.querySelectorAll('#sbbeat i').forEach((d) => d.classList.remove('on'));
}

function schedule() {
  const ac = metro.ac;
  while (metro.next < ac.currentTime + 0.12) {
    const beat = metro.beat % metro.beats;
    if (metro.sound) click(metro.next, beat === 0);
    const wait = Math.max(0, (metro.next - ac.currentTime) * 1000);
    setTimeout(() => flash(beat), wait);
    metro.next += 60 / metro.bpm;
    metro.beat++;
  }
}

function click(at, accent) {
  const ac = metro.ac;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.frequency.value = accent ? 1760 : 1175;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.55, at + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
  osc.connect(g).connect(ac.destination);
  osc.start(at);
  osc.stop(at + 0.08);
}

function flash(beat) {
  if (!metro.running) return;
  const dots = document.querySelectorAll('#sbbeat i');
  dots.forEach((d, i) => d.classList.toggle('on', i === beat));
  const bar = document.getElementById('stagebar');
  if (!bar) return;
  bar.classList.remove('pulse', 'down');
  void bar.offsetWidth; // reinicia la animación
  bar.classList.add(beat === 0 ? 'down' : 'pulse');
}

// ---------- desplazamiento automático ----------
function startScroll() {
  scroll.running = true;
  scroll.last = performance.now();
  scroll.carry = 0;
  scroll.holdUntil = 0;
  cancelAnimationFrame(scroll.raf);
  scroll.raf = requestAnimationFrame(step);
}

function stopScroll() {
  scroll.running = false;
  cancelAnimationFrame(scroll.raf);
}

function step(now) {
  if (!scroll.running) return;
  const dt = Math.min(now - scroll.last, 100) / 1000;
  scroll.last = now;
  if (now >= scroll.holdUntil) {
    scroll.carry += SPEEDS[scroll.level - 1] * dt;
    const px = Math.floor(scroll.carry);
    if (px) {
      scroll.carry -= px;
      window.scrollBy(0, px);
    }
    const end = document.scrollingElement.scrollHeight - window.innerHeight - 2;
    if (window.scrollY >= end) {
      stopScroll();
      paint();
      return;
    }
  }
  scroll.raf = requestAnimationFrame(step);
}

/** Nivel inicial: que la hoja completa pase en unos 3 minutos y medio. */
function defaultLevel() {
  const sheet = document.querySelector('.detail .sheet');
  if (!sheet) return 3;
  const want = Math.max(sheet.offsetHeight / 210, SPEEDS[2]);
  let best = 0;
  SPEEDS.forEach((s, i) => Math.abs(s - want) < Math.abs(SPEEDS[best] - want) && (best = i));
  return best + 1;
}

// ---------- barra ----------
/** Botón para entrar (va en la ficha de la canción). */
export function stageButton() {
  return '<button class="stagebtn offstage" data-stage="enter">🎤 Modo escenario</button>';
}

/** La barra de abajo; se dibuja con la ficha y se llena en wireStage. */
export function stageBar() {
  return `<div class="stagebar" id="stagebar">
    <div class="sbrow">
      <span class="sbbeat" id="sbbeat" aria-hidden="true"></span>
      <button class="ghost" data-stage="bpm-" aria-label="Más lento">−</button>
      <span class="sbbpm"><b id="sbbpm"></b> BPM</span>
      <button class="ghost" data-stage="bpm+" aria-label="Más rápido">+</button>
      <button class="ghost" data-stage="meter" id="sbmeter" aria-label="Compás"></button>
      <button class="ghost" data-stage="sound" id="sbsound"></button>
      <button data-stage="metro" id="sbmetro"></button>
    </div>
    <div class="sbrow">
      <button data-stage="scroll" id="sbscroll"></button>
      <button class="ghost" data-stage="slow" aria-label="Más lento">−</button>
      <span class="sbspeed">Vel. <b id="sbspeed"></b></span>
      <button class="ghost" data-stage="fast" aria-label="Más rápido">+</button>
      <button class="ghost sbexit" data-stage="exit">✕ Salir</button>
    </div>
    <p class="sbwarn" id="sbwarn" hidden>Este navegador no deja mantener la pantalla encendida. Súbele el tiempo de bloqueo en los ajustes del teléfono.</p>
  </div>`;
}

function paint() {
  const $ = (id) => document.getElementById(id);
  if (!$('stagebar')) return;
  $('sbbeat').innerHTML = '<i></i>'.repeat(metro.beats);
  $('sbbpm').textContent = metro.bpm;
  $('sbmeter').textContent = `${metro.beats}/${metro.beats === 6 ? 8 : 4}`;
  $('sbsound').textContent = metro.sound ? '🔊' : '🔇';
  $('sbsound').setAttribute('aria-label', metro.sound ? 'Quitar sonido del click' : 'Poner sonido al click');
  $('sbmetro').textContent = metro.running ? '■' : '▶';
  $('sbmetro').setAttribute('aria-label', metro.running ? 'Detener metrónomo' : 'Arrancar metrónomo');
  $('sbmetro').classList.toggle('primary', !metro.running);
  $('sbscroll').textContent = scroll.running ? '■ Desplazar' : '⇣ Desplazar';
  $('sbspeed').textContent = scroll.level;
  $('sbwarn').hidden = !lockFailed;
}

/**
 * Se llama cada vez que se dibuja la ficha. Si es otra canción, toma su BPM y su velocidad
 * guardada; si es la misma (cambio de tono, de vista), sigue todo como iba.
 */
export function wireStage(root, song) {
  if (song.id !== songId) {
    stopMetro();
    stopScroll();
    songId = song.id;
    metro.bpm = Number(song.bpm) || 72;
    scroll.level = Number(store.get(`zamar:scroll:${song.id}`, 0)) || 0;
  }
  document.body.classList.toggle('stage', on);
  paint();
  root.querySelectorAll('[data-stage]').forEach((b) =>
    b.addEventListener('click', () => {
      const a = b.dataset.stage;
      if (a === 'enter') {
        enterStage();
        window.scrollTo({ top: root.querySelector('.detail .tabs')?.getBoundingClientRect().top + window.scrollY - 70 || 0 });
      } else if (a === 'exit') exitStage();
      else if (a === 'metro') metro.running ? stopMetro() : startMetro();
      else if (a === 'bpm-' || a === 'bpm+') {
        metro.bpm = Math.min(Math.max(metro.bpm + (a === 'bpm+' ? 1 : -1), 30), 240);
      } else if (a === 'meter') {
        metro.beats = METERS[(METERS.indexOf(metro.beats) + 1) % METERS.length];
        store.set('zamar:meter', metro.beats);
      } else if (a === 'sound') {
        metro.sound = !metro.sound;
        store.set('zamar:clicksound', metro.sound);
        if (metro.sound) unmuteIos();
      } else if (a === 'scroll') {
        if (scroll.running) stopScroll();
        else {
          scroll.level ||= defaultLevel();
          startScroll();
        }
      } else if (a === 'slow' || a === 'fast') {
        scroll.level = Math.min(Math.max((scroll.level || defaultLevel()) + (a === 'fast' ? 1 : -1), 1), SPEEDS.length);
        store.set(`zamar:scroll:${song.id}`, scroll.level);
      }
      paint();
    }),
  );
  if (!scroll.level) {
    // Se calcula cuando ya está dibujada la hoja.
    requestAnimationFrame(() => {
      scroll.level ||= defaultLevel();
      paint();
    });
  }
}
