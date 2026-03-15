import React, { useRef, useState, useEffect } from 'react';
import { toPng } from 'html-to-image';
import { Toolbar, MODELS, RIBBONS } from './components/Toolbar';
import { Typewriter } from './components/Typewriter';
import { audioEngine, type AudioStatus } from './lib/audio';
import { resolveResponsiveTier, type ResponsiveTier } from './lib/responsive';
import { type PaperSizeKey, type MarginPresetKey, type CustomMargins, type DocumentModel } from './lib/documentModel';
import { exportDocumentToPdf } from './lib/pdfExport';
import type { RibbonWearState } from './lib/ribbonWear';

export default function App() {
  const [model, setModel] = useState<keyof typeof MODELS>('remington');
  const [ribbon, setRibbon] = useState<keyof typeof RIBBONS>('black');
  const [volume, setVolume] = useState(0.8);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('off');
  const [lineSpacing, setLineSpacing] = useState<number>(1);
  const [paperSize, setPaperSize] = useState<PaperSizeKey>('letter');
  const [marginPreset, setMarginPreset] = useState<MarginPresetKey>('normal');
  const [customMargins, setCustomMargins] = useState<CustomMargins>({
    marginTop: 122,
    marginBottom: 104,
    marginLeft: 104,
    marginRight: 104,
  });
  const [disableBackspaceDelete, setDisableBackspaceDelete] = useState(false);
  const [responsiveTier, setResponsiveTier] = useState<ResponsiveTier>('desktop');
  const [mobileKeyboardOpen, setMobileKeyboardOpen] = useState(false);

  const paperRef = useRef<HTMLDivElement>(null);
  const latestDocRef = useRef<DocumentModel | null>(null);
  const latestWearRef = useRef<RibbonWearState | null>(null);

  useEffect(() => {
    const unsubscribe = audioEngine.onStatusChange(setAudioStatus);
    return unsubscribe;
  }, []);

  useEffect(() => {
    audioEngine.setEnabled(audioEnabled);

    if (audioEnabled) {
      audioEngine.init();
    }
  }, [audioEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateTier = () => {
      setResponsiveTier(resolveResponsiveTier(window.innerWidth));
    };

    updateTier();
    window.addEventListener('resize', updateTier);
    return () => window.removeEventListener('resize', updateTier);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const viewport = window.visualViewport;
    const detectKeyboard = () => {
      const keyboardLikelyOpen = window.innerHeight - viewport.height > 140;
      setMobileKeyboardOpen(keyboardLikelyOpen);
    };

    detectKeyboard();
    viewport.addEventListener('resize', detectKeyboard);
    return () => viewport.removeEventListener('resize', detectKeyboard);
  }, []);

  const handleExportPNG = async () => {
    if (!paperRef.current) return;
    try {
      const dataUrl = await toPng(paperRef.current, {
        pixelRatio: 2,
        backgroundColor: '#f4f1ea',
      });
      const link = document.createElement('a');
      link.download = `typewriter-page-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export PNG', err);
    }
  };

  const handleExportPDF = async () => {
    if (!latestDocRef.current) return;

    try {
      await exportDocumentToPdf(latestDocRef.current, {
        modelKey: model,
        ribbon,
        wearState: latestWearRef.current ?? undefined,
        wearLevel: MODELS[model].wear,
      });
    } catch (err) {
      console.error('Failed to export PDF', err);
    }
  };

  return (
    <div className="flex flex-col min-h-[100dvh] bg-neutral-900 text-neutral-200 font-sans overflow-hidden">
      <Toolbar
        responsiveTier={responsiveTier}
        model={model} setModel={setModel}
        ribbon={ribbon} setRibbon={setRibbon}
        volume={volume} setVolume={setVolume}
        audioEnabled={audioEnabled} setAudioEnabled={setAudioEnabled}
        audioStatus={audioStatus}
        lineSpacing={lineSpacing} setLineSpacing={setLineSpacing}
        paperSize={paperSize} setPaperSize={setPaperSize}
        marginPreset={marginPreset} setMarginPreset={setMarginPreset}
        customMargins={customMargins} setCustomMargins={setCustomMargins}
        disableBackspaceDelete={disableBackspaceDelete}
        setDisableBackspaceDelete={setDisableBackspaceDelete}
        onExportPNG={handleExportPNG}
        onExportPDF={handleExportPDF}
      />
      <Typewriter
        responsiveTier={responsiveTier}
        mobileKeyboardOpen={mobileKeyboardOpen}
        model={model}
        ribbon={ribbon}
        audioEnabled={audioEnabled}
        audioStatus={audioStatus}
        volume={volume}
        lineSpacing={lineSpacing}
        paperSize={paperSize}
        marginPreset={marginPreset}
        customMargins={customMargins}
        disableBackspaceDelete={disableBackspaceDelete}
        paperRef={paperRef}
        onDocumentModelChange={(doc) => {
          latestDocRef.current = doc;
        }}
        onRibbonWearChange={(wearState) => {
          latestWearRef.current = wearState;
        }}
      />
    </div>
  );
}
