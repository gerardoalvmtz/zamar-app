// Archivos para compartir un setlist: una imagen PNG con el resumen (canciones, tonos y BPM)
// y un PDF con las letras. Todo se genera en el teléfono, sin servidor.

const longDay = (iso) =>
  iso
    ? new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';

const fileName = (set, ext) =>
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
export async function setlistPdf(set, rows) {
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
    doc.text(plain([r.key && `Tono ${r.key}`, r.bpm && `${r.bpm} BPM`].filter(Boolean).join(' · ')), W - M, y, { align: 'right' });
    y += 22;
  });

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
    const meta = [r.author, r.key && `Tono ${r.key}`, r.bpm && `${r.bpm} BPM`].filter(Boolean).join(' · ');
    if (meta) doc.text(plain(meta), M, y);
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
  }
  return doc.output('blob');
}

/** Comparte un archivo con la hoja del teléfono; si no se puede, lo descarga. */
export async function shareFile(blob, set, ext, mime) {
  const name = fileName(set, ext);
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
