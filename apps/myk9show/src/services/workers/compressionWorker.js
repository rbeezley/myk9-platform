/**
 * Web Worker for image compression and optimization
 * Runs compression operations off the main thread for better performance
 */

// Import compression libraries (you would need to include these)
// For example: import imageCompression from 'browser-image-compression';

self.onmessage = async function(event) {
  const { file, quality, format } = event.data;
  
  try {
    let compressedFile = file;
    
    // Image compression based on file type
    if (file.type.startsWith('image/')) {
      compressedFile = await compressImage(file, quality, format);
    } else if (file.type === 'application/javascript' || file.type === 'text/css') {
      compressedFile = await compressText(file);
    }
    
    self.postMessage({
      success: true,
      compressedFile,
      originalSize: file.size,
      compressedSize: compressedFile.size,
      compressionRatio: (file.size - compressedFile.size) / file.size
    });
  } catch (error) {
    self.postMessage({
      success: false,
      error: error.message,
      compressedFile: file // Fallback to original
    });
  }
};

async function compressImage(file, quality = 80, targetFormat) {
  return new Promise((resolve, reject) => {
    const canvas = new OffscreenCanvas(1, 1);
    const ctx = canvas.getContext('2d');
    
    const img = new Image();
    img.onload = () => {
      // Calculate new dimensions while maintaining aspect ratio
      const maxWidth = 1920;
      const maxHeight = 1080;
      
      let { width, height } = img;
      
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw and compress
      ctx.drawImage(img, 0, 0, width, height);
      
      const outputFormat = targetFormat || (file.type === 'image/png' ? 'image/png' : 'image/jpeg');
      const qualityValue = quality / 100;
      
      canvas.convertToBlob({ type: outputFormat, quality: qualityValue })
        .then(resolve)
        .catch(reject);
    };
    
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function compressText(file) {
  // For text files (CSS, JS), we can use gzip compression
  const text = await file.text();
  
  // Simple text optimization (remove comments, whitespace)
  let optimized = text
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove CSS comments
    .replace(/\/\/.*$/gm, '') // Remove JS single-line comments
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();
  
  return new Blob([optimized], { type: file.type });
}

// Error handling
self.onerror = function(error) {
  self.postMessage({
    success: false,
    error: 'Worker error: ' + error.message
  });
};