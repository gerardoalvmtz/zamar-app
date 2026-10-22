// Archivos para compartir un setlist: una imagen PNG con el resumen (canciones, tonos y BPM)
// y un PDF con las letras. Todo se genera en el teléfono, sin servidor.

export const LINKTREE = 'https://linktr.ee/zamaradoracion';
const LINKTREE_TEXT = 'linktr.ee/zamaradoracion';

const longDay = (iso) =>
  iso
    ? new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';

export const fileName = (set, ext) =>
  `${(set.name || 'setlist')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'setlist'}.${ext}`;

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Corta un texto con "…" para que quepa en el ancho dado. */
function fit(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > width) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

/**
 * Imagen del setlist. `rows` = [{ title, author, key, bpm }].
 * Devuelve un Blob PNG de 1080 px de ancho.
 */
export async function setlistImage(set, rows) {
  const W = 1080;
  const pad = 72;
  const rowH = 118;
  const head = 330;
  const H = head + Math.max(rows.length, 1) * rowH + 150;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const serif = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
  const sans = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  ctx.fillStyle = '#faf9f7';
  ctx.fillRect(0, 0, W, H);

  const logo = await loadImage('img/logo-negro.png');
  if (logo) {
    const h = 64;
    ctx.drawImage(logo, pad, 60, (logo.width / logo.height) * h, h);
  }
  ctx.fillStyle = '#121212';
  ctx.font = `600 64px ${serif}`;
  ctx.fillText(fit(ctx, set.name || 'Setlist', W - pad * 2), pad, 210);
  ctx.fillStyle = '#6d6a66';
  ctx.font = `34px ${sans}`;
  const day = longDay(set.date);
  ctx.fillText(`${day ? day.charAt(0).toUpperCase() + day.slice(1) + ' · ' : ''}${rows.length} canciones`, pad, 264);

  ctx.strokeStyle = '#e6e2dc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, head - 20);
  ctx.lineTo(W - pad, head - 20);
  ctx.stroke();

  const keyX = W - pad - 300;
  rows.forEach((r, i) => {
    const y = head + i * rowH;
    if (i % 2 === 0) {
      ctx.fillStyle = '#f1efeb';
      ctx.beginPath();
      ctx.roundRect(pad - 24, y, W - pad * 2 + 48, rowH - 14, 22);
      ctx.fill();
    }
    ctx.fillStyle = '#6d6a66';
    ctx.font = `600 34px ${sans}`;
    ctx.fillText(String(i + 1), pad, y + 64);
    ctx.fillStyle = '#121212';
    ctx.font = `600 38px ${sans}`;
    ctx.fillText(fit(ctx, r.title, keyX - pad - 90), pad + 64, r.author ? y + 50 : y + 64);
    if (r.author) {
      ctx.fillStyle = '#6d6a66';
      ctx.font = `28px ${sans}`;
      ctx.fillText(fit(ctx, r.author, keyX - pad - 90), pad + 64, y + 88);
    }
    // Tono en una pastilla y BPM a la derecha.
    ctx.textAlign = 'center';
    if (r.key) {
      ctx.fillStyle = '#121212';
      ctx.beginPath();
      ctx.roundRect(keyX, y + 22, 130, 62, 31);
      ctx.fill();
      ctx.fillStyle = '#faf9f7';
      ctx.font = `700 34px ${sans}`;
      ctx.fillText(r.key, keyX + 65, y + 65);
    }
    ctx.fillStyle = r.bpm ? '#121212' : '#b9b4ad';
    ctx.font = `600 34px ${sans}`;
    ctx.fillText(r.bpm ? String(r.bpm) : '—', W - pad - 70, y + 58);
    ctx.fillStyle = '#6d6a66';
    ctx.font = `22px ${sans}`;
    ctx.fillText('BPM', W - pad - 70, y + 86);
    ctx.textAlign = 'left';
  });

  ctx.fillStyle = '#6d6a66';
  ctx.font = `26px ${sans}`;
  ctx.textAlign = 'center';
  ctx.fillText('Zamar Adoración', W / 2, H - 60);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** Envuelve un texto en líneas que quepan en el ancho dado (máximo `max` líneas). */
function wrap(ctx, text, width, max = 2) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > max) lines.splice(max - 1, lines.length, lines.slice(max - 1).join(' '));
  return lines.map((l) => fit(ctx, l, width));
}

/**
 * Imagen del programa de un ensayo. `info` = { title, when, total, available,
 * items: [{ time, kind, title, key, minutes, notes }], pending: [{ text, who }] }.
 * Devuelve un Blob PNG de 1080 px de ancho.
 */
export async function programImage(info) {
  const W = 1080;
  const pad = 72;
  const serif = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
  const sans = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const titleX = pad + 150;
  const pillW = 120;
  const textW = W - pad - pillW - 40 - titleX;

  // Primero se mide cada renglón para saber la altura total.
  ctx.font = `26px ${sans}`;
  const rows = info.items.map((i) => {
    ctx.font = `600 36px ${sans}`;
    const title = wrap(ctx, i.title, textW, 2);
    ctx.font = `26px ${sans}`;
    const notes = i.notes ? wrap(ctx, i.notes, textW, 2) : [];
    return { ...i, lines: title, noteLines: notes, h: Math.max(118, 74 + (title.length - 1) * 44 + notes.length * 34 + (notes.length ? 6 : 0)) };
  });
  ctx.font = `30px ${sans}`;
  const pend = (info.pending || []).map((t) => wrap(ctx, `${t.text}${t.who ? ` — ${t.who}` : ''}`, W - pad * 2 - 50, 2));
  const whenLines = wrap(ctx, info.when, W - pad * 2, 2);

  const head = 296 + (whenLines.length - 1) * 44 + 60;
  const listH = rows.reduce((s, r) => s + r.h + 14, 0);
  const totalH = 110;
  const pendH = pend.length ? 90 + pend.reduce((s, l) => s + l.length * 40 + 12, 0) : 0;
  const H = head + listH + totalH + pendH + 110;
  canvas.width = W;
  canvas.height = H;

  ctx.fillStyle = '#faf9f7';
  ctx.fillRect(0, 0, W, H);
  const logo = await loadImage('img/logo-negro.png');
  if (logo) ctx.drawImage(logo, pad, 60, (logo.width / logo.height) * 64, 64);

  ctx.fillStyle = '#6d6a66';
  ctx.font = `600 28px ${sans}`;
  ctx.fillText('PROGRAMA DE ENSAYO', pad, 180);
  ctx.fillStyle = '#121212';
  ctx.font = `600 60px ${serif}`;
  ctx.fillText(fit(ctx, info.title || 'Ensayo', W - pad * 2), pad, 246);
  ctx.fillStyle = '#6d6a66';
  ctx.font = `30px ${sans}`;
  whenLines.forEach((l, n) => ctx.fillText(l, pad, 296 + n * 44));

  ctx.strokeStyle = '#e6e2dc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, head - 20);
  ctx.lineTo(W - pad, head - 20);
  ctx.stroke();

  let y = head;
  rows.forEach((r, n) => {
    if (n % 2 === 0) {
      ctx.fillStyle = '#f1efeb';
      ctx.beginPath();
      ctx.roundRect(pad - 24, y, W - pad * 2 + 48, r.h, 22);
      ctx.fill();
    }
    ctx.fillStyle = '#121212';
    ctx.font = `600 32px ${sans}`;
    ctx.fillText(r.time || String(n + 1), pad, y + 58);
    ctx.fillStyle = '#6d6a66';
    ctx.font = `24px ${sans}`;
    ctx.fillText(r.kind === 'song' ? '🎵 Canción' : '💬 Tema', pad, y + 94);

    ctx.fillStyle = '#121212';
    ctx.font = `600 36px ${sans}`;
    r.lines.forEach((l, k) => ctx.fillText(l, titleX, y + 58 + k * 44));
    ctx.fillStyle = '#6d6a66';
    ctx.font = `26px ${sans}`;
    r.noteLines.forEach((l, k) => ctx.fillText(l, titleX, y + 52 + r.lines.length * 44 + k * 34));

    // Tono en una pastilla y minutos a la derecha.
    const px = W - pad - pillW + 24;
    ctx.textAlign = 'center';
    if (r.key) {
      ctx.fillStyle = '#121212';
      ctx.beginPath();
      ctx.roundRect(px - pillW / 2 - 70, y + 22, 96, 52, 26);
      ctx.fill();
      ctx.fillStyle = '#faf9f7';
      ctx.font = `700 28px ${sans}`;
      ctx.fillText(r.key, px - pillW / 2 - 22, y + 58);
    }
    ctx.fillStyle = '#121212';
    ctx.font = `600 32px ${sans}`;
    ctx.fillText(r.minutes ? String(r.minutes) : '—', px + 10, y + 54);
    ctx.fillStyle = '#6d6a66';
    ctx.font = `22px ${sans}`;
    ctx.fillText('min', px + 10, y + 82);
    ctx.textAlign = 'left';
    y += r.h + 14;
  });

  y += 20;
  ctx.fillStyle = '#121212';
  ctx.font = `600 34px ${sans}`;
  ctx.fillText(`Total: ${info.total} min`, pad, y + 40);
  if (info.available) {
    const over = info.total > info.available;
    ctx.textAlign = 'right';
    ctx.fillStyle = over ? '#b3261e' : '#6d6a66';
    ctx.font = `28px ${sans}`;
    ctx.fillText(over ? `Se pasa ${info.total - info.available} min del horario` : `de ${info.available} min disponibles`, W - pad, y + 40);
    ctx.textAlign = 'left';
  }
  y += totalH;

  if (pend.length) {
    ctx.fillStyle = '#121212';
    ctx.font = `600 32px ${sans}`;
    ctx.fillText('📌 Pendientes del ensayo anterior', pad, y + 30);
    y += 80;
    ctx.font = `30px ${sans}`;
    pend.forEach((lines) => {
      ctx.fillStyle = '#6d6a66';
      ctx.fillText('☐', pad, y);
      ctx.fillStyle = '#121212';
      lines.forEach((l, k) => ctx.fillText(l, pad + 50, y + k * 40));
      y += lines.length * 40 + 12;
    });
  }

  ctx.fillStyle = '#6d6a66';
  ctx.font = `26px ${sans}`;
  ctx.textAlign = 'center';
  ctx.fillText('Zamar Adoración', W / 2, H - 50);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

let jsPdfReady = null;
function loadJsPdf() {
  jsPdfReady ||= new Promise((resolve, reject) => {
    if (window.jspdf) return resolve(window.jspdf.jsPDF);
    const s = document.createElement('script');
    s.src = 'js/vendor/jspdf.umd.min.js';
    s.onload = () => resolve(window.jspdf.jsPDF);
    s.onerror = () => {
      jsPdfReady = null;
      reject(new Error('No se pudo cargar el generador de PDF. Revisa tu conexión.'));
    };
    document.head.appendChild(s);
  });
  return jsPdfReady;
}

// Las fuentes básicas del PDF solo traen letras latinas: se cambian comillas tipográficas y similares.
const plain = (t) =>
  String(t || '')
    .replace(/[‘’ʼ´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[–—]/g, '-')
    .replace(/ /g, ' ')
    .replace(/[^\n\x20-\x7e¡-ÿ]/g, '');

/**
 * PDF con la lista y la letra de cada canción. `rows` = [{ title, author, key, bpm, lyrics }],
 * donde los títulos de sección vienen como [[Coro]]. Devuelve un Blob.
 */
export async function setlistPdf(set, rows, { audience = false } = {}) {
  // Para la asamblea (el PDF del QR) no van tono ni BPM: solo letras.
  const meta = (r, withAuthor) =>
    [withAuthor && r.author, !audience && r.key && `Tono ${r.key}`, !audience && r.bpm && `${r.bpm} BPM`].filter(Boolean).join(' · ');
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 54;
  const lineH = 15;
  let y = M;
  const ensure = (h) => {
    if (y + h > H - M) {
      doc.addPage();
      y = M;
    }
  };

  // Portada: nombre, fecha y la lista con tono y BPM.
  doc.setFont('times', 'bold');
  doc.setFontSize(26);
  doc.text(plain(set.name || 'Setlist'), M, (y += 10));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(110);
  const day = longDay(set.date);
  y += 22;
  doc.text(plain(`${day ? day.charAt(0).toUpperCase() + day.slice(1) + ' · ' : ''}${rows.length} canciones`), M, y);
  doc.setTextColor(0);
  y += 30;
  rows.forEach((r, i) => {
    ensure(22);
    doc.setFont('helvetica', 'bold');
    doc.text(`${i + 1}.`, M, y);
    doc.text(plain(r.title), M + 22, y);
    doc.setFont('helvetica', 'normal');
    doc.text(plain(meta(r, audience)), W - M, y, { align: 'right' });
    y += 22;
  });
  ensure(60);
  y += 24;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(110);
  doc.text('Síguenos y escucha nuestra música:', M, y);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.textWithLink(LINKTREE_TEXT, M, y + 18, { url: LINKTREE });

  // Una canción por página.
  rows.forEach((r, i) => {
    doc.addPage();
    y = M + 10;
    doc.setFont('times', 'bold');
    doc.setFontSize(20);
    doc.text(plain(`${i + 1}. ${r.title}`), M, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(110);
    y += 20;
    const info = meta(r, true);
    if (info) doc.text(plain(info), M, y);
    doc.setTextColor(0);
    y += 26;
    doc.setFontSize(12);
    if (!r.lyrics) {
      doc.setTextColor(110);
      doc.text('Aún no hay letra cargada para esta canción.', M, y);
      doc.setTextColor(0);
      return;
    }
    // Quita los títulos de sección que no llevan letra (Intro, Interludio) y los espacios que dejaron los acordes.
    const lines = plain(r.lyrics)
      .split('\n')
      .map((l) => l.replace(/(\S) {2,}/g, '$1 ').trimEnd());
    const isSection = (l) => /^\s*\[\[.+\]\]\s*$/.test(l);
    const kept = lines.filter((l, i) => {
      if (!isSection(l)) return true;
      const next = lines.slice(i + 1).find((x) => x.trim());
      return next !== undefined && !isSection(next);
    }).filter((l, i, all) => l.trim() || (i > 0 && all[i - 1].trim()));
    for (const raw of kept) {
      const section = raw.match(/^\s*\[\[(.+)\]\]\s*$/);
      if (section) {
        y += 6;
        ensure(lineH * 2);
        doc.setFont('helvetica', 'bold');
        doc.text(section[1].toUpperCase(), M, y);
        doc.setFont('helvetica', 'normal');
        y += lineH + 2;
        continue;
      }
      if (!raw.trim()) {
        y += lineH * 0.6;
        continue;
      }
      for (const line of doc.splitTextToSize(raw, W - M * 2)) {
        ensure(lineH);
        doc.text(line, M, y);
        y += lineH;
      }
    }
  });

  // Pie con número de página.
  const pages = doc.getNumberOfPages();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(140);
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.text(plain(`${set.name || 'Setlist'} · Zamar Adoración`), M, H - 28);
    doc.text(`${p} / ${pages}`, W - M, H - 28, { align: 'right' });
    doc.textWithLink(LINKTREE_TEXT, W / 2 - doc.getTextWidth(LINKTREE_TEXT) / 2, H - 28, { url: LINKTREE });
  }
  return doc.output('blob');
}

let qrReady = null;
function loadQr() {
  qrReady ||= new Promise((resolve, reject) => {
    if (window.qrcode) return resolve(window.qrcode);
    const s = document.createElement('script');
    s.src = 'js/vendor/qrcode.js';
    s.onload = () => resolve(window.qrcode);
    s.onerror = () => {
      qrReady = null;
      reject(new Error('No se pudo cargar el generador de QR. Revisa tu conexión.'));
    };
    document.head.appendChild(s);
  });
  return qrReady;
}

/** Dibuja el QR de un link en un canvas, con margen blanco alrededor. */
export async function qrCanvas(text, size = 600) {
  const qrcode = await loadQr();
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = Math.floor(size / (n + 8));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = cell * (n + 8);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#121212';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + 4) * cell, (r + 4) * cell, cell, cell);
  return canvas;
}

/** Imagen lista para proyectar o mandar: nombre del setlist, QR grande y el Linktree. */
export async function qrPoster(set, url) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const serif = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
  const sans = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = '#faf9f7';
  ctx.fillRect(0, 0, W, H);
  const logo = await loadImage('img/logo-negro.png');
  if (logo) {
    const h = 80;
    const w = (logo.width / logo.height) * h;
    ctx.drawImage(logo, (W - w) / 2, 70, w, h);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#121212';
  ctx.font = `600 60px ${serif}`;
  ctx.fillText(fit(ctx, set.name || 'Setlist', W - 120), W / 2, 250);
  const day = longDay(set.date);
  ctx.fillStyle = '#6d6a66';
  ctx.font = `34px ${sans}`;
  if (day) ctx.fillText(day.charAt(0).toUpperCase() + day.slice(1), W / 2, 305);
  const qr = await qrCanvas(url, 700);
  const s = 700;
  ctx.drawImage(qr, (W - s) / 2, 360, s, s);
  ctx.fillStyle = '#121212';
  ctx.font = `600 42px ${sans}`;
  ctx.fillText('Escanea para ver las letras', W / 2, 1140);
  ctx.fillStyle = '#6d6a66';
  ctx.font = `32px ${sans}`;
  ctx.fillText(`Síguenos: ${LINKTREE_TEXT}`, W / 2, 1210);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** Comparte un archivo con la hoja del teléfono; si no se puede, lo descarga. */
export async function shareFile(blob, set, ext, mime, suffix = '') {
  const name = fileName(set, ext).replace(/\.(\w+)$/, `${suffix}.$1`);
  const file = new File([blob], name, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: set.name });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'downloaded';
}
