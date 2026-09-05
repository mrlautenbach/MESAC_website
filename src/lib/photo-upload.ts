import sharp from "sharp";
import { put, del } from "@vercel/blob";
import { randomUUID } from "crypto";
import { ACCEPTED_IMAGE_EXTENSIONS, ACCEPTED_IMAGE_TYPES, MAX_PHOTO_BYTES } from "@/lib/validation";

export class PhotoValidationError extends Error {}

const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 82;

// Re-encodes every upload to a fresh JPEG at a capped resolution. This:
//  - strips EXIF/GPS and any other embedded metadata,
//  - neutralizes files that are disguised as images but aren't
//    (sharp will fail to parse them, regardless of their claimed MIME type
//    or file extension),
//  - keeps event pages fast by capping resolution/file size.
export async function processAndStorePhoto(file: File, eventId: string) {
  // Some OS/browser combinations report no MIME type, or a generic one like
  // "application/octet-stream", for a valid image file that lacks a
  // registered file association - fall back to the extension in that case
  // rather than rejecting a real photo. A MIME type that positively claims
  // to be something else is still rejected. Sharp validates the actual
  // bytes below regardless of what either check says.
  const hasAcceptedType = ACCEPTED_IMAGE_TYPES.includes(file.type);
  const hasAcceptedExtension = ACCEPTED_IMAGE_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
  const unknownType = !file.type || file.type === "application/octet-stream";
  if (!hasAcceptedType && !(unknownType && hasAcceptedExtension)) {
    throw new PhotoValidationError("That file type isn't supported. Please upload a JPEG, PNG, WebP, or HEIC photo.");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new PhotoValidationError("That photo is too large. Please upload a file under 15MB.");
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  let output;
  try {
    output = await sharp(inputBuffer, { limitInputPixels: 268_402_689 })
      .rotate() // apply EXIF orientation before it gets stripped
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      // JPEG has no alpha channel, so any transparency (e.g. a logo PNG)
      // gets flattened onto a solid color - sharp defaults that to black;
      // white matches this site's light background instead.
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new PhotoValidationError(
      "That file couldn't be read as an image. It may be corrupted or not actually a photo."
    );
  }

  const pathname = `events/${eventId}/${randomUUID()}.jpg`;
  const blob = await put(pathname, output.data, {
    access: "public",
    contentType: "image/jpeg",
    addRandomSuffix: false,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    width: output.info.width,
    height: output.info.height,
  };
}

export async function deleteStoredPhoto(pathname: string) {
  await del(pathname);
}
