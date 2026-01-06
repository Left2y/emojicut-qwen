import React, { useRef, useState, useEffect } from 'react';
import '../retro.css';
import { CloudUpload, Wand2, Power, Scissors, AlertCircle } from 'lucide-react';
import { StickerStyle, STICKER_STYLES, generateStickerSheet } from '../services/qwenService';

interface CutePrinterProps {
    status: 'idle' | 'uploading' | 'generating' | 'processing' | 'complete' | 'error';
    progress?: number;
    message?: string;
    onGenerated: (imageDataUrl: string) => void;
    onDirectUpload: (file: File) => void;
}

const CutePrinter2D: React.FC<CutePrinterProps> = ({ status, progress, message, onGenerated, onDirectUpload }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [referenceImage, setReferenceImage] = useState<string | null>(null);
    const [customStyle, setCustomStyle] = useState('');
    const [selectedStyleId, setSelectedStyleId] = useState('line_cute');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [apiKeyMissing, setApiKeyMissing] = useState(false);

    useEffect(() => {
        // 在 Vite 中，使用 import.meta.env 读取环境变量
        const key = (import.meta as any).env?.VITE_DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY;
        if (!key || key === 'your_key_here' || key === '') {
            setApiKeyMissing(true);
        } else {
            setApiKeyMissing(false);
        }
    }, [isGenerating]);

    const STYLES = STICKER_STYLES;
    const selectedStyle = STYLES.find(s => s.id === selectedStyleId) || STYLES[0];

    // Navigate styles with D-pad
    const handleDPad = (direction: 'up' | 'down' | 'left' | 'right') => {
        const currentIndex = STYLES.findIndex(s => s.id === selectedStyleId);
        let nextIndex = currentIndex;
        if (direction === 'up' || direction === 'left') {
            nextIndex = (currentIndex - 1 + STYLES.length) % STYLES.length;
        } else {
            nextIndex = (currentIndex + 1) % STYLES.length;
        }
        setSelectedStyleId(STYLES[nextIndex].id);
        setError(null);
    };

    const handlePanelClick = () => {
        if (status === 'idle' || status === 'complete') {
            fileInputRef.current?.click();
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                setReferenceImage(event.target?.result as string);
                setError(null);
            };
            reader.readAsDataURL(file);
        }
    };

    const [localProgress, setLocalProgress] = useState(0);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isGenerating) {
            setLocalProgress(0);
            interval = setInterval(() => {
                setLocalProgress(prev => (prev < 95 ? prev + Math.random() * 5 : prev));
            }, 800);
        } else {
            setLocalProgress(0);
        }
        return () => clearInterval(interval);
    }, [isGenerating]);

    const handleGenerate = async () => {
        if (!referenceImage || isGenerating) return;

        setIsGenerating(true);
        setError(null);

        try {
            const generatedImageUrl = await generateStickerSheet(
                referenceImage,
                selectedStyle,
                customStyle || undefined
            );
            onGenerated(generatedImageUrl);
        } catch (err) {
            console.error('Generation failed:', err);
            setError(err instanceof Error ? err.message : '生成失败，请重试');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleReset = () => {
        setReferenceImage(null);
        setCustomStyle('');
        setError(null);
    };

    const currentStatus = isGenerating ? 'generating' : status;

    return (
        <div className="flex flex-col items-center">
            <div className={`cute-machine ${currentStatus === 'generating' || currentStatus === 'processing' ? 'processing' : ''}`}>

                <div className="output-slot-2d"></div>

                {/* GameBoy Screen */}
                <div className="machine-screen" onClick={!referenceImage ? handlePanelClick : undefined}>
                    <div className="machine-screen-tall">
                        {error ? (
                            <div className="flex flex-col items-center justify-center h-full p-2 text-center">
                                <AlertCircle size={32} className="text-red-700 mb-2" />
                                <div className="screen-text" style={{ fontSize: '14px', color: '#700' }}>ERROR:</div>
                                <div className="screen-text" style={{ fontSize: '12px', color: '#700', marginTop: '8px' }}>{error}</div>
                                <div className="screen-text animate-pulse mt-6" style={{ fontSize: '12px' }}>PRESS B TO RESET</div>
                            </div>
                        ) : !referenceImage ? (
                            <>
                                <CloudUpload size={32} className="text-gb-text mb-2 opacity-60" />
                                <div className="screen-text" style={{ fontSize: '14px' }}>INSERT PHOTO<br />TO START</div>
                                {apiKeyMissing && (
                                    <div className="screen-text mt-4 text-red-700" style={{ fontSize: '12px' }}>! CHECK API KEY !</div>
                                )}
                            </>
                        ) : (
                            <div className="relative w-full h-full flex flex-col items-center p-2">
                                {isGenerating ? (
                                    <div className="flex flex-col items-center justify-center h-full w-full px-4">
                                        <div className="screen-text animate-pulse">GENERATING...</div>
                                        <div className="progress-container">
                                            <div
                                                className="progress-bar"
                                                style={{ width: `${Math.round(localProgress || progress || 0)}%` }}
                                            ></div>
                                        </div>
                                        <div className="screen-text mt-2" style={{ fontSize: '14px' }}>{Math.round(localProgress || progress || 0)}%</div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="w-full text-center mb-1">
                                            <div className="screen-text" style={{ fontSize: '14px' }}>{selectedStyle.name}</div>
                                        </div>
                                        <img src={referenceImage} alt="Reference" className="w-[120px] h-[120px] object-contain border-2 border-gb-text" />
                                        <div className="mt-2 w-full px-1">
                                            <input
                                                className="printer-style-input"
                                                placeholder="STYLE..."
                                                value={customStyle}
                                                onChange={(e) => setCustomStyle(e.target.value)}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* GameBoy Controls */}
                <div className="gameboy-controls">
                    <div className="controls-top">
                        {/* Style Grid (Replaces D-Pad) */}
                        <div className="style-pad-grid">
                            {STYLES.slice(0, 4).map((style) => (
                                <button
                                    key={style.id}
                                    className={`style-grid-btn ${selectedStyleId === style.id ? 'active' : ''}`}
                                    onClick={() => {
                                        setSelectedStyleId(style.id);
                                        setError(null);
                                    }}
                                >
                                    {style.name}
                                </button>
                            ))}
                        </div>

                        {/* A/B Buttons */}
                        <div className="ab-buttons">
                            <div className="relative">
                                <button className="gb-btn-round" onClick={handleReset}>B</button>
                                <span className="ab-label" style={{ left: '15px' }}>RESET</span>
                            </div>
                            <div className="relative">
                                <button
                                    className="gb-btn-round"
                                    onClick={handleGenerate}
                                    disabled={!referenceImage || isGenerating}
                                >
                                    A
                                </button>
                                <span className="ab-label" style={{ left: '10px' }}>START</span>
                            </div>
                        </div>
                    </div>

                    <div className="controls-bottom">
                        <div className="gb-btn-pill">
                            <span className="pill-label">SELECT</span>
                        </div>
                        <div className="gb-btn-pill">
                            <span className="pill-label">START</span>
                        </div>
                    </div>
                </div>

                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept="image/*"
                />
            </div>

            {/* Style Chips removed (moved to D-pad area) */}
        </div>
    );
};

export default CutePrinter2D;
