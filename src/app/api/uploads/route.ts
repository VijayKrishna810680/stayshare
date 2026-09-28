import { api } from "@/lib/api";
import { requireUser } from "@/lib/auth/current";
import { badRequest } from "@/lib/errors";
import { PURPOSES, saveUpload, type UploadPurpose } from "@/services/storage";

/** Multipart upload: fields `file` and `purpose`. Type is verified by magic bytes, size-limited. */
export const POST = api(
  async (req) => {
    const u = await requireUser();
    const fd = await req.formData();
    const file = fd.get("file");
    const purpose = String(fd.get("purpose") ?? "");
    if (!(file instanceof File)) throw badRequest("No file uploaded");
    if (!(purpose in PURPOSES)) throw badRequest("Invalid purpose");
    if (["PROPERTY_IMAGE", "ROOM_IMAGE", "PROPERTY_DOC", "KYC"].includes(purpose) && !u.isOwner && !u.isAdmin) throw badRequest("Only property partners can upload property files");
    const saved = await saveUpload(file, purpose as UploadPurpose, u.id);
    return { id: saved.id, url: saved.url, fileName: saved.fileName, mimeType: saved.mimeType };
  },
  { rateLimit: { limit: 60, windowSec: 600 } },
);
