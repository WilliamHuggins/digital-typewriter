export type AudioStatus = 'off' | 'loading' | 'ready' | 'failed';

export class TypewriterAudio {
  ctx: AudioContext | null = null;
  enabled: boolean = false;
  volume: number = 0.5;
  private loading: boolean = false;
  status: AudioStatus = 'off';
  private initPromise: Promise<void> | null = null;
  private statusListeners = new Set<(status: AudioStatus) => void>();
  private recentBufferIndices: Record<string, number[]> = {};
  private activeVoices: { source: AudioBufferSourceNode; gain: GainNode; startedAt: number; key: string }[] = [];

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
      if (!response.ok) {
        console.error(`[audio] Failed to fetch sound ${url}: HTTP ${response.status}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength === 0) {
        console.error(`[audio] Failed to load sound ${url}: empty file`);
        return null;
      }

      return await this.ctx.decodeAudioData(arrayBuffer);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`[audio] Failed to decode sound ${url}: ${error.name}: ${error.message}`);
      } else {
        console.error(`[audio] Failed to decode sound ${url}:`, error);
      }
      return null;
    }
  }

  private createFallbackBuffer(category: 'key' | 'space' | 'return' | 'bell'): AudioBuffer | null {
    if (!this.ctx) return null;

    const sampleRate = this.ctx.sampleRate;
    const durationByCategory: Record<typeof category, number> = {
      key: 0.06,
      space: 0.075,
      return: 0.16,
      bell: 0.22
    };
    const baseFrequencyByCategory: Record<typeof category, number> = {
      key: 1500,
      space: 900,
      return: 250,
      bell: 1850
    };

    const duration = durationByCategory[category];
    const frameCount = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);
    const baseFrequency = baseFrequencyByCategory[category];

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const progress = i / frameCount;
      const decay = Math.exp(-progress * (category === 'bell' ? 3.5 : category === 'return' ? 6 : 10));
      const sine = Math.sin(2 * Math.PI * baseFrequency * t);
      const overtone = Math.sin(2 * Math.PI * baseFrequency * 1.7 * t) * (category === 'bell' ? 0.35 : 0.2);
      const noise = (Math.random() * 2 - 1) * (category === 'bell' ? 0.08 : 0.18);
      const click = i < 50 ? 1 - i / 50 : 0;
      channelData[i] = (sine * 0.55 + overtone + noise + click * 0.22) * decay;
    }

    return buffer;
  }

  private ensureFallbackBuffers() {
    const ensure = (categoryLabel: string, existing: AudioBuffer[], fallbackType: 'key' | 'space' | 'return' | 'bell') => {
      if (existing.length > 0) return existing;
      const fallback = this.createFallbackBuffer(fallbackType);
      if (!fallback) return existing;
      console.warn(`[audio] ${categoryLabel} has no decodable assets. Using synthesized fallback.`);
      return [fallback];
    };

    for (const modelName of Object.keys(this.buffers.models)) {
      this.buffers.models[modelName] = ensure(`model:${modelName}`, this.buffers.models[modelName], 'key');
    }

    this.buffers.space = ensure('space', this.buffers.space, 'space');
    this.buffers.bell = ensure('bell', this.buffers.bell, 'bell');
    this.buffers.return = ensure('return', this.buffers.return, 'return');
  }

  private setStatus(status: AudioStatus) {
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }

  onStatusChange(listener: (status: AudioStatus) => void) {
    this.statusListeners.add(listener);
    listener(this.status);

    return () => {
      this.statusListeners.delete(listener);
    };
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;

    if (!enabled) {
      this.loading = false;
      this.initPromise = null;
      this.setStatus('off');
    }
  }

  async init() {
    if (!this.enabled) {
      this.setStatus('off');
      return;
    }

    if (this.status === 'ready') {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.loading = true;
    this.setStatus('loading');

    this.initPromise = (async () => {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      const loadAll = async (urls: string[], label: string) => {
        const results = await Promise.all(urls.map(async (url) => ({ url, buffer: await this.loadSound(url) })));
        const failed = results.filter((result) => result.buffer === null).map((result) => result.url);
        if (failed.length > 0) {
          console.warn(`[audio] ${label} loaded with missing assets: ${failed.join(', ')}`);
        }
        return results
          .filter((result) => result.buffer !== null)
          .map((result) => result.buffer as AudioBuffer);
      };

      this.buffers.models.remington = await loadAll(['/sounds/soft-click.wav', '/sounds/soft-hit.wav'], 'remington');
      this.buffers.models.underwood = await loadAll(['/sounds/old-typing.wav', '/sounds/mechanical-hit.wav', '/sounds/mechanical-single-hit.wav'], 'underwood');
      this.buffers.models.royal = await loadAll(['/sounds/typewriter-hit.wav', '/sounds/single-mechanical-hit.wav'], 'royal');
      this.buffers.models.olivetti = await loadAll(['/sounds/hard-click.wav', '/sounds/keyboard-typing.wav'], 'olivetti');
      this.buffers.models.ibm = await loadAll(['/sounds/electric-typing.wav', '/sounds/electronic-typing.wav'], 'ibm');

      this.buffers.space = await loadAll(['/sounds/soft-hit.wav', '/sounds/soft-click.wav'], 'space');
      this.buffers.bell = await loadAll(['/sounds/bell-1.wav'], 'bell');
      this.buffers.return = await loadAll(
        ['/sounds/carriage-return-1.wav', '/sounds/carriage-return-2.flac', '/sounds/mechanical-hit.wav'],
        'return'
      );

      this.ensureFallbackBuffers();

      const hasAnyModelBuffers = Object.values(this.buffers.models).some((buffers) => buffers.length > 0);
      const coreReady = this.buffers.space.length > 0 && this.buffers.bell.length > 0 && this.buffers.return.length > 0;

      if (hasAnyModelBuffers && coreReady) {
        this.setStatus('ready');
      } else {
        console.error('[audio] Initialization failed: no usable audio assets and fallback generation unavailable.');
        this.setStatus('failed');
      }
    })()
      .catch((error) => {
        console.error('Failed to initialize audio:', error);
        this.setStatus('failed');
      })
      .finally(() => {
        this.loading = false;
        this.initPromise = null;
      });

    return this.initPromise;
  }

  setVolume(v: number) {
    this.volume = v;
  }

  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  private pickBufferIndex(buffers: AudioBuffer[], key: string) {
    if (buffers.length <= 1) return 0;

    const historyLength = Math.min(2, buffers.length - 1);
    const recent = this.recentBufferIndices[key] ?? [];
    const disallowed = new Set(recent.slice(-historyLength));

    const candidates = buffers
      .map((_, index) => index)
      .filter((index) => !disallowed.has(index));

    const selectedIndex = candidates[Math.floor(Math.random() * candidates.length)];
    this.recentBufferIndices[key] = [...recent, selectedIndex].slice(-4);

    return selectedIndex;
  }

  private registerVoice(source: AudioBufferSourceNode, gain: GainNode, voiceGroup: string) {
    const voiceCaps: Record<string, number> = {
      key: 9,
      space: 6,
      return: 2,
      bell: 2
    };

    const cap = voiceCaps[voiceGroup] ?? 6;
    const inGroup = this.activeVoices.filter((voice) => voice.key === voiceGroup);

    if (inGroup.length >= cap) {
      const oldest = inGroup.sort((a, b) => a.startedAt - b.startedAt)[0];
      oldest.gain.gain.cancelScheduledValues(this.ctx!.currentTime);
      oldest.gain.gain.setValueAtTime(oldest.gain.gain.value, this.ctx!.currentTime);
      oldest.gain.gain.linearRampToValueAtTime(0, this.ctx!.currentTime + 0.015);
      oldest.source.stop(this.ctx!.currentTime + 0.02);
    }

    const trackedVoice = { source, gain, startedAt: this.ctx!.currentTime, key: voiceGroup };
    this.activeVoices.push(trackedVoice);
    source.onended = () => {
      this.activeVoices = this.activeVoices.filter((voice) => voice !== trackedVoice);
    };
  }

  private playBuffer(
    buffers: AudioBuffer[],
    options: {
      category: 'key' | 'space' | 'return' | 'bell';
      sampleKey: string;
      baseVolume: number;
      gainJitter: number;
      playbackJitter: number;
      mechanicalLayer?: { gain: number; delay: number; playbackRate: number };
      varyPitch?: boolean;
    }
  ) {
    if (!this.enabled || !this.ctx || buffers.length === 0) return;

    const index = this.pickBufferIndex(buffers, options.sampleKey);
    const buffer = buffers[index];
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = this.ctx.createGain();
    const jitter = (Math.random() - 0.5) * options.gainJitter;
    gainNode.gain.value = this.clamp(this.volume * (options.baseVolume + jitter), 0, 1);

    const shouldVaryPitch = options.varyPitch ?? true;
    if (shouldVaryPitch && options.playbackJitter > 0) {
      source.playbackRate.value = this.clamp(1 + (Math.random() - 0.5) * options.playbackJitter, 0.92, 1.08);
    }

    source.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    this.registerVoice(source, gainNode, options.category);
    source.start(0);

    if (options.mechanicalLayer && buffers.length > 1) {
      const layerSource = this.ctx.createBufferSource();
      const layerIndex = this.pickBufferIndex(buffers, `${options.sampleKey}-layer`);
      layerSource.buffer = buffers[layerIndex];

      const layerGain = this.ctx.createGain();
      const layerJitter = (Math.random() - 0.5) * 0.04;
      layerGain.gain.value = this.clamp(
        this.volume * (options.baseVolume * options.mechanicalLayer.gain + layerJitter),
        0,
        0.5
      );

      layerSource.playbackRate.value = this.clamp(
        options.mechanicalLayer.playbackRate + (Math.random() - 0.5) * 0.02,
        0.9,
        1.05
      );

      layerSource.connect(layerGain);
      layerGain.connect(this.ctx.destination);

      this.registerVoice(layerSource, layerGain, options.category);
      layerSource.start(this.ctx.currentTime + options.mechanicalLayer.delay + Math.random() * 0.004);
    }
  }

  playKeypress(isSpace: boolean = false, model: string = 'remington') {
    if (isSpace) {
      this.playBuffer(this.buffers.space, {
        category: 'space',
        sampleKey: 'space',
        baseVolume: 0.72,
        gainJitter: 0.09,
        playbackJitter: 0.025,
        mechanicalLayer: { gain: 0.45, delay: 0.009, playbackRate: 0.97 }
      });
    } else {
      const modelBuffers = this.buffers.models[model] || this.buffers.models.remington;
      this.playBuffer(modelBuffers, {
        category: 'key',
        sampleKey: `model-${model}`,
        baseVolume: 0.92,
        gainJitter: 0.12,
        playbackJitter: 0.035,
        mechanicalLayer: { gain: 0.36, delay: 0.006, playbackRate: 0.985 }
      });
    }
  }

  playBell() {
    this.playBuffer(this.buffers.bell, {
      category: 'bell',
      sampleKey: 'bell',
      baseVolume: 0.68,
      gainJitter: 0.05,
      playbackJitter: 0,
      varyPitch: false
    });
  }

  playReturn() {
    this.playBuffer(this.buffers.return, {
      category: 'return',
      sampleKey: 'return',
      baseVolume: 0.98,
      gainJitter: 0.08,
      playbackJitter: 0.015,
      varyPitch: true,
      mechanicalLayer: { gain: 0.25, delay: 0.014, playbackRate: 0.95 }
    });
  }
}

export const audioEngine = new TypewriterAudio();
