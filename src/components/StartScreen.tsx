import { useEffect, useRef, useState } from 'react';
import { ImportedSong } from '../types';
import { AudioInputDevice } from '../utils/pitchDetector';
import startBackgroundVideo from '../assets/start-bg.mp4';
import startBackgroundPoster from '../assets/start-bg-poster.jpg';
import { MyTabs } from './MyTabs';

interface Props {
  song: ImportedSong | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  storageNotice: string | null;
  devices: AudioInputDevice[];
  deviceId: string;
  onDeviceChange: (id: string) => void;
  onFindInputs: () => void;
  onFile: (file: File) => void;
  onDemo: () => void;
  onChordTest: () => void;
  onStart: (withAudio: boolean) => void;
  onReset: () => void;
}

export function StartScreen({ song, loading, busy, error, storageNotice, devices, deviceId, onDeviceChange, onFindInputs, onFile, onDemo, onStart, onReset }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [dragging, setDragging] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [showTabs, setShowTabs] = useState(false);
  const tabsButton = useRef<HTMLButtonElement>(null);
  const disabled = loading || busy;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || videoFailed) return;
    const syncPlayback = () => {
      if (document.hidden) {
        video.pause();
        return;
      }
      void video.play().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', syncPlayback);
    syncPlayback();
    return () => {
      document.removeEventListener('visibilitychange', syncPlayback);
      video.pause();
    };
  }, [videoFailed]);

  return (
    <main className="start-screen" aria-labelledby="start-heading">
      <div className={`start-video-layer ${videoFailed ? 'is-video-failed' : ''}`} aria-hidden="true" style={{ backgroundImage: `url(${startBackgroundPoster})` }}>
        {!videoFailed && <video ref={videoRef} className="start-bg-video" src={startBackgroundVideo} poster={startBackgroundPoster} autoPlay loop muted playsInline preload="auto" onError={() => setVideoFailed(true)} />}
      </div>
      <h1 className="start-wordmark"><span>Guitar</span>Coach</h1>
      <nav className="start-navigation" aria-label="Start menu"><button ref={tabsButton} className="my-tabs-menu" disabled={disabled} aria-expanded={showTabs} onClick={() => setShowTabs((open) => !open)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M4 5h6l2 2h8v12H4V5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M8 11h8M8 15h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>My Tabs
      </button></nav>
      <div className="start-card">
        {showTabs ? <MyTabs onBack={() => { setShowTabs(false); tabsButton.current?.focus(); }} onOpen={(file) => { setShowTabs(false); onFile(file); }} /> : !song ? (
          <>
            <h2 id="start-heading" className="start-title">Practice tabs like<br /><span>a rhythm game</span></h2>
            <input ref={input} hidden type="file" tabIndex={-1} aria-label="Guitar Pro file" accept=".gp,.gpx,.gp3,.gp4,.gp5,.gp7,.gp8" disabled={disabled}
              onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onFile(file); }} />
            <button className={`drop-zone ${dragging ? 'is-dragging' : ''}`} aria-label="Drop Guitar Pro file - Load Guitar Pro Tab" disabled={disabled}
              onClick={() => input.current?.click()}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file && !disabled) onFile(file); }}>
              <svg className="drop-icon" aria-hidden="true" viewBox="0 0 32 32" fill="none"><path d="M9 5h10l5 5v17H9V5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M19 5v6h5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M22 21h7M25.5 17.5v7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>
              <span className="drop-title">{loading ? 'Loading your tab...' : 'Load Guitar Pro Tab'}</span>
            </button>
            <button className="secondary-button demo-button" disabled={disabled} onClick={onDemo}>Try demo song</button>
            <p className="format-note">Supports GP, GPX, GP3-GP8</p>
            <p className="privacy-note"><span className="lock-icon" aria-hidden="true" />Audio stays on your device</p>
          </>
        ) : (
          <section className="input-setup" aria-label="Prepare practice">
            <div className="loaded-song"><div><h2 id="start-heading" className="start-title loaded-title">{song.title}</h2></div><button className="text-button" onClick={onReset} disabled={busy}>Change tab</button></div>
            <div className="input-label"><label htmlFor="guitar-input">Guitar input</label><button className="text-button" onClick={onFindInputs} disabled={busy}>{busy ? 'Connecting...' : 'Find inputs'}</button></div>
            <select id="guitar-input" value={deviceId} disabled={busy} onChange={(event) => onDeviceChange(event.target.value)}>
              <option value="">Default input</option>
              {devices.filter((device) => device.deviceId && device.deviceId !== 'default').map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Audio input ${index + 1}`}</option>)}
            </select>
            <button className="primary-button start-button" onClick={() => onStart(true)} disabled={busy}>{busy ? 'Connecting...' : 'Start Practice'}</button>
            <p className="privacy-note"><span className="lock-icon" aria-hidden="true" />Your guitar audio is processed locally.</p>
            <button className="secondary-button preview-button" onClick={() => onStart(false)} disabled={busy}>Continue without audio</button>
          </section>
        )}
        {error && <p role="alert" className="error-message">{error}</p>}
        {storageNotice && !showTabs && song && <p role="status" className="my-tabs-caption">{storageNotice}</p>}
      </div>
    </main>
  );
}
