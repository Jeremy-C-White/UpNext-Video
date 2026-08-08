import { useState, useRef, TouchEvent, ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';

export function SwipeableCard({ children, onMark }: { children: ReactNode, onMark: () => void, key?: string | number }) {
  const [offset, setOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const hasSwiped = useRef(false);
  const swipeThreshold = 80;
  
  const handleTouchStart = (e: TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    setIsSwiping(true);
    isHorizontalSwipe.current = null;
    hasSwiped.current = false;
  };
  
  const handleTouchMove = (e: TouchEvent) => {
    if (!isSwiping) return;
    
    currentX.current = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX.current - startX.current;
    const diffY = currentY - startY.current;
    
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
        isHorizontalSwipe.current = true;
      } else if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 10) {
        isHorizontalSwipe.current = false;
      }
    }

    if (isHorizontalSwipe.current) {
      if (e.cancelable) e.preventDefault(); // lock vertical scroll
      if (diffX > 0) { // Only allow swipe right
        setOffset(diffX);
        if (diffX > 10) hasSwiped.current = true;
      }
    }
  };
  
  const handleTouchEnd = () => {
    if (!isSwiping) return;
    setIsSwiping(false);
    
    if (offset > swipeThreshold) {
      setOffset(window.innerWidth);
      setTimeout(() => {
        onMark();
        setTimeout(() => setOffset(0), 100);
      }, 200);
    } else {
      setOffset(0);
      setTimeout(() => { hasSwiped.current = false; }, 50);
    }
  };

  const handleClickCapture = (e: React.MouseEvent) => {
    if (hasSwiped.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl w-full" onClickCapture={handleClickCapture}>
      <div 
        className="absolute inset-0 bg-green-500/20 text-green-500 flex items-center justify-start px-6 transition-opacity"
        style={{ opacity: Math.min(offset / swipeThreshold, 1) }}
      >
        <div className="flex flex-col items-center gap-1 font-bold">
          <CheckCircle2 className="w-8 h-8" />
          <span className="text-xs uppercase tracking-wide">Mark</span>
        </div>
      </div>
      
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ 
          transform: `translateX(${offset}px)`,
          transition: isSwiping ? 'none' : 'transform 0.2s cubic-bezier(0.32, 0.72, 0, 1)' 
        }}
        className="relative z-10 w-full bg-slate-50 dark:bg-slate-950" // need bg here so background reveal is hidden
      >
        {children}
      </div>
    </div>
  );
}
