/**
 * Banking-Style 9:16 Transaction Receipt Image Generator & Native OS Share Service
 *
 * Renders a crisp 1080x1920 (9:16 full-bleed) PNG bank slip completely client-side via HTML5 Canvas
 * so it works 100% offline and opens cleanly in WhatsApp, iOS Photos, Save to Files, and AirDrop.
 */

export type ReceiptVisualKind = 'expense' | 'income' | 'transfer' | 'bill' | 'payment';

export interface ReceiptDetailRow {
  label: string;
  value: string;
}

export interface ReceiptSharePayload {
  kind: ReceiptVisualKind;
  badge: string;
  title: string;
  amountText: string;
  rows: ReceiptDetailRow[];
  paymentBreakdown?: Array<{ label: string; amountText: string }>;
  paymentBreakdownTotalText?: string;
  notes?: string;
  recordId: string;
  isPaidBill?: boolean;
  issuer: {
    name: string;
    email?: string | null;
    photoURL?: string | null;
  };
}

const ACCENT_BY_KIND: Record<ReceiptVisualKind, string> = {
  expense: '#E11D48',
  income: '#059669',
  transfer: '#2563EB',
  bill: '#D97706',
  payment: '#4F46E5',
};

const WIDTH = 1080;
const HEIGHT = 1920;
const FONT_SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif';
const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

function loadImageWithCors(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    const timeout = window.setTimeout(() => resolve(null), 2500);
    img.onload = () => {
      window.clearTimeout(timeout);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timeout);
      resolve(null);
    };
    img.src = url;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawKindIcon(
  ctx: CanvasRenderingContext2D,
  kind: ReceiptVisualKind,
  cx: number,
  cy: number
) {
  ctx.save();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (kind === 'expense') {
    // Arrow up-right
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy + 24);
    ctx.lineTo(cx + 24, cy - 24);
    ctx.moveTo(cx - 8, cy - 24);
    ctx.lineTo(cx + 24, cy - 24);
    ctx.lineTo(cx + 24, cy + 8);
    ctx.stroke();
  } else if (kind === 'income') {
    // Arrow down-left
    ctx.beginPath();
    ctx.moveTo(cx + 24, cy - 24);
    ctx.lineTo(cx - 24, cy + 24);
    ctx.moveTo(cx + 8, cy + 24);
    ctx.lineTo(cx - 24, cy + 24);
    ctx.lineTo(cx - 24, cy - 8);
    ctx.stroke();
  } else if (kind === 'transfer') {
    // Left-right arrows
    ctx.beginPath();
    ctx.moveTo(cx - 28, cy - 14);
    ctx.lineTo(cx + 28, cy - 14);
    ctx.moveTo(cx - 14, cy - 28);
    ctx.lineTo(cx - 28, cy - 14);
    ctx.lineTo(cx - 14, cy);
    ctx.moveTo(cx + 28, cy + 14);
    ctx.lineTo(cx - 28, cy + 14);
    ctx.moveTo(cx + 14, cy);
    ctx.lineTo(cx + 28, cy + 14);
    ctx.lineTo(cx + 14, cy + 28);
    ctx.stroke();
  } else if (kind === 'bill') {
    // Document icon
    drawRoundedRect(ctx, cx - 22, cy - 28, 44, 56, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 11, cy - 8);
    ctx.lineTo(cx + 11, cy - 8);
    ctx.moveTo(cx - 11, cy + 8);
    ctx.lineTo(cx + 6, cy + 8);
    ctx.stroke();
  } else {
    // Checkmark (payment)
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy + 2);
    ctx.lineTo(cx - 6, cy + 20);
    ctx.lineTo(cx + 26, cy - 18);
    ctx.stroke();
  }

  ctx.restore();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  // Ellipsize last line if still wider than maxWidth
  const lastIdx = lines.length - 1;
  if (lastIdx >= 0 && ctx.measureText(lines[lastIdx]).width > maxWidth) {
    let trimmed = lines[lastIdx];
    while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
      trimmed = trimmed.slice(0, -1);
    }
    lines[lastIdx] = `${trimmed}…`;
  }

  return lines;
}

function drawIssuerAndFooter(
  ctx: CanvasRenderingContext2D,
  payload: ReceiptSharePayload,
  accent: string,
  avatarImg: HTMLImageElement | null,
  footerRightText: string
) {
  const padX = 80;
  const maxRowWidth = WIDTH - padX * 2;
  const footerBottomY = HEIGHT - 90;
  const dashedLineY = footerBottomY - 82;
  const issuerBoxH = 164;
  const issuerBoxY = dashedLineY - issuerBoxH - 48;

  // Issued By rounded card
  drawRoundedRect(ctx, padX, issuerBoxY, maxRowWidth, issuerBoxH, 28);
  ctx.fillStyle = '#F8F6F2';
  ctx.fill();
  ctx.strokeStyle = '#E8E2D8';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const avatarR = 46;
  const avatarCx = padX + 36 + avatarR;
  const avatarCy = issuerBoxY + issuerBoxH / 2;

  if (avatarImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImg, avatarCx - avatarR, avatarCy - avatarR, avatarR * 2, avatarR * 2);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(15,23,42,0.08)';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 38px ${FONT_SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initial = (payload.issuer.name[0] || 'U').toUpperCase();
    ctx.fillText(initial, avatarCx, avatarCy + 2);
  }

  const textX = avatarCx + avatarR + 28;
  const textMaxW = WIDTH - padX - 32 - textX;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#94A3B8';
  ctx.font = `700 24px ${FONT_SANS}`;
  ctx.fillText('ISSUED BY', textX, issuerBoxY + 42);

  ctx.fillStyle = '#0F172A';
  ctx.font = `800 34px ${FONT_SANS}`;
  const issuerName = wrapText(ctx, payload.issuer.name, textMaxW, 1)[0] || payload.issuer.name;
  ctx.fillText(issuerName, textX, issuerBoxY + 86);

  if (payload.issuer.email) {
    ctx.fillStyle = '#64748B';
    ctx.font = `500 28px ${FONT_SANS}`;
    const issuerEmail = wrapText(ctx, payload.issuer.email, textMaxW, 1)[0] || payload.issuer.email;
    ctx.fillText(issuerEmail, textX, issuerBoxY + 128);
  }

  // Dashed divider line
  ctx.save();
  ctx.setLineDash([12, 10]);
  ctx.strokeStyle = '#D6CFC2';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(padX, dashedLineY);
  ctx.lineTo(WIDTH - padX, dashedLineY);
  ctx.stroke();
  ctx.restore();

  // Footer: Record ID on left, label on right
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#94A3B8';
  ctx.font = `500 24px ${FONT_MONO}`;
  const shortId = wrapText(ctx, payload.recordId, maxRowWidth * 0.6, 1)[0] || payload.recordId;
  ctx.fillText(shortId, padX, footerBottomY);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#475569';
  ctx.font = `800 26px ${FONT_SANS}`;
  ctx.fillText(footerRightText, WIDTH - padX, footerBottomY);
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality = 1.0): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`Failed to encode ${mimeType} receipt.`));
      },
      mimeType,
      quality
    );
  });
}

/**
 * Pure client-side PDF 1.4 generator that bundles multiple 1080x1920 (9:16) receipt canvases
 * into a single crisp multi-page 9:16 PDF (360x640 pt @ 216 DPI) with zero external libraries.
 */
async function buildMultiPagePdfFromCanvases(canvases: HTMLCanvasElement[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const pageWidthPt = 360;
  const pageHeightPt = 640;

  const jpegPages: Uint8Array[] = [];
  for (const canvas of canvases) {
    const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', 0.94);
    const buf = await jpegBlob.arrayBuffer();
    jpegPages.push(new Uint8Array(buf));
  }

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };
  const pushText = (str: string) => {
    pushBytes(encoder.encode(str));
  };

  // PDF Header with binary comment bytes
  pushText('%PDF-1.4\n');
  pushBytes(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const totalObjects = 2 + jpegPages.length * 3;
  const offsets: number[] = new Array(totalObjects + 1).fill(0);

  // 1: Catalog
  offsets[1] = offset;
  pushText('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: Pages tree
  const kidRefs = jpegPages.map((_, idx) => `${3 + idx * 3} 0 R`).join(' ');
  offsets[2] = offset;
  pushText(`2 0 obj\n<< /Type /Pages /Kids [${kidRefs}] /Count ${jpegPages.length} >>\nendobj\n`);

  // 3..N: Each page = Page dict + JPEG Image XObject + Content stream
  for (let i = 0; i < jpegPages.length; i++) {
    const pageObjId = 3 + i * 3;
    const imgObjId = pageObjId + 1;
    const contentObjId = pageObjId + 2;
    const jpegBytes = jpegPages[i];

    offsets[pageObjId] = offset;
    pushText(
      `${pageObjId} 0 obj\n` +
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt} ${pageHeightPt}] ` +
        `/Resources << /XObject << /Im0 ${imgObjId} 0 R >> >> /Contents ${contentObjId} 0 R >>\n` +
        `endobj\n`
    );

    offsets[imgObjId] = offset;
    pushText(
      `${imgObjId} 0 obj\n` +
        `<< /Type /XObject /Subtype /Image /Width ${WIDTH} /Height ${HEIGHT} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\n` +
        `stream\n`
    );
    pushBytes(jpegBytes);
    pushText('\nendstream\nendobj\n');

    const streamContent = `q\n${pageWidthPt} 0 0 ${pageHeightPt} 0 0 cm\n/Im0 Do\nQ\n`;
    const streamBytes = encoder.encode(streamContent);
    offsets[contentObjId] = offset;
    pushText(
      `${contentObjId} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`
    );
    pushBytes(streamBytes);
    pushText('endstream\nendobj\n');
  }

  const xrefOffset = offset;
  pushText(`xref\n0 ${totalObjects + 1}\n`);
  pushText('0000000000 65535 f \n');
  for (let id = 1; id <= totalObjects; id++) {
    pushText(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  }

  pushText(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

/**
 * Renders 1 or more crisp 1080x1920 (9:16) receipt canvases.
 * Smartly fills Page 1 with as many Payment Breakdown items as fit cleanly,
 * spilling ONLY overflow items onto Page 2+ with a clean normal-text header.
 */
async function renderReceiptCanvases(payload: ReceiptSharePayload): Promise<HTMLCanvasElement[]> {
  const accent =
    payload.kind === 'bill' && payload.isPaidBill ? '#059669' : ACCENT_BY_KIND[payload.kind];

  const avatarImg = payload.issuer.photoURL
    ? await loadImageWithCors(payload.issuer.photoURL)
    : null;

  const padX = 80;
  const maxRowWidth = WIDTH - padX * 2;
  const headerHeight = 560;
  const footerBottomY = HEIGHT - 90;
  const dashedLineY = footerBottomY - 82;
  const issuerBoxH = 164;
  const issuerBoxY = dashedLineY - issuerBoxH - 48;
  const bodyBottomLimit = issuerBoxY - 36;

  const breakdown = payload.paymentBreakdown ?? [];
  const hasNotes = Boolean(payload.notes && payload.notes.trim());
  const rowStep = payload.rows.length > 8 ? 64 : 72;
  const afterRowsY = headerHeight + 70 + payload.rows.length * rowStep;
  const notesHeight = hasNotes ? 14 + 42 + 3 * 40 : 0;
  const breakdownItemStep = 50;

  // How many breakdown rows fit on Page 1 alongside notes (for 1-page case)
  const fullBreakdownHeight =
    breakdown.length > 0 ? 16 + 44 + breakdown.length * breakdownItemStep : 0;
  const fitsAllOnPage1 = afterRowsY + fullBreakdownHeight + notesHeight <= bodyBottomLimit;

  let page1BreakdownCount = breakdown.length;
  let notesOnPage1 = hasNotes;
  const overflowChunks: Array<Array<{ label: string; amountText: string }>> = [];

  if (!fitsAllOnPage1 && breakdown.length > 0) {
    // Reserve 44px for the "Continued on Page 2..." cue at the bottom of Page 1 breakdown
    const spaceForPage1Breakdown = bodyBottomLimit - afterRowsY - 16 - 44 - 44;
    page1BreakdownCount = Math.max(0, Math.floor(spaceForPage1Breakdown / breakdownItemStep));
    // Never leave an awkward single-item orphan on Page 1 if 0 fit; otherwise fill Page 1 naturally!
    notesOnPage1 = false;

    const remaining = breakdown.slice(page1BreakdownCount);
    // Clean normal-text top header on Page 2+ starts body at y = 260
    const page2BodyStartY = 260;
    const page2ItemStep = 60;
    const reserveEndPage = (payload.paymentBreakdownTotalText ? 90 : 0) + notesHeight + 24;
    const maxPerNormalPage = Math.max(
      1,
      Math.floor((bodyBottomLimit - page2BodyStartY - 24) / page2ItemStep)
    );
    const maxOnLastPage = Math.max(
      1,
      Math.floor((bodyBottomLimit - page2BodyStartY - reserveEndPage) / page2ItemStep)
    );

    let cursor = 0;
    while (cursor < remaining.length) {
      const left = remaining.length - cursor;
      if (left <= maxOnLastPage) {
        overflowChunks.push(remaining.slice(cursor));
        break;
      }
      overflowChunks.push(remaining.slice(cursor, cursor + maxPerNormalPage));
      cursor += maxPerNormalPage;
    }
  }

  const totalPages = 1 + overflowChunks.length;
  const canvases: HTMLCanvasElement[] = [];

  // --- PAGE 1 ---
  const canvas1 = document.createElement('canvas');
  canvas1.width = WIDTH;
  canvas1.height = HEIGHT;
  const ctx1 = canvas1.getContext('2d');
  if (!ctx1) {
    throw new Error('Canvas 2D context unavailable.');
  }

  ctx1.fillStyle = '#FFFFFF';
  ctx1.fillRect(0, 0, WIDTH, HEIGHT);

  ctx1.fillStyle = accent;
  ctx1.fillRect(0, 0, WIDTH, headerHeight);

  const grad = ctx1.createLinearGradient(0, 0, 0, headerHeight);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx1.fillStyle = grad;
  ctx1.fillRect(0, 0, WIDTH, headerHeight);

  const iconCx = WIDTH / 2;
  const iconCy = 158;
  ctx1.beginPath();
  ctx1.arc(iconCx, iconCy, 62, 0, Math.PI * 2);
  ctx1.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx1.fill();
  drawKindIcon(ctx1, payload.kind, iconCx, iconCy);

  ctx1.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx1.font = `800 29px ${FONT_SANS}`;
  ctx1.textAlign = 'center';
  ctx1.textBaseline = 'middle';
  ctx1.fillText(payload.badge.toUpperCase(), WIDTH / 2, 266);

  ctx1.fillStyle = '#FFFFFF';
  ctx1.font = `900 82px ${FONT_SANS}`;
  const fittedAmount = wrapText(ctx1, payload.amountText, WIDTH - 120, 1)[0] || payload.amountText;
  ctx1.fillText(fittedAmount, WIDTH / 2, 368);

  ctx1.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx1.font = `600 38px ${FONT_SANS}`;
  const titleLines = wrapText(ctx1, payload.title, WIDTH - 140, 2);
  titleLines.forEach((line, idx) => {
    ctx1.fillText(line, WIDTH / 2, 456 + idx * 46);
  });

  let y = headerHeight + 70;
  for (const row of payload.rows) {
    if (y > bodyBottomLimit) break;
    ctx1.textBaseline = 'middle';
    ctx1.textAlign = 'left';
    ctx1.fillStyle = '#64748B';
    ctx1.font = `500 32px ${FONT_SANS}`;
    ctx1.fillText(row.label, padX, y);

    ctx1.textAlign = 'right';
    ctx1.fillStyle = '#0F172A';
    ctx1.font = `700 32px ${FONT_SANS}`;
    const valueText = wrapText(ctx1, row.value, maxRowWidth * 0.62, 1)[0] || row.value;
    ctx1.fillText(valueText, WIDTH - padX, y);

    y += rowStep;
  }

  // Draw Payment Breakdown items that fit on Page 1
  if (breakdown.length > 0 && page1BreakdownCount > 0) {
    y += 14;
    ctx1.textBaseline = 'middle';
    ctx1.textAlign = 'left';
    ctx1.fillStyle = '#94A3B8';
    ctx1.font = `700 25px ${FONT_SANS}`;
    ctx1.fillText('PAYMENT BREAKDOWN', padX, y);
    y += 44;

    for (let i = 0; i < page1BreakdownCount; i++) {
      const item = breakdown[i];
      ctx1.textAlign = 'left';
      ctx1.fillStyle = '#475569';
      ctx1.font = `500 30px ${FONT_SANS}`;
      const leftText = wrapText(ctx1, item.label, maxRowWidth * 0.64, 1)[0] || item.label;
      ctx1.fillText(leftText, padX, y);

      ctx1.textAlign = 'right';
      ctx1.fillStyle = '#059669';
      ctx1.font = `700 30px ${FONT_SANS}`;
      ctx1.fillText(item.amountText, WIDTH - padX, y);

      y += breakdownItemStep;
    }

    if (overflowChunks.length > 0 && y <= bodyBottomLimit) {
      const remainingCount = breakdown.length - page1BreakdownCount;
      ctx1.textAlign = 'left';
      ctx1.fillStyle = '#64748B';
      ctx1.font = `600 26px ${FONT_SANS}`;
      ctx1.fillText(
        `+${remainingCount} more ${remainingCount === 1 ? 'payment' : 'payments'} on Page 2…`,
        padX,
        y + 4
      );
    }
  } else if (breakdown.length > 0 && overflowChunks.length > 0 && y <= bodyBottomLimit - 30) {
    y += 12;
    ctx1.textBaseline = 'middle';
    ctx1.textAlign = 'left';
    ctx1.fillStyle = '#64748B';
    ctx1.font = `600 27px ${FONT_SANS}`;
    ctx1.fillText(
      `Payment breakdown (${breakdown.length} ${breakdown.length === 1 ? 'payment' : 'payments'}) on Page 2`,
      padX,
      y
    );
  }

  // Optional Notes block on Page 1 (when everything fits on 1 page)
  if (notesOnPage1 && hasNotes && y < bodyBottomLimit - 60) {
    y += 12;
    ctx1.textAlign = 'left';
    ctx1.fillStyle = '#94A3B8';
    ctx1.font = `700 25px ${FONT_SANS}`;
    ctx1.fillText('NOTES', padX, y);
    y += 42;

    ctx1.fillStyle = '#334155';
    ctx1.font = `500 30px ${FONT_SANS}`;
    const noteLines = wrapText(ctx1, payload.notes!.trim(), maxRowWidth, 3);
    for (const line of noteLines) {
      if (y > bodyBottomLimit) break;
      ctx1.fillText(line, padX, y);
      y += 40;
    }
  }

  drawIssuerAndFooter(
    ctx1,
    payload,
    accent,
    avatarImg,
    totalPages > 1 ? `PAGE 1 OF ${totalPages}` : 'EXPENSE LEDGER'
  );
  canvases.push(canvas1);

  // --- OVERFLOW PAGES (Page 2+, Clean Generic Normal-Text Header) ---
  for (let chunkIdx = 0; chunkIdx < overflowChunks.length; chunkIdx++) {
    const pageNum = chunkIdx + 2;
    const isLastPage = pageNum === totalPages;
    const chunk = overflowChunks[chunkIdx];

    const canvasN = document.createElement('canvas');
    canvasN.width = WIDTH;
    canvasN.height = HEIGHT;
    const ctxN = canvasN.getContext('2d');
    if (!ctxN) continue;

    ctxN.fillStyle = '#FFFFFF';
    ctxN.fillRect(0, 0, WIDTH, HEIGHT);

    // Clean normal-text top header (no heavy colored banner)
    ctxN.textAlign = 'left';
    ctxN.textBaseline = 'middle';
    ctxN.fillStyle = '#64748B';
    ctxN.font = `700 26px ${FONT_SANS}`;
    ctxN.fillText(
      page1BreakdownCount > 0 ? 'PAYMENT BREAKDOWN (CONTINUED)' : 'PAYMENT BREAKDOWN',
      padX,
      118
    );

    ctxN.fillStyle = '#0F172A';
    ctxN.font = `800 44px ${FONT_SANS}`;
    const headerTitle = wrapText(ctxN, payload.title, maxRowWidth * 0.72, 1)[0] || payload.title;
    ctxN.fillText(headerTitle, padX, 174);

    ctxN.textAlign = 'right';
    ctxN.fillStyle = '#64748B';
    ctxN.font = `700 26px ${FONT_SANS}`;
    ctxN.fillText(`Page ${pageNum} of ${totalPages}`, WIDTH - padX, 174);

    // Subtle horizontal divider under header
    ctxN.strokeStyle = '#E2E8F0';
    ctxN.lineWidth = 2.5;
    ctxN.beginPath();
    ctxN.moveTo(padX, 218);
    ctxN.lineTo(WIDTH - padX, 218);
    ctxN.stroke();

    let y2 = 276;
    for (const item of chunk) {
      ctxN.textBaseline = 'middle';
      ctxN.textAlign = 'left';
      ctxN.fillStyle = '#334155';
      ctxN.font = `500 32px ${FONT_SANS}`;
      const leftText = wrapText(ctxN, item.label, maxRowWidth * 0.65, 1)[0] || item.label;
      ctxN.fillText(leftText, padX, y2);

      ctxN.textAlign = 'right';
      ctxN.fillStyle = '#059669';
      ctxN.font = `700 32px ${FONT_SANS}`;
      ctxN.fillText(item.amountText, WIDTH - padX, y2);

      y2 += 60;
    }

    if (isLastPage && payload.paymentBreakdownTotalText) {
      y2 += 10;
      ctxN.strokeStyle = '#E2E8F0';
      ctxN.lineWidth = 2.5;
      ctxN.beginPath();
      ctxN.moveTo(padX, y2 - 20);
      ctxN.lineTo(WIDTH - padX, y2 - 20);
      ctxN.stroke();

      ctxN.textBaseline = 'middle';
      ctxN.textAlign = 'left';
      ctxN.fillStyle = '#0F172A';
      ctxN.font = `800 34px ${FONT_SANS}`;
      ctxN.fillText('Total Paid', padX, y2 + 18);

      ctxN.textAlign = 'right';
      ctxN.fillStyle = '#059669';
      ctxN.font = `900 36px ${FONT_SANS}`;
      ctxN.fillText(payload.paymentBreakdownTotalText, WIDTH - padX, y2 + 18);
      y2 += 72;
    }

    // If notes were deferred off Page 1, place them cleanly on the last page
    if (isLastPage && !notesOnPage1 && hasNotes && y2 < bodyBottomLimit - 60) {
      y2 += 14;
      ctxN.textAlign = 'left';
      ctxN.fillStyle = '#94A3B8';
      ctxN.font = `700 25px ${FONT_SANS}`;
      ctxN.fillText('NOTES', padX, y2);
      y2 += 42;

      ctxN.fillStyle = '#334155';
      ctxN.font = `500 30px ${FONT_SANS}`;
      const noteLines = wrapText(ctxN, payload.notes!.trim(), maxRowWidth, 3);
      for (const line of noteLines) {
        if (y2 > bodyBottomLimit) break;
        ctxN.fillText(line, padX, y2);
        y2 += 40;
      }
    }

    drawIssuerAndFooter(ctxN, payload, accent, avatarImg, `PAGE ${pageNum} OF ${totalPages}`);
    canvases.push(canvasN);
  }

  return canvases;
}

export async function renderReceiptPngBlob(payload: ReceiptSharePayload): Promise<Blob> {
  const canvases = await renderReceiptCanvases(payload);
  return canvasToBlob(canvases[0], 'image/png', 1.0);
}

/**
 * Generates a crisp 9:16 PNG (when 1 page) or a multi-page 9:16 PDF (when 2+ pages)
 * and invokes the native OS Share Sheet (WhatsApp, Photos, Files, AirDrop) with desktop download fallback.
 */
export async function shareReceiptImage(payload: ReceiptSharePayload): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const canvases = await renderReceiptCanvases(payload);
  const safeId = payload.recordId.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 24) || 'receipt';

  let file: File;
  if (canvases.length > 1) {
    const pdfBlob = await buildMultiPagePdfFromCanvases(canvases);
    file = new File([pdfBlob], `expense-ledger-${safeId}.pdf`, { type: 'application/pdf' });
  } else {
    const pngBlob = await canvasToBlob(canvases[0], 'image/png', 1.0);
    file = new File([pngBlob], `expense-ledger-${safeId}.png`, { type: 'image/png' });
  }

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  ) {
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return 'shared';
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }

  // Desktop / unsupported browser fallback: single clean file download (PNG or multi-page PDF)
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
