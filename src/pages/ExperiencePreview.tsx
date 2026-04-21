import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const SLIDES = [
  {
    text: 'Please pick up the telephone.',
    italic: false,
  },
  {
    text: 'I open my heart to everything that I feel.',
    italic: true,
  },
  {
    text: 'I will give myself the time & honesty I need to complete this experience.',
    italic: true,
  },
  {
    text: 'What do you need the most right now?',
    italic: false,
  },
] as const;

const AUTO_ADVANCE_MS = 4000;

export default function ExperiencePreview({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);

  const next = useCallback(() => {
    setIndex(i => (i + 1) % SLIDES.length);
  }, []);

  const prev = useCallback(() => {
    setIndex(i => (i - 1 + SLIDES.length) % SLIDES.length);
  }, []);

  // Auto-advance
  useEffect(() => {
    const t = setTimeout(next, AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [index, next]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, next, prev]);

  const slide = SLIDES[index];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ fontFamily: '"Lora", ui-serif, serif' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-xl mx-6 bg-black border border-white/10 flex flex-col"
        style={{ aspectRatio: '4/3' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Slide text */}
        <div className="absolute inset-0 flex items-center justify-center px-12">
          <AnimatePresence mode="wait">
            <motion.p
              key={index}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5 }}
              className={`text-xl tracking-wide text-white text-center leading-relaxed ${slide.italic ? 'italic' : ''}`}
            >
              {slide.text}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Left arrow */}
        <button
          onClick={prev}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white opacity-25 hover:opacity-80 transition-opacity duration-300 text-lg cursor-pointer select-none"
          aria-label="Previous"
        >
          ←
        </button>

        {/* Right arrow */}
        <button
          onClick={next}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white opacity-25 hover:opacity-80 transition-opacity duration-300 text-lg cursor-pointer select-none"
          aria-label="Next"
        >
          →
        </button>

        {/* Progress dots */}
        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`w-1.5 h-1.5 rounded-full bg-white transition-opacity duration-500 cursor-pointer ${i === index ? 'opacity-80' : 'opacity-20 hover:opacity-40'}`}
            />
          ))}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-5 text-white opacity-25 hover:opacity-70 transition-opacity duration-300 text-sm tracking-widest lowercase cursor-pointer"
        >
          esc
        </button>
      </motion.div>
    </motion.div>
  );
}
