import React, { useRef, useState, useEffect, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Toolbar, type ToolbarNotice } from './components/Toolbar';
import { Typewriter } from './components/Typewriter';
import { MODELS, type ModelKey, type RibbonKey } from './lib/machines';
import { audioEngine, type AudioStatus } from './lib/audio';
import { resolveResponsiveTier, type ResponsiveTier } from './lib/responsive';
import { type PaperSizeKey, type MarginPresetKey, type CustomMargins, type DocumentModel } from './lib/documentModel';
import { exportDocumentToPdf } from './lib/pdfExport';
import type { RibbonWearState } from './lib/ribbonWear';
import { useTypewriterDocument, type SheetSettings } from './hooks/useTypewriterDocument';
import { copyToClipboard, downloadTextFile, toFileBaseName, toPlainText } from './lib/exporters';
import { getGoogleClientId } from './lib/googleDrive';
import type { PersistedSheet } from './lib/persistence';

const NOTICE_TIMEOUT_MS = 4000;

function TypewriterApp() {
  const [model, setModel] = useState<ModelKey>('remington');
  const [ribbon, setRibbon] = useState<RibbonKey>('black');
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
  const [notice, setNotice] = useState<ToolbarNotice | null>(null);

  const paperRef = useRef<HTMLDivElement>(null);
  const latestDocRef = useRef<DocumentModel | null>(null);
  const latestWearRef = useRef<RibbonWearState | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const settings: SheetSettings = {
    model,
    ribbon,
    lineSpacing,
    paperSize,
    marginPreset,
    customMargins,
  };

  // Restoring a saved sheet also restores the machine it was typed on, so a
  // reload brings back the same page, not just the same words.
  const handleRestoreSettings = useCallback((sheet: PersistedSheet) => {
    setModel(sheet.model);
    setRibbon(sheet.ribbon);
    setLineSpacing(sheet.lineSpacing);
    setPaperSize(sheet.paperSize as PaperSizeKey);
    setMarginPreset(sheet.marginPreset as MarginPresetKey);
    setCustomMargins(sheet.customMargins);
  }, []);

  const doc = useTypewriterDocument({ settings, onRestoreSettings: handleRestoreSettings });

  const showNotice = useCallback((message: string, tone: 'ok' | 'error') => {
    setNotice({ message, tone });
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), NOTICE_TIMEOUT_MS);
  }, []);

  useEffect(() => () => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
  }, []);

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

  // ---------------------------------------------------------------------------
  // Getting the writing out
  // ---------------------------------------------------------------------------

  const plainText = () => toPlainText(doc.text);
  const fileBaseName = () => toFileBaseName(doc.title);

  const handleExportTXT = () => {
    if (!doc.text.trim()) {
      showNotice('Nothing typed yet.', 'error');
      return;
    }
    downloadTextFile(`${fileBaseName()}.txt`, plainText());
    showNotice('Text file downloaded.', 'ok');
  };

  const handleCopyText = async () => {
    if (!doc.text.trim()) {
      showNotice('Nothing typed yet.', 'error');
      return;
    }
    const copied = await copyToClipboard(plainText());
    showNotice(
      copied ? 'Text copied to the clipboard.' : 'Could not reach the clipboard in this browser.',
      copied ? 'ok' : 'error',
    );
  };

  const handleExportPNG = async () => {
    if (!paperRef.current) return;
    try {
      const dataUrl = await toPng(paperRef.current, {
        pixelRatio: 2,
        backgroundColor: '#f4f1ea',
      });
      const link = document.createElement('a');
      link.download = `${fileBaseName()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export PNG', err);
      showNotice('Could not render the page as an image.', 'error');
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
      showNotice('Could not build the PDF.', 'error');
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
        title={doc.title} setTitle={doc.setTitle}
        saveState={doc.saveState} saveError={doc.saveError}
        canUndo={doc.canUndo} canRedo={doc.canRedo}
        onUndo={() => doc.undo()}
        onRedo={() => doc.redo()}
        onNewSheet={doc.newSheet}
        onExportTXT={handleExportTXT}
        onCopyText={handleCopyText}
        onExportPNG={handleExportPNG}
        onExportPDF={handleExportPDF}
        driveContents={plainText}
        driveFilename={() => `${fileBaseName()}.txt`}
        onNotice={showNotice}
        notice={notice}
      />
      <Typewriter
        responsiveTier={responsiveTier}
        mobileKeyboardOpen={mobileKeyboardOpen}
        doc={doc}
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
        onDocumentModelChange={(model) => {
          latestDocRef.current = model;
        }}
        onRibbonWearChange={(wearState) => {
          latestWearRef.current = wearState;
        }}
      />
    </div>
  );
}

export default function App() {
  const clientId = getGoogleClientId();

  // The OAuth provider loads Google's script as soon as it mounts, so it is
  // only rendered when Drive is actually configured. Without it the app makes
  // no third-party requests at all.
  if (!clientId) {
    return <TypewriterApp />;
  }

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <TypewriterApp />
    </GoogleOAuthProvider>
  );
}
