import React, { useRef, useState, useEffect } from 'react';
import { toPng, toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { Toolbar, MODELS, RIBBONS } from './components/Toolbar';
import { Typewriter } from './components/Typewriter';
import { audioEngine, type AudioStatus } from './lib/audio';
import { DEFAULT_PAGE_SPEC } from './lib/documentModel';

export default function App() {
  const [model, setModel] = useState<keyof typeof MODELS>('remington');
  const [ribbon, setRibbon] = useState<keyof typeof RIBBONS>('black');
  const [volume, setVolume] = useState(0.5);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('off');
  const [lineSpacing, setLineSpacing] = useState<number>(1);
  
  const paperRef = useRef<HTMLDivElement>(null);

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
    if (!paperRef.current) return;
    try {
      const pages = Array.from(paperRef.current.children) as HTMLElement[];
      
      const { width, height } = DEFAULT_PAGE_SPEC.paper;

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [width, height]
      });

      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i];
        const imgData = await toJpeg(pageEl, {
          pixelRatio: 2,
          backgroundColor: '#f4f1ea',
          quality: 0.95,
        });

        if (i > 0) {
          pdf.addPage([width, height], 'portrait');
        }

        pdf.addImage(imgData, 'JPEG', 0, 0, width, height);
      }
      
      pdf.save(`typewriter-document-${Date.now()}.pdf`);
    } catch (err) {
      console.error('Failed to export PDF', err);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-900 text-neutral-200 font-sans overflow-hidden">
      <Toolbar 
        model={model} setModel={setModel}
        ribbon={ribbon} setRibbon={setRibbon}
        volume={volume} setVolume={setVolume}
        audioEnabled={audioEnabled} setAudioEnabled={setAudioEnabled}
        audioStatus={audioStatus}
        lineSpacing={lineSpacing} setLineSpacing={setLineSpacing}
        onExportPNG={handleExportPNG}
        onExportPDF={handleExportPDF}
      />
      <Typewriter 
        model={model}
        ribbon={ribbon}
        audioEnabled={audioEnabled}
        audioStatus={audioStatus}
        volume={volume}
        lineSpacing={lineSpacing}
        paperRef={paperRef}
      />
    </div>
  );
}
