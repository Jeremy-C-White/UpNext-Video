type BrowserAudioContext = AudioContext & { state: AudioContextState };

export class StoreAudioBus {
  private context: BrowserAudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: GainNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private muted = false;

  async start() {
    if (!this.context) this.buildGraph();
    await this.context?.resume();
    this.setMuted(this.muted);
    this.playDoorChime();
  }

  private buildGraph() {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor() as BrowserAudioContext;
    const master = context.createGain();
    const ambience = context.createGain();
    master.gain.value = 0.32;
    ambience.gain.value = 0.16;
    ambience.connect(master);
    master.connect(context.destination);

    const hum = context.createOscillator();
    const humGain = context.createGain();
    hum.type = "sine";
    hum.frequency.value = 59.9;
    humGain.gain.value = 0.018;
    hum.connect(humGain).connect(ambience);
    hum.start();

    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * 0.11;
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = buffer;
    noise.loop = true;
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 430;
    noiseGain.gain.value = 0.04;
    noise.connect(noiseFilter).connect(noiseGain).connect(ambience);
    noise.start();

    this.context = context;
    this.master = master;
    this.ambience = ambience;
    this.sources = [hum, noise];
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.32, this.context.currentTime, 0.08);
  }

  setPaused(paused: boolean) {
    if (!this.context || !this.ambience) return;
    this.ambience.gain.setTargetAtTime(paused ? 0 : 0.16, this.context.currentTime, 0.12);
  }

  private tone(frequency: number, startOffset: number, duration: number, gain = 0.1) {
    if (!this.context || !this.master || this.muted) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    const startsAt = this.context.currentTime + startOffset;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startsAt);
    envelope.gain.setValueAtTime(0.0001, startsAt);
    envelope.gain.exponentialRampToValueAtTime(gain, startsAt + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
    oscillator.connect(envelope).connect(this.master);
    oscillator.start(startsAt);
    oscillator.stop(startsAt + duration + 0.03);
  }

  playDoorChime() {
    this.tone(659.25, 0, 0.42, 0.13);
    this.tone(783.99, 0.16, 0.5, 0.11);
  }

  playCasePickup() {
    this.tone(185, 0, 0.08, 0.08);
    this.tone(110, 0.07, 0.12, 0.05);
  }

  playNavigationPing() {
    this.tone(880, 0, 0.14, 0.08);
    this.tone(1174.66, 0.11, 0.18, 0.06);
  }

  stop() {
    this.sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // A source may already have ended.
      }
    });
    this.sources = [];
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.ambience = null;
  }
}

