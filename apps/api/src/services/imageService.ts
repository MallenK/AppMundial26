/**
 * Image service — local /uploads folder served as static files.
 *
 * ⚠️  IMPORTANTE: En Render free tier el filesystem es EFÍMERO.
 *     Las fotos se pierden en cada deploy/restart.
 *
 * Opciones para producción real:
 *   A) Render Starter ($7/mes) + Persistent Disk ($1/GB) → misma lógica
 *   B) Migrar a Supabase Storage (1 GB gratis, permanente) — sin coste
 *
 * Para MVP / desarrollo local: funciona perfectamente.
 */

import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import multer, { StorageEngine } from "multer";

export const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

// Create dir if missing
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const storage: StorageEngine = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo no permitido: ${file.mimetype}`));
    }
  },
});

/** Returns the public URL for a stored file */
export function getPublicUrl(filename: string): string {
  const base = (process.env.BACKEND_URL ?? "http://localhost:3001").replace(/\/$/, "");
  return `${base}/uploads/${filename}`;
}

/** Delete a file from disk */
export function deletePhoto(filename: string): void {
  try {
    const filepath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  } catch (err: any) {
    console.warn("[imageService] Delete error:", err.message);
  }
}

/** Extract filename from a full URL */
export function filenameFromUrl(url: string): string {
  return url.split("/").pop() ?? "";
}
