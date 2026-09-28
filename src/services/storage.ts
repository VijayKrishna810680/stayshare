import "server-only";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { db } from "@/db";
import { fileUploads } from "@/db/schema";
import { env } from "@/lib/env";
import { badRequest } from "@/lib/errors";

/**
 * File storage. The "local" driver writes to STORAGE_DIR (mount a persistent volume in production).
 * An S3/GCS/Azure driver can be added by implementing put/get with the same signature.
 * Files are served only via /api/files/[id], which enforces authorisation for PRIVATE files.
 */
const ALLOWED: Record<string, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp"],
  document: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
};

// Magic-byte sniffing so a renamed executable can't be uploaded as an "image".
function sniff(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  return null;
}

export const PURPOSES = {
  PROPERTY_IMAGE: { kind: "image", visibility: "PUBLIC" },
  ROOM_IMAGE: { kind: "image", visibility: "PUBLIC" },
  REVIEW_IMAGE: { kind: "image", visibility: "PUBLIC" },
  AVATAR: { kind: "image", visibility: "PUBLIC" },
  ID_PROOF: { kind: "document", visibility: "PRIVATE" },
  KYC: { kind: "document", visibility: "PRIVATE" },
  PROPERTY_DOC: { kind: "document", visibility: "PRIVATE" },
  TICKET_ATTACHMENT: { kind: "document", visibility: "PRIVATE" },
} as const;
export type UploadPurpose = keyof typeof PURPOSES;

export async function saveUpload(file: File, purpose: UploadPurpose, uploadedBy: string) {
  const conf = PURPOSES[purpose];
  if (!conf) throw badRequest("Unknown upload purpose");
  const maxBytes = env.maxUploadMb * 1024 * 1024;
  if (file.size > maxBytes) throw badRequest(`File is too large (max ${env.maxUploadMb} MB)`);
  if (file.size === 0) throw badRequest("File is empty");
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniff(buf);
  if (!mime || !ALLOWED[conf.kind]!.includes(mime)) throw badRequest(conf.kind === "image" ? "Only JPG, PNG or WEBP images are allowed" : "Only JPG, PNG, WEBP or PDF files are allowed");
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[mime];
  const key = `${conf.visibility.toLowerCase()}/${purpose.toLowerCase()}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  const full = path.join(env.storageDir, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf);
  const [row] = await db
    .insert(fileUploads)
    .values({
      storageKey: key,
      fileName: file.name.replace(/[^\w.\- ]/g, "_").slice(0, 120) || "upload",
      mimeType: mime,
      sizeBytes: file.size,
      purpose,
      visibility: conf.visibility,
      uploadedBy,
    })
    .returning();
  return { ...row!, url: `/api/files/${row!.id}` };
}

export async function readStored(storageKey: string) {
  const full = path.resolve(env.storageDir, storageKey);
  if (!full.startsWith(path.resolve(env.storageDir))) throw badRequest("Invalid key");
  return readFile(full);
}
