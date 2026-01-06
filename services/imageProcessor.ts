import { StickerSegment } from '../types';

export interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Loads an image from a File object.
 */
export const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
};

/**
 * Enhanced background check using tolerance.
 * Checks if a pixel is close to white (background).
 */
const isBackground = (r: number, g: number, b: number, a: number, threshold = 230): boolean => {
  if (a < 20) return true; // Transparent
  // Check if pixel is very bright (close to white)
  return r > threshold && g > threshold && b > threshold;
};

/**
 * Merges bounding boxes that are spatially close to each other.
 */
const mergeRects = (rects: Rect[], distanceThreshold: number): Rect[] => {
  let merged = [...rects];
  let changed = true;

  while (changed) {
    changed = false;
    const newMerged: Rect[] = [];
    const visited = new Set<number>();

    for (let i = 0; i < merged.length; i++) {
      if (visited.has(i)) continue;

      let current = { ...merged[i] };
      visited.add(i);

      for (let j = i + 1; j < merged.length; j++) {
        if (visited.has(j)) continue;

        const other = merged[j];

        const xDist = Math.max(0, current.minX - other.maxX, other.minX - current.maxX);
        const yDist = Math.max(0, current.minY - other.maxY, other.minY - current.maxY);

        if (xDist < distanceThreshold && yDist < distanceThreshold) {
          current.minX = Math.min(current.minX, other.minX);
          current.minY = Math.min(current.minY, other.minY);
          current.maxX = Math.max(current.maxX, other.maxX);
          current.maxY = Math.max(current.maxY, other.maxY);
          visited.add(j);
          changed = true;
        }
      }
      newMerged.push(current);
    }
    merged = newMerged;
  }
  return merged;
};

/**
 * Extracts a specific region from an image/canvas, removes background, and adds a white stroke.
 */
export const extractStickerFromRect = (
  source: HTMLImageElement | HTMLCanvasElement,
  rect: Rect,
  defaultName: string = 'sticker'
): StickerSegment | null => {
  // 1. First Pass: Get the raw crop from the calculated rect
  const rawX = Math.max(0, rect.minX);
  const rawY = Math.max(0, rect.minY);
  const rawW = Math.min(source.width - rawX, rect.maxX - rect.minX);
  const rawH = Math.min(source.height - rawY, rect.maxY - rect.minY);

  if (rawW <= 0 || rawH <= 0) return null;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = rawW;
  tempCanvas.height = rawH;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  if (!tempCtx) return null;

  tempCtx.drawImage(
    source,
    rawX, rawY, rawW, rawH,
    0, 0, rawW, rawH
  );

  // 2. Second Pass: Find the TRUE bounding box of the non-transparent pixels
  // This eliminates any dead space if the initial rect was too loose
  const imgData = tempCtx.getImageData(0, 0, rawW, rawH);
  const tempData = imgData.data;
  let minX = rawW, maxX = 0, minY = rawH, maxY = 0;
  let found = false;

  // Aggressive background check during bounding box search
  for (let y = 0; y < rawH; y++) {
    for (let x = 0; x < rawW; x++) {
      const i = (y * rawW + x) * 4;
      // Check for non-transparent AND non-white-ish pixels
      const r = tempData[i], g = tempData[i + 1], b = tempData[i + 2], a = tempData[i + 3];
      if (a > 20 && !isBackground(r, g, b, a, 240)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        found = true;
      }
    }
  }

  if (!found) return null; // Empty or pure white rect

  // 3. Final Crop Dimensions
  const contentW = maxX - minX + 1;
  const contentH = maxY - minY + 1;

  // Add consistent small padding for the sticker border effect
  const stickerPadding = 16; // Moderate padding for the white border
  const finalW = contentW + (stickerPadding * 2);
  const finalH = contentH + (stickerPadding * 2);

  const segCanvas = document.createElement('canvas');
  segCanvas.width = finalW;
  segCanvas.height = finalH;
  const segCtx = segCanvas.getContext('2d');
  if (!segCtx) return null;

  // Draw the content centered in the padded canvas
  segCtx.drawImage(
    tempCanvas,
    minX, minY, contentW, contentH,
    stickerPadding, stickerPadding, contentW, contentH
  );

  // CRITICAL FIX: Remove white background pixels to ensure die-cut shape
  // Otherwise the sticker is just a white box
  const segImageData = segCtx.getImageData(0, 0, finalW, finalH);
  const data = segImageData.data;
  const bgThreshold = 250; // Very high threshold for pure white AI background

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Simple color keying: if close to white, make transparent
    if (a > 20 && r > bgThreshold && g > bgThreshold && b > bgThreshold) {
      data[i + 3] = 0;
    }
  }
  segCtx.putImageData(segImageData, 0, 0);

  // 4. White Silhouette & Stroke
  const strokeWidth = 6;

  // Create silhouette from the actual content
  const silhouetteCanvas = document.createElement('canvas');
  silhouetteCanvas.width = finalW;
  silhouetteCanvas.height = finalH;
  const sCtx = silhouetteCanvas.getContext('2d');
  if (!sCtx) return null;

  sCtx.drawImage(segCanvas, 0, 0);
  sCtx.globalCompositeOperation = 'source-in';
  sCtx.fillStyle = '#FFFFFF';
  sCtx.fillRect(0, 0, finalW, finalH);

  // Final composition canvas
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = finalW + (strokeWidth * 2);
  finalCanvas.height = finalH + (strokeWidth * 2);
  const fCtx = finalCanvas.getContext('2d');
  if (!fCtx) return null;

  fCtx.imageSmoothingEnabled = true;
  fCtx.imageSmoothingQuality = 'high';

  // Draw stroke (multiple passes for thickness)
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const ox = strokeWidth + Math.cos(angle) * strokeWidth;
    const oy = strokeWidth + Math.sin(angle) * strokeWidth;
    fCtx.drawImage(silhouetteCanvas, ox, oy);
  }
  // Middle fill for stroke
  fCtx.drawImage(silhouetteCanvas, strokeWidth, strokeWidth);

  // Draw original segmented content on top
  fCtx.globalCompositeOperation = 'source-over';
  fCtx.drawImage(segCanvas, strokeWidth, strokeWidth);

  return {
    id: crypto.randomUUID(),
    dataUrl: finalCanvas.toDataURL('image/png'),
    originalX: rawX + minX, // Approximate original position
    originalY: rawY + minY,
    width: finalCanvas.width,
    height: finalCanvas.height,
    name: defaultName,
    isNaming: false
  };
};

/**
 * Advanced Sticker Segmentation: Erosion -> Seed Detection -> Region Growing
 */
export const processStickerSheet = async (
  image: HTMLImageElement,
  onProgress: (msg: string) => void
): Promise<StickerSegment[]> => {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) throw new Error("Could not get canvas context");

  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { width, height, data } = imageData;

  onProgress("Preprocessing image...");

  // 1. Binary Map Generation & Pre-processing (Closing)
  // Foreground = 1, Background = 0
  const binaryMap = new Uint8Array(width * height);
  const bgThreshold = 240;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    if (!isBackground(data[idx], data[idx + 1], data[idx + 2], data[idx + 3], bgThreshold)) {
      binaryMap[i] = 1;
    }
  }

  // --- Step 2: "Opening" Strategy (Erosion then Dilation/Growth) ---
  // Goal: Break thin connections between stickers by Eroding first.

  // 1. Heavy Erosion to find "cores" (Seeds)
  onProgress("Separating touching stickers...");

  let currentMap = Float32Array.from(binaryMap);
  let tempMap = new Uint8Array(width * height);
  const erosionPasses = 6; // Aggressive erosion to separate connected stickers

  for (let pass = 0; pass < erosionPasses; pass++) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (currentMap[idx] === 1) {
          // Strict 4-neighbor erosion
          if (currentMap[idx - 1] === 0 || currentMap[idx + 1] === 0 ||
            currentMap[idx - width] === 0 || currentMap[idx + width] === 0) {
            tempMap[idx] = 0;
          } else {
            tempMap[idx] = 1;
          }
        } else {
          tempMap[idx] = 0;
        }
      }
    }
    currentMap = Float32Array.from(tempMap);
  }


  // 3. Find Connected Components (Seeds) & Merge Close Seeds
  onProgress("Locating cores...");
  const seeds: Rect[] = [];
  const visited = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    if (currentMap[i] === 1 && visited[i] === 0) {
      // Found a seed
      let minX = i % width, maxX = minX;
      let minY = Math.floor(i / width), maxY = minY;
      const stack = [i];
      visited[i] = 1;

      while (stack.length) {
        const curr = stack.pop()!;
        const cx = curr % width;
        const cy = Math.floor(curr / width);

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [curr - 1, curr + 1, curr - width, curr + width];
        for (const n of neighbors) {
          if (n >= 0 && n < width * height && currentMap[n] === 1 && visited[n] === 0) {
            visited[n] = 1;
            stack.push(n);
          }
        }
      }

      // Merge Logic: If this seed is very close to an existing seed, merge them
      // This prevents "Head" and "Body" from being separate seeds
      const newSeed = { minX, maxX, minY, maxY };
      let merged = false;

      for (let s = 0; s < seeds.length; s++) {
        const existing = seeds[s];
        // Check distance between bounding boxes
        const xDist = Math.max(0, newSeed.minX - existing.maxX, existing.minX - newSeed.maxX);
        const yDist = Math.max(0, newSeed.minY - existing.maxY, existing.minY - newSeed.maxY);

        // Threshold: 30px (If parts are within 30px, they belong to the same person)
        if (xDist < 30 && yDist < 30) {
          existing.minX = Math.min(existing.minX, newSeed.minX);
          existing.maxX = Math.max(existing.maxX, newSeed.maxX);
          existing.minY = Math.min(existing.minY, newSeed.minY);
          existing.maxY = Math.max(existing.maxY, newSeed.maxY);
          merged = true;
          break;
        }
      }

      if (!merged) {
        seeds.push(newSeed);
      }
    }
  }

  // 4. Region Growing (Restore Boundaries)
  // For each seed, we expand back to the ORIGINAL binaryMap boundaries
  onProgress(`Restoring ${seeds.length} stickers...`);

  const finalRects: Rect[] = [];

  // To prevent regions from growing into each other, we use a global claimed map
  const globalClaimed = new Uint8Array(width * height);

  for (const seed of seeds) {
    // Start BFS from the center of the seed
    const centerX = Math.floor((seed.minX + seed.maxX) / 2);
    const centerY = Math.floor((seed.minY + seed.maxY) / 2);
    const startIdx = centerY * width + centerX;

    if (binaryMap[startIdx] === 0) continue; // Should not happen

    let minX = centerX, maxX = centerX;
    let minY = centerY, maxY = centerY;

    const stack = [startIdx];
    globalClaimed[startIdx] = 1;

    while (stack.length) {
      const curr = stack.pop()!;
      const cx = curr % width;
      const cy = Math.floor(curr / width);

      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      // Check 8-neighbors for better coverage
      const neighbors = [
        curr - 1, curr + 1, curr - width, curr + width,
        curr - width - 1, curr - width + 1, curr + width - 1, curr + width + 1
      ];

      for (const n of neighbors) {
        if (n >= 0 && n < width * height) {
          // Crucial: Only grow if it's foreground in ORIGINAL binaryMap AND not claimed by another sticker
          if (binaryMap[n] === 1 && globalClaimed[n] === 0) {
            globalClaimed[n] = 1;
            stack.push(n);
          }
        }
      }
    }

    finalRects.push({ minX, maxX, minY, maxY });
  }

  // 5. Final Extraction
  const finalSegments: StickerSegment[] = [];
  // Sort by position (top-left to bottom-right) to keep order
  finalRects.sort((a, b) => (a.minY - b.minY) * 1000 + (a.minX - b.minX));

  for (let i = 0; i < finalRects.length; i++) {
    const rect = finalRects[i];

    // Add a safe padding (but check boundaries)
    // Pass exact detected bounds, padding is handled inside extractStickerFromRect visually
    const extractRect = {
      minX: rect.minX,
      maxX: rect.maxX,
      minY: rect.minY,
      maxY: rect.maxY
    };

    const segment = extractStickerFromRect(canvas, extractRect, `sticker_${i + 1}`);
    if (segment) {
      finalSegments.push(segment);
    }
  }

  return finalSegments;
};
