import { useEffect, useRef, useState } from 'react';
import { PlayingStage } from './components/PlayingStage';
import { StartScreen } from './components/StartScreen';
import { PracticeResult } from './components/PracticeResult';
import { ImportedSong } from './types';
import { micDetector } from './utils/pitchDetector';
import { guitarSynth } from './utils/guitarSynth';
import { PracticeResult as SessionResult } from './utils/practiceSession';
import { SONG_CATALOG, SONG_TABS } from './data/songTabs';

function demoSong(): ImportedSong {
  const song = SONG_CATALOG[0];
  const notes = SONG_TABS[song.id].map((note) => ({
    ...note,
    measureIndex: Math.max(1, Math.floor((note.timestampMs - 1000) / (60000 / song.tempo * 4)) + 1),
  }));
  return { ...song, title: 'Canon in D · demo', notes, sections: [], sourceFileName: '', attempts: 0, bestAccuracy: 0, measures: Math.max(...notes.map((note) => note.measureIndex)) };
}

export default function App() {
  const [screen, setScreen] = useState<'start' | 'practice' | 'result'>('start');
  const [song, setSong] = useState<ImportedSong | null>(null);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [tempoPercent, setTempoPercent] = useState(100);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [withAudio, setWithAudio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef(false);
  const mounted = useRef(true);

  const refreshInputs = async () => {
    try {
      const available = await navigator.mediaDevices?.enumerateDevices();
      if (mounted.current) setDevices((available || []).filter((device) => device.kind === 'audioinput'));
    } catch { /* Input permission remains recoverable through Start Practice. */ }
  };

  useEffect(() => {
    mounted.current = true;
    void refreshInputs();
    navigator.mediaDevices?.addEventListener('devicechange', refreshInputs);
    return () => {
      mounted.current = false;
      micDetector.stopListening();
      navigator.mediaDevices?.removeEventListener('devicechange', refreshInputs);
    };
  }, []);

  const loadFile = async (file: File) => {
    if (operation.current) return;
    operation.current = true;
    setLoading(true);
    setError(null);
    try {
      const { importGuitarProFile } = await import('./utils/guitarProImporter');
      const imported = await importGuitarProFile(file);
      if (mounted.current) { setSong(imported); setTempoPercent(100); }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error && cause.message.startsWith('Choose a Guitar Pro')
        ? cause.message
        : 'We couldn’t open that tab. Try another Guitar Pro file.');
    } finally {
      operation.current = false;
      if (mounted.current) setLoading(false);
    }
  };

  const findInputs = async () => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError(null);
    try {
      const connected = await micDetector.startListening();
      if (!mounted.current) return;
      if (connected) await refreshInputs();
      else setError(micDetector.getErrorMessage());
    } finally {
      micDetector.stopListening();
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const startPractice = async (useAudio: boolean) => {
    if (!song || operation.current) return;
    operation.current = true;
    setBusy(true);
    setError(null);
    try {
      if (useAudio && !await micDetector.startListening(deviceId)) {
        if (mounted.current) setError(micDetector.getErrorMessage());
        return;
      }
      if (!mounted.current) return;
      if (!useAudio) { micDetector.stopListening(); guitarSynth.resume(); }
      setWithAudio(useAudio);
      setResult(null);
      setScreen('practice');
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const reset = () => {
    micDetector.stopListening();
    setSong(null);
    setResult(null);
    setError(null);
    setScreen('start');
  };

  if (screen === 'practice' && song) return (
    <PlayingStage song={song} withAudio={withAudio} tempoPercent={tempoPercent} onTempoPercentChange={setTempoPercent}
      onFinish={(session) => { micDetector.stopListening(); setResult(session); setScreen('result'); }} />
  );

  if (screen === 'result' && song && result) return (
    <PracticeResult songTitle={song.title} result={result} isStarting={busy} error={error}
      onReplay={() => { void startPractice(withAudio); }} onLoadAnother={reset} />
  );

  return <StartScreen song={song} loading={loading} busy={busy} error={error} devices={devices} deviceId={deviceId}
    onDeviceChange={setDeviceId} onFindInputs={() => { void findInputs(); }} onFile={(file) => { void loadFile(file); }}
    onDemo={() => { setSong(demoSong()); setTempoPercent(100); setError(null); }} onStart={(useAudio) => { void startPractice(useAudio); }} onReset={reset} />;
}
