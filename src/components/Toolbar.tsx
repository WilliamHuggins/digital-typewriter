import React, { useEffect, useState } from 'react';
import {
  Volume2, VolumeX, Download, Type, Palette, AlignJustify, FileText, Columns,
  Eraser, Menu, X, Settings2, Undo2, Redo2, FilePlus2, ClipboardCopy, Check, AlertTriangle,
} from 'lucide-react';
import { type AudioStatus } from '../lib/audio';
import type { ResponsiveTier } from '../lib/responsive';
import { MODELS, MODEL_KEYS, RIBBONS, RIBBON_LABELS, RIBBON_KEYS, type ModelKey, type RibbonKey } from '../lib/machines';
import { MachineSelect } from './MachineSelect';
import type { SaveState } from '../hooks/useTypewriterDocument';
import { isDriveConfigured } from '../lib/googleDrive';
import { DriveSaveButton } from './DriveSaveButton';
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

export { MODELS, RIBBONS } from '../lib/machines';

export interface ToolbarNotice {
  message: string;
  tone: 'ok' | 'error';
}

interface ToolbarProps {
  responsiveTier: ResponsiveTier;
  model: ModelKey;
  setModel: (m: ModelKey) => void;
  ribbon: RibbonKey;
  setRibbon: (r: RibbonKey) => void;
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

  title: string;
  setTitle: (title: string) => void;
  saveState: SaveState;
  saveError: string | null;

  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onNewSheet: () => void;

  onExportTXT: () => void;
  onCopyText: () => void;
  onExportPNG: () => void;
  onExportPDF: () => void;

  driveContents: () => string;
  driveFilename: () => string;
  onNotice: (message: string, tone: 'ok' | 'error') => void;
  notice: ToolbarNotice | null;
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

const SAVE_STATE_LABELS: Record<SaveState, string> = {
  idle: 'Saved on this device',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Not saved',
};

function SaveIndicator({ saveState, saveError }: { saveState: SaveState; saveError: string | null }) {
  const failed = saveState === 'error';
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] ${failed ? 'text-amber-400' : 'text-zinc-500'}`}
      title={saveError ?? 'Your sheet is kept in this browser until you clear it.'}
    >
      {failed
        ? <AlertTriangle size={12} aria-hidden="true" />
        : <Check size={12} aria-hidden="true" />}
      {SAVE_STATE_LABELS[saveState]}
    </span>
  );
}

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
  title, setTitle,
  saveState, saveError,
  canUndo, canRedo, onUndo, onRedo, onNewSheet,
  onExportTXT, onCopyText, onExportPNG, onExportPDF,
  driveContents, driveFilename, onNotice, notice,
}: ToolbarProps) {
  const [isMobileControlsOpen, setIsMobileControlsOpen] = useState(false);
  const driveAvailable = isDriveConfigured();

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

  const iconButton = 'inline-flex items-center justify-center rounded border border-zinc-700 bg-zinc-800 p-1.5 text-zinc-300 hover:bg-zinc-700 hover:text-white disabled:opacity-40 disabled:hover:bg-zinc-800 disabled:hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400';
  const textButton = 'inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400';

  const handleNewSheet = () => {
    const confirmed = window.confirm('Start a new sheet? The current one will be cleared from this device.');
    if (confirmed) onNewSheet();
  };

  return (
    <>
      <div className="relative z-30 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur-sm shadow-md">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <a
              href="https://aiwritersretreat.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 shrink-0 flex-col leading-tight text-zinc-300 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 rounded"
              title="AI Writers Retreat"
            >
              <span className="font-serif text-base font-medium tracking-wide sm:text-lg">
                AI Writers Retreat
              </span>
              <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                Digital Typewriter · Open Source
              </span>
            </a>

            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="sr-only">Document name</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled sheet"
                className="w-full min-w-0 max-w-64 rounded border border-transparent bg-transparent px-2 py-1 text-sm text-zinc-200 hover:border-zinc-700 focus:border-zinc-600 focus:bg-zinc-800 focus:outline-none"
              />
            </label>
          </div>

          {isMobile ? (
            <button
              onClick={() => setIsMobileControlsOpen((prev) => !prev)}
              className="inline-flex shrink-0 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
              aria-expanded={isMobileControlsOpen}
              aria-controls="mobile-controls-panel"
            >
              {isMobileControlsOpen ? <X size={16} /> : <Menu size={16} />}
              Controls
            </button>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <SaveIndicator saveState={saveState} saveError={saveError} />
              <button
                onClick={() => setAudioEnabled(!audioEnabled)}
                className="p-1.5 hover:bg-zinc-800 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                title={audioEnabled ? 'Mute' : 'Unmute'}
                aria-label={audioEnabled ? 'Mute sound' : 'Enable sound'}
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
                aria-label="Sound volume"
              />
              <span className={`text-[11px] uppercase tracking-wide ${statusTone}`}>{AUDIO_STATUS_LABELS[audioStatus]}</span>
            </div>
          )}
        </div>

        <div className={isMobile ? 'hidden' : 'px-3 pb-3 sm:px-4'}>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <div className="flex items-center gap-1">
              <button onClick={onUndo} disabled={!canUndo} className={iconButton} title="Undo (Ctrl+Z)" aria-label="Undo">
                <Undo2 size={16} />
              </button>
              <button onClick={onRedo} disabled={!canRedo} className={iconButton} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
                <Redo2 size={16} />
              </button>
              <button onClick={handleNewSheet} className={iconButton} title="New sheet" aria-label="New sheet">
                <FilePlus2 size={16} />
              </button>
            </div>

            <MachineSelect
              label="Machine"
              className="w-52"
              icon={<Type size={15} />}
              value={model}
              onChange={setModel}
              options={MODEL_KEYS.map((key) => ({
                value: key,
                label: MODELS[key].name,
                detail: MODELS[key].era,
              }))}
            />

            <MachineSelect
              label="Ribbon"
              className="w-36"
              icon={<Palette size={15} />}
              value={ribbon}
              onChange={setRibbon}
              options={RIBBON_KEYS.map((key) => ({ value: key, label: RIBBON_LABELS[key] }))}
            />

            {!isTablet && (
              <MachineSelect
                label="Spacing"
                className="w-40"
                icon={<AlignJustify size={15} />}
                value={lineSpacing}
                onChange={setLineSpacing}
                options={[
                  { value: 1, label: 'Single' },
                  { value: 1.5, label: 'One and a half' },
                  { value: 2, label: 'Double' },
                ]}
              />
            )}

            <MachineSelect
              label="Paper"
              className="w-32"
              icon={<FileText size={15} />}
              value={paperSize}
              onChange={setPaperSize}
              options={Object.entries(PAPER_SIZES).map(([k, v]) => ({ value: k as PaperSizeKey, label: v.name }))}
            />

            <MachineSelect
              label="Margins"
              className="w-44"
              icon={<Columns size={15} />}
              value={marginPreset}
              onChange={(val) => {
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
              options={[
                ...Object.entries(MARGIN_PRESETS).map(([k, v]) => ({ value: k as MarginPresetKey, label: v.name })),
                { value: 'custom' as MarginPresetKey, label: 'Set on the scale' },
              ]}
            />

            {marginPreset === 'custom' && !isTablet && (
              <CustomMarginInputs
                customMargins={customMargins}
                setCustomMargins={setCustomMargins}
                paperSize={paperSize}
              />
            )}

            <button
              onClick={() => setDisableBackspaceDelete(!disableBackspaceDelete)}
              className={`inline-flex items-center gap-1 rounded border px-2 py-1.5 text-xs transition-colors ${
                disableBackspaceDelete
                  ? 'bg-amber-900/50 border-amber-700 text-amber-200'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
              }`}
              aria-pressed={disableBackspaceDelete}
            >
              <Eraser size={14} aria-hidden="true" />
              {disableBackspaceDelete ? 'Backspace Lock On' : 'Backspace Lock Off'}
            </button>

            <div className="ml-auto flex items-center gap-2">
              <button onClick={onExportTXT} className={textButton} title="Download the text to this device">
                <Download size={16} aria-hidden="true" /> Text
              </button>
              <button onClick={onCopyText} className={textButton} title="Copy the text to the clipboard">
                <ClipboardCopy size={16} aria-hidden="true" /> Copy
              </button>
              {driveAvailable && (
                <DriveSaveButton
                  getContents={driveContents}
                  getFilename={driveFilename}
                  onResult={onNotice}
                />
              )}
              <button onClick={onExportPNG} className={textButton}>
                <Download size={16} aria-hidden="true" /> PNG
              </button>
              <button onClick={onExportPDF} className={textButton}>
                <Download size={16} aria-hidden="true" /> PDF
              </button>
            </div>
          </div>

          {notice && (
            <p
              className={`mt-2 text-xs ${notice.tone === 'error' ? 'text-amber-400' : 'text-emerald-400'}`}
              role="status"
            >
              {notice.message}
            </p>
          )}
        </div>
      </div>

      {isMobile && (
        <div
          id="mobile-controls-panel"
          className={isMobileControlsOpen ? 'fixed inset-0 z-40' : 'hidden'}
          role="dialog"
          aria-modal="true"
          aria-label="Typewriter controls"
        >
          <button
            className="absolute inset-0 bg-black/60"
            onClick={() => setIsMobileControlsOpen(false)}
            aria-label="Close controls"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[78dvh] overflow-y-auto rounded-t-2xl border-t border-zinc-700 bg-zinc-900 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-200">
                <Settings2 size={16} aria-hidden="true" />
                <span className="text-sm font-medium uppercase tracking-wide">Typewriter Controls</span>
              </div>
              <button onClick={() => setIsMobileControlsOpen(false)} className="rounded border border-zinc-700 p-1.5 text-zinc-300" aria-label="Close controls">
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 text-sm">
              <div className="flex items-center justify-between">
                <SaveIndicator saveState={saveState} saveError={saveError} />
                <div className="flex gap-1">
                  <button onClick={onUndo} disabled={!canUndo} className={iconButton} aria-label="Undo"><Undo2 size={16} /></button>
                  <button onClick={onRedo} disabled={!canRedo} className={iconButton} aria-label="Redo"><Redo2 size={16} /></button>
                </div>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-zinc-400">Document name</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Untitled sheet"
                  className="rounded border border-zinc-700 bg-zinc-800 px-2 py-2 text-zinc-200"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-zinc-400">Model</span>
                <select value={model} onChange={(e) => setModel(e.target.value as ModelKey)} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-2">
                  {Object.entries(MODELS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-zinc-400">Ribbon</span>
                <select value={ribbon} onChange={(e) => setRibbon(e.target.value as RibbonKey)} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-2">
                  {RIBBON_KEYS.map((key) => <option key={key} value={key}>{RIBBON_LABELS[key]}</option>)}
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
                <button onClick={onExportTXT} className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2">Download Text</button>
                <button onClick={onCopyText} className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2">Copy Text</button>
                {driveAvailable && (
                  <DriveSaveButton
                    compact
                    getContents={driveContents}
                    getFilename={driveFilename}
                    onResult={onNotice}
                  />
                )}
                <button onClick={onExportPNG} className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2">Export PNG</button>
                <button onClick={onExportPDF} className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2">Export PDF</button>
                <button onClick={handleNewSheet} className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2">New Sheet</button>
              </div>

              {notice && (
                <p className={`text-xs ${notice.tone === 'error' ? 'text-amber-400' : 'text-emerald-400'}`} role="status">
                  {notice.message}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
