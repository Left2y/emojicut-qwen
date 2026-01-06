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
 * Force grid splitting if only one large segment is detected.
 * This is a fallback for when AI generates a grid but our detector sees it as one blob.
 */
const forceGridSplit = (rect: Rect, width: number, height: number): Rect[] => {
    // If the detected rect covers most of the image, assume it's a grid
    const areaRatio = ((rect.maxX - rect.minX) * (rect.maxY - rect.minY)) / (width * height);
    
    if (areaRatio > 0.5) {
        // Assume 4x4 grid (16 stickers)
        const cols = 4;
        const rows = 4;
        const newRects: Rect[] = [];
        const cellW = width / cols;
        const cellH = height / rows;
        
        // Add some margin to avoid cutting edges
        const margin = 10; 

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                newRects.push({
                    minX: Math.floor(x * cellW + margin),
                    maxX: Math.floor((x + 1) * cellW - margin),
                    minY: Math.floor(y * cellH + margin),
                    maxY: Math.floor((y + 1) * cellH - margin)
                });
            }
        }
        return newRects;
    }
    return [rect];
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
 * Main function to process the sticker sheet.
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

  // --- Advanced Segmentation Logic: Erosion -> Detection -> Expansion ---

  // 1. Create a binary map (1 = foreground, 0 = background)
  const binaryMap = new Uint8Array(width * height);
  const erosionMap = new Uint8Array(width * height);
  
  // High threshold to treat light shadows as background
  const bgThreshold = 240; 

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    // If pixel is NOT background (i.e., it is part of a sticker)
    if (!isBackground(data[idx], data[idx + 1], data[idx + 2], data[idx + 3], bgThreshold)) {
      binaryMap[i] = 1;
    } else {
      binaryMap[i] = 0;
    }
  }

  // 2. Perform Erosion (shrink objects to break connections)
  // Kernel size 3 (checking 1 pixel radius)
  onProgress("Refining shapes...");
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (binaryMap[idx] === 1) {
        // Check neighbors. If any neighbor is background, erode this pixel.
        // Using 4-connectivity for speed
        if (binaryMap[idx - 1] === 0 || binaryMap[idx + 1] === 0 || 
            binaryMap[idx - width] === 0 || binaryMap[idx + width] === 0) {
            erosionMap[idx] = 0;
        } else {
            erosionMap[idx] = 1;
        }
      }
    }
  }

  // 3. Detect Connected Components on the ERODED map
  const rawRects: Rect[] = [];
  const visited = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) { 
    for (let x = 0; x < width; x++) {
      const visitIdx = y * width + x;
      if (visited[visitIdx] || erosionMap[visitIdx] === 0) continue;

      // Found a component
      let minX = x, maxX = x, minY = y, maxY = y;
      const stack = [[x, y]];
      visited[visitIdx] = 1;
      let pixelCount = 0;

      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        pixelCount++;

        const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = ny * width + nx;
            if (erosionMap[nIdx] === 1 && visited[nIdx] === 0) {
              visited[nIdx] = 1;
              stack.push([nx, ny]);
            }
          }
        }
      }

      // Filter noise
      if (pixelCount > 100 && (maxX - minX) > 20 && (maxY - minY) > 20) {
        // 4. RESTORE (Expand) the rect to compensate for erosion
        // We eroded by ~1-2 pixels effectively, but we add more padding to be safe
        // Also expand to include the original non-eroded boundaries if possible
        const padding = 10; 
        rawRects.push({
            minX: Math.max(0, minX - padding),
            maxX: Math.min(width, maxX + padding),
            minY: Math.max(0, minY - padding),
            maxY: Math.min(height, maxY + padding)
        });
      }
    }
  }

  onProgress(`Detected ${rawRects.length} potential stickers...`);

  // 5. Smart Merge
  let mergedRects = mergeRects(rawRects, 5); 

  // --- ULTIMATE FALLBACK: Smart Grid Split ---
  // If we detect fewer than 10 stickers, it implies heavy sticking or background noise.
  // We force a 4x4 split and then refine each cell.
  if (mergedRects.length < 10) {
     onProgress("⚠️ Sticking detected. Forcing 4x4 Grid Split...");
     mergedRects = [];
     
     const cols = 4;
     const rows = 4;
     const cellW = width / cols;
     const cellH = height / rows;
     const margin = 15; // Cut inside the cell to avoid neighbor's limbs

     for (let r = 0; r < rows; r++) {
         for (let c = 0; c < cols; c++) {
             // Define the cell box
             const cellRect = {
                 minX: Math.floor(c * cellW + margin),
                 maxX: Math.floor((c + 1) * cellW - margin),
                 minY: Math.floor(r * cellH + margin),
                 maxY: Math.floor((r + 1) * cellH - margin)
             };
             
             // Inside this cell, find the largest object (the sticker)
             // This removes tiny debris from neighbors
             const refined = findLargestObjectInRect(cellRect, binaryMap, width);
             if (refined) {
                 mergedRects.push(refined);
             } else {
                 mergedRects.push(cellRect); // Fallback to raw cell
             }
         }
     }
  }

  onProgress(`Finalizing ${mergedRects.length} stickers...`);

  const finalSegments: StickerSegment[] = [];
  
  for (let i = 0; i < mergedRects.length; i++) {
    const rect = mergedRects[i];
    
    // Slight expansion for final extraction
    const extractRect = {
        minX: Math.max(0, rect.minX - 5),
        maxX: Math.min(width, rect.maxX + 5),
        minY: Math.max(0, rect.minY - 5),
        maxY: Math.min(height, rect.maxY + 5)
    };

    const segment = extractStickerFromRect(canvas, extractRect, `sticker_${i + 1}`);
    if (segment) {
        finalSegments.push(segment);
    }
  }

  return finalSegments;
};

/**
 * Helper: Find the bounding box of the largest connected component within a given rect.
 * Used to "clean up" a grid cell.
 */
function findLargestObjectInRect(rect: Rect, binaryMap: Uint8Array, fullWidth: number): Rect | null {
    let bestRect: Rect | null = null;
    let maxPixels = 0;
    
    // Create a local visited map for this cell
    const visited = new Set<number>();
    
    for (let y = rect.minY; y < rect.maxY; y++) {
        for (let x = rect.minX; x < rect.maxX; x++) {
            const idx = y * fullWidth + x;
            if (binaryMap[idx] === 1 && !visited.has(idx)) {
                // Found a component
                let minX = x, maxX = x, minY = y, maxY = y;
                let count = 0;
                const stack = [idx];
                visited.add(idx);
                
                while(stack.length) {
                    const curr = stack.pop()!;
                    const cx = curr % fullWidth;
                    const cy = Math.floor(curr / fullWidth);
                    
                    if (cx < minX) minX = cx;
                    if (cx > maxX) maxX = cx;
                    if (cy < minY) minY = cy;
                    if (cy > maxY) maxY = cy;
                    count++;
                    
                    // Check neighbors (only within the cell bounds!)
                    const neighbors = [curr-1, curr+1, curr-fullWidth, curr+fullWidth];
                    for (const n of neighbors) {
                        const nx = n % fullWidth;
                        const ny = Math.floor(n / fullWidth);
                        if (nx >= rect.minX && nx < rect.maxX && ny >= rect.minY && ny < rect.maxY) {
                            if (binaryMap[n] === 1 && !visited.has(n)) {
                                visited.add(n);
                                stack.push(n);
                            }
                        }
                    }
                }
                
                if (count > maxPixels) {
                    maxPixels = count;
                    bestRect = { minX, maxX, minY, maxY };
                }
            }
        }
    }
    
    return bestRect;
}