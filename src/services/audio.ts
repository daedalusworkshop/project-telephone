export class AudioService {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingUrl: string | null = null;
  private playbackAudio: HTMLAudioElement | null = null;
  private currentAudio: HTMLAudioElement | null = null;

  private buildTelephoneChain(): { input: BiquadFilterNode; output: DynamicsCompressorNode } {
    const hp = this.audioContext!.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 590;
    hp.Q.value = 2.45;

    const lp = this.audioContext!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4350;
    lp.Q.value = 0.70;

    const comp = this.audioContext!.createDynamicsCompressor();
    comp.threshold.value = -60;
    comp.knee.value = 13;
    comp.ratio.value = 13.5;
    comp.attack.value = 0.20;
    comp.release.value = 0.77;

    hp.connect(lp);
    lp.connect(comp);
    return { input: hp, output: comp };
  }

  async initialize() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0;
      const chain = this.buildTelephoneChain();
      this.source.connect(chain.input);
      chain.output.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);
      await this.audioContext.resume();
    } catch (err) {
      console.error("Microphone access denied", err);
      throw new Error("MIC_DENIED");
    }
  }

  setSidetone(enabled: boolean) {
    if (this.gainNode && this.audioContext) {
      const apply = () => {
        this.gainNode!.gain.setTargetAtTime(enabled ? 0.4 : 0, this.audioContext!.currentTime, 0.1);
      };
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().then(apply);
      } else {
        apply();
      }
    }
  }

  startRecording() {
    if (!this.stream) return;
    this.recordedChunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordedChunks.push(e.data);
    };
    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
      if (this.recordingUrl) URL.revokeObjectURL(this.recordingUrl);
      this.recordingUrl = URL.createObjectURL(blob);
    };
    this.mediaRecorder.start();
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  playRecording(onEnded: () => void) {
    if (!this.recordingUrl) { onEnded(); return; }
    this.playbackAudio = new Audio(this.recordingUrl);
    if (this.audioContext) {
      const mediaSource = this.audioContext.createMediaElementSource(this.playbackAudio);
      const chain = this.buildTelephoneChain();
      mediaSource.connect(chain.input);
      chain.output.connect(this.audioContext.destination);
    }
    this.playbackAudio.onended = onEnded;
    this.playbackAudio.play().catch(() => {});
  }

  stopPlayback() {
    if (this.playbackAudio) {
      this.playbackAudio.pause();
      this.playbackAudio.currentTime = 0;
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
  }

  // Try to play a pre-recorded file. Returns true if the file loaded successfully.
  private async tryAudioFile(src: string, onEnded?: () => void): Promise<boolean> {
    return new Promise((resolve) => {
      const audio = new Audio(src);
      audio.oncanplaythrough = () => {
        this.currentAudio = audio;
        if (this.audioContext) {
          const mediaSource = this.audioContext.createMediaElementSource(audio);
          const chain = this.buildTelephoneChain();
          mediaSource.connect(chain.input);
          chain.output.connect(this.audioContext.destination);
        }
        audio.onended = () => {
          this.currentAudio = null;
          onEnded?.();
        };
        audio.onerror = () => {
          this.currentAudio = null;
          resolve(false);
        };
        audio.play().then(() => resolve(true)).catch(() => resolve(false));
      };
      audio.onerror = () => resolve(false);
      // Give it 1 second to respond
      setTimeout(() => resolve(false), 1000);
    });
  }

  // Speak text — tries an audio file first, falls back to TTS with a duration-based timeout.
  // audioSrc: optional path like '/audio/welcome.mp3'
  speak(text: string, onEnded?: () => void, audioSrc?: string) {
    const done = (() => {
      let called = false;
      return () => { if (!called) { called = true; onEnded?.(); } };
    })();

    const useTTS = () => {
      if (!window.speechSynthesis) {
        setTimeout(done, this.estimateDuration(text));
        return;
      }
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.85;
      utterance.pitch = 0.9;

      // Chrome returns voices asynchronously — wait for them if needed
      const speak = () => {
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(v =>
          v.name.includes('Samantha') ||
          v.name.includes('Google UK English Female') ||
          v.name.includes('Female')
        ) || voices[0];
        if (voice) utterance.voice = voice;

        utterance.onend = done;
        utterance.onerror = done;

        // Hard fallback: Chrome's onend is unreliable
        const fallback = setTimeout(done, this.estimateDuration(text) + 2000);
        utterance.onend = () => { clearTimeout(fallback); done(); };

        window.speechSynthesis.speak(utterance);
      };

      if (window.speechSynthesis.getVoices().length > 0) {
        speak();
      } else {
        window.speechSynthesis.addEventListener('voiceschanged', speak, { once: true });
        // If voiceschanged never fires, fall back after 500ms
        setTimeout(() => { if (window.speechSynthesis.getVoices().length === 0) speak(); }, 500);
      }
    };

    if (audioSrc) {
      this.tryAudioFile(audioSrc, done).then(loaded => {
        if (!loaded) useTTS();
      });
    } else {
      useTTS();
    }
  }

  // Estimate how long TTS will take in ms based on word count and rate
  private estimateDuration(text: string): number {
    const words = text.trim().split(/\s+/).length;
    const wordsPerMin = 130 * 0.85; // ~110 wpm at rate 0.85
    return Math.max(3000, (words / wordsPerMin) * 60 * 1000);
  }

  playBeep(onEnded?: () => void) {
    if (!this.audioContext) { setTimeout(() => onEnded?.(), 600); return; }
    if (this.audioContext.state === 'suspended') this.audioContext.resume();

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.audioContext.currentTime);
    gain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(this.audioContext.destination);
    osc.start();
    osc.stop(this.audioContext.currentTime + 0.5);

    setTimeout(() => onEnded?.(), 600);
  }

  playRinging(durationMs: number, onEnded?: () => void) {
    if (!this.audioContext) { setTimeout(() => onEnded?.(), durationMs); return; }
    if (this.audioContext.state === 'suspended') this.audioContext.resume();

    const osc1 = this.audioContext.createOscillator();
    const osc2 = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc1.type = 'sine';
    osc1.frequency.value = 440;
    osc2.type = 'sine';
    osc2.frequency.value = 480;

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.audioContext.destination);

    const now = this.audioContext.currentTime;
    gain.gain.setValueAtTime(0, now);

    // RING pattern: 2s on, 4s off
    for (let i = 0; i < durationMs / 1000; i += 6) {
      gain.gain.setValueAtTime(0.12, now + i);
      gain.gain.setValueAtTime(0.12, now + i + 2);
      gain.gain.setValueAtTime(0, now + i + 2.05);
    }

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + durationMs / 1000);
    osc2.stop(now + durationMs / 1000);

    setTimeout(() => onEnded?.(), durationMs);
  }
}

export const audioService = new AudioService();
