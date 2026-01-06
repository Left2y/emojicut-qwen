import React, { useState, useRef } from 'react';
import { RefreshCw, Download, Loader2, PlusCircle, ArrowLeft } from 'lucide-react';
import { ProcessingStatus, StickerSegment, AppMode } from './types';
import { loadImage, processStickerSheet, extractStickerFromRect, Rect } from './services/imageProcessor';
import { generateStickerName, generateStickerSheet } from './services/qwenService';
import ManualCropModal from './components/ManualCropModal';
import CutePrinter2D from './components/CutePrinter2D';
import StickerStack from './components/StickerStack';
import JSZip from 'jszip';
import './retro.css';

const App: React.FC = () => {
  const [appMode, setAppMode] = useState<AppMode>('generate');
  const [status, setStatus] = useState<ProcessingStatus>({ stage: 'idle', progress: 0, message: '' });
  const [segments, setSegments] = useState<StickerSegment[]>([]);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [originalImageEl, setOriginalImageEl] = useState<HTMLImageElement | null>(null);
  const [isManualCropping, setIsManualCropping] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    try {
      setAppMode('cut');
      setStatus({ stage: 'analyzing_layout', progress: 10, message: '加载图片...' });
      setSegments([]);

      const img = await loadImage(file);
      setOriginalImage(img.src);
      setOriginalImageEl(img);

      setStatus({ stage: 'segmenting', progress: 30, message: '检测边界...' });

      await new Promise(r => setTimeout(r, 500));

      const detectedSegments = await processStickerSheet(img, (msg) => {
        setStatus(prev => ({ ...prev, message: msg }));
      });

      if (detectedSegments.length === 0) {
        setStatus({ stage: 'idle', progress: 0, message: '未检测到贴纸' });
        alert("未检测到贴纸。请确保图片有白色背景。");
        return;
      }

      setSegments(detectedSegments);
      setSegments(detectedSegments);
      // Pass segments to naming with a slight delay to allow UI to render first
      setTimeout(() => runAiNaming(detectedSegments), 500);

    } catch (error) {
      console.error(error);
      setStatus({ stage: 'idle', progress: 0, message: '处理图片时出错' });
    }
  };

  const runAiNaming = async (itemsToName: StickerSegment[]) => {
    setStatus({ stage: 'ai_naming', progress: 60, message: '正在命名...' });

    setSegments(prev => prev.map(p =>
      itemsToName.some(i => i.id === p.id) ? { ...p, isNaming: true } : p
    ));

    let completed = 0;
    const batchSize = 3;

    const processBatch = async (batch: StickerSegment[]) => {
      const promises = batch.map(async (seg) => {
        try {
          const name = await generateStickerName(seg.dataUrl);
          setSegments(prev => prev.map(p => p.id === seg.id ? { ...p, name, isNaming: false } : p));
        } catch (e) {
          console.error("Naming error", e);
        }
        completed++;
        if (itemsToName.length > 1) {
          setStatus(prev => ({
            ...prev,
            progress: 60 + (completed / itemsToName.length) * 40,
            message: `命名中 ${completed}/${itemsToName.length}...`
          }));
        }
      });
      await Promise.all(promises);
    };

    for (let i = 0; i < itemsToName.length; i += batchSize) {
      await processBatch(itemsToName.slice(i, i + batchSize));
    }

    setStatus({ stage: 'complete', progress: 100, message: '完成!' });
  };

  const handleManualCrop = (rect: Rect) => {
    if (!originalImageEl) return;

    const newSegment = extractStickerFromRect(
      originalImageEl,
      rect,
      `sticker_${segments.length + 1}`
    );

    if (newSegment) {
      setSegments(prev => [...prev, newSegment]);
      setIsManualCropping(false);
      runAiNaming([newSegment]);
    }
  };

  const handleDownloadAll = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();

      segments.forEach((seg) => {
        let fileName = seg.name;
        let counter = 1;
        while (usedNames.has(fileName)) {
          fileName = `${seg.name}_${counter}`;
          counter++;
        }
        usedNames.add(fileName);

        const base64Data = seg.dataUrl.split(',')[1];
        zip.file(`${fileName}.png`, base64Data, { base64: true });
      });

      const content = await zip.generateAsync({ type: "blob" });

      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = "stickers.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error zipping:", error);
      alert("Failed to create zip file.");
    } finally {
      setIsZipping(false);
    }
  };

  const handleReset = () => {
    setSegments([]);
    setOriginalImage(null);
    setOriginalImageEl(null);
    setAppMode('generate');
    setStatus({ stage: 'idle', progress: 0, message: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handler when sticker sheet is generated by CutePrinter2D
  const handleGenerated = async (imageDataUrl: string) => {
    setStatus({ stage: 'generating', progress: 0, message: '生成中...' });

    // Start progress simulation
    let progressInterval = setInterval(() => {
      setStatus(prev => {
        if (prev.stage === 'generating' && prev.progress < 90) {
          return { ...prev, progress: prev.progress + 2 };
        }
        return prev;
      });
    }, 500);

    try {
      // Convert data URL to File and process for cutting
      const response = await fetch(imageDataUrl);
      const blob = await response.blob();
      const file = new File([blob], 'generated_stickers.png', { type: 'image/png' });

      clearInterval(progressInterval);
      processFile(file);
    } catch (e) {
      clearInterval(progressInterval);
      throw e;
    }
  };

  const handleDirectUpload = (file: File) => {
    processFile(file);
  };

  return (
    <div className="shojo-container">

      {/* Generate Mode */}
      {appMode === 'generate' && (
        <CutePrinter2D
          status={status.stage === 'idle' ? 'idle' : 'generating'}
          progress={status.progress}
          message={status.message}
          onGenerated={handleGenerated}
          onDirectUpload={handleDirectUpload}
        />
      )}

      {/* Cut Mode */}
      {appMode === 'cut' && (
        <>
          {/* Back to Generate button */}
          <button
            onClick={handleReset}
            className="cute-btn fixed top-6 left-6 z-50 flex items-center gap-2"
          >
            <ArrowLeft size={20} /> <span style={{ fontSize: '14px' }}>RESTART</span>
          </button>

          {/* Floating Controls */}
          {segments.length > 0 && (
            <div className="fixed top-6 right-6 z-50 flex flex-col gap-3">
              <button onClick={handleDownloadAll} className="cute-btn flex items-center gap-2">
                {isZipping ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                <span style={{ fontSize: '14px' }}>SAVE ALL</span>
              </button>
              <button onClick={() => setIsManualCropping(true)} className="cute-btn flex items-center gap-2">
                <PlusCircle size={18} /> <span style={{ fontSize: '14px' }}>MANUAL</span>
              </button>
            </div>
          )}

          {/* Static GameBoy Display */}
          <div className="cute-machine">
            <div className="output-slot-2d"></div>
            <div className="machine-screen">
              <div className="machine-screen-tall">
                {status.stage !== 'idle' && status.stage !== 'complete' ? (
                  <div className="flex flex-col items-center justify-center h-full w-full px-4 text-center">
                    <div className="screen-text animate-pulse" style={{ fontSize: '12px' }}>{status.message}</div>
                    <div className="progress-container">
                      <div
                        className="progress-bar"
                        style={{ width: `${status.progress}%` }}
                      ></div>
                    </div>
                    <div className="screen-text mt-2" style={{ fontSize: '10px' }}>{Math.round(status.progress)}%</div>
                  </div>
                ) : (
                  <div className="screen-text">✨ SUCCESS!</div>
                )}
              </div>
            </div>

            {/* GameBoy Controls (Static/Disabled in Cut mode) */}
            <div className="gameboy-controls opacity-50 pointer-events-none">
              <div className="controls-top">
                <div className="style-pad-grid">
                  {/* Visual placebo buttons */}
                  <div className="style-grid-btn">可爱<br />LINE</div>
                  <div className="style-grid-btn">Q版<br />表情</div>
                  <div className="style-grid-btn">粉彩<br />少女</div>
                  <div className="style-grid-btn">动感<br />活力</div>
                </div>
                <div className="ab-buttons">
                  <div className="relative">
                    <button className="gb-btn-round">B</button>
                    <span className="ab-label" style={{ left: '15px' }}>RESET</span>
                  </div>
                  <div className="relative">
                    <button className="gb-btn-round">A</button>
                    <span className="ab-label" style={{ left: '10px' }}>START</span>
                  </div>
                </div>
              </div>
              <div className="controls-bottom">
                <div className="gb-btn-pill"><span className="pill-label">SELECT</span></div>
                <div className="gb-btn-pill"><span className="pill-label">START</span></div>
              </div>
            </div>
          </div>

          {/* Output area */}
          <div className="sticker-output-area mt-12 w-full max-w-[1200px]">
            <StickerStack stickers={segments} visible={segments.length > 0} />
          </div>

          {isManualCropping && originalImage && (
            <ManualCropModal
              imageUrl={originalImage}
              onClose={() => setIsManualCropping(false)}
              onConfirm={handleManualCrop}
            />
          )}
        </>
      )}
    </div>
  );
};

export default App;