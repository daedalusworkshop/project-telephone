import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Leva, useControls, folder } from 'leva';
import { audioService } from './services/audio';

const STORAGE_KEY = 'telephone-dsp';
const FONT_KEY = 'telephone-font';

const FONT_OPTIONS: Record<string, string> = {
  'Nunito':              '"Nunito", ui-sans-serif, sans-serif',
  'Cormorant Garamond':  '"Cormorant Garamond", ui-serif, serif',
  'Lora':                '"Lora", ui-serif, serif',
  'Fraunces':            '"Fraunces", ui-serif, serif',
  'DM Serif Display':    '"DM Serif Display", ui-serif, serif',
};
const FONT_DEFAULT = 'Nunito';

function loadFontName(): string {
  return localStorage.getItem(FONT_KEY) ?? FONT_DEFAULT;
}
function saveFontName(name: string) {
  localStorage.setItem(FONT_KEY, name);
}

const DSP_DEFAULTS = {
  // Mic monitoring (sidetone)
  monitorVolume: 0.42,
  // Recorded message playback
  playbackVolume: 0.41,
  // Shared telephone DSP chain
  preGain: 0.80,
  highPass: 590,
  lowPass: 4350,
  threshold: -26,
  ratio: 3.0,
  attack: 0.32,
  release: 0.77,
  // Voice prompts (pre-recorded MP3s)
  promptVolume: 0.08,
  // TTS fallback
  ttsVolume: 1.0,
  ttsRate: 0.85,
  ttsPitch: 0.9,
  // Ring tone
  ringVolume: 0.12,
  ringFreq1: 440,
  ringFreq2: 480,
  ringOnSec: 2,
  ringCycleSec: 6,
  // Beep (start-recording tone)
  beepVolume: 0.1,
  beepFreq: 800,
  beepDuration: 0.5,
};

function loadDSP(): typeof DSP_DEFAULTS {
  try {
    return { ...DSP_DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return DSP_DEFAULTS;
  }
}

function saveDSP(key: keyof typeof DSP_DEFAULTS, value: number) {
  try {
    const current = loadDSP();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, [key]: value }));
  } catch { /* ignore */ }
}

type AppState =
  | 'START'
  | 'OATH'
  | 'CALL'
  | 'RECORDING'
  | 'POST_RECORDING'
  | 'PLAYBACK'
  | 'SEND_EXIT'
  | 'DISCARD_EXIT'
  | 'END'
  | 'ERROR';

const TIMELINE_STEPS: Array<{ state: AppState; label: string }> = [
  { state: 'START',          label: 'start' },
  { state: 'OATH',           label: 'oath'  },
  { state: 'CALL',           label: 'call'  },
  { state: 'RECORDING',      label: 'rec'   },
  { state: 'POST_RECORDING', label: 'post'  },
  { state: 'PLAYBACK',       label: 'play'  },
  { state: 'SEND_EXIT',      label: 'send'  },
  { state: 'DISCARD_EXIT',   label: 'disc'  },
  { state: 'END',            label: 'end'   },
  { state: 'ERROR',          label: 'err'   },
];

function DevTimeline({ current, onJump }: { current: AppState; onJump: (s: AppState) => void }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 flex justify-center pb-5 z-50 pointer-events-none">
      <div className="flex items-end gap-px pointer-events-auto">
        {TIMELINE_STEPS.map((step, i) => {
          const active = current === step.state;
          return (
            <button
              key={step.state}
              onClick={() => onJump(step.state)}
              className="flex flex-col items-center gap-1 px-3 py-2 group transition-colors duration-150"
              style={{ fontFamily: 'monospace' }}
            >
              {active && (
                <span className="block w-1 h-1 rounded-full bg-white mb-0.5" />
              )}
              {!active && (
                <span className="block w-1 h-1 mb-0.5" />
              )}
              <span className={`text-sm transition-colors duration-150 ${active ? 'text-white' : 'text-white/25 group-hover:text-white/60'}`}>
                {i + 1}
              </span>
              <span className={`text-[9px] uppercase tracking-widest transition-colors duration-150 ${active ? 'text-white/60' : 'text-white/15 group-hover:text-white/40'}`}>
                {step.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StartScreen({ onNext, onError }: { key?: string, onNext: () => void, onError: () => void }) {
  const [showNext, setShowNext] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowNext(true), 2000);
    return () => clearTimeout(t);
  }, []);

  const handleNext = async () => {
    try {
      await audioService.initialize();
      audioService.setSidetone(true);
      document.documentElement.requestFullscreen?.().catch(() => {});
      onNext();
    } catch (e) {
      onError();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 2 }}
      className="absolute inset-0"
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="text-xl tracking-wide text-white/80">Please pick up the telephone.</p>
      </div>
      <AnimatePresence>
        {showNext && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2 }}
            onClick={handleNext}
            className="absolute bottom-24 left-0 right-0 text-sm tracking-widest text-white/40 hover:text-white/80 transition-colors duration-500 lowercase cursor-pointer text-center"
          >
            [ next ]
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function OathScreen({ onNext }: { key?: string, onNext: () => void }) {
  const [phase, setPhase] = useState(0); // 0: "please say:", 1: line1, 2: line2

  useEffect(() => {
    const t = setTimeout(() => setPhase(1), 2500);
    return () => clearTimeout(t);
  }, []);

  const handleNext = () => {
    if (phase === 1) {
      setPhase(2);
    } else {
      audioService.setSidetone(false);
      onNext();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 2 }}
      className="absolute inset-0"
    >
      <div className="absolute inset-0 flex items-center justify-center text-center px-8">
        <AnimatePresence mode="wait">
          {phase === 0 && (
            <motion.p
              key="intro"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5 }}
              className="text-xl tracking-wide text-white/80"
            >
              Please say:
            </motion.p>
          )}
          {phase === 1 && (
            <motion.p
              key="line1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5 }}
              className="text-xl tracking-wide text-white/80 italic max-w-2xl"
            >
              I open my heart to everything that I feel.
            </motion.p>
          )}
          {phase === 2 && (
            <motion.p
              key="line2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5 }}
              className="text-xl tracking-wide text-white/80 italic max-w-2xl"
            >
              I will give myself the time & honesty I need to complete this experience.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      {phase >= 1 && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 3, delay: 4 }}
          onClick={handleNext}
          className="absolute bottom-24 left-0 right-0 text-sm tracking-widest text-white/40 hover:text-white/80 transition-colors duration-500 lowercase cursor-pointer text-center"
        >
          [ next ]
        </motion.button>
      )}
    </motion.div>
  );
}

const PROMPT_LINES = [
  "The operator isn't available right now.",
  "She is asking: who do you wish to call?",
  "What do you need the most right now?",
  "Please leave your message after the tone.",
  "She'll find a way to reach you.",
];

// Delays (ms) at which each line fades in, timed to approximate speech
const PROMPT_LINE_DELAYS = [0, 4000, 8000, 12000, 16500];

function CallScreen({ onComplete }: { key?: string, onComplete: () => void }) {
  const [visibleLines, setVisibleLines] = useState<number[]>([]);
  // Stable ref so the effect closure always calls the latest onComplete without
  // being listed as a dependency (which would restart the sequence on re-render).
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let isMounted = true;

    const runSequence = async () => {
      // 1. Intro voice
      await new Promise<void>(resolve => {
        audioService.speak(
          "Hello, welcome. Please wait while I connect you with your operator. She can direct your call to anyone in the world.",
          () => setTimeout(resolve, 800),
          '/audio/welcome.mp3'
        );
      });
      if (!isMounted) return;

      // 2. Ringing (~15s)
      await new Promise<void>(resolve => {
        audioService.playRinging(15000, resolve);
      });
      if (!isMounted) return;

      // 3. Prompt voice + text lines fading in simultaneously
      PROMPT_LINE_DELAYS.forEach((delay, index) => {
        setTimeout(() => {
          if (isMounted) setVisibleLines(prev => [...prev, index]);
        }, delay);
      });

      await new Promise<void>(resolve => {
        audioService.speak(
          "The operator isn't available right now. She is asking: who do you wish to call? What do you need the most right now? Please leave your message after the tone. She'll find a way to reach you.",
          () => setTimeout(resolve, 1500),
          '/audio/prompt.mp3'
        );
      });

      if (isMounted) onCompleteRef.current();
    };

    runSequence();
    return () => {
      isMounted = false;
      audioService.stopPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 2 }}
      className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 space-y-3"
    >
      <AnimatePresence>
        {visibleLines.map(i => (
          <motion.p
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5 }}
            className="text-xl tracking-wide text-white/80"
          >
            {PROMPT_LINES[i]}
          </motion.p>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

function RecordingScreen({ onHangup }: { key?: string, onHangup: () => void }) {
  useEffect(() => {
    let isMounted = true;

    setTimeout(() => {
      if (!isMounted) return;
      audioService.playBeep(() => {
        if (!isMounted) return;
        audioService.setSidetone(true);
        audioService.startRecording();
      });
    }, 1000);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        audioService.stopRecording();
        audioService.setSidetone(false);
        onHangup();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      isMounted = false;
      window.removeEventListener('keydown', handleKeyDown);
      audioService.stopRecording();
    };
  }, [onHangup]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 2 }}
      className="absolute inset-0 flex flex-col items-center justify-center text-center"
    >
      <p className="text-sm tracking-widest text-white/40">Press spacebar to hang up.</p>
    </motion.div>
  );
}

function PostRecordingScreen({ onAction }: { key?: string, onAction: (action: number) => void }) {
  const [showOptions, setShowOptions] = useState(false);

  useEffect(() => {
    // Dark pause — let the silence breathe before options appear
    const t = setTimeout(() => setShowOptions(true), 2000);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '1') onAction(1);
      if (e.key === '2') onAction(2);
      if (e.key === '3') onAction(3);
      if (e.key === '4') onAction(4);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onAction]);

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <AnimatePresence>
        {showOptions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2 }}
            className="flex flex-col space-y-6 text-xl tracking-widest text-white/60"
          >
            <div className="flex space-x-8"><span className="w-4 text-right">1</span><span>Re-record</span></div>
            <div className="flex space-x-8"><span className="w-4 text-right">2</span><span>Listen</span></div>
            <div className="flex space-x-8"><span className="w-4 text-right">3</span><span>Send & exit</span></div>
            <div className="flex space-x-8"><span className="w-4 text-right">4</span><span>Discard & exit</span></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PlaybackScreen({ onComplete }: { key?: string, onComplete: () => void }) {
  useEffect(() => {
    audioService.playRecording(() => {
      onComplete();
    });
    return () => {
      audioService.stopPlayback();
    };
  }, [onComplete]);

  return <div className="absolute inset-0 bg-black" />;
}

function SendExitScreen({ onComplete }: { key?: string, onComplete: () => void }) {
  useEffect(() => {
    let isMounted = true;
    audioService.uploadRecording().catch(() => {});
    audioService.speak("Thank you. The operator will find a way to reach you.", () => {
      setTimeout(() => {
        if (isMounted) onComplete();
      }, 2000);
    }, '/audio/thank-you.mp3');
    return () => { isMounted = false; };
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 2 }}
      className="absolute inset-0 flex flex-col items-center justify-center text-center px-8"
    >
      <p className="text-xl tracking-wide text-white/80">Thank you. The operator will find a way to reach you.</p>
    </motion.div>
  );
}

function DiscardExitScreen({ onComplete }: { key?: string, onComplete: () => void }) {
  useEffect(() => {
    let isMounted = true;
    audioService.speak("May you be well. I'll be here if you need me.", () => {
      setTimeout(() => {
        if (isMounted) onComplete();
      }, 2000);
    }, '/audio/farewell.mp3');
    return () => { isMounted = false; };
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 2 }}
      className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 space-y-4"
    >
      <p className="text-xl tracking-wide text-white/80">May you be well.</p>
      <p className="text-xl tracking-wide text-white/80">I'll be here if you need me.</p>
    </motion.div>
  );
}

function EndScreen({ onReset }: { key?: string, onReset: () => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onReset();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onReset]);

  return <div className="absolute inset-0 bg-black" />;
}

function ErrorScreen({ key }: { key?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 flex flex-col items-center justify-center text-center"
    >
      <p className="text-xl tracking-wide text-white/80">This experience requires a microphone.</p>
    </motion.div>
  );
}

export default function App() {
  const [state, setState] = useState<AppState>('START');
  const [panelVisible, setPanelVisible] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`') setPanelVisible(v => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const family = FONT_OPTIONS[loadFontName()];
    if (family) document.body.style.fontFamily = family;
  }, []);

  const saved = loadDSP();

  useControls({
    'Appearance': folder({
      font: {
        label: 'Font',
        value: loadFontName(),
        options: Object.keys(FONT_OPTIONS),
        onChange: (name: string) => {
          const family = FONT_OPTIONS[name];
          if (family) {
            document.body.style.fontFamily = family;
            saveFontName(name);
          }
        },
      },
    }),
    'Monitoring': folder({
      monitorVolume: {
        label: 'Volume',
        value: saved.monitorVolume, min: 0, max: 2, step: 0.01,
        hint: 'How loud you hear your own mic in the speakers while speaking (sidetone). Lets you tell if the telephone effect is working before you record.',
        onChange: (v: number) => { audioService.setSidetoneVolume(v); saveDSP('monitorVolume', v); },
      },
    }),
    'Playback': folder({
      playbackVolume: {
        label: 'Volume',
        value: saved.playbackVolume, min: 0, max: 2, step: 0.01,
        hint: 'How loud your recorded message plays back when you press Listen (option 2). Does not affect the recording itself.',
        onChange: (v: number) => { audioService.setPlaybackVolume(v); saveDSP('playbackVolume', v); },
      },
    }),
    'Input': folder({
      preGain: {
        label: 'Pre-Gain',
        value: saved.preGain, min: 0, max: 4, step: 0.05,
        hint: 'Amplifies the raw mic signal before any DSP. Raise if your voice sounds too quiet after processing. Above 2× risks clipping.',
        onChange: (v: number) => { audioService.setPreGain(v); saveDSP('preGain', v); },
      },
    }, { collapsed: true }),
    'EQ': folder({
      highPass: {
        label: 'High-Pass Hz',
        value: saved.highPass, min: 50, max: 2000, step: 10,
        hint: 'Cuts all frequencies below this point. Removes desk rumble, AC hum, breath pops, and proximity bass from the mic. 80 Hz = natural, 500+ Hz = telephone narrowing.',
        onChange: (v: number) => { audioService.setHpFreq(v); saveDSP('highPass', v); },
      },
      lowPass: {
        label: 'Low-Pass Hz',
        value: saved.lowPass, min: 800, max: 16000, step: 100,
        hint: 'Cuts all frequencies above this point. Removes harshness and sibilance. 4 kHz = classic telephone, 10 kHz = broadcast warmth, 16 kHz = transparent.',
        onChange: (v: number) => { audioService.setLpFreq(v); saveDSP('lowPass', v); },
      },
    }, { collapsed: true }),
    'Compressor': folder({
      threshold: {
        label: 'Threshold dB',
        value: saved.threshold, min: -80, max: 0, step: 1,
        hint: 'Loudness level where compression starts kicking in. Lower means even quiet sounds get compressed. -20 dB is gentle leveling; -60 dB is very heavy.',
        onChange: (v: number) => { audioService.setCompThreshold(v); saveDSP('threshold', v); },
      },
      ratio: {
        label: 'Ratio',
        value: saved.ratio, min: 1, max: 20, step: 0.5,
        hint: 'How aggressively loud peaks are squashed once past the threshold. 2:1 = subtle evening-out, 10:1 = limiting, 20:1 = brick wall.',
        onChange: (v: number) => { audioService.setCompRatio(v); saveDSP('ratio', v); },
      },
      attack: {
        label: 'Attack s',
        value: saved.attack, min: 0, max: 1, step: 0.01,
        hint: 'How fast the compressor clamps down after a loud transient hits. Fast (0.01 s) = tight and controlled. Slow (0.3 s) = lets the punch through before squashing.',
        onChange: (v: number) => { audioService.setCompAttack(v); saveDSP('attack', v); },
      },
      release: {
        label: 'Release s',
        value: saved.release, min: 0.01, max: 2, step: 0.01,
        hint: 'How quickly the compressor lets go after the signal drops back down. Too fast = audible pumping/breathing. Too slow = quiet sounds after a loud one stay squashed.',
        onChange: (v: number) => { audioService.setCompRelease(v); saveDSP('release', v); },
      },
    }, { collapsed: true }),
    'Voice Prompts': folder({
      promptVolume: {
        label: 'Volume',
        value: saved.promptVolume, min: 0, max: 2, step: 0.01,
        hint: 'Volume of the pre-recorded MP3 files: welcome, operator prompt, thank-you, and farewell. These also pass through the telephone DSP chain.',
        onChange: (v: number) => { audioService.setPromptVolume(v); saveDSP('promptVolume', v); },
      },
    }, { collapsed: true }),
    'TTS Fallback': folder({
      ttsVolume: {
        label: 'Volume',
        value: saved.ttsVolume, min: 0, max: 1, step: 0.01,
        hint: 'Volume of the browser text-to-speech voice. Only used when an MP3 file fails to load.',
        onChange: (v: number) => { audioService.setTTSVolume(v); saveDSP('ttsVolume', v); },
      },
      ttsRate: {
        label: 'Rate',
        value: saved.ttsRate, min: 0.1, max: 2, step: 0.05,
        hint: 'Speaking speed of the TTS voice. 1.0 = normal, 0.5 = half speed, 2.0 = double speed. Lower is warmer and more deliberate.',
        onChange: (v: number) => { audioService.setTTSRate(v); saveDSP('ttsRate', v); },
      },
      ttsPitch: {
        label: 'Pitch',
        value: saved.ttsPitch, min: 0, max: 2, step: 0.05,
        hint: 'Pitch of the TTS voice. 1.0 = natural, below 1 = deeper/masculine, above 1 = higher. Only affects the browser synthesis fallback.',
        onChange: (v: number) => { audioService.setTTSPitch(v); saveDSP('ttsPitch', v); },
      },
    }, { collapsed: true }),
    'Ring': folder({
      ringVolume: {
        label: 'Volume',
        value: saved.ringVolume, min: 0, max: 2, step: 0.01,
        hint: 'Loudness of the ringing tone. Adjustable live while the phone is ringing — no need to wait for the next ring cycle.',
        onChange: (v: number) => { audioService.setRingVolume(v); saveDSP('ringVolume', v); },
      },
      ringFreq1: {
        label: 'Freq 1 Hz',
        value: saved.ringFreq1, min: 100, max: 2000, step: 1,
        hint: 'Frequency of the first ringing oscillator. Traditional telephone ring uses 440 Hz + 480 Hz. Detune from Freq 2 to widen the beating effect.',
        onChange: (v: number) => { audioService.setRingFreq1(v); saveDSP('ringFreq1', v); },
      },
      ringFreq2: {
        label: 'Freq 2 Hz',
        value: saved.ringFreq2, min: 100, max: 2000, step: 1,
        hint: 'Frequency of the second ringing oscillator. The difference between Freq 1 and Freq 2 creates an interference / beating effect.',
        onChange: (v: number) => { audioService.setRingFreq2(v); saveDSP('ringFreq2', v); },
      },
      ringOnSec: {
        label: 'Ring On s',
        value: saved.ringOnSec, min: 0.1, max: 5, step: 0.1,
        hint: 'How many seconds the ring sounds before going silent. US standard is 2 s on, UK is 0.4 s on.',
        onChange: (v: number) => { audioService.setRingOnSec(v); saveDSP('ringOnSec', v); },
      },
      ringCycleSec: {
        label: 'Cycle s',
        value: saved.ringCycleSec, min: 1, max: 10, step: 0.1,
        hint: 'Total length of one ring cycle (on + silent). Silence = Cycle − Ring On. US standard is 6 s (2 s ring, 4 s silence).',
        onChange: (v: number) => { audioService.setRingCycleSec(v); saveDSP('ringCycleSec', v); },
      },
    }, { collapsed: true }),
    'Beep': folder({
      beepVolume: {
        label: 'Volume',
        value: saved.beepVolume, min: 0, max: 2, step: 0.01,
        hint: 'Loudness of the recording-start beep tone.',
        onChange: (v: number) => { audioService.setBeepVolume(v); saveDSP('beepVolume', v); },
      },
      beepFreq: {
        label: 'Freq Hz',
        value: saved.beepFreq, min: 100, max: 4000, step: 10,
        hint: 'Pitch of the beep. 800 Hz is a standard answering-machine beep. Lower is warmer, higher is more alerting.',
        onChange: (v: number) => { audioService.setBeepFreq(v); saveDSP('beepFreq', v); },
      },
      beepDuration: {
        label: 'Duration s',
        value: saved.beepDuration, min: 0.1, max: 2, step: 0.05,
        hint: 'How long the beep lasts. Shorter = snappy cue, longer = more deliberate / ceremonial.',
        onChange: (v: number) => { audioService.setBeepDuration(v); saveDSP('beepDuration', v); },
      },
    }, { collapsed: true }),
  });

  return (
    <>
    <Leva hidden={!panelVisible} />
    {panelVisible && <DevTimeline current={state} onJump={setState} />}
    <div className="fixed inset-0 bg-black text-white/90 font-serif selection:bg-white/10 cursor-default">
      <AnimatePresence mode="wait">
        {state === 'START' && (
          <StartScreen key="start" onNext={() => setState('OATH')} onError={() => setState('ERROR')} />
        )}
        {state === 'OATH' && (
          <OathScreen key="oath" onNext={() => setState('CALL')} />
        )}
        {state === 'CALL' && (
          <CallScreen key="call" onComplete={() => setState('RECORDING')} />
        )}
        {state === 'RECORDING' && (
          <RecordingScreen key="recording" onHangup={() => setState('POST_RECORDING')} />
        )}
        {state === 'POST_RECORDING' && (
          <PostRecordingScreen
            key="post_recording"
            onAction={(action) => {
              if (action === 1) setState('RECORDING');
              if (action === 2) setState('PLAYBACK');
              if (action === 3) setState('SEND_EXIT');
              if (action === 4) setState('DISCARD_EXIT');
            }}
          />
        )}
        {state === 'PLAYBACK' && (
          <PlaybackScreen key="playback" onComplete={() => setState('POST_RECORDING')} />
        )}
        {state === 'SEND_EXIT' && (
          <SendExitScreen key="send_exit" onComplete={() => setState('END')} />
        )}
        {state === 'DISCARD_EXIT' && (
          <DiscardExitScreen key="discard_exit" onComplete={() => setState('END')} />
        )}
        {state === 'END' && (
          <EndScreen key="end" onReset={() => setState('START')} />
        )}
        {state === 'ERROR' && (
          <ErrorScreen key="error" />
        )}
      </AnimatePresence>
    </div>
    </>
  );
}
