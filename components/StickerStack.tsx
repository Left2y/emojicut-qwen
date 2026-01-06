import React, { useState, useRef, useEffect } from 'react';
import { StickerSegment } from '../types';
import { Download, X } from 'lucide-react';

interface StickerStackProps {
    stickers: StickerSegment[];
    visible: boolean;
}

const StickerStack: React.FC<StickerStackProps> = ({ stickers, visible }) => {
    if (!visible || stickers.length === 0) return null;

    return (
        <div className="absolute bottom-0 left-0 right-0 top-0 pointer-events-none z-10 flex items-center justify-center">
            {/* This container aligns with the printer's output in 2D space naturally 
           because the printer is centered. The 'stack' will appear to spill out.
           We need to offset it to match the visual output slot of the isometric printer.
        */}
            <div className="relative translate-y-40 translate-x-0 w-full h-full max-w-4xl mx-auto pointer-events-auto">
                {stickers.map((sticker, index) => (
                    <DraggableSticker
                        key={sticker.id}
                        sticker={sticker}
                        index={index}
                        total={stickers.length}
                    />
                ))}
            </div>
        </div>
    );
};

interface DraggableProps {
    sticker: StickerSegment;
    index: number;
    total: number;
}

const DraggableSticker: React.FC<DraggableProps> = ({ sticker, index, total }) => {
    // Randomize initial spread MUCH more for a scattered look
    // Spread across a 600x400 area roughly
    const initialRotation = useRef(Math.random() * 60 - 30); // +/- 30 deg
    const initialX = useRef(Math.random() * 600 - 300);      // +/- 300px horizontal
    const initialY = useRef(Math.random() * 400 - 100);      // +/- 200px vertical + offset

    const [position, setPosition] = useState({ x: initialX.current, y: initialY.current });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isHovered, setIsHovered] = useState(false);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        });
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging) {
            setPosition({
                x: e.clientX - dragOffset.x,
                y: e.clientY - dragOffset.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragOffset]);

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        const link = document.createElement('a');
        link.href = sticker.dataUrl;
        link.download = `${sticker.name}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div
            className="absolute left-1/2 top-1/2 cursor-grab active:cursor-grabbing transition-shadow duration-200"
            style={{
                transform: `translate(${position.x}px, ${position.y}px) rotate(${initialRotation.current}deg) scale(${isDragging ? 1.1 : 1})`,
                zIndex: isDragging ? 100 : index, // Bring to front when dragging
                opacity: 0,
                animation: `slideOut 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards`,
                animationDelay: `${index * 0.1}s` // Stagger animation
            }}
            onMouseDown={handleMouseDown}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div
                className="sticker-segment"
            >
                <img
                    src={sticker.dataUrl}
                    alt={sticker.name}
                    className="w-full h-full object-contain pointer-events-none select-none drop-shadow-md"
                />

                {/* Hover Actions */}
                <div className={`absolute -top-12 left-1/2 -translate-x-1/2 bg-gb-text text-gb-screen-bg px-3 py-2 rounded text-[14px] whitespace-nowrap transition-opacity font-['Press_Start_2P'] border-2 border-black ${isHovered || isDragging ? 'opacity-100' : 'opacity-0'}`}>
                    {sticker.name.toUpperCase()}
                    <div
                        onClick={handleDownload}
                        className="mt-2 text-center cursor-pointer hover:underline text-[12px]"
                    >
                        [SAVE]
                    </div>
                </div>
            </div>
            <style>{`
        @keyframes slideOut {
            from { transform: translate(0, -100px) scale(0.5); opacity: 0; }
            to { opacity: 1; }
        }
      `}</style>
        </div>
    );
};

export default StickerStack;
