export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('We could not read that image. Please try another file.'));
    };
    reader.onerror = () =>
      reject(new Error('We could not read that image. Please try another file.'));
    reader.readAsDataURL(file);
  });
}

export async function resolvePdfCoverImageSrc(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:')) return url;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await fileToDataUrl(new File([blob], 'premium-cover', { type: blob.type }));
  } catch {
    return null;
  }
}
