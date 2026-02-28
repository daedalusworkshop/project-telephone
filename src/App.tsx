import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { audioService } from './services/audio';

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
      className="absolute bottom-24 left-0 right-0 flex flex-col items-center justify-center text-center space-y-8"
    >
      <p className="text-xl tracking-wide lowercase text-white/80">please pick up the telephone.</p>
      <AnimatePresence>
        {showNext && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2 }}
            onClick={handleNext}
            className="text-sm tracking-widest text-white/40 hover:text-white/80 transition-colors duration-500 lowercase cursor-pointer"
          >
            [ next ]
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function OathScreen({ onNext }: { key?: string, onNext: () => void }) {
  const [showNext, setShowNext] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowNext(true), 4000);
    return () => clearTimeout(t);
  }, []);

  const handleNext = () => {
    audioService.setSidetone(false);
    onNext();
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      transition={{ duration: 2 }}
      className="absolute bottom-24 left-0 right-0 flex flex-col items-center justify-center text-center space-y-12 px-8 max-w-2xl mx-auto"
    >
      <div className="text-xl tracking-wide lowercase text-white/80 leading-relaxed space-y-6">
        <p>please say:</p>
        <p className="italic">"i open my heart to everything that i feel…</p>
        <p className="italic">and will give myself the time and honesty that i need to complete this experience."</p>
      </div>
      <AnimatePresence>
        {showNext && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2 }}
            onClick={handleNext}
            className="text-sm tracking-widest text-white/40 hover:text-white/80 transition-colors duration-500 lowercase cursor-pointer"
          >
            [ next ]
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CallScreen({ onComplete }: { key?: string, onComplete: () => void }) {
  const [step, setStep] = useState<'INTRO' | 'RINGING' | 'PROMPT'>('INTRO');
  const [promptLine, setPromptLine] = useState(-1);

  useEffect(() => {
    let isMounted = true;

    const runSequence = async () => {
      // 1. Intro
      await new Promise<void>(resolve => {
        audioService.speak("Hello, welcome. Please wait while I connect you with your operator. She can direct your call to anyone in the world.", () => {
          setTimeout(resolve, 1000);
        });
      });
      if (!isMounted) return;

      // 2. Ringing
      setStep('RINGING');
      await new Promise<void>(resolve => {
        audioService.playRinging(15000, resolve);
      });
      if (!isMounted) return;

      // 3. Prompt
      setStep('PROMPT');
      
      const lines = [
        { text: "the operator isn't available right now.", delay: 0 },
        { text: "she is asking: who do you wish to call?", delay: 3500 },
        { text: "what do you need the most right now?", delay: 7000 },
        { text: "please leave your message after the tone.", delay: 10500 },
        { text: "she'll find a way to reach you.", delay: 14000 }
      ];

      lines.forEach((line, index) => {
        setTimeout(() => {
          if (isMounted) setPromptLine(index);
        }, line.delay);
      });

      await new Promise<void>(resolve => {
        audioService.speak("The operator isn't available right now. She is asking: who do you wish to call? What do you need the most right now? Please leave your message after the tone. She'll find a way to reach you.", () => {
          setTimeout(resolve, 2000);
        });
      });
      
      if (isMounted) onComplete();
    };

    runSequence();

    return () => {
      isMounted = false;
    };
  }, [onComplete]);

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      transition={{ duration: 2 }}
      className="absolute bottom-24 left-0 right-0 flex flex-col items-center justify-center text-center px-8"
    >
      <AnimatePresence mode="wait">
        {step === 'PROMPT' && promptLine >= 0 && (
          <motion.div
            key={promptLine}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 1.5 }}
            className="text-xl tracking-wide lowercase text-white/80"
          >
            {promptLine === 0 && <p>the operator isn't available right now.</p>}
            {promptLine === 1 && <p>she is asking: who do you wish to call?</p>}
            {promptLine === 2 && <p>what do you need the most right now?</p>}
            {promptLine === 3 && <p>please leave your message after the tone.</p>}
            {promptLine === 4 && <p>she'll find a way to reach you.</p>}
          </motion.div>
        )}
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
    };
  }, [onHangup]);

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      transition={{ duration: 2 }}
      className="absolute bottom-24 left-0 right-0 flex flex-col items-center justify-center text-center"
    >
      <p className="text-sm tracking-widest lowercase text-white/40">press spacebar to hang up.</p>
    </motion.div>
  );
}

function PostRecordingScreen({ onAction }: { key?: string, onAction: (action: number) => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '1') onAction(1);
      if (e.key === '2') onAction(2);
      if (e.key === '3') onAction(3);
      if (e.key === '4') onAction(4);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onAction]);

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      transition={{ duration: 2 }}
      className="absolute inset-0 flex items-center justify-center"
    >
      <div className="flex flex-col space-y-6 text-xl tracking-widest lowercase text-white/60">
        <div className="flex space-x-8"><span className="w-4 text-right">1</span><span>re-record</span></div>
        <div className="flex space-x-8"><span className="w-4 text-right">2</span><span>listen</span></div>
        <div className="flex space-x-8"><span className="w-4 text-right">3</span><span>send & exit</span></div>
        <div className="flex space-x-8"><span className="w-4 text-right">4</span><span>discard & exit</span></div>
      </div>
    </motion.div>
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
    audioService.speak("Thank you. The operator will find a way to reach you.", () => {
      setTimeout(() => {
        if (isMounted) onComplete();
      }, 2000);
    });
    return () => { isMounted = false; };
  }, [onComplete]);

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      transition={{ duration: 2 }}
      className="absolute bottom-24 left-0 right-0 flex flex-col items-center justify-center text-center px-8"
    >
      <p className="text-xl tracking-wide lowercase text-white/80">thank you. the operator will find a way to reach you.</p>
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
    });
    return () => { isMounted = false; };
  }, [onComplete]);

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      transition={{ duration: 2 }}
      className="absolute bottom-24 left-0 right-0 flex flex-col items-center justify-center text-center px-8 space-y-4"
    >
      <p className="text-xl tracking-wide lowercase text-white/80">may you be well.</p>
      <p className="text-xl tracking-wide lowercase text-white/80">i'll be here if you need me.</p>
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
      className="absolute bottom-24 left-0 right-0 flex flex-col items-center justify-center text-center"
    >
      <p className="text-xl tracking-wide lowercase text-white/80">this experience requires a microphone.</p>
    </motion.div>
  );
}

export default function App() {
  const [state, setState] = useState<AppState>('START');

  return (
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
  );
}
