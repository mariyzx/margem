import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";

export const MAX_PDF_BYTES = 25 * 1024 * 1024;

export const PDF_UPLOAD_OPTIONS: MulterOptions = {
  limits: { fileSize: MAX_PDF_BYTES },
  defParamCharset: "utf8",
};
const PDF_MAGIC_BYTES = Buffer.from("%PDF-");

export function isPdfBuffer(buffer: Buffer): boolean {
  if (buffer.length < PDF_MAGIC_BYTES.length) return false;
  return buffer.subarray(0, PDF_MAGIC_BYTES.length).equals(PDF_MAGIC_BYTES);
}
