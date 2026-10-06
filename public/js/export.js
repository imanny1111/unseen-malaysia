// Renders the map card to a canvas and downloads it as PNG, JPG or PDF.
(function () {
  const W = 1800, H = 1200, PAD = 70;
  const FONT = '"Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif';

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function render(o) {
    const { data, theme: th, visited, texts } = o;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);

    // Header
    let tx = PAD;
    if (o.photo) {
      const img = await loadImage(o.photo);
      const r = 62, cx = PAD + r, cy = 158;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
      ctx.lineWidth = 6; ctx.strokeStyle = th.visited;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      tx += r * 2 + 34;
    }
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = th.muted;
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText(texts.kicker.toUpperCase(), tx, 118);
    ctx.fillStyle = th.ink;
    ctx.font = `800 70px ${FONT}`;
    ctx.fillText(texts.title, tx, 190);
    if (texts.name) {
      ctx.fillStyle = th.muted;
      ctx.font = `500 30px ${FONT}`;
      ctx.fillText(texts.name, tx, 236);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = th.muted;
    ctx.font = `700 50px ${FONT}`;
    const totalTxt = '/' + data.districts.length;
    ctx.fillText(totalTxt, W - PAD, 200);
    const tw = ctx.measureText(totalTxt).width;
    ctx.fillStyle = th.visited;
    ctx.font = `800 130px ${FONT}`;
    ctx.fillText(String(visited.size), W - PAD - tw - 8, 200);
    ctx.textAlign = 'left';

    // Map
    const [, , vw, vh] = data.viewBox;
    const mapTop = 262, mapW = W - PAD * 2, mapH = 740;
    const s = Math.min(mapW / vw, mapH / vh);
    const ox = PAD + (mapW - vw * s) / 2, oy = mapTop + (mapH - vh * s) / 2;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(s, s);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = th.stroke;
    for (const d of data.districts) {
      const p = new Path2D(d.d);
      ctx.fillStyle = visited.has(d.id) ? th.visited : th.land;
      ctx.fill(p);
      ctx.stroke(p);
    }
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = th.muted;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(data.divider, 40); ctx.lineTo(data.divider, vh - 40);
    ctx.stroke();
    ctx.restore();

    if (o.labels) {
      ctx.font = `600 17px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const d of data.districts) {
        if (!visited.has(d.id)) continue;
        const x = ox + d.c[0] * s, y = oy + d.c[1] * s;
        ctx.lineWidth = 4; ctx.strokeStyle = th.bg;
        ctx.strokeText(d.name, x, y);
        ctx.fillStyle = th.ink;
        ctx.fillText(d.name, x, y);
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // Footer
    const barY = 1040, barW = W - PAD * 2;
    roundRect(ctx, PAD, barY, barW, 14, 7, th.land);
    if (visited.size) roundRect(ctx, PAD, barY, Math.max(14, barW * visited.size / data.districts.length), 14, 7, th.visited);
    ctx.font = `600 28px ${FONT}`;
    ctx.fillStyle = th.ink;
    ctx.fillText(texts.summary, PAD, 1098);
    ctx.textAlign = 'right';
    ctx.fillStyle = th.muted;
    ctx.fillText(texts.states, W - PAD, 1098);

    // Brand
    ctx.textAlign = 'left';
    roundRect(ctx, PAD, 1124, 40, 40, 10, th.visited);
    ctx.fillStyle = th.bg;
    ctx.font = `800 24px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('M', PAD + 20, 1153);
    ctx.textAlign = 'left';
    ctx.fillStyle = th.ink;
    ctx.font = `700 24px ${FONT}`;
    ctx.fillText('Unseen Malaysia', PAD + 54, 1153);
    return c;
  }

  function roundRect(ctx, x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const toBlob = (canvas, type, q) => new Promise((r) => canvas.toBlob(r, type, q));

  // Minimal single-page PDF that embeds the JPEG directly (DCTDecode).
  async function makePdf(canvas) {
    const jpeg = new Uint8Array(await (await toBlob(canvas, 'image/jpeg', 0.95)).arrayBuffer());
    const pw = 842, ph = Math.round((842 * canvas.height) / canvas.width);
    const enc = new TextEncoder();
    const parts = [];
    const offsets = [];
    let len = 0;
    const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;

    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
    obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
    obj(4, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
      push(jpeg);
      push('\nendstream');
    });
    obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    const xref = len;
    push('xref\n0 6\n0000000000 65535 f \n');
    for (let i = 1; i <= 5; i++) push(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
    push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  window.exportMap = async function (format, opts) {
    const canvas = await render(opts);
    const name = 'my-malaysia-map';
    if (format === 'png') download(await toBlob(canvas, 'image/png'), name + '.png');
    else if (format === 'jpg') download(await toBlob(canvas, 'image/jpeg', 0.92), name + '.jpg');
    else download(await makePdf(canvas), name + '.pdf');
  };
  // Exposed for testing.
  window.renderMapCanvas = render;
})();
