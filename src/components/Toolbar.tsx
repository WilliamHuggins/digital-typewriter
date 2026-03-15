import React from 'react';
import { Volume2, VolumeX, Download, Type, Palette, Home, AlignJustify, FileText, Columns } from 'lucide-react';
import { type AudioStatus } from '../lib/audio';
import {
  PAPER_SIZES,
  MARGIN_PRESETS,
  type PaperSizeKey,
  type MarginPresetKey,
  type CustomMargins,
  pxToInches,
  inchesToPx,
  validateMargins,
  MIN_MARGIN,
} from '../lib/documentModel';

export const MODELS = {
  remington: { name: 'Remington Noiseless', font: 'font-special-elite', wear: 0.8 },
  underwood: { name: 'Underwood No. 5', font: 'font-cutive-mono', wear: 0.5 },
  royal: { name: 'Royal Quiet De Luxe', font: 'font-courier-prime', wear: 0.2 },
  olivetti: { name: 'Olivetti Lettera 22', font: 'font-space-mono', wear: 0.1 },
  ibm: { name: 'IBM Executive', font: 'font-cousine', wear: 0.05 },
};

export const RIBBONS = {
  black: 'text-ink-black',
  red: 'text-ink-red',
  blue: 'text-ink-blue',
  stencil: 'ink-stencil',
};

interface ToolbarProps {
  model: keyof typeof MODELS;
  setModel: (m: keyof typeof MODELS) => void;
  ribbon: keyof typeof RIBBONS;
  setRibbon: (r: keyof typeof RIBBONS) => void;
  volume: number;
  setVolume: (v: number) => void;
  audioEnabled: boolean;
  setAudioEnabled: (e: boolean) => void;
  audioStatus: AudioStatus;
  lineSpacing: number;
  setLineSpacing: (s: number) => void;
  paperSize: PaperSizeKey;
  setPaperSize: (s: PaperSizeKey) => void;
  marginPreset: MarginPresetKey;
  setMarginPreset: (m: MarginPresetKey) => void;
  customMargins: CustomMargins;
  setCustomMargins: (m: CustomMargins) => void;
  onExportPNG: () => void;
  onExportPDF: () => void;
}

// ---------------------------------------------------------------------------
// Custom margin inline inputs (shown only when "Custom" is selected)
// ---------------------------------------------------------------------------

const MARGIN_FIELDS = [
  { key: 'marginTop', label: 'T' },
  { key: 'marginRight', label: 'R' },
  { key: 'marginBottom', label: 'B' },
  { key: 'marginLeft', label: 'L' },
] as const;

function CustomMarginInputs({
  customMargins,
  setCustomMargins,
  paperSize,
}: {
  customMargins: CustomMargins;
  setCustomMargins: (m: CustomMargins) => void;
  paperSize: PaperSizeKey;
}) {
  const paper = PAPER_SIZES[paperSize];
  const validation = validateMargins(
    paper,
    customMargins.marginTop,
    customMargins.marginBottom,
    customMargins.marginLeft,
    customMargins.marginRight,
  );

  const handleChange = (field: keyof CustomMargins, inchValue: string) => {
    const parsed = parseFloat(inchValue);
    if (Number.isNaN(parsed)) return;
    const px = inchesToPx(Math.max(0, parsed));
    setCustomMargins({ ...customMargins, [field]: px });
  };

  return (
    <div className="flex items-center gap-1.5">
      {MARGIN_FIELDS.map(({ key, label }) => (
        <label key={key} className="flex items-center gap-0.5 text-xs text-zinc-400">
          <span>{label}</span>
          <input
            type="number"
            step="0.05"
            min={pxToInches(MIN_MARGIN)}
            value={pxToInches(customMargins[key])}
            onChange={(e) => handleChange(key, e.target.value)}
            className="w-14 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </label>
      ))}
      <span className="text-[10px] text-zinc-500 ml-0.5">in</span>
      {!validation.valid && (
        <span className="text-[10px] text-red-400 ml-1 max-w-32 truncate" title={validation.reason}>
          {validation.reason}
        </span>
      )}
    </div>
  );
}

const AUDIO_STATUS_LABELS: Record<AudioStatus, string> = {
  off: 'Sound Off',
  loading: 'Loading Sounds…',
  ready: 'Sound Ready',
  failed: 'Sound Error',
};

export function Toolbar({
  model, setModel,
  ribbon, setRibbon,
  volume, setVolume,
  audioEnabled, setAudioEnabled,
  audioStatus,
  lineSpacing, setLineSpacing,
  paperSize, setPaperSize,
  marginPreset, setMarginPreset,
  customMargins, setCustomMargins,
  onExportPNG, onExportPDF
}: ToolbarProps) {
  const statusTone = audioStatus === 'failed'
    ? 'text-red-400'
    : audioStatus === 'ready'
      ? 'text-emerald-400'
      : 'text-zinc-500';

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-zinc-900 text-zinc-300 border-b border-zinc-800 shadow-md z-10 relative">
      <div className="flex items-center gap-6">
        <a 
          href="https://aiwritersretreat.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-2 hover:text-white transition-colors group"
          title="Home - aiwritersretreat.com"
        >
          <Home size={20} className="text-zinc-400 group-hover:text-white transition-colors" />
          <span className="font-serif font-medium text-lg tracking-wide hidden sm:inline-block">
            Digital Typewriter <span className="text-zinc-500 text-sm font-sans tracking-normal ml-1">by AIWR</span>
          </span>
        </a>

        <div className="h-6 w-px bg-zinc-800 hidden sm:block"></div>

        <div className="flex items-center gap-2">
          <Type size={18} className="text-zinc-500" />
          <select 
            value={model} 
            onChange={(e) => setModel(e.target.value as any)}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            {Object.entries(MODELS).map(([k, v]) => (
              <option key={k} value={k}>{v.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Palette size={18} className="text-zinc-500" />
          <select 
            value={ribbon} 
            onChange={(e) => setRibbon(e.target.value as any)}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value="black">Black Ribbon</option>
            <option value="red">Red Ribbon</option>
            <option value="blue">Blue Ribbon</option>
            <option value="stencil">Stencil (No Ink)</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <AlignJustify size={18} className="text-zinc-500" />
          <select
            value={lineSpacing}
            onChange={(e) => setLineSpacing(parseFloat(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value={1}>Single Space</option>
            <option value={1.5}>1.5 Space</option>
            <option value={2}>Double Space</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <FileText size={18} className="text-zinc-500" />
          <select
            value={paperSize}
            onChange={(e) => setPaperSize(e.target.value as PaperSizeKey)}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            {Object.entries(PAPER_SIZES).map(([k, v]) => (
              <option key={k} value={k}>{v.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Columns size={18} className="text-zinc-500" />
          <select
            value={marginPreset}
            onChange={(e) => {
              const val = e.target.value as MarginPresetKey;
              setMarginPreset(val);
              if (val !== 'custom') {
                const preset = MARGIN_PRESETS[val];
                setCustomMargins({
                  marginTop: preset.marginTop,
                  marginBottom: preset.marginBottom,
                  marginLeft: preset.marginLeft,
                  marginRight: preset.marginRight,
                });
              }
            }}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            {Object.entries(MARGIN_PRESETS).map(([k, v]) => (
              <option key={k} value={k}>{v.name} Margins</option>
            ))}
            <option value="custom">Custom Margins</option>
          </select>
          {marginPreset === 'custom' && (
            <CustomMarginInputs
              customMargins={customMargins}
              setCustomMargins={setCustomMargins}
              paperSize={paperSize}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setAudioEnabled(!audioEnabled)}
            className="p-1.5 hover:bg-zinc-800 rounded transition-colors"
            title={audioEnabled ? "Mute" : "Unmute"}
          >
            {audioEnabled ? <Volume2 size={18} /> : <VolumeX size={18} className="text-red-400" />}
          </button>
          <input 
            type="range" 
            min="0" max="1" step="0.1" 
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-20 accent-zinc-500"
            disabled={!audioEnabled}
          />
          <span className={`text-xs uppercase tracking-wide ${statusTone}`}>{AUDIO_STATUS_LABELS[audioStatus]}</span>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={onExportPNG}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 rounded text-sm transition-colors"
          >
            <Download size={16} />
            <span className="hidden sm:inline">PNG</span>
          </button>
          <button 
            onClick={onExportPDF}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 rounded text-sm transition-colors"
          >
            <Download size={16} />
            <span className="hidden sm:inline">PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
}
