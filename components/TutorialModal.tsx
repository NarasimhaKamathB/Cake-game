'use client';
import { useEffect, useRef } from 'react';

interface TutorialModalProps {
  onClose: () => void;
}

export function TutorialModal({ onClose }: TutorialModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm"
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 sm:px-5 sm:py-3 bg-[#3B1A08] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎂</span>
          <span className="text-[#FFF8F0] font-bold text-xs sm:text-sm tracking-wide">
            <span className="sm:hidden">How to Play</span>
            <span className="hidden sm:inline">THE CAKE GAME — How to Play (62s)</span>
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-[#C26A1A] hover:text-[#FFF8F0] font-bold text-xs sm:text-sm px-3 py-1 sm:px-4 sm:py-1.5 rounded-lg border border-[#C26A1A] hover:bg-[#C26A1A] transition-colors whitespace-nowrap"
        >
          <span className="sm:hidden">Got it ✓</span>
          <span className="hidden sm:inline">Got it, I'm ready ✓</span>
        </button>
      </div>

      {/* iframe fills remaining space */}
      <iframe
        src="/tutorial.html"
        className="flex-1 w-full border-0"
        title="Cake Game Tutorial"
        allow="autoplay"
      />
    </div>
  );
}
