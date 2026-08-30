import { put, del } from "@vercel/blob";
import { randomUUID } from "crypto";
import { ACCEPTED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from "@/lib/validation";

export class DocumentValidationError extends Error {}

const PDF_MAGIC_BYTES = Buffer.from("%PDF-");

// Unlike photos, a PDF can't be re-encoded to strip potential threats, so
// this instead checks the file actually starts with the PDF signature
// rather than trusting the client-supplied MIME type or file extension.
export async function processAndStoreDocument(file: File, eventId: string) {
  if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type)) {
    throw new DocumentValidationError("That file type isn't supported. Please upload a PDF.");
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new DocumentValidationError("That file is too large. Please upload a PDF under 20MB.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!buffer.subarray(0, 5).equals(PDF_MAGIC_BYTES)) {
    throw new DocumentValidationError("That file doesn't look like a valid PDF.");
  }

  const pathname = `events/${eventId}/documents/${randomUUID()}.pdf`;
  const blob = await put(pathname, buffer, {
    access: "public",
    contentType: "application/pdf",
    addRandomSuffix: false,
  });

  return { url: blob.url, pathname: blob.pathname };
}

export async function deleteStoredDocument(pathname: string) {
  await del(pathname);
}
