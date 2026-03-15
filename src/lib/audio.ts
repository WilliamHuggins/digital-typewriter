export class TypewriterAudio {
  ctx: AudioContext | null = null;
  enabled: boolean = false;
  volume: number = 0.5;
  private loading: boolean = false;

  buffers: {
    models: Record<string, AudioBuffer[]>;
    space: AudioBuffer[];
    bell: AudioBuffer[];
    return: AudioBuffer[];
  } = {
    models: {
      remington: [],
      underwood: [],
      royal: [],
      olivetti: [],
      ibm: []
    },
    space: [],
    bell: [],
    return: []
  };

  private async loadSound(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      return await this.ctx.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.error(`Failed to load sound ${url}:`, e);
      return null;
    }
  }

  async init() {
    if (this.loading) return;
    this.loading = true;

    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.enabled = true;

    // Load sounds if not already loaded
    if (this.buffers.bell.length === 0) {
      const loadAll = async (urls: string[]) => {
        const bufs = await Promise.all(urls.map(url => this.loadSound(url)));
        return bufs.filter(b => b !== null) as AudioBuffer[];
      };

      this.buffers.models.remington = await loadAll(['/sounds/soft-click.wav', '/sounds/soft-hit.wav']);
      this.buffers.models.underwood = await loadAll(['/sounds/old-typing.wav', '/sounds/mechanical-hit.wav', '/sounds/mechanical-single-hit.wav']);
      this.buffers.models.royal = await loadAll(['/sounds/typewriter-hit.wav', '/sounds/single-mechanical-hit.wav']);
      this.buffers.models.olivetti = await loadAll(['/sounds/hard-click.wav', '/sounds/keyboard-typing.wav']);
      this.buffers.models.ibm = await loadAll(['/sounds/electric-typing.wav', '/sounds/electronic-typing.wav']);

      this.buffers.space = await loadAll(['/sounds/soft-hit.wav', '/sounds/soft-click.wav']);
      this.buffers.bell = await loadAll(['/sounds/bell-1.wav', '/sounds/return-bell.wav']);
      this.buffers.return = await loadAll(['/sounds/carriage-return-1.wav', '/sounds/carriage-return-2.flac']);
    }
    this.loading = false;
  }

  setVolume(v: number) {
    this.volume = v;
  }

  private playBuffer(buffers: AudioBuffer[], baseVolume: number = 1, varyPitch: boolean = true) {
    if (!this.enabled || !this.ctx || buffers.length === 0) return;

    const buffer = buffers[Math.floor(Math.random() * buffers.length)];
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = this.ctx.createGain();
    
    // Vary gain slightly
    const jitter = (Math.random() - 0.5) * 0.2;
    gainNode.gain.value = this.volume * baseVolume + jitter;

    // Vary playback speed slightly
    if (varyPitch) {
      source.playbackRate.value = 1 + (Math.random() - 0.5) * 0.1;
    }

    source.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    source.start(0);
  }

  playKeypress(isSpace: boolean = false, model: string = 'remington') {
    if (isSpace) {
      this.playBuffer(this.buffers.space, 0.8);
    } else {
      const modelBuffers = this.buffers.models[model] || this.buffers.models.remington;
      this.playBuffer(modelBuffers, 1.0);
    }
  }

  playBell() {
    this.playBuffer(this.buffers.bell, 0.8, false);
  }

  playReturn() {
    this.playBuffer(this.buffers.return, 1.0, false);
  }
}

export const audioEngine = new TypewriterAudio();
