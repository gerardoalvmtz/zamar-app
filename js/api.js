// Comunicación con el programa de Apps Script de la hoja. Todo lo que escribe (y las
// composiciones, que no son públicas) pasa por aquí con el PIN del ministerio.
import { WRITE_URL } from './config.js';

export const canEdit = () => Boolean(WRITE_URL);

async function post(body) {
  const res = await fetch(WRITE_URL, {
    method: 'POST',
    // text/plain evita la verificación previa (CORS) que Apps Script no responde.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'No se pudo guardar.');
  return data;
}

export function setupApi(store) {
  /** PIN y nombre para el registro de cambios; se piden la primera vez y se recuerdan. */
  async function credentials() {
    let pin = store.get('zamar:pin', '');
    let who = store.get('zamar:who', '');
    if (pin) return { pin, who };
    pin = (prompt('PIN de edición del ministerio:') || '').trim();
    if (!pin) throw new Error('Se necesita el PIN.');
    await post({ action: 'check', pin });
    who = (prompt('¿Tu nombre? Queda en el registro de cambios.') || '').trim();
    store.set('zamar:pin', pin);
    store.set('zamar:who', who);
    return { pin, who };
  }

  async function api(action, payload = {}) {
    const { pin, who } = await credentials();
    try {
      return await post({ action, pin, who, ...payload });
    } catch (err) {
      if (/PIN incorrecto/.test(err.message)) store.set('zamar:pin', '');
      throw err;
    }
  }

  return { api, who: () => store.get('zamar:who', '') };
}

export function readBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
