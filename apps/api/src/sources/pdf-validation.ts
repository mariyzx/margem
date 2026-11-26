export const MAX_PDF_BYTES = 25 * 1024 * 1024;
const PDF_MAGIC_BYTES = Buffer.from("%PDF-");

export function isPdfBuffer(buffer: Buffer): boolean {
  if (buffer.length < PDF_MAGIC_BYTES.length) return false;
  return buffer.subarray(0, PDF_MAGIC_BYTES.length).equals(PDF_MAGIC_BYTES);
}
