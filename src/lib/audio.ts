export type AudioStatus = 'off' | 'loading' | 'ready' | 'failed';

type AudioCategory = 'key' | 'space' | 'return' | 'bell' | 'ribbon';

interface LayerConfig {
  gain: number;
  delay: number;
  playbackRate: number;
}

interface PlaybackProfile {
  baseVolume: number;
  gainJitter: number;
  playbackJitter: number;
  varyPitch?: boolean;
  mechanicalLayer?: LayerConfig;
}

interface ModelSoundProfile {
  key: PlaybackProfile;
  space: PlaybackProfile;
  bell: PlaybackProfile;
  returnCarriage: PlaybackProfile;
  returnFeed: PlaybackProfile;
  ribbon: PlaybackProfile;
  overlapCaps: Record<AudioCategory, number>;
  bellZoneOffset: number;
  bellResetOffset: number;
}

const DEFAULT_VOICE_CAPS: Record<AudioCategory, number> = {
  key: 9,
  space: 6,
  return: 2,
  bell: 2,
  ribbon: 6
};

const MODEL_SOUND_PROFILES: Record<string, ModelSoundProfile> = {
  remington: {
    key: { baseVolume: 0.72, gainJitter: 0.08, playbackJitter: 0.02, mechanicalLayer: { gain: 0.2, delay: 0.007, playbackRate: 0.98 } },
    space: { baseVolume: 0.62, gainJitter: 0.06, playbackJitter: 0.018, mechanicalLayer: { gain: 0.18, delay: 0.01, playbackRate: 0.97 } },
    bell: { baseVolume: 0.56, gainJitter: 0.03, playbackJitter: 0, varyPitch: false },
    returnCarriage: { baseVolume: 0.78, gainJitter: 0.05, playbackJitter: 0.01, varyPitch: true, mechanicalLayer: { gain: 0.14, delay: 0.01, playbackRate: 0.95 } },
    returnFeed: { baseVolume: 0.34, gainJitter: 0.03, playbackJitter: 0.012, mechanicalLayer: { gain: 0.1, delay: 0.01, playbackRate: 0.98 } },
    ribbon: { baseVolume: 0.12, gainJitter: 0.04, playbackJitter: 0.03 },
    overlapCaps: { key: 7, space: 5, return: 2, bell: 1, ribbon: 5 },
    bellZoneOffset: 8,
    bellResetOffset: 12
  },
  underwood: {
    key: { baseVolume: 0.88, gainJitter: 0.1, playbackJitter: 0.03, mechanicalLayer: { gain: 0.32, delay: 0.006, playbackRate: 0.985 } },
    space: { baseVolume: 0.68, gainJitter: 0.08, playbackJitter: 0.02, mechanicalLayer: { gain: 0.24, delay: 0.009, playbackRate: 0.97 } },
    bell: { baseVolume: 0.64, gainJitter: 0.04, playbackJitter: 0, varyPitch: false },
    returnCarriage: { baseVolume: 0.9, gainJitter: 0.07, playbackJitter: 0.013, varyPitch: true, mechanicalLayer: { gain: 0.2, delay: 0.011, playbackRate: 0.95 } },
    returnFeed: { baseVolume: 0.4, gainJitter: 0.03, playbackJitter: 0.012, mechanicalLayer: { gain: 0.12, delay: 0.01, playbackRate: 0.98 } },
    ribbon: { baseVolume: 0.18, gainJitter: 0.05, playbackJitter: 0.025 },
    overlapCaps: { key: 9, space: 6, return: 2, bell: 1, ribbon: 6 },
    bellZoneOffset: 7,
    bellResetOffset: 12
  },
  royal: {
    key: { baseVolume: 1, gainJitter: 0.12, playbackJitter: 0.028, mechanicalLayer: { gain: 0.4, delay: 0.006, playbackRate: 0.98 } },
    space: { baseVolume: 0.74, gainJitter: 0.09, playbackJitter: 0.021, mechanicalLayer: { gain: 0.28, delay: 0.009, playbackRate: 0.965 } },
    bell: { baseVolume: 0.74, gainJitter: 0.05, playbackJitter: 0, varyPitch: false },
    returnCarriage: { baseVolume: 1, gainJitter: 0.08, playbackJitter: 0.015, varyPitch: true, mechanicalLayer: { gain: 0.24, delay: 0.011, playbackRate: 0.945 } },
    returnFeed: { baseVolume: 0.46, gainJitter: 0.04, playbackJitter: 0.012, mechanicalLayer: { gain: 0.14, delay: 0.012, playbackRate: 0.975 } },
    ribbon: { baseVolume: 0.16, gainJitter: 0.05, playbackJitter: 0.028 },
    overlapCaps: { key: 9, space: 6, return: 2, bell: 1, ribbon: 6 },
    bellZoneOffset: 7,
    bellResetOffset: 11
  },
  olivetti: {
    key: { baseVolume: 0.8, gainJitter: 0.07, playbackJitter: 0.038, mechanicalLayer: { gain: 0.22, delay: 0.004, playbackRate: 1.005 } },
    space: { baseVolume: 0.64, gainJitter: 0.06, playbackJitter: 0.03, mechanicalLayer: { gain: 0.16, delay: 0.006, playbackRate: 1 } },
    bell: { baseVolume: 0.62, gainJitter: 0.03, playbackJitter: 0, varyPitch: false },
    returnCarriage: { baseVolume: 0.82, gainJitter: 0.05, playbackJitter: 0.012, varyPitch: true, mechanicalLayer: { gain: 0.14, delay: 0.009, playbackRate: 0.965 } },
    returnFeed: { baseVolume: 0.36, gainJitter: 0.025, playbackJitter: 0.02, mechanicalLayer: { gain: 0.1, delay: 0.009, playbackRate: 0.995 } },
    ribbon: { baseVolume: 0.1, gainJitter: 0.03, playbackJitter: 0.035 },
    overlapCaps: { key: 8, space: 5, return: 2, bell: 1, ribbon: 5 },
    bellZoneOffset: 8,
    bellResetOffset: 13
  },
  ibm: {
    key: { baseVolume: 0.76, gainJitter: 0.06, playbackJitter: 0.018, mechanicalLayer: { gain: 0.12, delay: 0.005, playbackRate: 1 } },
    space: { baseVolume: 0.6, gainJitter: 0.05, playbackJitter: 0.015, mechanicalLayer: { gain: 0.1, delay: 0.007, playbackRate: 1 } },
    bell: { baseVolume: 0.54, gainJitter: 0.025, playbackJitter: 0, varyPitch: false },
    returnCarriage: { baseVolume: 0.74, gainJitter: 0.05, playbackJitter: 0.01, varyPitch: true, mechanicalLayer: { gain: 0.1, delay: 0.01, playbackRate: 0.98 } },
    returnFeed: { baseVolume: 0.32, gainJitter: 0.02, playbackJitter: 0.01, mechanicalLayer: { gain: 0.08, delay: 0.009, playbackRate: 1 } },
    ribbon: { baseVolume: 0.06, gainJitter: 0.02, playbackJitter: 0.015 },
    overlapCaps: { key: 7, space: 5, return: 2, bell: 1, ribbon: 4 },
    bellZoneOffset: 9,
    bellResetOffset: 14
  }
};

// ---------------------------------------------------------------------------
// Per-model sound synthesis — generates realistic audio buffers tuned to
// the acoustic character of each real typewriter model.
// ---------------------------------------------------------------------------

interface SynthParams {
  duration: number;
  components: Array<{
    type: 'sine' | 'square' | 'noise' | 'impulse' | 'filtered-noise';
    freq?: number;
    gain: number;
    decay: number;
    onset?: number;       // delay in seconds before this component starts
    onsetSharpness?: number; // 0-1, how abrupt the onset is
    freqEnvelope?: number; // frequency multiplier at end (for pitch bend)
    filterFreq?: number;   // for filtered-noise
    filterQ?: number;
  }>;
}

function getModelKeySynthParams(model: string, variant: number): SynthParams {
  switch (model) {
    case 'remington':
      // Remington Noiseless: cushioned, dampened, muffled impact
      return {
        duration: 0.055 + variant * 0.008,
        components: [
          // Dampened typebar hit — low-mid thud, heavily decayed
          { type: 'sine', freq: 420 + variant * 30, gain: 0.35, decay: 18, onset: 0 },
          // Cushion absorption — soft low rumble
          { type: 'sine', freq: 180 + variant * 15, gain: 0.25, decay: 14 },
          // Muffled mechanical noise — filtered, not bright
          { type: 'filtered-noise', gain: 0.12, decay: 22, filterFreq: 1800, filterQ: 0.8 },
          // Soft initial click (dampened)
          { type: 'impulse', gain: 0.18, decay: 30 },
        ]
      };

    case 'underwood':
      // Underwood No. 5: heavy, loud, metallic clunk, strong typebar
      return {
        duration: 0.08 + variant * 0.01,
        components: [
          // Heavy typebar strike — strong metallic impact
          { type: 'sine', freq: 680 + variant * 50, gain: 0.55, decay: 11, freqEnvelope: 0.7 },
          // Platen resonance — deep body thud
          { type: 'sine', freq: 220 + variant * 20, gain: 0.35, decay: 8 },
          // Metallic ring / resonance tail
          { type: 'sine', freq: 1400 + variant * 80, gain: 0.15, decay: 16 },
          // Broad mechanical noise — unfiltered, harsh
          { type: 'noise', gain: 0.22, decay: 14 },
          // Sharp initial impact click
          { type: 'impulse', gain: 0.35, decay: 20 },
          // Typebar return spring
          { type: 'sine', freq: 950 + variant * 60, gain: 0.08, decay: 24, onset: 0.025 },
        ]
      };

    case 'royal':
      // Royal Quiet De Luxe: crisp, medium-weight, satisfying snap
      return {
        duration: 0.065 + variant * 0.008,
        components: [
          // Crisp typebar strike — clear mid-range
          { type: 'sine', freq: 580 + variant * 45, gain: 0.45, decay: 13, freqEnvelope: 0.85 },
          // Body resonance — warm undertone
          { type: 'sine', freq: 280 + variant * 20, gain: 0.28, decay: 10 },
          // Bright snap overtone
          { type: 'sine', freq: 1200 + variant * 70, gain: 0.12, decay: 20 },
          // Clean mechanical noise
          { type: 'filtered-noise', gain: 0.16, decay: 16, filterFreq: 3200, filterQ: 0.6 },
          // Decisive click
          { type: 'impulse', gain: 0.28, decay: 22 },
        ]
      };

    case 'olivetti':
      // Olivetti Lettera 22: light, snappy, portable, higher-pitched
      return {
        duration: 0.045 + variant * 0.006,
        components: [
          // Light typebar — higher pitch, quick decay
          { type: 'sine', freq: 780 + variant * 60, gain: 0.38, decay: 16, freqEnvelope: 0.9 },
          // Thin body resonance — portable/plastic body
          { type: 'sine', freq: 380 + variant * 25, gain: 0.18, decay: 14 },
          // Bright snap — characteristic lightness
          { type: 'sine', freq: 1800 + variant * 90, gain: 0.1, decay: 22 },
          // Light mechanical clatter
          { type: 'filtered-noise', gain: 0.14, decay: 20, filterFreq: 4200, filterQ: 0.5 },
          // Quick click
          { type: 'impulse', gain: 0.22, decay: 26 },
        ]
      };

    case 'ibm':
      // IBM Executive: electric, motorized, smooth action, typeball
      return {
        duration: 0.04 + variant * 0.005,
        components: [
          // Electric typeball impact — clean, precise
          { type: 'sine', freq: 620 + variant * 40, gain: 0.32, decay: 18 },
          // Motor hum undertone
          { type: 'sine', freq: 120 + variant * 10, gain: 0.08, decay: 6 },
          // Typeball mechanism — quick, precise click
          { type: 'square', freq: 2200 + variant * 120, gain: 0.06, decay: 30 },
          // Clean filtered impact
          { type: 'filtered-noise', gain: 0.1, decay: 24, filterFreq: 2800, filterQ: 1.2 },
          // Precise click
          { type: 'impulse', gain: 0.2, decay: 28 },
        ]
      };

    default:
      return getModelKeySynthParams('remington', variant);
  }
}

function getModelSpaceSynthParams(model: string, variant: number): SynthParams {
  switch (model) {
    case 'remington':
      // Dampened spacebar — cushioned thud
      return {
        duration: 0.07 + variant * 0.008,
        components: [
          { type: 'sine', freq: 200 + variant * 15, gain: 0.3, decay: 12 },
          { type: 'sine', freq: 110 + variant * 10, gain: 0.2, decay: 9 },
          { type: 'filtered-noise', gain: 0.08, decay: 18, filterFreq: 1200, filterQ: 0.7 },
          { type: 'impulse', gain: 0.14, decay: 20 },
        ]
      };

    case 'underwood':
      // Heavy spacebar — loud clunk with spring return
      return {
        duration: 0.09 + variant * 0.01,
        components: [
          { type: 'sine', freq: 250 + variant * 20, gain: 0.4, decay: 9 },
          { type: 'sine', freq: 140 + variant * 10, gain: 0.3, decay: 7 },
          { type: 'noise', gain: 0.15, decay: 12 },
          { type: 'impulse', gain: 0.25, decay: 16 },
          // Spring return
          { type: 'sine', freq: 600 + variant * 40, gain: 0.08, decay: 22, onset: 0.03 },
        ]
      };

    case 'royal':
      // Crisp spacebar — clean mechanical action
      return {
        duration: 0.075 + variant * 0.008,
        components: [
          { type: 'sine', freq: 230 + variant * 18, gain: 0.35, decay: 11 },
          { type: 'sine', freq: 130 + variant * 10, gain: 0.22, decay: 8 },
          { type: 'filtered-noise', gain: 0.12, decay: 15, filterFreq: 2400, filterQ: 0.6 },
          { type: 'impulse', gain: 0.2, decay: 18 },
        ]
      };

    case 'olivetti':
      // Light spacebar — snappy, quick
      return {
        duration: 0.055 + variant * 0.006,
        components: [
          { type: 'sine', freq: 300 + variant * 22, gain: 0.28, decay: 14 },
          { type: 'sine', freq: 160 + variant * 12, gain: 0.16, decay: 11 },
          { type: 'filtered-noise', gain: 0.1, decay: 18, filterFreq: 3500, filterQ: 0.5 },
          { type: 'impulse', gain: 0.16, decay: 22 },
        ]
      };

    case 'ibm':
      // Electric spacebar — smooth motorized action
      return {
        duration: 0.045 + variant * 0.005,
        components: [
          { type: 'sine', freq: 280 + variant * 18, gain: 0.24, decay: 16 },
          { type: 'sine', freq: 100 + variant * 8, gain: 0.06, decay: 6 },
          { type: 'filtered-noise', gain: 0.08, decay: 22, filterFreq: 2000, filterQ: 1 },
          { type: 'impulse', gain: 0.14, decay: 24 },
        ]
      };

    default:
      return getModelSpaceSynthParams('remington', variant);
  }
}

function getModelBellSynthParams(model: string): SynthParams {
  switch (model) {
    case 'remington':
      // Muffled bell — dampened ring, shorter sustain
      return {
        duration: 0.32,
        components: [
          { type: 'sine', freq: 1650, gain: 0.38, decay: 3.2 },
          { type: 'sine', freq: 3300, gain: 0.12, decay: 4.5 },
          { type: 'sine', freq: 4950, gain: 0.04, decay: 6 },
          { type: 'impulse', gain: 0.1, decay: 10 },
        ]
      };

    case 'underwood':
      // Loud, resonant bell — classic heavy typewriter ring
      return {
        duration: 0.55,
        components: [
          { type: 'sine', freq: 1850, gain: 0.55, decay: 2.2 },
          { type: 'sine', freq: 3700, gain: 0.22, decay: 3.0 },
          { type: 'sine', freq: 5550, gain: 0.1, decay: 4.0 },
          { type: 'sine', freq: 7400, gain: 0.04, decay: 5.5 },
          { type: 'impulse', gain: 0.15, decay: 8 },
        ]
      };

    case 'royal':
      // Classic clear bell — balanced, pleasant ring
      return {
        duration: 0.45,
        components: [
          { type: 'sine', freq: 2000, gain: 0.5, decay: 2.5 },
          { type: 'sine', freq: 4000, gain: 0.18, decay: 3.5 },
          { type: 'sine', freq: 6000, gain: 0.07, decay: 4.5 },
          { type: 'impulse', gain: 0.12, decay: 9 },
        ]
      };

    case 'olivetti':
      // High-pitched, thin bell — portable typewriter character
      return {
        duration: 0.35,
        components: [
          { type: 'sine', freq: 2400, gain: 0.42, decay: 2.8 },
          { type: 'sine', freq: 4800, gain: 0.15, decay: 3.8 },
          { type: 'sine', freq: 7200, gain: 0.05, decay: 5.0 },
          { type: 'impulse', gain: 0.08, decay: 12 },
        ]
      };

    case 'ibm':
      // Electronic-style bell — shorter, precise, less resonant
      return {
        duration: 0.22,
        components: [
          { type: 'sine', freq: 1950, gain: 0.36, decay: 3.8 },
          { type: 'sine', freq: 3900, gain: 0.1, decay: 5.5 },
          { type: 'square', freq: 1950, gain: 0.04, decay: 5 },
          { type: 'impulse', gain: 0.06, decay: 14 },
        ]
      };

    default:
      return getModelBellSynthParams('remington');
  }
}

function getModelReturnSynthParams(model: string): SynthParams {
  switch (model) {
    case 'remington':
      // Dampened carriage return — cushioned slide and stop
      return {
        duration: 0.2,
        components: [
          // Carriage slide — muffled whoosh
          { type: 'filtered-noise', gain: 0.2, decay: 5, filterFreq: 1400, filterQ: 0.6 },
          // Dampened stop impact
          { type: 'sine', freq: 250, gain: 0.3, decay: 10, onset: 0.06 },
          { type: 'impulse', gain: 0.2, decay: 14, onset: 0.06 },
          // Mechanism click
          { type: 'sine', freq: 500, gain: 0.1, decay: 20, onset: 0.07 },
        ]
      };

    case 'underwood':
      // Heavy carriage return — loud slide, clunky stop, mechanical
      return {
        duration: 0.28,
        components: [
          // Heavy carriage slide with metallic friction
          { type: 'noise', gain: 0.28, decay: 4 },
          { type: 'filtered-noise', gain: 0.12, decay: 3.5, filterFreq: 2800, filterQ: 0.4 },
          // Heavy impact stop
          { type: 'sine', freq: 200, gain: 0.45, decay: 7, onset: 0.08, freqEnvelope: 0.6 },
          { type: 'impulse', gain: 0.35, decay: 10, onset: 0.08 },
          // Metallic resonance after impact
          { type: 'sine', freq: 800, gain: 0.12, decay: 15, onset: 0.09 },
          // Spring mechanism
          { type: 'sine', freq: 1200, gain: 0.06, decay: 22, onset: 0.12 },
        ]
      };

    case 'royal':
      // Crisp carriage return — satisfying slide and clean stop
      return {
        duration: 0.22,
        components: [
          // Smooth carriage slide
          { type: 'filtered-noise', gain: 0.22, decay: 4.5, filterFreq: 2200, filterQ: 0.5 },
          // Clean stop impact
          { type: 'sine', freq: 280, gain: 0.38, decay: 9, onset: 0.065 },
          { type: 'impulse', gain: 0.28, decay: 12, onset: 0.065 },
          // Crisp overtone
          { type: 'sine', freq: 700, gain: 0.1, decay: 18, onset: 0.07 },
        ]
      };

    case 'olivetti':
      // Light carriage return — quick, snappy, portable feel
      return {
        duration: 0.18,
        components: [
          // Quick light slide
          { type: 'filtered-noise', gain: 0.16, decay: 5.5, filterFreq: 3000, filterQ: 0.5 },
          // Lighter stop
          { type: 'sine', freq: 340, gain: 0.3, decay: 12, onset: 0.05 },
          { type: 'impulse', gain: 0.22, decay: 16, onset: 0.05 },
          // High ping
          { type: 'sine', freq: 900, gain: 0.08, decay: 22, onset: 0.055 },
        ]
      };

    case 'ibm':
      // Electric carriage return — motorized, smooth, mechanical hum
      return {
        duration: 0.2,
        components: [
          // Motor-driven carriage movement
          { type: 'sine', freq: 150, gain: 0.15, decay: 4 },
          { type: 'filtered-noise', gain: 0.1, decay: 6, filterFreq: 1800, filterQ: 1 },
          // Smooth mechanical stop
          { type: 'sine', freq: 300, gain: 0.22, decay: 12, onset: 0.07 },
          { type: 'impulse', gain: 0.16, decay: 18, onset: 0.07 },
          // Motor settling buzz
          { type: 'square', freq: 120, gain: 0.03, decay: 5, onset: 0.08 },
        ]
      };

    default:
      return getModelReturnSynthParams('remington');
  }
}

function getModelRibbonSynthParams(model: string, variant: number): SynthParams {
  switch (model) {
    case 'remington':
      // Soft ribbon spool advance — muffled click
      return {
        duration: 0.02 + variant * 0.003,
        components: [
          { type: 'filtered-noise', gain: 0.15, decay: 35, filterFreq: 2000, filterQ: 1.2 },
          { type: 'impulse', gain: 0.08, decay: 40 },
        ]
      };

    case 'underwood':
      // Audible ribbon mechanism — metallic tick
      return {
        duration: 0.025 + variant * 0.004,
        components: [
          { type: 'sine', freq: 3200 + variant * 200, gain: 0.08, decay: 30 },
          { type: 'filtered-noise', gain: 0.18, decay: 30, filterFreq: 3500, filterQ: 0.8 },
          { type: 'impulse', gain: 0.12, decay: 35 },
        ]
      };

    case 'royal':
      // Clean ribbon tick
      return {
        duration: 0.022 + variant * 0.003,
        components: [
          { type: 'sine', freq: 2800 + variant * 180, gain: 0.06, decay: 32 },
          { type: 'filtered-noise', gain: 0.14, decay: 32, filterFreq: 3000, filterQ: 0.9 },
          { type: 'impulse', gain: 0.1, decay: 36 },
        ]
      };

    case 'olivetti':
      // Light ribbon click — minimal
      return {
        duration: 0.018 + variant * 0.003,
        components: [
          { type: 'filtered-noise', gain: 0.12, decay: 36, filterFreq: 4000, filterQ: 0.7 },
          { type: 'impulse', gain: 0.07, decay: 38 },
        ]
      };

    case 'ibm':
      // Subtle electric ribbon advance — barely audible
      return {
        duration: 0.015 + variant * 0.002,
        components: [
          { type: 'filtered-noise', gain: 0.06, decay: 40, filterFreq: 2500, filterQ: 1.5 },
          { type: 'impulse', gain: 0.04, decay: 42 },
        ]
      };

    default:
      return getModelRibbonSynthParams('remington', variant);
  }
}

function getModelReturnFeedSynthParams(model: string): SynthParams {
  switch (model) {
    case 'remington':
      return {
        duration: 0.06,
        components: [
          { type: 'sine', freq: 180, gain: 0.2, decay: 12 },
          { type: 'filtered-noise', gain: 0.08, decay: 16, filterFreq: 800, filterQ: 0.8 },
          { type: 'impulse', gain: 0.1, decay: 20 },
        ]
      };

    case 'underwood':
      return {
        duration: 0.08,
        components: [
          { type: 'sine', freq: 160, gain: 0.3, decay: 9 },
          { type: 'noise', gain: 0.1, decay: 12 },
          { type: 'impulse', gain: 0.18, decay: 14 },
        ]
      };

    case 'royal':
      return {
        duration: 0.065,
        components: [
          { type: 'sine', freq: 200, gain: 0.25, decay: 11 },
          { type: 'filtered-noise', gain: 0.08, decay: 14, filterFreq: 1200, filterQ: 0.6 },
          { type: 'impulse', gain: 0.14, decay: 16 },
        ]
      };

    case 'olivetti':
      return {
        duration: 0.05,
        components: [
          { type: 'sine', freq: 240, gain: 0.18, decay: 14 },
          { type: 'filtered-noise', gain: 0.06, decay: 18, filterFreq: 1600, filterQ: 0.5 },
          { type: 'impulse', gain: 0.1, decay: 20 },
        ]
      };

    case 'ibm':
      return {
        duration: 0.04,
        components: [
          { type: 'sine', freq: 200, gain: 0.14, decay: 16 },
          { type: 'sine', freq: 100, gain: 0.04, decay: 6 },
          { type: 'impulse', gain: 0.08, decay: 22 },
        ]
      };

    default:
      return getModelReturnFeedSynthParams('remington');
  }
}


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
    space: Record<string, AudioBuffer[]>;
    bell: Record<string, AudioBuffer[]>;
    return: Record<string, AudioBuffer[]>;
    returnFeed: Record<string, AudioBuffer[]>;
    ribbon: Record<string, AudioBuffer[]>;
  } = {
    models: { remington: [], underwood: [], royal: [], olivetti: [], ibm: [] },
    space: { remington: [], underwood: [], royal: [], olivetti: [], ibm: [] },
    bell: { remington: [], underwood: [], royal: [], olivetti: [], ibm: [] },
    return: { remington: [], underwood: [], royal: [], olivetti: [], ibm: [] },
    returnFeed: { remington: [], underwood: [], royal: [], olivetti: [], ibm: [] },
    ribbon: { remington: [], underwood: [], royal: [], olivetti: [], ibm: [] },
  };

  // ---------------------------------------------------------------------------
  // Synthesis engine — generates AudioBuffers from SynthParams
  // ---------------------------------------------------------------------------

  private synthesize(params: SynthParams): AudioBuffer | null {
    if (!this.ctx) return null;

    const sampleRate = this.ctx.sampleRate;
    const frameCount = Math.max(1, Math.floor(sampleRate * params.duration));
    const buffer = this.ctx.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (const comp of params.components) {
      const onsetSample = Math.floor((comp.onset ?? 0) * sampleRate);
      const activeFrames = frameCount - onsetSample;
      if (activeFrames <= 0) continue;

      for (let i = 0; i < activeFrames; i++) {
        const t = i / sampleRate;
        const progress = i / activeFrames;
        const decay = Math.exp(-progress * comp.decay);

        let sample = 0;
        switch (comp.type) {
          case 'sine': {
            const freq = comp.freq! * (1 + progress * ((comp.freqEnvelope ?? 1) - 1));
            sample = Math.sin(2 * Math.PI * freq * t) * comp.gain * decay;
            break;
          }
          case 'square': {
            const freq = comp.freq! * (1 + progress * ((comp.freqEnvelope ?? 1) - 1));
            sample = (Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1) * comp.gain * decay;
            break;
          }
          case 'noise': {
            sample = (Math.random() * 2 - 1) * comp.gain * decay;
            break;
          }
          case 'impulse': {
            const impulseDecay = Math.exp(-progress * comp.decay * 1.5);
            sample = (i < 8 ? (1 - i / 8) : 0) * comp.gain + (Math.random() * 2 - 1) * comp.gain * 0.3 * impulseDecay;
            break;
          }
          case 'filtered-noise': {
            // Simulate band-pass filtered noise using resonant sine modulated noise
            const filterFreq = comp.filterFreq ?? 2000;
            const filterQ = comp.filterQ ?? 1;
            const carrier = Math.sin(2 * Math.PI * filterFreq * t);
            const noise = (Math.random() * 2 - 1);
            // Mix carrier-modulated noise for band-pass effect
            const mix = noise * (0.4 + 0.6 * Math.abs(carrier));
            // Q affects bandwidth — higher Q = more tonal
            const tonal = carrier * noise * filterQ * 0.3;
            sample = (mix + tonal) * comp.gain * decay;
            break;
          }
        }

        channelData[onsetSample + i] += sample;
      }
    }

    // Normalize to prevent clipping
    let peak = 0;
    for (let i = 0; i < frameCount; i++) {
      const abs = Math.abs(channelData[i]);
      if (abs > peak) peak = abs;
    }
    if (peak > 0.95) {
      const scale = 0.9 / peak;
      for (let i = 0; i < frameCount; i++) {
        channelData[i] *= scale;
      }
    }

    return buffer;
  }

  private generateModelBuffers() {
    const models = ['remington', 'underwood', 'royal', 'olivetti', 'ibm'];

    for (const model of models) {
      // Generate 4 key variants per model
      const keyBuffers: AudioBuffer[] = [];
      for (let v = 0; v < 4; v++) {
        const buf = this.synthesize(getModelKeySynthParams(model, v));
        if (buf) keyBuffers.push(buf);
      }
      this.buffers.models[model] = keyBuffers;

      // Generate 3 space variants per model
      const spaceBuffers: AudioBuffer[] = [];
      for (let v = 0; v < 3; v++) {
        const buf = this.synthesize(getModelSpaceSynthParams(model, v));
        if (buf) spaceBuffers.push(buf);
      }
      this.buffers.space[model] = spaceBuffers;

      // Generate 1 bell per model (bells are consistent per machine)
      const bellBuf = this.synthesize(getModelBellSynthParams(model));
      this.buffers.bell[model] = bellBuf ? [bellBuf] : [];

      // Generate 2 return variants per model
      const returnBuf1 = this.synthesize(getModelReturnSynthParams(model));
      this.buffers.return[model] = returnBuf1 ? [returnBuf1] : [];

      // Generate return feed sound per model
      const feedBuf = this.synthesize(getModelReturnFeedSynthParams(model));
      this.buffers.returnFeed[model] = feedBuf ? [feedBuf] : [];

      // Generate 3 ribbon advance variants per model
      const ribbonBuffers: AudioBuffer[] = [];
      for (let v = 0; v < 3; v++) {
        const buf = this.synthesize(getModelRibbonSynthParams(model, v));
        if (buf) ribbonBuffers.push(buf);
      }
      this.buffers.ribbon[model] = ribbonBuffers;
    }
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

      // Do not block initialization on AudioContext resume. Some browsers
      // keep resume pending until a user gesture, which would leave status
      // stuck on "loading" forever.
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch((error) => {
          console.debug('[audio] Resume deferred until user gesture:', error);
        });
      }

      // Generate all model-specific synthesized sounds
      this.generateModelBuffers();

      // Verify we have usable audio
      const hasAnyModelBuffers = Object.values(this.buffers.models).some((buffers) => buffers.length > 0);
      const hasAnyBells = Object.values(this.buffers.bell).some((buffers) => buffers.length > 0);
      const hasAnyReturns = Object.values(this.buffers.return).some((buffers) => buffers.length > 0);

      if (hasAnyModelBuffers && hasAnyBells && hasAnyReturns) {
        console.info('[audio] All model-specific sounds synthesized successfully.');
        this.setStatus('ready');
      } else {
        console.error('[audio] Initialization failed: sound synthesis unavailable.');
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


  async resumeFromUserGesture() {
    if (!this.enabled) return;

    if (!this.ctx) {
      await this.init();
    }

    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        return;
      }
    }

    // iOS Safari can require a started source node inside a gesture.
    if (this.ctx.state === 'running') {
      const buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(this.ctx.destination);
      source.start(0);
    }
  }

  setVolume(v: number) {
    this.volume = v;
  }

  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  private getModelProfile(model: string): ModelSoundProfile {
    return MODEL_SOUND_PROFILES[model] ?? MODEL_SOUND_PROFILES.remington;
  }

  getBellColumns(maxCharsPerLine: number, model: string): { ringAtColumn: number; resetAtColumn: number } {
    const profile = this.getModelProfile(model);
    return {
      ringAtColumn: Math.max(1, maxCharsPerLine - profile.bellZoneOffset),
      resetAtColumn: Math.max(0, maxCharsPerLine - profile.bellResetOffset)
    };
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

  private registerVoice(source: AudioBufferSourceNode, gain: GainNode, voiceGroup: AudioCategory, voiceCapOverride?: number) {
    const cap = voiceCapOverride ?? DEFAULT_VOICE_CAPS[voiceGroup] ?? 6;
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
      category: AudioCategory;
      sampleKey: string;
      baseVolume: number;
      gainJitter: number;
      playbackJitter: number;
      mechanicalLayer?: { gain: number; delay: number; playbackRate: number };
      varyPitch?: boolean;
      voiceCap?: number;
    }
  ) {
    if (!this.enabled || !this.ctx || buffers.length === 0) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {
        // Some browsers require repeated user gestures before audio unlocks.
      });
      if (this.ctx.state === 'suspended') {
        return;
      }
    }

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

    this.registerVoice(source, gainNode, options.category, options.voiceCap);
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

      this.registerVoice(layerSource, layerGain, options.category, options.voiceCap);
      layerSource.start(this.ctx.currentTime + options.mechanicalLayer.delay + Math.random() * 0.004);
    }
  }

  playKeypress(isSpace: boolean = false, model: string = 'remington') {
    const profile = this.getModelProfile(model);
    const m = model in this.buffers.models ? model : 'remington';

    if (isSpace) {
      this.playBuffer(this.buffers.space[m] || this.buffers.space.remington, {
        category: 'space',
        sampleKey: `space-${m}`,
        ...profile.space,
        voiceCap: profile.overlapCaps.space
      });
    } else {
      this.playBuffer(this.buffers.models[m] || this.buffers.models.remington, {
        category: 'key',
        sampleKey: `model-${m}`,
        ...profile.key,
        voiceCap: profile.overlapCaps.key
      });
    }
  }

  playRibbon(model: string = 'remington') {
    const profile = this.getModelProfile(model);
    const m = model in this.buffers.ribbon ? model : 'remington';

    this.playBuffer(this.buffers.ribbon[m] || this.buffers.ribbon.remington, {
      category: 'ribbon',
      sampleKey: `ribbon-${m}`,
      ...profile.ribbon,
      voiceCap: profile.overlapCaps.ribbon
    });
  }

  playBell(model: string = 'remington') {
    const profile = this.getModelProfile(model);
    const m = model in this.buffers.bell ? model : 'remington';

    this.playBuffer(this.buffers.bell[m] || this.buffers.bell.remington, {
      category: 'bell',
      sampleKey: `bell-${m}`,
      ...profile.bell,
      voiceCap: profile.overlapCaps.bell
    });
  }

  playReturn(model: string = 'remington') {
    const profile = this.getModelProfile(model);
    const m = model in this.buffers.return ? model : 'remington';

    this.playBuffer(this.buffers.return[m] || this.buffers.return.remington, {
      category: 'return',
      sampleKey: `return-${m}-carriage`,
      ...profile.returnCarriage,
      voiceCap: profile.overlapCaps.return
    });

    if (!this.enabled || !this.ctx) return;

    const feedDelay = 0.028;
    window.setTimeout(() => {
      if (!this.enabled || !this.ctx) return;

      this.playBuffer(this.buffers.returnFeed[m] || this.buffers.returnFeed.remington, {
        category: 'return',
        sampleKey: `return-${m}-feed`,
        ...profile.returnFeed,
        voiceCap: profile.overlapCaps.return
      });
    }, feedDelay * 1000);
  }

  getSoundPersonality(model: string) {
    return this.getModelProfile(model);
  }

  getSoundPersonalitySummary(model: string) {
    const profile = this.getModelProfile(model);
    return {
      keyGain: profile.key.baseVolume,
      keyPlaybackJitter: profile.key.playbackJitter,
      mechanicalLayerGain: profile.key.mechanicalLayer?.gain ?? 0,
      returnIntensity: profile.returnCarriage.baseVolume,
      bellIntensity: profile.bell.baseVolume,
      overlapCaps: profile.overlapCaps
    };
  }
}

export const audioEngine = new TypewriterAudio();
