import { ApiError } from "./errors";

const dataUrl = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i;
const maxBytes = 500_000;

export function decodePhoto(value: string): { bytes: Uint8Array; type: string } {
  const match = dataUrl.exec(value.trim());
  if (!match) throw new ApiError(400, "Use a JPEG, PNG, or WebP photo.");
  const bytes = Uint8Array.from(Buffer.from(match[2].replace(/\s/g, ""), "base64"));
  if (bytes.length < 32 || bytes.length > maxBytes) {
    throw new ApiError(400, "That photo is too large. Use one under 500 KB.");
  }
  const type = match[1].toLowerCase();
  if (!signatureMatches(type, bytes)) throw new ApiError(400, "That file is not a readable photo.");
  return { bytes, type };
}

export function photoBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === "string") {
    const hex = value.startsWith("\\x") ? value.slice(2) : "";
    if (hex) return Uint8Array.from(Buffer.from(hex, "hex"));
  }
  if (value && typeof value === "object" && ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (value && typeof value === "object" && "data" in value && Array.isArray((value as { data: unknown }).data)) {
    return Uint8Array.from((value as { data: number[] }).data);
  }
  throw new ApiError(500, "Could not read the saved photo.");
}

function signatureMatches(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (type === "image/webp") {
    return (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  return false;
}
