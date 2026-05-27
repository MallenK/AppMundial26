import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY ?? "",
    secretAccessKey: process.env.R2_SECRET_KEY ?? "",
  },
});

const BUCKET = process.env.R2_BUCKET ?? "mundial26-photos";
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function generateR2Key(matchId: number, userId: string, ext: string): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `photos/${date}/${matchId}/${userId}/${randomUUID()}.${ext}`;
}

export function getPublicUrl(key: string): string {
  // r2.dev public bucket URL — configure in Cloudflare dashboard
  return `https://pub-${process.env.CF_ACCOUNT_ID}.r2.dev/${key}`;
}

/**
 * Generate a presigned PUT URL so the frontend uploads directly to R2.
 * This avoids streaming the file through our backend (saves RAM + bandwidth).
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string
): Promise<{ uploadUrl: string; publicUrl: string }> {
  if (!ALLOWED_TYPES.includes(contentType)) {
    throw new Error(`Content type not allowed: ${contentType}`);
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLengthRange: { min: 1, max: MAX_SIZE_BYTES } as any,
    Metadata: { uploadedAt: new Date().toISOString() },
  });

  const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 300 }); // 5 min
  const publicUrl = getPublicUrl(key);

  return { uploadUrl, publicUrl };
}

/**
 * Delete a photo from R2.
 */
export async function deletePhoto(key: string): Promise<void> {
  await r2.send(
    new DeleteObjectCommand({ Bucket: BUCKET, Key: key })
  );
}

export function getExtensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return map[mimeType] ?? "jpg";
}
