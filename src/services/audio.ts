export class AudioService {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingUrl: string | null = null;
  private playbackAudio: HTMLAudioElement | null = null;

  async initialize() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0; // Start muted
      this.source.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);
    } catch (err) {
      console.error("Microphone access denied", err);
      throw new Error("MIC_DENIED");
    }
  }

  setSidetone(enabled: boolean) {
    if (this.gainNode && this.audioContext) {
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      this.gainNode.gain.setTargetAtTime(enabled ? 0.4 : 0, this.audioContext.currentTime, 0.1);
    }
  }

  startRecording() {
    if (!this.stream) return;
    this.recordedChunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };
    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
      if (this.recordingUrl) {
        URL.revokeObjectURL(this.recordingUrl);
      }
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
    if (!this.recordingUrl) {
      onEnded();
      return;
    }
    this.playbackAudio = new Audio(this.recordingUrl);
    this.playbackAudio.onended = onEnded;
    this.playbackAudio.play();
  }

  stopPlayback() {
    if (this.playbackAudio) {
      this.playbackAudio.pause();
      this.playbackAudio.currentTime = 0;
    }
  }

  playBeep(onEnded?: () => void) {
    if (!this.audioContext) return;
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
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
    setTimeout(() => {
      if (onEnded) onEnded();
    }, 600);
  }

  playRinging(durationMs: number, onEnded?: () => void) {
    if (!this.audioContext) return;
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
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
    
    for (let i = 0; i < durationMs / 1000; i += 6) {
      gain.gain.setValueAtTime(0.1, now + i);
      gain.gain.setValueAtTime(0.1, now + i + 2);
      gain.gain.setValueAtTime(0, now + i + 2.1);
      gain.gain.setValueAtTime(0, now + i + 6);
    }
    
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + durationMs / 1000);
    osc2.stop(now + durationMs / 1000);
    
    setTimeout(() => {
      if (onEnded) onEnded();
    }, durationMs);
  }

  speak(text: string, onEnded?: () => void) {
    if (!window.speechSynthesis) {
      setTimeout(() => onEnded?.(), 2000);
      return;
    }
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;
    utterance.pitch = 0.9;
    
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.name.includes('Samantha') || v.name.includes('Google UK English Female') || v.name.includes('Female')) || voices[0];
    if (voice) utterance.voice = voice;
    
    utterance.onend = () => {
      if (onEnded) onEnded();
    };
    utterance.onerror = () => {
      if (onEnded) onEnded();
    };
    window.speechSynthesis.speak(utterance);
  }
}

export const audioService = new AudioService();
