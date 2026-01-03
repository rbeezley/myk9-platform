// Utility to convert a data URL to a Blob URL for immediate image preview
export function getDisplayImageUrl(imageUrl: string | null | undefined): string {
  if (!imageUrl) return '';
  if (typeof imageUrl === 'string' && imageUrl.startsWith('data:image/')) {
    try {
      const arr = imageUrl.split(','), match = arr[0].match(/:(.*?);/), mime = match?.[1] || 'image/jpeg', bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
      for (let i = 0; i < n; ++i) u8arr[i] = bstr.charCodeAt(i);
      const blob = new Blob([u8arr], { type: mime });
      return URL.createObjectURL(blob);
    } catch { return imageUrl; }
  }
  return imageUrl;
}
