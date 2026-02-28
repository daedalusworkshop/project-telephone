export class AudioService {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  // Sidetone chain — stored so every node can be tweaked live
  private preGainNode: GainNode | null = null;
  private hpNode: BiquadFilterNode | null = null;
  private lpNode: BiquadFilterNode | null = null;
  private compNode: DynamicsCompressorNode | null = null;
  private outputGainNode: GainNode | null = null;

  private sidetoneVolume = 0.42;

  // DSP defaults — shared between live sidetone chain and on-demand playback chains
  private dsp = {
    preGain: 0.80,
    hpFreq: 590,   hpQ: 2.45,
    lpFreq: 4350,  lpQ: 0.70,
    compThreshold: -26, compKnee: 13, compRatio: 3.0,
    compAttack: 0.32, compRelease: 0.77,
  };

  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingUrl: string | null = null;
  private playbackAudio: HTMLAudioElement | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private playbackVolume = 0.41;

  // Builds a fresh telephone DSP chain using current dsp params (used for playback / TTS).
  private buildTelephoneChain(): { input: GainNode; output: DynamicsCompressorNode } {
    const ctx = this.audioContext!;

    const pre = ctx.createGain();
    pre.gain.value = this.dsp.preGain;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = this.dsp.hpFreq;
    hp.Q.value = this.dsp.hpQ;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = this.dsp.lpFreq;
    lp.Q.value = this.dsp.lpQ;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = this.dsp.compThreshold;
    comp.knee.value = this.dsp.compKnee;
    comp.ratio.value = this.dsp.compRatio;
    comp.attack.value = this.dsp.compAttack;
    comp.release.value = this.dsp.compRelease;

    pre.connect(hp);
    hp.connect(lp);
    lp.connect(comp);
    return { input: pre, output: comp };
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

      // Build sidetone chain and store every node for live param updates
      this.preGainNode = this.audioContext.createGain();
      this.preGainNode.gain.value = this.dsp.preGain;

      this.hpNode = this.audioContext.createBiquadFilter();
      this.hpNode.type = 'highpass';
      this.hpNode.frequency.value = this.dsp.hpFreq;
      this.hpNode.Q.value = this.dsp.hpQ;

      this.lpNode = this.audioContext.createBiquadFilter();
      this.lpNode.type = 'lowpass';
      this.lpNode.frequency.value = this.dsp.lpFreq;
      this.lpNode.Q.value = this.dsp.lpQ;

      this.compNode = this.audioContext.createDynamicsCompressor();
      this.compNode.threshold.value = this.dsp.compThreshold;
      this.compNode.knee.value = this.dsp.compKnee;
      this.compNode.ratio.value = this.dsp.compRatio;
      this.compNode.attack.value = this.dsp.compAttack;
      this.compNode.release.value = this.dsp.compRelease;

      this.outputGainNode = this.audioContext.createGain();
      this.outputGainNode.gain.value = 0; // starts muted; setSidetone() opens it

      this.source.connect(this.preGainNode);
      this.preGainNode.connect(this.hpNode);
      this.hpNode.connect(this.lpNode);
      this.lpNode.connect(this.compNode);
      this.compNode.connect(this.outputGainNode);
      this.outputGainNode.connect(this.audioContext.destination);

      await this.audioContext.resume();
    } catch (err) {
      console.error("Microphone access denied", err);
      throw new Error("MIC_DENIED");
    }
  }

  // ── Live param setters ────────────────────────────────────────────────────

  setSidetoneVolume(v: number) {
    this.sidetoneVolume = v;
    if (this.outputGainNode && this.audioContext && this.outputGainNode.gain.value > 0) {
      this.outputGainNode.gain.setTargetAtTime(v, this.audioContext.currentTime, 0.05);
    }
  }

  setPreGain(v: number) {
    this.dsp.preGain = v;
    if (this.preGainNode) this.preGainNode.gain.value = v;
  }

  setHpFreq(v: number) {
    this.dsp.hpFreq = v;
    if (this.hpNode) this.hpNode.frequency.value = v;
  }

  setLpFreq(v: number) {
    this.dsp.lpFreq = v;
    if (this.lpNode) this.lpNode.frequency.value = v;
  }

  setCompThreshold(v: number) {
    this.dsp.compThreshold = v;
    if (this.compNode) this.compNode.threshold.value = v;
  }

  setCompRatio(v: number) {
    this.dsp.compRatio = v;
    if (this.compNode) this.compNode.ratio.value = v;
  }

  setCompAttack(v: number) {
    this.dsp.compAttack = v;
    if (this.compNode) this.compNode.attack.value = v;
  }

  setCompRelease(v: number) {
    this.dsp.compRelease = v;
    if (this.compNode) this.compNode.release.value = v;
  }

  setPlaybackVolume(v: number) {
    this.playbackVolume = v;
    if (this.playbackAudio) this.playbackAudio.volume = v;
  }

  // ── Sidetone on/off ──────────────────────────────────────────────────────

  setSidetone(enabled: boolean) {
    if (this.outputGainNode && this.audioContext) {
      const apply = () => {
        this.outputGainNode!.gain.setTargetAtTime(
          enabled ? this.sidetoneVolume : 0,
          this.audioContext!.currentTime,
          0.1,
        );
      };
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().then(apply);
      } else {
        apply();
      }
    }
  }

  // ── Recording ────────────────────────────────────────────────────────────

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
    this.playbackAudio.volume = this.playbackVolume;
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
        audio.onended = () => { this.currentAudio = null; onEnded?.(); };
        audio.onerror = () => { this.currentAudio = null; resolve(false); };
        audio.play().then(() => resolve(true)).catch(() => resolve(false));
      };
      audio.onerror = () => resolve(false);
      setTimeout(() => resolve(false), 1000);
    });
  }

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

      const speak = () => {
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(v =>
          v.name.includes('Samantha') ||
          v.name.includes('Google UK English Female') ||
          v.name.includes('Female')
        ) || voices[0];
        if (voice) utterance.voice = voice;

        const fallback = setTimeout(done, this.estimateDuration(text) + 2000);
        utterance.onend = () => { clearTimeout(fallback); done(); };
        utterance.onerror = done;

        window.speechSynthesis.speak(utterance);
      };

      if (window.speechSynthesis.getVoices().length > 0) {
        speak();
      } else {
        window.speechSynthesis.addEventListener('voiceschanged', speak, { once: true });
        setTimeout(() => { if (window.speechSynthesis.getVoices().length === 0) speak(); }, 500);
      }
    };

    if (audioSrc) {
      this.tryAudioFile(audioSrc, done).then(loaded => { if (!loaded) useTTS(); });
    } else {
      useTTS();
    }
  }

  private estimateDuration(text: string): number {
    const words = text.trim().split(/\s+/).length;
    const wordsPerMin = 130 * 0.85;
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

    osc1.type = 'sine'; osc1.frequency.value = 440;
    osc2.type = 'sine'; osc2.frequency.value = 480;

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.audioContext.destination);

    const now = this.audioContext.currentTime;
    gain.gain.setValueAtTime(0, now);

    for (let i = 0; i < durationMs / 1000; i += 6) {
      gain.gain.setValueAtTime(0.12, now + i);
      gain.gain.setValueAtTime(0.12, now + i + 2);
      gain.gain.setValueAtTime(0, now + i + 2.05);
    }

    osc1.start(now); osc2.start(now);
    osc1.stop(now + durationMs / 1000);
    osc2.stop(now + durationMs / 1000);

    setTimeout(() => onEnded?.(), durationMs);
  }

  async uploadRecording() {
    if (!this.recordedChunks.length) return;
    const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
    await fetch('http://localhost:3001/api/recordings', {
      method: 'POST',
      headers: { 'Content-Type': 'audio/webm' },
      body: blob,
    });
  }
}

export const audioService = new AudioService();
