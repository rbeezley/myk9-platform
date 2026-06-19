import type { ResultCardModel } from './resultCardModel';

const WIDTH = 1080;
const HEIGHT = 1350;
const RESULT_Y = 530;
const PLACEMENT_Y = 625;
const CLASS_Y_WITH_PLACEMENT = PLACEMENT_Y + 90;
const CLASS_Y_WITHOUT_PLACEMENT = 640;
const SHOW_Y_WITH_PLACEMENT = CLASS_Y_WITH_PLACEMENT + 70;
const SHOW_Y_WITHOUT_PLACEMENT = CLASS_Y_WITHOUT_PLACEMENT + 65;
const DETAILS_Y_WITH_PLACEMENT = SHOW_Y_WITH_PLACEMENT + 95;
const DETAILS_Y_WITHOUT_PLACEMENT = SHOW_Y_WITHOUT_PLACEMENT + 95;
const TEXT_MAX_WIDTH = WIDTH - 160;

export async function renderResultCardImage(model: ResultCardModel): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create result card image');
  }

  ctx.fillStyle = '#fffaf3';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = '#1f2933';
  ctx.font = '700 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  drawFittedText(ctx, model.dogName, WIDTH / 2, 150, TEXT_MAX_WIDTH);

  const photo = model.photoUrl ? await loadImage(model.photoUrl) : null;
  if (photo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(WIDTH / 2, 305, 130, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(photo, WIDTH / 2 - 130, 175, 260, 260);
    ctx.restore();
  } else {
    drawPhotoPlaceholder(ctx, model.dogName);
  }

  ctx.fillStyle = '#1d4ed8';
  ctx.font = '800 144px system-ui, sans-serif';
  drawFittedText(ctx, model.resultLabel, WIDTH / 2, RESULT_Y, TEXT_MAX_WIDTH);

  const placementLabel = model.placementLabel;
  const hasPlacement = Boolean(placementLabel);
  const classY = hasPlacement ? CLASS_Y_WITH_PLACEMENT : CLASS_Y_WITHOUT_PLACEMENT;
  const showY = hasPlacement ? SHOW_Y_WITH_PLACEMENT : SHOW_Y_WITHOUT_PLACEMENT;
  const detailsStartY = hasPlacement ? DETAILS_Y_WITH_PLACEMENT : DETAILS_Y_WITHOUT_PLACEMENT;

  if (placementLabel) {
    ctx.fillStyle = '#1f2933';
    ctx.font = '700 64px system-ui, sans-serif';
    drawFittedText(ctx, placementLabel, WIDTH / 2, PLACEMENT_Y, TEXT_MAX_WIDTH);
  }

  ctx.fillStyle = '#334155';
  ctx.font = '600 48px system-ui, sans-serif';
  drawFittedText(ctx, model.className, WIDTH / 2, classY, TEXT_MAX_WIDTH);
  ctx.font = '500 42px system-ui, sans-serif';
  drawFittedText(ctx, model.showName, WIDTH / 2, showY, TEXT_MAX_WIDTH);

  const details = [model.timeLabel, model.faultsLabel, model.armband ? `Armband ${model.armband}` : undefined]
    .filter((value): value is string => Boolean(value));

  ctx.font = '500 38px system-ui, sans-serif';
  details.forEach((detail, index) => {
    drawFittedText(ctx, detail, WIDTH / 2, detailsStartY + index * 58, TEXT_MAX_WIDTH);
  });

  ctx.fillStyle = '#6b6358';
  ctx.font = '600 34px system-ui, sans-serif';
  drawFittedText(ctx, 'myK9Show', WIDTH / 2, HEIGHT - 90, TEXT_MAX_WIDTH);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Unable to create result card image'));
    }, 'image/png');
  });
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  try {
    return await loadSingleImage(src);
  } catch {
    return null;
  }
}

function loadSingleImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load result card image asset'));
    image.src = src;
  });
}

function drawPhotoPlaceholder(ctx: CanvasRenderingContext2D, dogName: string) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(WIDTH / 2, 305, 130, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#dbeafe';
  ctx.fillRect(WIDTH / 2 - 130, 175, 260, 260);
  ctx.fillStyle = '#1d4ed8';
  ctx.font = '800 104px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(dogName.trim().charAt(0).toUpperCase() || 'Q', WIDTH / 2, 340);
  ctx.restore();
}

function drawFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number
) {
  ctx.fillText(fitCanvasText(ctx, text, maxWidth), x, y);
}

function fitCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  const suffix = '...';
  if (ctx.measureText(suffix).width > maxWidth) {
    return '';
  }

  let fitted = text.trimEnd();
  while (fitted.length > 0 && ctx.measureText(`${fitted}${suffix}`).width > maxWidth) {
    fitted = fitted.slice(0, -1).trimEnd();
  }

  return fitted ? `${fitted}${suffix}` : suffix;
}
