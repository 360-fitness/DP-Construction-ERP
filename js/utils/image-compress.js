// =============================================================
// IMAGE COMPRESSION UTIL
// Firestore documents have a 1MB hard limit, and no Cloud Storage
// bucket is available on the Spark (free) plan. So receipts get
// compressed client-side and stored as a base64 string directly in
// the expense/purchase document — fine for phone photos of receipts,
// not for huge multi-page scans. If compression can't get a file
// under the size cap, the caller should skip storing it and tell
// the user (rather than silently truncating or failing later).
// =============================================================

const MAX_DIMENSION = 1000; // px, longest side
const MAX_BYTES = 700 * 1024; // ~700KB, leaves headroom under Firestore's 1MB doc cap

// Returns a base64 data URL string, or null if the file couldn't be
// compressed under the size limit (caller should warn the user).
export async function compressImageToBase64(file) {
  if (!file.type.startsWith("image/")) return null;

  const bitmap = await loadImage(file);
  const { width, height } = scaledDimensions(bitmap.width, bitmap.height, MAX_DIMENSION);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);

  // Step quality down until it fits, rather than picking one value blind.
  for (const quality of [0.75, 0.6, 0.45, 0.3]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (estimateBase64Bytes(dataUrl) <= MAX_BYTES) return dataUrl;
  }
  return null; // even the lowest quality was too big
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function scaledDimensions(w, h, maxDim) {
  if (w <= maxDim && h <= maxDim) return { width: w, height: h };
  const ratio = w > h ? maxDim / w : maxDim / h;
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

function estimateBase64Bytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}
