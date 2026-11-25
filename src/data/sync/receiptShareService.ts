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

export async function renderReceiptPngBlob(payload: ReceiptSharePayload): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable.');
  }

  const accent =
    payload.kind === 'bill' && payload.isPaidBill ? '#059669' : ACCENT_BY_KIND[payload.kind];

  // Full-bleed white receipt canvas
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Colored Bank Slip Header Banner
  const headerHeight = 610;
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, WIDTH, headerHeight);

  // Subtle top sheen gradient
  const grad = ctx.createLinearGradient(0, 0, 0, headerHeight);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, headerHeight);

  // Circular Icon Medallion
  const iconCx = WIDTH / 2;
  const iconCy = 175;
  ctx.beginPath();
  ctx.arc(iconCx, iconCy, 66, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.fill();
  drawKindIcon(ctx, payload.kind, iconCx, iconCy);

  // Badge text
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.font = `800 30px ${FONT_SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(payload.badge.toUpperCase(), WIDTH / 2, 290);

  // Hero Amount
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `900 84px ${FONT_SANS}`;
  const fittedAmount = wrapText(ctx, payload.amountText, WIDTH - 120, 1)[0] || payload.amountText;
  ctx.fillText(fittedAmount, WIDTH / 2, 398);

  // Title
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.font = `600 40px ${FONT_SANS}`;
  const titleLines = wrapText(ctx, payload.title, WIDTH - 140, 2);
  titleLines.forEach((line, idx) => {
    ctx.fillText(line, WIDTH / 2, 492 + idx * 50);
  });

  // Details Body
  const padX = 80;
  let y = headerHeight + 82;
  const maxRowWidth = WIDTH - padX * 2;

  for (const row of payload.rows) {
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748B';
    ctx.font = `500 34px ${FONT_SANS}`;
    ctx.fillText(row.label, padX, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F172A';
    ctx.font = `700 34px ${FONT_SANS}`;
    const valueText = wrapText(ctx, row.value, maxRowWidth * 0.62, 1)[0] || row.value;
    ctx.fillText(valueText, WIDTH - padX, y);

    y += 78;
  }

  // Optional Notes block
  if (payload.notes && payload.notes.trim()) {
    y += 14;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94A3B8';
    ctx.font = `700 26px ${FONT_SANS}`;
    ctx.fillText('NOTES', padX, y);
    y += 46;

    ctx.fillStyle = '#334155';
    ctx.font = `500 32px ${FONT_SANS}`;
    const noteLines = wrapText(ctx, payload.notes.trim(), maxRowWidth, 3);
    for (const line of noteLines) {
      ctx.fillText(line, padX, y);
      y += 44;
    }
  }

  // Bottom Section: Issued By (User Google PFP + Name + Email) + Dashed Divider + Footer
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

  // User Google Profile Picture (or fallback initial circle)
  const avatarR = 46;
  const avatarCx = padX + 36 + avatarR;
  const avatarCy = issuerBoxY + issuerBoxH / 2;

  const avatarImg = payload.issuer.photoURL
    ? await loadImageWithCors(payload.issuer.photoURL)
    : null;

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

  // Issuer text
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

  // Footer: Record ID on left, EXPENSE LEDGER on right
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#94A3B8';
  ctx.font = `500 24px ${FONT_MONO}`;
  const shortId = wrapText(ctx, payload.recordId, maxRowWidth * 0.6, 1)[0] || payload.recordId;
  ctx.fillText(shortId, padX, footerBottomY);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#475569';
  ctx.font = `800 26px ${FONT_SANS}`;
  ctx.fillText('EXPENSE LEDGER', WIDTH - padX, footerBottomY);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode PNG receipt.'));
      },
      'image/png',
      1.0
    );
  });
}

/**
 * Generates a 9:16 PNG receipt and invokes the native OS Share Sheet (WhatsApp, Photos, Files, AirDrop)
 * with an automatic PNG download fallback on desktop browsers.
 */
export async function shareReceiptImage(payload: ReceiptSharePayload): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await renderReceiptPngBlob(payload);
  const safeId = payload.recordId.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 24) || 'receipt';
  const filename = `expense-ledger-${safeId}.png`;
  const file = new File([blob], filename, { type: 'image/png' });

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  ) {
    try {
      if (navigator.canShare({ files: [file] })) {
        // Pass ONLY `files` (no `title`/`text`) so macOS/iOS Share Sheet "Copy"
        // places a single clean PNG on the clipboard instead of duplicating on paste.
        await navigator.share({ files: [file] });
        return 'shared';
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }

  // Desktop / unsupported browser fallback: clean PNG download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
