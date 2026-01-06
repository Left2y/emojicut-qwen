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
    const padding = 5; // Increased padding
    const strokeWidth = 6; 

    const width = source.width;
    const height = source.height;

    const finalX = Math.max(0, rect.minX - padding);
    const finalY = Math.max(0, rect.minY - padding);
    const finalW = Math.min(width - finalX, (rect.maxX - rect.minX) + padding * 2);
    const finalH = Math.min(height - finalY, (rect.maxY - rect.minY) + padding * 2);

    if (finalW <= 0 || finalH <= 0) return null;

    const segCanvas = document.createElement('canvas');
    segCanvas.width = finalW;
    segCanvas.height = finalH;
    const segCtx = segCanvas.getContext('2d');
    if (!segCtx) return null;

    segCtx.drawImage(
      source,
      finalX, finalY, finalW, finalH,
      0, 0, finalW, finalH
    );

    const segImageData = segCtx.getImageData(0, 0, finalW, finalH);
    const segPixels = segImageData.data;
    
    // Aggressive background removal
    for (let i = 0; i < segPixels.length; i += 4) {
      if (isBackground(segPixels[i], segPixels[i+1], segPixels[i+2], segPixels[i+3], 240)) {
        segPixels[i+3] = 0; 
      }
    }
    segCtx.putImageData(segImageData, 0, 0);

    // Silhouette & Stroke Logic
    const silhouetteCanvas = document.createElement('canvas');
    silhouetteCanvas.width = finalW;
    silhouetteCanvas.height = finalH;
    const sCtx = silhouetteCanvas.getContext('2d');
    if (!sCtx) return null;

    sCtx.drawImage(segCanvas, 0, 0);
    sCtx.globalCompositeOperation = 'source-in';
    sCtx.fillStyle = '#FFFFFF';
    sCtx.fillRect(0, 0, finalW, finalH);

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = finalW + (strokeWidth * 2);
    finalCanvas.height = finalH + (strokeWidth * 2);
    const fCtx = finalCanvas.getContext('2d');
    if (!fCtx) return null;

    fCtx.imageSmoothingEnabled = true;
    fCtx.imageSmoothingQuality = 'high';

    const steps = 24; 
    for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * 2 * Math.PI;
        const ox = strokeWidth + Math.cos(angle) * strokeWidth;
        const oy = strokeWidth + Math.sin(angle) * strokeWidth;
        fCtx.drawImage(silhouetteCanvas, ox, oy);
    }
    fCtx.drawImage(silhouetteCanvas, strokeWidth, strokeWidth);

    fCtx.globalCompositeOperation = 'source-over';
    fCtx.drawImage(segCanvas, strokeWidth, strokeWidth);

    return {
      id: crypto.randomUUID(),
      dataUrl: finalCanvas.toDataURL('image/png'),
      originalX: finalX,
      originalY: finalY,
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

  // 1. Binary Map Generation
  // Foreground = 1, Background = 0
  const binaryMap = new Uint8Array(width * height);
  const bgThreshold = 240; 

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    // Strict background check
    if (!isBackground(data[idx], data[idx + 1], data[idx + 2], data[idx + 3], bgThreshold)) {
      binaryMap[i] = 1;
    }
  }

  // 2. Heavy Erosion (Find Seeds)
  // We apply erosion multiple times to separate sticky objects
  onProgress("Applying erosion to separate stickers...");
  let currentMap = Float32Array.from(binaryMap); // Use Float for calculation if needed, but Uint8 is fine
  let tempMap = new Uint8Array(width * height);
  
  const erosionPasses = 4; // Aggressive erosion

  for (let pass = 0; pass < erosionPasses; pass++) {
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            if (currentMap[idx] === 1) {
                // If any neighbor is background, turn this to background
                if (currentMap[idx-1] === 0 || currentMap[idx+1] === 0 || 
                    currentMap[idx-width] === 0 || currentMap[idx+width] === 0) {
                    tempMap[idx] = 0;
                } else {
                    tempMap[idx] = 1;
                }
            } else {
                tempMap[idx] = 0;
            }
        }
    }
    // Swap maps
    currentMap = Float32Array.from(tempMap);
  }

  // 3. Find Connected Components (Seeds) on Eroded Map
  onProgress("Locating sticker cores...");
  const seeds: Rect[] = [];
  const visited = new Uint8Array(width * height);
  
  for (let i = 0; i < width * height; i++) {
      if (currentMap[i] === 1 && visited[i] === 0) {
          // Found a seed
          let minX = i % width, maxX = minX;
          let minY = Math.floor(i / width), maxY = minY;
          const stack = [i];
          visited[i] = 1;
          let count = 0;

          while(stack.length) {
              const curr = stack.pop()!;
              const cx = curr % width;
              const cy = Math.floor(curr / width);
              
              if (cx < minX) minX = cx;
              if (cx > maxX) maxX = cx;
              if (cy < minY) minY = cy;
              if (cy > maxY) maxY = cy;
              count++;

              const neighbors = [curr-1, curr+1, curr-width, curr+width];
              for(const n of neighbors) {
                  if (n >= 0 && n < width*height && currentMap[n] === 1 && visited[n] === 0) {
                      visited[n] = 1;
                      stack.push(n);
                  }
              }
          }

          if (count > 20) { // Filter noise
              seeds.push({ minX, maxX, minY, maxY });
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

      while(stack.length) {
          const curr = stack.pop()!;
          const cx = curr % width;
          const cy = Math.floor(curr / width);

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          // Check 8-neighbors for better coverage
          const neighbors = [
              curr-1, curr+1, curr-width, curr+width,
              curr-width-1, curr-width+1, curr+width-1, curr+width+1
          ];

          for (const n of neighbors) {
              if (n >= 0 && n < width*height) {
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
    const padding = 10;
    const extractRect = {
        minX: Math.max(0, rect.minX - padding),
        maxX: Math.min(width, rect.maxX + padding),
        minY: Math.max(0, rect.minY - padding),
        maxY: Math.min(height, rect.maxY + padding)
    };

    const segment = extractStickerFromRect(canvas, extractRect, `sticker_${i + 1}`);
    if (segment) {
        finalSegments.push(segment);
    }
  }
  
  return finalSegments;
};
