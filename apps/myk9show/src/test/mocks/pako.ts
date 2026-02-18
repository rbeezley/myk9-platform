// Stub for pako compression library - used to satisfy Vite's static import analysis
// in tests. Tests that use pako mock it via vi.mock('pako', ...) in the test file.
export const deflate = () => new Uint8Array([]);
export const inflate = () => new Uint8Array([]);
export const gzip = () => new Uint8Array([]);
export const ungzip = () => new Uint8Array([]);
export default { deflate, inflate, gzip, ungzip };
