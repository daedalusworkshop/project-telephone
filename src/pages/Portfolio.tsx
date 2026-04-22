import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

type Recording = { label: string; src: string; cues?: string };

const FEATURED: Recording[] = [
  { label: 'Gabriel', src: '/featured/gabriel.wav', cues: 'gabriel' },
  { label: 'Ben',     src: '/featured/ben.wav',     cues: 'ben' },
  { label: 'Wren',    src: '/featured/wren.wav',    cues: 'wren' },
];

const MORE: Recording[] = [
  { label: 'Kess',   src: '/featured/kess.wav',   cues: 'kess' },
  { label: 'Kate',   src: '/featured/kate.wav',   cues: 'kate' },
  { label: 'Justin', src: '/featured/justin.wav', cues: 'justin' },
];

// ── Cue helpers ───────────────────────────────────────────────────────────────

type CueBlock = { time: string; text: string };

function mssToSec(mss: string): number {
  const m = mss.match(/^(\d+):(\d{2})$/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : NaN;
}

function secToMss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function parseMd(md: string): CueBlock[] {
  return md.trim().split(/\n\s*\n/).flatMap(block => {
    const lines = block.trim().split('\n');
    if (lines.length < 2) return [];
    return [{ time: lines[0].trim(), text: lines.slice(1).join('\n').trim() }];
  });
}

function blocksToMd(blocks: CueBlock[]): string {
  return blocks.map(b => `${b.time}\n${b.text}`).join('\n\n') + '\n';
}

const QUESTION = 'What do you need the most right now?';

// ── Sequential listen experience ──────────────────────────────────────────────

function ListenSequence({ recordings, moreRecordings, onClose }: {
  key?: React.Key;
  recordings: Recording[];
  moreRecordings?: Recording[];
  onClose: () => void;
}) {
  type Phase = 'playing' | 'prompt' | 'more';
  const [phase, setPhase] = useState<Phase>('playing');
  const [playlist, setPlaylist] = useState(recordings);
  const [index, setIndex] = useState(0);
  const [blocks, setBlocks] = useState<CueBlock[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const indexRef = useRef(index);
  indexRef.current = index;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const rec = playlist[index];

  const advance = useCallback(() => {
    if (phaseRef.current !== 'playing' && phaseRef.current !== 'more') return;
    const next = indexRef.current + 1;
    if (next >= playlist.length) {
      if (phaseRef.current === 'playing' && moreRecordings?.length) {
        setPhase('prompt');
      } else {
        onClose();
      }
    } else {
      setIndex(next);
    }
  }, [playlist.length, moreRecordings, onClose]);

  // Load audio when index changes (not during prompt)
  useEffect(() => {
    if (phase === 'prompt') return;
    setBlocks([]);
    setActiveIndex(-1);
    setProgress(0);
    const audio = new Audio(rec.src);
    audioRef.current = audio;
    audio.onended = advance;
    audio.play().catch(() => {});
    return () => { audio.pause(); audio.onended = null; audioRef.current = null; };
  }, [index, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load cues
  useEffect(() => {
    if (phase === 'prompt' || !rec?.cues) return;
    fetch(`/api/cues/${rec.cues}`)
      .then(r => r.ok ? r.text() : '')
      .then(md => { if (md) setBlocks(parseMd(md)); })
      .catch(() => {});
  }, [rec?.cues, phase]);

  // Track time → active cue + progress
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handler = () => {
      if (audio.duration) setProgress(audio.currentTime / audio.duration);
      let idx = -1;
      for (let i = 0; i < blocks.length; i++) {
        const s = mssToSec(blocks[i].time);
        if (!isNaN(s) && s <= audio.currentTime) idx = i;
        else break;
      }
      setActiveIndex(idx);
    };
    audio.addEventListener('timeupdate', handler);
    return () => audio.removeEventListener('timeupdate', handler);
  }, [blocks, index]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (phaseRef.current === 'prompt') {
          setPhase('more');
          setPlaylist(moreRecordings!);
          setIndex(0);
        } else {
          advance();
        }
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [advance, moreRecordings, onClose]);

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  }, []);

  const activeText = blocks[activeIndex]?.text ?? '';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2 }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
      style={{ fontFamily: '"Lora", ui-serif, serif' }}
    >
      <div className="flex justify-between items-start px-10 pt-10 shrink-0">
        <p className="text-sm leading-relaxed text-white/60 italic max-w-xs">
          To bring out the soulful blues we feel, every day. To give it a shared voice. To share it is to say it's okay.
        </p>
        <button
          onClick={onClose}
          className="text-sm tracking-widest text-white/25 hover:text-white/60 transition-colors duration-300 lowercase cursor-pointer"
        >
          esc
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-16 gap-10">
        <AnimatePresence mode="wait">
          {phase === 'prompt' ? (
            <motion.div
              key="prompt"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2 }}
              className="border border-white/20 px-12 py-6 text-center"
            >
              <p className="text-xl tracking-wide text-white/80 italic">press space to listen to more</p>
            </motion.div>
          ) : (
            <motion.p
              key={rec.label}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1 }}
              className="text-5xl tracking-wide text-white/80 text-center"
            >
              {rec.label}
            </motion.p>
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          {activeText && phase !== 'prompt' && (
            <motion.p
              key={activeText}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5 }}
              className="text-2xl leading-relaxed text-white/75 text-center tracking-wide max-w-xl"
            >
              {activeText}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="px-10 pb-10 flex flex-col gap-3 shrink-0">
        <div className="flex justify-between items-baseline">
          <span className="text-sm tracking-widest text-white/45 lowercase">Who do you wish to call? &nbsp;•&nbsp; {QUESTION}</span>
          <span className="text-sm tracking-widest text-white/45 lowercase">
            {phase === 'prompt' ? 'space to play more' : 'space to skip'}
          </span>
        </div>
        <div
          className="w-full h-px bg-white/10 relative cursor-pointer group"
          onClick={phase !== 'prompt' ? seek : undefined}
        >
          <div
            className="h-px bg-white/35 transition-[width] duration-1000 ease-linear"
            style={{ width: phase === 'prompt' ? '100%' : `${progress * 100}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/50 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: phase === 'prompt' ? '100%' : `${progress * 100}%` }}
          />
        </div>
      </div>
    </motion.div>
  );
}

// ── Listening mode (operator cue editor) ──────────────────────────────────────

function ListeningMode({ rec, audio, onClose }: {
  key?: React.Key;
  rec: Recording;
  audio: HTMLAudioElement;
  onClose: () => void;
}) {
  const [blocks, setBlocks] = useState<CueBlock[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [currentTime, setCurrentTime] = useState(0);
  const [progress, setProgress] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const activeBlockRef = useRef<HTMLDivElement>(null);

  // Load cue file on mount
  useEffect(() => {
    if (!rec.cues) return;
    fetch(`/api/cues/${rec.cues}`)
      .then(r => r.ok ? r.text() : '')
      .then(md => { if (md) setBlocks(parseMd(md)); })
      .catch(() => {});
  }, [rec.cues]);

  // Track audio time → active index + progress
  useEffect(() => {
    const handler = () => {
      const t = audio.currentTime;
      setCurrentTime(t);
      if (audio.duration) setProgress(t / audio.duration);
      let idx = -1;
      for (let i = 0; i < blocks.length; i++) {
        const s = mssToSec(blocks[i].time);
        if (!isNaN(s) && s <= t) idx = i;
        else break;
      }
      setActiveIndex(idx);
    };
    audio.addEventListener('timeupdate', handler);
    return () => audio.removeEventListener('timeupdate', handler);
  }, [audio, blocks]);

  // Auto-scroll editor to active block
  useEffect(() => {
    activeBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeIndex]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const saveBlocks = useCallback((next: CueBlock[]) => {
    if (!rec.cues) return;
    setSaveStatus('unsaved');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await fetch(`/api/cues/${rec.cues}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/plain' },
          body: blocksToMd(next),
        });
        setSaveStatus('saved');
      } catch {
        setSaveStatus('unsaved');
      }
    }, 1000);
  }, [rec.cues]);

  const updateTime = (i: number, time: string) => {
    const next = blocks.map((b, idx) => idx === i ? { ...b, time } : b);
    setBlocks(next);
    saveBlocks(next);
  };

  const updateText = (i: number, text: string) => {
    const next = blocks.map((b, idx) => idx === i ? { ...b, text } : b);
    setBlocks(next);
    saveBlocks(next);
  };

  const addBlock = () => {
    const newBlock = { time: secToMss(Math.floor(currentTime)), text: '' };
    // Insert after active index, or at end
    const insertAt = activeIndex >= 0 ? activeIndex + 1 : blocks.length;
    const next = [...blocks.slice(0, insertAt), newBlock, ...blocks.slice(insertAt)];
    setBlocks(next);
    saveBlocks(next);
  };

  const deleteBlock = (i: number) => {
    const next = blocks.filter((_, idx) => idx !== i);
    setBlocks(next);
    saveBlocks(next);
  };

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  }, [audio]);

  const activeText = blocks[activeIndex]?.text ?? '';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2 }}
      className="fixed inset-0 z-50 flex"
      style={{ fontFamily: '"Lora", ui-serif, serif' }}
    >
      {/* ── Left: listening panel ── */}
      <div className="flex flex-col w-[45%] bg-black shrink-0">
        {/* Header */}
        <div className="flex justify-between items-start px-10 pt-10">
          <span className="text-sm tracking-widest text-white/25 lowercase">{rec.label}</span>
          <button
            onClick={onClose}
            className="text-sm tracking-widest text-white/25 hover:text-white/60 transition-colors duration-300 lowercase cursor-pointer"
          >
            esc
          </button>
        </div>

        {/* Cue text */}
        <div className="flex-1 flex items-center justify-center px-12">
          <AnimatePresence mode="wait">
            {activeText && (
              <motion.p
                key={activeText}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.5 }}
                className="text-2xl leading-relaxed text-white/85 text-center tracking-wide"
              >
                {activeText}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-10 pb-10 flex items-center gap-4">
          <div
            className="flex-1 h-px bg-white/10 relative cursor-pointer group"
            onClick={seek}
          >
            <div className="h-px bg-white/40" style={{ width: `${progress * 100}%` }} />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/50 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `${progress * 100}%` }}
            />
          </div>
          <button
            onClick={() => { audio.currentTime = 0; }}
            className="text-xs text-white/20 hover:text-white/50 transition-colors duration-300 cursor-pointer"
          >
            ↩
          </button>
        </div>
      </div>

      {/* ── Right: cue editor ── */}
      <div className="flex flex-col flex-1 bg-[#080808] border-l border-white/[0.05]">
        {/* Editor header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-white/[0.05] shrink-0">
          <span className="text-xs font-mono text-white/20">
            {rec.cues ? `public/cues/${rec.cues}.md` : 'no cue file'}
          </span>
          <div className="flex items-center gap-4">
            <span className="text-xs font-mono text-white/20 tabular-nums">
              {secToMss(currentTime)}
            </span>
            <span className={`text-xs tracking-widest lowercase transition-colors duration-300 ${
              saveStatus === 'saved' ? 'text-white/15' :
              saveStatus === 'saving' ? 'text-white/30' :
              'text-white/50'
            }`}>
              {saveStatus === 'saving' ? 'saving…' : saveStatus === 'unsaved' ? '●' : 'saved'}
            </span>
          </div>
        </div>

        {/* Cue blocks */}
        <div className="flex-1 overflow-y-auto py-3">
          {blocks.length === 0 && (
            <p className="px-6 py-4 text-xs text-white/20 lowercase tracking-widest">
              no cue file found — add blocks below
            </p>
          )}
          {blocks.map((block, i) => {
            const isActive = i === activeIndex;
            return (
              <div
                key={i}
                ref={isActive ? (el => { (activeBlockRef as React.MutableRefObject<HTMLDivElement | null>).current = el; }) : undefined}
                className={`group flex gap-3 px-5 py-2.5 transition-colors duration-300 ${
                  isActive ? 'bg-white/[0.06]' : 'hover:bg-white/[0.025]'
                }`}
              >
                {/* Timestamp — click seeks to that time */}
                <button
                  onClick={() => {
                    const s = mssToSec(block.time);
                    if (!isNaN(s)) audio.currentTime = s;
                  }}
                  className="text-xs font-mono text-white/25 hover:text-white/60 transition-colors duration-200 shrink-0 w-9 text-left pt-0.5 cursor-pointer"
                  title="Seek to this time"
                >
                  {block.time || '—'}
                </button>

                {/* Editable timestamp */}
                <input
                  value={block.time}
                  onChange={e => updateTime(i, e.target.value)}
                  placeholder="0:00"
                  className="text-xs font-mono text-white/40 bg-transparent border-none outline-none shrink-0 w-10 pt-0.5 placeholder-white/15"
                  spellCheck={false}
                />

                {/* Text */}
                <textarea
                  value={block.text}
                  onChange={e => updateText(i, e.target.value)}
                  rows={Math.max(1, block.text.split('\n').length)}
                  className={`flex-1 bg-transparent border-none outline-none resize-none leading-relaxed text-sm transition-colors duration-300 ${
                    isActive ? 'text-white/80' : 'text-white/35'
                  }`}
                  style={{ fontFamily: '"Lora", ui-serif, serif' }}
                  spellCheck
                />

                {/* Delete */}
                <button
                  onClick={() => deleteBlock(i)}
                  className="text-xs text-white/0 group-hover:text-white/25 hover:!text-white/60 transition-colors duration-200 cursor-pointer shrink-0 pt-0.5"
                >
                  ×
                </button>
              </div>
            );
          })}

          {/* Add block */}
          {rec.cues && (
            <button
              onClick={addBlock}
              className="flex items-center gap-3 px-5 py-3 w-full text-left text-xs text-white/15 hover:text-white/40 transition-colors duration-300 lowercase tracking-widest cursor-pointer"
            >
              <span className="font-mono w-9">{secToMss(Math.floor(currentTime))}</span>
              <span>+ add cue at current time</span>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Portfolio page ────────────────────────────────────────────────────────────

export default function Portfolio() {
  const [listening, setListening] = useState(false);

  return (
    <div
      className="min-h-screen bg-black text-white/80 selection:bg-white/10"
      style={{ fontFamily: '"Lora", ui-serif, serif' }}
    >
      <div className="max-w-2xl mx-auto px-8 py-24">

        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2 }}
          className="text-3xl tracking-wide text-white mb-2"
        >
          Project Telephone
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2, delay: 0.5 }}
          className="text-sm tracking-widest text-white/45 mb-16"
        >
          Spring • 2026
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2, delay: 1.2 }}
          className="mb-20 space-y-5"
        >
          <p className="text-xs tracking-widest text-white/45 lowercase mb-4">the idea</p>
          <p className="text-2xl leading-relaxed text-white/90 italic">
            An honest installation. A telephone booth on a college drillfield. Pick up a telephone &amp; leave a message.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2, delay: 1.5 }}
          className="mb-20"
        >
          <p className="text-xs tracking-widest text-white/45 lowercase mb-4">the question</p>
          <p className="text-2xl tracking-wide text-white/90 italic">
            {QUESTION} Who do you wish to call?
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2, delay: 1.8 }}
          className="mb-24"
        >
          <p className="text-xs tracking-widest text-white/45 lowercase mb-4">the recordings</p>
          <button
            onClick={() => setListening(true)}
            className="group flex items-center gap-2.5 text-2xl tracking-wide text-white/90 hover:text-white cursor-pointer italic relative transition-colors duration-300"
          >
            <span className="relative">
              Hear their answers
              <span className="absolute left-0 -bottom-0.5 h-px w-full bg-white/40" />
            </span>
          </button>
        </motion.div>

      </div>

      <AnimatePresence>
        {listening && (
          <ListenSequence
            key="listen"
            recordings={FEATURED}
            moreRecordings={MORE}
            onClose={() => setListening(false)}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
