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

  // DSP defaults — used by sidetone chain (live) and playback/prompt chains (on-demand)
  private dsp = {
    preGain: 0.80,
    hpFreq: 590,  hpQ: 2.45,
    lpFreq: 4350, lpQ: 0.70,
    compThreshold: -26, compKnee: 13, compRatio: 3.0,
    compAttack: 0.32, compRelease: 0.77,
  };

  // System sound params — beep, ring, voice prompts, TTS
  private sounds = {
    promptVolume: 0.08,
    ttsRate: 0.85,
    ttsPitch: 0.9,
    ttsVolume: 1.0,
    beepFreq: 800,
    beepVolume: 0.1,
    beepDuration: 0.5,
    ringVolume: 0.12,
    ringFreq1: 440,
    ringFreq2: 480,
    ringOnSec: 2,
    ringCycleSec: 6,
  };

  // Live ring master gain — sits on top of the envelope so volume can be changed mid-ring
  private ringingMasterGain: GainNode | null = null;
  // Ring oscillators — stored so stopPlayback can hard-stop them immediately
  private ringingOsc1: OscillatorNode | null = null;
  private ringingOsc2: OscillatorNode | null = null;

  // Audio element being loaded (not yet playing) — tracked to abort on cleanup
  private pendingAudio: HTMLAudioElement | null = null;

  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingUrl: string | null = null;
  private recordingTimestamp: string | null = null;
  private playbackAudio: HTMLAudioElement | null = null;
  private playbackGainNode: GainNode | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private currentAudioGain: GainNode | null = null;
  private playbackVolume = 0.41;

  // ── DSP chain builder (used for playback & prompt chains) ────────────────

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

  // ── Init ─────────────────────────────────────────────────────────────────

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

      // Build and store sidetone chain for live param updates
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
      this.outputGainNode.gain.value = 0; // muted until setSidetone(true)

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

  // ── Sidetone / mic chain setters ─────────────────────────────────────────

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

  // ── Playback (recorded message) setters ──────────────────────────────────

  setPlaybackVolume(v: number) {
    this.playbackVolume = v;
    if (this.playbackGainNode) this.playbackGainNode.gain.value = v;
  }

  // ── Voice prompt setters ─────────────────────────────────────────────────

  setPromptVolume(v: number) {
    this.sounds.promptVolume = v;
    if (this.currentAudioGain) this.currentAudioGain.gain.value = v;
  }

  // ── TTS setters ───────────────────────────────────────────────────────────

  setTTSRate(v: number)   { this.sounds.ttsRate = v; }
  setTTSPitch(v: number)  { this.sounds.ttsPitch = v; }
  setTTSVolume(v: number) { this.sounds.ttsVolume = v; }

  // ── Beep setters ──────────────────────────────────────────────────────────

  setBeepFreq(v: number)     { this.sounds.beepFreq = v; }
  setBeepVolume(v: number)   { this.sounds.beepVolume = v; }
  setBeepDuration(v: number) { this.sounds.beepDuration = v; }

  // ── Ring setters ──────────────────────────────────────────────────────────

  setRingVolume(v: number) {
    this.sounds.ringVolume = v;
    // Live-adjust master gain if ring is currently playing
    if (this.ringingMasterGain) this.ringingMasterGain.gain.value = v;
  }
  setRingFreq1(v: number)    { this.sounds.ringFreq1 = v; }
  setRingFreq2(v: number)    { this.sounds.ringFreq2 = v; }
  setRingOnSec(v: number)    { this.sounds.ringOnSec = v; }
  setRingCycleSec(v: number) { this.sounds.ringCycleSec = v; }

  // ── Sidetone on/off ───────────────────────────────────────────────────────

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

  // ── Recording ─────────────────────────────────────────────────────────────

  startRecording() {
    if (!this.stream) return;
    this.recordedChunks = [];
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    this.recordingTimestamp = [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
    ].join('-') + '_' + [
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join('-');
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
      this.playbackGainNode = this.audioContext.createGain();
      this.playbackGainNode.gain.value = this.playbackVolume;
      const chain = this.buildTelephoneChain();
      mediaSource.connect(this.playbackGainNode);
      this.playbackGainNode.connect(chain.input);
      chain.output.connect(this.audioContext.destination);
    }
    this.playbackAudio.onended = () => { this.playbackGainNode = null; onEnded(); };
    this.playbackAudio.play().catch(() => {});
  }

  stopPlayback() {
    // Cancel any audio element that is still loading — prevents stale oncanplaythrough
    // callbacks from firing after a StrictMode cleanup or early exit.
    if (this.pendingAudio) {
      this.pendingAudio.oncanplaythrough = null;
      this.pendingAudio.onerror = null;
      this.pendingAudio.src = '';
      this.pendingAudio = null;
    }
    if (this.playbackAudio) {
      this.playbackAudio.pause();
      this.playbackAudio.currentTime = 0;
      this.playbackGainNode = null;
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
      this.currentAudioGain = null;
    }
    // Hard-stop ring oscillators and silence the master gain
    if (this.ringingOsc1) {
      try { this.ringingOsc1.stop(); } catch { /* already stopped */ }
      this.ringingOsc1 = null;
    }
    if (this.ringingOsc2) {
      try { this.ringingOsc2.stop(); } catch { /* already stopped */ }
      this.ringingOsc2 = null;
    }
    if (this.ringingMasterGain) {
      this.ringingMasterGain.gain.value = 0;
      this.ringingMasterGain = null;
    }
    // Cancel any in-progress TTS
    window.speechSynthesis?.cancel();
  }

  // ── Voice prompts (pre-recorded MP3s) ────────────────────────────────────

  private async tryAudioFile(src: string, onEnded?: () => void): Promise<boolean> {
    // Discard any previously pending audio so its callbacks can't fire late
    if (this.pendingAudio) {
      this.pendingAudio.oncanplaythrough = null;
      this.pendingAudio.onerror = null;
      this.pendingAudio.src = '';
      this.pendingAudio = null;
    }

    return new Promise((resolve) => {
      const audio = new Audio(src);
      this.pendingAudio = audio;

      const cleanup = () => {
        // Only clean up if this audio element is still the active pending one
        if (this.pendingAudio === audio) this.pendingAudio = null;
      };

      audio.oncanplaythrough = () => {
        // If stopPlayback was called before this fired, abort silently
        if (this.pendingAudio !== audio) return;
        cleanup();

        this.currentAudio = audio;
        if (this.audioContext) {
          const mediaSource = this.audioContext.createMediaElementSource(audio);
          this.currentAudioGain = this.audioContext.createGain();
          this.currentAudioGain.gain.value = this.sounds.promptVolume;
          const chain = this.buildTelephoneChain();
          mediaSource.connect(this.currentAudioGain);
          this.currentAudioGain.connect(chain.input);
          chain.output.connect(this.audioContext.destination);
        }
        audio.onended = () => { this.currentAudio = null; this.currentAudioGain = null; onEnded?.(); };
        audio.onerror = () => { this.currentAudio = null; this.currentAudioGain = null; resolve(false); };
        audio.play().then(() => resolve(true)).catch(() => resolve(false));
      };

      audio.onerror = () => { cleanup(); resolve(false); };

      // Timeout: if loading stalls, fall through to TTS. Clear handlers first so a
      // late oncanplaythrough can't play the audio alongside TTS.
      setTimeout(() => {
        if (this.pendingAudio !== audio) return; // already handled
        cleanup();
        audio.oncanplaythrough = null;
        audio.onerror = null;
        resolve(false);
      }, 1000);
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
      utterance.rate   = this.sounds.ttsRate;
      utterance.pitch  = this.sounds.ttsPitch;
      utterance.volume = this.sounds.ttsVolume;

      const speak = (() => {
        // Guard: ensure speak() is only called once even if both the voiceschanged
        // event and the 500ms fallback timeout fire close together.
        let spoken = false;
        return () => {
          if (spoken) return;
          spoken = true;
          const voices = window.speechSynthesis.getVoices();
          const voice = voices.find(v =>
            v.name.includes('Samantha') ||
            v.name.includes('Google UK English Female') ||
            v.name.includes('Female')
          ) || voices[0];
          if (voice) utterance.voice = voice;

          const fallback = setTimeout(done, this.estimateDuration(text) + 2000);
          utterance.onend = () => { clearTimeout(fallback); done(); };
          utterance.onerror = () => { clearTimeout(fallback); done(); };

          window.speechSynthesis.speak(utterance);
        };
      })();

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

  // ── Beep ──────────────────────────────────────────────────────────────────

  playBeep(onEnded?: () => void) {
    const dur = this.sounds.beepDuration;
    if (!this.audioContext) { setTimeout(() => onEnded?.(), dur * 1000 + 100); return; }
    if (this.audioContext.state === 'suspended') this.audioContext.resume();

    const osc  = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const now  = this.audioContext.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(this.sounds.beepFreq, now);
    gain.gain.setValueAtTime(this.sounds.beepVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(gain);
    gain.connect(this.audioContext.destination);
    osc.start(now);
    osc.stop(now + dur);

    setTimeout(() => onEnded?.(), dur * 1000 + 100);
  }

  // ── Ring ──────────────────────────────────────────────────────────────────

  playRinging(durationMs: number, onEnded?: () => void) {
    if (!this.audioContext) { setTimeout(() => onEnded?.(), durationMs); return; }
    if (this.audioContext.state === 'suspended') this.audioContext.resume();

    const { ringFreq1, ringFreq2, ringVolume, ringOnSec, ringCycleSec } = this.sounds;

    const osc1 = this.audioContext.createOscillator();
    const osc2 = this.audioContext.createOscillator();
    // Envelope gain: on/off pattern
    const envelopeGain = this.audioContext.createGain();
    // Master gain: live-adjustable volume
    this.ringingMasterGain = this.audioContext.createGain();
    this.ringingMasterGain.gain.value = ringVolume;

    // Store refs so stopPlayback() can hard-stop them
    this.ringingOsc1 = osc1;
    this.ringingOsc2 = osc2;

    osc1.type = 'sine'; osc1.frequency.value = ringFreq1;
    osc2.type = 'sine'; osc2.frequency.value = ringFreq2;

    osc1.connect(envelopeGain);
    osc2.connect(envelopeGain);
    envelopeGain.connect(this.ringingMasterGain);
    this.ringingMasterGain.connect(this.audioContext.destination);

    const now = this.audioContext.currentTime;
    envelopeGain.gain.setValueAtTime(0, now);

    const totalSec = durationMs / 1000;
    for (let t = 0; t < totalSec; t += ringCycleSec) {
      envelopeGain.gain.setValueAtTime(1, now + t);
      envelopeGain.gain.setValueAtTime(1, now + t + ringOnSec);
      envelopeGain.gain.setValueAtTime(0, now + t + ringOnSec + 0.05);
    }

    osc1.start(now); osc2.start(now);
    osc1.stop(now + totalSec);
    osc2.stop(now + totalSec);

    setTimeout(() => {
      this.ringingOsc1 = null;
      this.ringingOsc2 = null;
      this.ringingMasterGain = null;
      onEnded?.();
    }, durationMs);
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  async uploadRecording() {
    if (!this.recordedChunks.length) return;
    const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
    const headers: Record<string, string> = { 'Content-Type': 'audio/webm' };
    if (this.recordingTimestamp) headers['X-Recording-Time'] = this.recordingTimestamp;
    await fetch('http://localhost:3001/api/recordings', {
      method: 'POST',
      headers,
      body: blob,
    });
  }
}

export const audioService = new AudioService();
