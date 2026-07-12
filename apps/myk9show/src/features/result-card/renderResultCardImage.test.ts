import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResultCardModel } from './resultCardModel';
import { renderResultCardImage } from './renderResultCardImage';

function makeModel(overrides: Partial<ResultCardModel> = {}): ResultCardModel {
  return {
    entryId: 'entry-1',
    releaseKey: 'entry-1:release',
    dogName: 'Ditto',
    showName: 'Rocky Mountain Classic',
    showDateLabel: '9/14/2026',
    className: 'Container Novice A',
    classNumber: '101',
    armband: '27',
    resultLabel: 'Q',
    placement: 1,
    placementLabel: '1st',
    timeLabel: '42.18s',
    faultsLabel: '0 faults',
    photoUrl: '/placeholder-dog.png',
    shareTitle: 'Ditto qualified',
    shareText: 'Ditto earned a Q.',
    shareEnabled: true,
    ...overrides,
  };
}

describe('renderResultCardImage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'Image',
      class {
        crossOrigin = '';
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;

        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('draws the dog-first result facts', async () => {
    const fillText = vi.fn();
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        fillRect: vi.fn(),
        fillText,
        drawImage,
        beginPath: vi.fn(),
        arc: vi.fn(),
        clip: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        measureText: vi.fn((text: string) => ({ width: text.length * 12 })),
        set fillStyle(_value: string) {},
        set font(_value: string) {},
        set textAlign(_value: CanvasTextAlign) {},
      })),
      toBlob: vi.fn((cb: BlobCallback) => cb(new Blob(['png'], { type: 'image/png' }))),
    } as unknown as HTMLCanvasElement;
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);

    await renderResultCardImage(makeModel());

    expect(fillText).toHaveBeenCalledWith('Ditto', expect.any(Number), expect.any(Number));
    expect(fillText).toHaveBeenCalledWith('Armband 27', expect.any(Number), expect.any(Number));
    expect(fillText).toHaveBeenCalledWith('Q', expect.any(Number), expect.any(Number));
    expect(fillText).toHaveBeenCalledWith('1st', expect.any(Number), expect.any(Number));
    expect(fillText).toHaveBeenCalledWith(
      'Rocky Mountain Classic',
      expect.any(Number),
      expect.any(Number)
    );
    expect(fillText).toHaveBeenCalledWith('myK9Show', expect.any(Number), expect.any(Number));
  });

  it('omits placement text when placement is hidden', async () => {
    const fillText = vi.fn();
    const canvas = {
      getContext: vi.fn(() => ({
        fillRect: vi.fn(),
        fillText,
        drawImage: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        clip: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        measureText: vi.fn((text: string) => ({ width: text.length * 12 })),
        set fillStyle(_value: string) {},
        set font(_value: string) {},
        set textAlign(_value: CanvasTextAlign) {},
      })),
      toBlob: vi.fn((cb: BlobCallback) => cb(new Blob(['png'], { type: 'image/png' }))),
    } as unknown as HTMLCanvasElement;
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);

    const model = makeModel();
    delete model.placement;
    delete model.placementLabel;
    await renderResultCardImage(model);

    expect(fillText).not.toHaveBeenCalledWith('1st', expect.any(Number), expect.any(Number));
  });

  it('fits long labels inside the share image width', async () => {
    const fillText = vi.fn();
    const longDogName =
      'Ditto The Extremely Accomplished Fast Dog With A Very Long Registered Name';
    const longShowName =
      'The Extraordinarily Long Invitational Scent Work Classic Hosted At The Biggest Fairgrounds';
    const canvas = {
      getContext: vi.fn(() => ({
        fillRect: vi.fn(),
        fillText,
        drawImage: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        clip: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        measureText: vi.fn((text: string) => ({ width: text.length * 18 })),
        set fillStyle(_value: string) {},
        set font(_value: string) {},
        set textAlign(_value: CanvasTextAlign) {},
      })),
      toBlob: vi.fn((cb: BlobCallback) => cb(new Blob(['png'], { type: 'image/png' }))),
    } as unknown as HTMLCanvasElement;
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);

    await renderResultCardImage(
      makeModel({
        dogName: longDogName,
        showName: longShowName,
      })
    );

    const dogNameCall = fillText.mock.calls.find(([, , y]) => y === 120);
    const showNameCall = fillText.mock.calls.find(([, , y]) => y === 825);

    expect(dogNameCall?.[0]).not.toBe(longDogName);
    expect(dogNameCall?.[0]).toMatch(/\.\.\.$/);
    expect(showNameCall?.[0]).not.toBe(longShowName);
    expect(showNameCall?.[0]).toMatch(/\.\.\.$/);
  });

  it('keeps the class name at least 70px below placement when both are present', async () => {
    const fillText = vi.fn();
    const canvas = {
      getContext: vi.fn(() => ({
        fillRect: vi.fn(),
        fillText,
        drawImage: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        clip: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        measureText: vi.fn((text: string) => ({ width: text.length * 12 })),
        set fillStyle(_value: string) {},
        set font(_value: string) {},
        set textAlign(_value: CanvasTextAlign) {},
      })),
      toBlob: vi.fn((cb: BlobCallback) => cb(new Blob(['png'], { type: 'image/png' }))),
    } as unknown as HTMLCanvasElement;
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);

    await renderResultCardImage(makeModel());

    const placementCall = fillText.mock.calls.find(([text]) => text === '1st');
    const classCall = fillText.mock.calls.find(([text]) => text === 'Container Novice A');

    expect(placementCall).toBeDefined();
    expect(classCall).toBeDefined();
    expect((classCall?.[2] as number) - (placementCall?.[2] as number)).toBeGreaterThanOrEqual(70);
  });

  it('draws an in-canvas placeholder when photo loading fails', async () => {
    const drawImage = vi.fn();
    const fillText = vi.fn();

    vi.stubGlobal(
      'Image',
      class {
        crossOrigin = '';
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;

        set src(_value: string) {
          queueMicrotask(() => this.onerror?.());
        }
      }
    );

    const canvas = {
      getContext: vi.fn(() => ({
        fillRect: vi.fn(),
        fillText,
        drawImage,
        beginPath: vi.fn(),
        arc: vi.fn(),
        clip: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        measureText: vi.fn((text: string) => ({ width: text.length * 12 })),
        set fillStyle(_value: string) {},
        set font(_value: string) {},
        set textAlign(_value: CanvasTextAlign) {},
      })),
      toBlob: vi.fn((cb: BlobCallback) => cb(new Blob(['png'], { type: 'image/png' }))),
    } as unknown as HTMLCanvasElement;
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);

    await renderResultCardImage(makeModel({ photoUrl: 'https://example.test/missing.jpg' }));

    expect(drawImage).not.toHaveBeenCalled();
    expect(fillText).toHaveBeenCalledWith('D', expect.any(Number), expect.any(Number));
  });
});
