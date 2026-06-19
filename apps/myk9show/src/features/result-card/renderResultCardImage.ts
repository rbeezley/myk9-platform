import type { ResultCardModel } from './resultCardModel';

const WIDTH = 1080;
const HEIGHT = 1350;

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
  ctx.fillText(model.dogName, WIDTH / 2, 150);

  const photo = await loadImage(model.photoUrl ?? '/placeholder-dog.png');
  ctx.save();
  ctx.beginPath();
  ctx.arc(WIDTH / 2, 305, 130, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(photo, WIDTH / 2 - 130, 175, 260, 260);
  ctx.restore();

  ctx.fillStyle = '#1d4ed8';
  ctx.font = '800 144px system-ui, sans-serif';
  ctx.fillText(model.resultLabel, WIDTH / 2, 530);

  if (model.placementLabel) {
    ctx.fillStyle = '#1f2933';
    ctx.font = '700 64px system-ui, sans-serif';
    ctx.fillText(model.placementLabel, WIDTH / 2, 625);
  }

  ctx.fillStyle = '#334155';
  ctx.font = '600 48px system-ui, sans-serif';
  ctx.fillText(model.className, WIDTH / 2, 610);
  ctx.font = '500 42px system-ui, sans-serif';
  ctx.fillText(model.showName, WIDTH / 2, 685);

  const details = [model.timeLabel, model.faultsLabel, model.armband ? `Armband ${model.armband}` : undefined]
    .filter((value): value is string => Boolean(value));

  ctx.font = '500 38px system-ui, sans-serif';
  details.forEach((detail, index) => {
    ctx.fillText(detail, WIDTH / 2, 780 + index * 58);
  });

  ctx.fillStyle = '#6b6358';
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.fillText('myK9Show', WIDTH / 2, HEIGHT - 90);

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

async function loadImage(src: string): Promise<HTMLImageElement> {
  try {
    return await loadSingleImage(src);
  } catch {
    return loadSingleImage('/placeholder-dog.png');
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
