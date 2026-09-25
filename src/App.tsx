import { useEffect, useRef, useState } from 'react';
import { PlayingStage } from './components/PlayingStage';
import { StartScreen } from './components/StartScreen';
import { PracticeResult } from './components/PracticeResult';
import { ImportedSong } from './types';
import { AudioInputDevice, micDetector } from './utils/pitchDetector';
import { guitarSynth } from './utils/guitarSynth';
import { findWeakSection, PracticeLoopRange, PracticeResult as SessionResult, WeakSection } from './utils/practiceSession';
import { SONG_CATALOG, SONG_TABS } from './data/songTabs';

function demoSong(): ImportedSong {
  const song = SONG_CATALOG[0];
  const notes = SONG_TABS[song.id].map((note) => ({
    ...note,
    measureIndex: Math.max(1, Math.floor((note.timestampMs - 1000) / (60000 / song.tempo * 4)) + 1),
  }));
  return { ...song, title: 'Canon in D · demo', notes, sourceFileName: '', attempts: 0, bestAccuracy: 0, measures: Math.max(...notes.map((note) => note.measureIndex)) };
}

export default function App() {
  const [screen, setScreen] = useState<'start' | 'practice' | 'result'>('start');
  const [song, setSong] = useState<ImportedSong | null>(null);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [tempoPercent, setTempoPercent] = useState(100);
  const [weakSection, setWeakSection] = useState<WeakSection | null>(null);
  const [practiceFocus, setPracticeFocus] = useState<PracticeLoopRange | null>(null);
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [withAudio, setWithAudio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef(false);
  const mounted = useRef(true);

  const refreshInputs = async () => {
    try {
      const available = await micDetector.listInputDevices();
      if (mounted.current) setDevices(available);
    } catch { /* Input permission remains recoverable through Start Practice. */ }
  };

  useEffect(() => {
    mounted.current = true;
    void refreshInputs();
    if (!micDetector.isNativeCaptureAvailable()) navigator.mediaDevices?.addEventListener('devicechange', refreshInputs);
    return () => {
      mounted.current = false;
      micDetector.stopListening();
      navigator.mediaDevices?.removeEventListener('devicechange', refreshInputs);
    };
  }, []);

  useEffect(() => {
    if (deviceId && !devices.some((device) => device.deviceId === deviceId)) {
      setDeviceId('');
    }
  }, [deviceId, devices]);

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
      if (micDetector.isNativeCaptureAvailable()) {
        await refreshInputs();
        return;
      }
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
      setWeakSection(null);
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
    setWeakSection(null);
    setPracticeFocus(null);
    setError(null);
    setScreen('start');
  };

  if (screen === 'practice' && song) return (
    <PlayingStage song={song} withAudio={withAudio} tempoPercent={tempoPercent} initialLoopRange={practiceFocus} onTempoPercentChange={setTempoPercent}
      onFinish={(session) => { micDetector.stopListening(); setPracticeFocus(null); setWeakSection(session.hadAudio ? findWeakSection(song, session.notes) : null); setResult(session); setScreen('result'); }} />
  );

  if (screen === 'result' && song && result) return (
    <PracticeResult songTitle={song.title} result={result} weakSection={weakSection} isStarting={busy} error={error}
      onPracticeWeakSection={() => {
        if (!weakSection) return;
        setPracticeFocus({ startBar: weakSection.startBar, endBar: weakSection.endBar });
        setTempoPercent(tempoPercent >= 90 ? 80 : tempoPercent >= 80 ? 70 : tempoPercent >= 70 ? 50 : 50);
        void startPractice(withAudio);
      }} onReplay={() => { setPracticeFocus(null); void startPractice(withAudio); }} onLoadAnother={reset} />
  );

  return <StartScreen song={song} loading={loading} busy={busy} error={error} devices={devices} deviceId={deviceId}
    onDeviceChange={setDeviceId} onFindInputs={() => { void findInputs(); }} onFile={(file) => { void loadFile(file); }}
    onDemo={() => { setSong(demoSong()); setTempoPercent(100); setError(null); }} onStart={(useAudio) => { void startPractice(useAudio); }} onReset={reset} />;
}
