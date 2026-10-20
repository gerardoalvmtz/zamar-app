// Setlists para eventos. También se pueden pasar con un link que lleva el setlist completo dentro.
// Con el programa de Apps Script conectado, los setlists son del equipo: se guardan en la hoja
// privada y todos los ven. Aquí se guarda una copia para abrirlos sin conexión. Los que se armaron
// antes en un teléfono siguen ahí ("solo en este teléfono") hasta que se suben.
const LOCAL = 'zamar:setlists';
const TEAM = 'zamar:setlists-equipo';

function read(key = LOCAL) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

function write(sets, key = LOCAL) {
  try {
    localStorage.setItem(key, JSON.stringify(sets));
  } catch {
    /* sin almacenamiento */
  }
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const teamId = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// { list(), save(set), remove(id), onError(err) } cuando hay Apps Script; null = solo este teléfono.
let remote = null;
let sending = Promise.resolve();
export function useTeam(r) {
  remote = r;
}
export const teamMode = () => Boolean(remote);

const team = () => read(TEAM).map((s) => ({ ...s, local: false }));
const local = () => read(LOCAL).map((s) => ({ ...s, local: true }));

export const allSetlists = () =>
  [...team(), ...local()].sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.name.localeCompare(b.name, 'es'));

export const getSetlist = (id) => allSetlists().find((s) => s.id === id) || null;

/** Lo que se guarda: sin la marca de "local". */
const clean = ({ id, name, date, items }) => ({ id, name, date: date || '', items: items.map((x) => ({ id: x.id, key: x.key || '' })) });

function put(key, set) {
  const sets = read(key);
  const i = sets.findIndex((s) => s.id === set.id);
  if (i >= 0) sets[i] = clean(set);
  else sets.push(clean(set));
  write(sets, key);
}

/** Guarda al momento en el teléfono y, si es del equipo, lo manda a la hoja en segundo plano. */
export function saveSetlist(set) {
  if (set.local || !remote) {
    put(LOCAL, set);
    return { ...set, local: true };
  }
  put(TEAM, set);
  // En fila, para que dos cambios seguidos lleguen a la hoja en el orden en que se hicieron.
  const copy = clean(set);
  sending = sending.then(() => remote.save(copy)).catch((err) => remote.onError(err));
  return { ...set, local: false };
}

export function createSetlist(name, date) {
  const set = { name: name || 'Setlist', date: date || '', items: [] };
  return remote ? saveSetlist({ ...set, id: teamId(), local: false }) : saveSetlist({ ...set, id: newId(), local: true });
}

/** Borrar uno del equipo pide PIN, así que espera la respuesta antes de quitarlo de la copia. */
export async function deleteSetlist(id) {
  const set = getSetlist(id);
  if (!set) return;
  if (set.local || !remote) return write(read(LOCAL).filter((s) => s.id !== id));
  await remote.remove(id);
  write(read(TEAM).filter((s) => s.id !== id), TEAM);
}

/** Agrega una canción (con el tono en que se va a tocar) al final del setlist. */
export function addToSetlist(id, songId, key) {
  const set = getSetlist(id);
  if (!set) return null;
  set.items.push({ id: songId, key: key || '' });
  return saveSetlist(set);
}

/** Copia un setlist con sus canciones y tonos, como "(copia)" y sin fecha para ponerle la nueva. */
export function duplicateSetlist(id) {
  const set = getSetlist(id);
  if (!set) return null;
  const copy = createSetlist(`${set.name} (copia)`, '');
  copy.items = set.items.map((x) => ({ ...x }));
  return saveSetlist(copy);
}

/** Sube al equipo un setlist que solo estaba en este teléfono. */
export function uploadSetlist(id) {
  const set = getSetlist(id);
  if (!set?.local || !remote) return null;
  const up = saveSetlist({ ...set, id: teamId(), local: false });
  write(read(LOCAL).filter((s) => s.id !== id));
  return up;
}

/** Trae los setlists del equipo. Devuelve true si cambió algo. */
export async function refreshTeam() {
  if (!remote) return false;
  await sending;
  const list = (await remote.list()).map(clean);
  const before = localStorage.getItem(TEAM);
  write(list, TEAM);
  return before !== localStorage.getItem(TEAM);
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code) {
  const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Código compacto para el link de compartir. */
export function encodeSetlist(set) {
  return toBase64Url(JSON.stringify({ n: set.name, d: set.date, i: set.items.map((x) => [x.id, x.key]) }));
}

export function decodeSetlist(code) {
  try {
    const o = JSON.parse(fromBase64Url(code));
    return {
      id: '',
      name: String(o.n || 'Setlist'),
      date: String(o.d || ''),
      items: (o.i || []).map(([id, key]) => ({ id: String(id), key: String(key || '') })),
    };
  } catch {
    return null;
  }
}

/** Guarda un setlist recibido por link (en el equipo si está conectado). */
export function importSetlist(shared) {
  const set = createSetlist(shared.name, shared.date);
  set.items = shared.items.map((x) => ({ ...x }));
  return saveSetlist(set);
}
