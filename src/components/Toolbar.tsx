import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX, Download, Type, Palette, Home, AlignJustify, FileText, Columns, Eraser, Menu, X, Settings2 } from 'lucide-react';
import { type AudioStatus } from '../lib/audio';
import type { ResponsiveTier } from '../lib/responsive';
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
  responsiveTier: ResponsiveTier;
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
  disableBackspaceDelete: boolean;
  setDisableBackspaceDelete: (value: boolean) => void;
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
  responsiveTier,
  model, setModel,
  ribbon, setRibbon,
  volume, setVolume,
  audioEnabled, setAudioEnabled,
  audioStatus,
  lineSpacing, setLineSpacing,
  paperSize, setPaperSize,
  marginPreset, setMarginPreset,
  customMargins, setCustomMargins,
  disableBackspaceDelete, setDisableBackspaceDelete,
  onExportPNG, onExportPDF
}: ToolbarProps) {
  const [isMobileControlsOpen, setIsMobileControlsOpen] = useState(false);

  const isTablet = responsiveTier === 'tablet';
  const isMobile = responsiveTier === 'mobile';

  useEffect(() => {
    if (!isMobile) {
      setIsMobileControlsOpen(false);
    }
  }, [isMobile]);

  const statusTone = audioStatus === 'failed'
    ? 'text-red-400'
    : audioStatus === 'ready'
      ? 'text-emerald-400'
      : 'text-zinc-500';

  return (
    <>
      <div className="relative z-30 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur-sm shadow-md">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
          <a
            href="https://aiwritersretreat.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-2 text-zinc-300 hover:text-white transition-colors group"
            title="Home - aiwritersretreat.com"
          >
            <Home size={18} className="text-zinc-500 group-hover:text-white transition-colors" />
            <span className="truncate font-serif font-medium tracking-wide text-base sm:text-lg">
              Digital Typewriter
              <span className="text-zinc-500 text-xs sm:text-sm font-sans tracking-normal ml-1">by AIWR</span>
            </span>
          </a>

          {isMobile ? (
            <button
              onClick={() => setIsMobileControlsOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
              aria-expanded={isMobileControlsOpen}
              aria-controls="mobile-controls-panel"
            >
              {isMobileControlsOpen ? <X size={16} /> : <Menu size={16} />}
              Controls
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAudioEnabled(!audioEnabled)}
                className="p-1.5 hover:bg-zinc-800 rounded transition-colors"
                title={audioEnabled ? 'Mute' : 'Unmute'}
              >
                {audioEnabled ? <Volume2 size={18} /> : <VolumeX size={18} className="text-red-400" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-16 md:w-20 accent-zinc-500"
                disabled={!audioEnabled}
              />
              <span className={`text-[11px] uppercase tracking-wide ${statusTone}`}>{AUDIO_STATUS_LABELS[audioStatus]}</span>
            </div>
          )}
        </div>

        <div className={isMobile ? 'hidden' : 'px-3 pb-3 sm:px-4'}>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5">
              <Type size={16} className="text-zinc-500" />
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as any)}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
              >
                {Object.entries(MODELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5">
              <Palette size={16} className="text-zinc-500" />
              <select
                value={ribbon}
                onChange={(e) => setRibbon(e.target.value as any)}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
              >
                <option value="black">Black Ribbon</option>
                <option value="red">Red Ribbon</option>
                <option value="blue">Blue Ribbon</option>
                <option value="stencil">Stencil</option>
              </select>
            </div>

            {!isTablet && (
              <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5">
                <AlignJustify size={16} className="text-zinc-500" />
                <select
                  value={lineSpacing}
                  onChange={(e) => setLineSpacing(parseFloat(e.target.value))}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
                >
                  <option value={1}>Single</option>
                  <option value={1.5}>1.5</option>
                  <option value={2}>Double</option>
                </select>
              </div>
            )}

            <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5">
              <FileText size={16} className="text-zinc-500" />
              <select
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value as PaperSizeKey)}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
              >
                {Object.entries(PAPER_SIZES).map(([k, v]) => (
                  <option key={k} value={k}>{v.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5">
              <Columns size={16} className="text-zinc-500" />
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
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
              >
                {Object.entries(MARGIN_PRESETS).map(([k, v]) => (
                  <option key={k} value={k}>{v.name}</option>
                ))}
                <option value="custom">Custom</option>
              </select>
              {marginPreset === 'custom' && !isTablet && (
                <CustomMarginInputs
                  customMargins={customMargins}
                  setCustomMargins={setCustomMargins}
                  paperSize={paperSize}
                />
              )}
            </div>

            <button
              onClick={() => setDisableBackspaceDelete(!disableBackspaceDelete)}
              className={`inline-flex items-center gap-1 rounded border px-2 py-1.5 text-xs transition-colors ${
                disableBackspaceDelete
                  ? 'bg-amber-900/50 border-amber-700 text-amber-200'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              <Eraser size={14} />
              {disableBackspaceDelete ? 'Backspace Lock On' : 'Backspace Lock Off'}
            </button>

            <button
              onClick={onExportPNG}
              className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 rounded text-sm"
            >
              <Download size={16} /> PNG
            </button>
            <button
              onClick={onExportPDF}
              className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 rounded text-sm"
            >
              <Download size={16} /> PDF
            </button>
          </div>
        </div>
      </div>

      {isMobile && (
        <div
          id="mobile-controls-panel"
          className={isMobileControlsOpen ? 'fixed inset-0 z-40' : 'hidden'}
          role="dialog"
          aria-modal="true"
        >
          <button
            className="absolute inset-0 bg-black/60"
            onClick={() => setIsMobileControlsOpen(false)}
            aria-label="Close controls"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[78dvh] overflow-y-auto rounded-t-2xl border-t border-zinc-700 bg-zinc-900 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-200">
                <Settings2 size={16} />
                <span className="text-sm font-medium uppercase tracking-wide">Typewriter Controls</span>
              </div>
              <button onClick={() => setIsMobileControlsOpen(false)} className="rounded border border-zinc-700 p-1.5 text-zinc-300">
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-zinc-400">Model</span>
                <select value={model} onChange={(e) => setModel(e.target.value as any)} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-2">
                  {Object.entries(MODELS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-zinc-400">Ribbon</span>
                <select value={ribbon} onChange={(e) => setRibbon(e.target.value as any)} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-2">
                  <option value="black">Black Ribbon</option>
                  <option value="red">Red Ribbon</option>
                  <option value="blue">Blue Ribbon</option>
                  <option value="stencil">Stencil</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-zinc-400">Sound Volume</span>
                <input type="range" min="0" max="1" step="0.1" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} className="accent-zinc-500" disabled={!audioEnabled} />
              </label>
              <button onClick={() => setAudioEnabled(!audioEnabled)} className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-left">
                {audioEnabled ? 'Mute Sound' : 'Enable Sound'} · <span className={statusTone}>{AUDIO_STATUS_LABELS[audioStatus]}</span>
              </button>
              <label className="flex flex-col gap-1">
                <span className="text-zinc-400">Paper</span>
                <select value={paperSize} onChange={(e) => setPaperSize(e.target.value as PaperSizeKey)} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-2">
                  {Object.entries(PAPER_SIZES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-zinc-400">Margins</span>
                <select value={marginPreset} onChange={(e) => { const val = e.target.value as MarginPresetKey; setMarginPreset(val); if (val !== 'custom') { const preset = MARGIN_PRESETS[val]; setCustomMargins({ marginTop: preset.marginTop, marginBottom: preset.marginBottom, marginLeft: preset.marginLeft, marginRight: preset.marginRight }); } }} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-2">
                  {Object.entries(MARGIN_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                  <option value="custom">Custom</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={onExportPNG} className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2">Export PNG</button>
                <button onClick={onExportPDF} className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2">Export PDF</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
