// Grabar y escuchar audios desde el teléfono. Lo usan las composiciones y las grabaciones
// de ensayo de cada canción.

export const MAX_AUDIO = 25 * 1024 * 1024;

// Safari no reconoce "audio/x-m4a", que es como Drive etiqueta las grabaciones del iPhone.
const playableType = (t) => (/m4a|mp4|aac/i.test(t || '') ? 'audio/mp4' : t || 'audio/mpeg');

/** Respuesta del Apps Script ({ data: base64, mimeType }) → URL para un <audio>. */
export function audioBlobUrl(res) {
  const bytes = Uint8Array.from(atob(res.data), (ch) => ch.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: playableType(res.mimeType) }));
}

/** Nombre de archivo con fecha para una grabación nueva. */
export function recordingName(prefix, label, ext) {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', 'h');
  return `${prefix} · ${label || 'grabación'} · ${stamp}.${ext}`;
}

/**
 * Botón de grabar/detener. msg(texto) muestra el avance; done(blob, ext) recibe la grabación.
 * Si el navegador no puede grabar, el botón queda desactivado.
 */
export function setupRecorder(btn, msg, done) {
  if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
    btn.disabled = true;
    btn.title = 'Este navegador no puede grabar; usa Elegir archivo';
    return;
  }
  let rec = null;
  let timer = null;
  btn.addEventListener('click', async () => {
    if (rec) return rec.stop();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return msg('No hay permiso para usar el micrófono.');
    }
    // iPhone graba en mp4; Android y computadoras en webm.
    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
    rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    const started = Date.now();
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      const mime = rec.mimeType || type || 'audio/webm';
      rec = null;
      btn.textContent = '● Grabar';
      btn.classList.remove('danger');
      done(new Blob(chunks, { type: mime.split(';')[0] }), mime.includes('mp4') ? 'm4a' : 'webm');
    };
    rec.start();
    btn.textContent = '■ Detener';
    btn.classList.add('danger');
    timer = setInterval(() => {
      const s = Math.round((Date.now() - started) / 1000);
      msg(`Grabando ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    }, 500);
  });
}
