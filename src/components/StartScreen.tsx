import { useRef, useState } from 'react';
import { ImportedSong } from '../types';

interface Props {
  song: ImportedSong | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  devices: MediaDeviceInfo[];
  deviceId: string;
  onDeviceChange: (id: string) => void;
  onFindInputs: () => void;
  onFile: (file: File) => void;
  onDemo: () => void;
  onStart: (withAudio: boolean) => void;
  onReset: () => void;
}

export function StartScreen({ song, loading, busy, error, devices, deviceId, onDeviceChange, onFindInputs, onFile, onDemo, onStart, onReset }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const disabled = loading || busy;
  return (
    <main className="centered-screen" aria-labelledby="start-heading">
      <div className="start-content">
        <h1 id="start-heading">GuitarCoach</h1>
        <p className="tagline">Practice any Guitar Pro tab with instant feedback.</p>
        {!song ? (
          <>
            <input ref={input} hidden type="file" tabIndex={-1} aria-label="Guitar Pro file" accept=".gp,.gpx,.gp3,.gp4,.gp5,.gp7,.gp8" disabled={disabled}
              onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onFile(file); }} />
            <button className={`drop-zone ${dragging ? 'is-dragging' : ''}`} disabled={disabled}
              onClick={() => input.current?.click()}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file && !disabled) onFile(file); }}>
              <span className="drop-title">{loading ? 'Loading your tab…' : 'Drop Guitar Pro file'}</span>
              <span className="muted">or click to choose a file</span>
            </button>
            <button className="text-button demo-button" disabled={disabled} onClick={onDemo}>Try demo song</button>
          </>
        ) : (
          <section className="input-setup" aria-label="Prepare practice">
            <div className="loaded-song"><div><p className="eyebrow">Ready to practice</p><h2>{song.title}</h2></div><button className="text-button" onClick={onReset} disabled={busy}>Change tab</button></div>
            <div className="input-label"><label htmlFor="guitar-input">Guitar input</label><button className="text-button" onClick={onFindInputs} disabled={busy}>{busy ? 'Connecting…' : 'Find inputs'}</button></div>
            <select id="guitar-input" value={deviceId} disabled={busy} onChange={(event) => onDeviceChange(event.target.value)}>
              <option value="">Default input</option>
              {devices.filter((device) => device.deviceId && device.deviceId !== 'default').map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Audio input ${index + 1}`}</option>)}
            </select>
            <button className="primary-button start-button" onClick={() => onStart(true)} disabled={busy}>{busy ? 'Connecting…' : 'Start Practice'}</button>
            <p className="privacy-note">Your guitar audio is processed locally.</p>
            <button className="text-button preview-button" onClick={() => onStart(false)} disabled={busy}>Continue without audio</button>
          </section>
        )}
        {error && <p role="alert" className="error-message">{error}</p>}
      </div>
    </main>
  );
}
