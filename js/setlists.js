// Setlists para eventos: se guardan en el teléfono y se comparten con un link
// que lleva el setlist completo dentro, así no hace falta servidor.

const KEY = 'zamar:setlists';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

function write(sets) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sets));
  } catch {
    /* sin almacenamiento */
  }
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const allSetlists = () => read().sort((a, b) => (b.date || '').localeCompare(a.date || ''));

export const getSetlist = (id) => read().find((s) => s.id === id) || null;

export function saveSetlist(set) {
  const sets = read();
  const i = sets.findIndex((s) => s.id === set.id);
  if (i >= 0) sets[i] = set;
  else sets.push(set);
  write(sets);
  return set;
}

export function createSetlist(name, date) {
  return saveSetlist({ id: newId(), name: name || 'Setlist', date: date || '', items: [] });
}

export function deleteSetlist(id) {
  write(read().filter((s) => s.id !== id));
}

/** Agrega una canción (con el tono en que se va a tocar) al final del setlist. */
export function addToSetlist(id, songId, key) {
  const set = getSetlist(id);
  if (!set) return null;
  set.items.push({ id: songId, key: key || '' });
  return saveSetlist(set);
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

/** Copia un setlist con sus canciones y tonos, como "(copia)" y sin fecha para ponerle la nueva. */
export function duplicateSetlist(id) {
  const set = getSetlist(id);
  if (!set) return null;
  return saveSetlist({ id: newId(), name: `${set.name} (copia)`, date: '', items: set.items.map((x) => ({ ...x })) });
}

/** Guarda en este teléfono un setlist recibido por link. */
export function importSetlist(shared) {
  return saveSetlist({ ...shared, id: newId() });
}
