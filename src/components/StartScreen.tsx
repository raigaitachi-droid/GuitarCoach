import { useRef, useState } from 'react';
import { ImportedSong } from '../types';
import { AudioInputDevice } from '../utils/pitchDetector';

interface Props {
  song: ImportedSong | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
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

export function StartScreen({ song, loading, busy, error, devices, deviceId, onDeviceChange, onFindInputs, onFile, onDemo, onChordTest, onStart, onReset }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const disabled = loading || busy;
  return (
    <main className="start-screen" aria-labelledby="start-heading">
      <div className="start-ambience" aria-hidden="true">
        <span className="spotlight spotlight-one" />
        <span className="spotlight spotlight-two" />
        <span className="spotlight spotlight-three" />
        <span className="start-highway">
          {['green', 'red', 'yellow', 'blue', 'orange', 'magenta'].map((lane) => <i key={lane} className={`start-lane start-lane-${lane}`} />)}
          <b className="start-hit start-hit-green" />
          <b className="start-hit start-hit-red" />
          <b className="start-hit start-hit-yellow" />
          <b className="start-hit start-hit-blue" />
          <b className="start-hit start-hit-orange" />
          <b className="start-hit start-hit-magenta" />
        </span>
      </div>
      <h1 className="start-wordmark"><span>Guitar</span>Coach</h1>
      <div className="start-card">
        {!song ? (
          <>
            <p className="start-kicker">Guitar rhythm trainer</p>
            <h1 id="start-heading">Practice tabs like<br />a rhythm game</h1>
            <p className="start-copy">Load any Guitar Pro tab and play through a neon note highway with local audio feedback.</p>
            <input ref={input} hidden type="file" tabIndex={-1} aria-label="Guitar Pro file" accept=".gp,.gpx,.gp3,.gp4,.gp5,.gp7,.gp8" disabled={disabled}
              onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onFile(file); }} />
            <button className={`drop-zone ${dragging ? 'is-dragging' : ''}`} aria-label="Drop Guitar Pro file - Load Guitar Pro Tab" disabled={disabled}
              onClick={() => input.current?.click()}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file && !disabled) onFile(file); }}>
              <span className="drop-icon" aria-hidden="true" />
              <span className="drop-title">{loading ? 'Loading your tabРІР‚В¦' : 'Load Guitar Pro Tab'}</span>
              <span className="muted">Drop a file here or click to choose</span>
            </button>
            <div className="start-actions">
              <button className="secondary-button demo-button" disabled={disabled} onClick={onDemo}>Try demo song</button>
              <button className="text-button demo-button" disabled={disabled} onClick={onChordTest}>Try open chords test</button>
            </div>
            <p className="format-note">Supports GP, GPX, GP3-GP8</p>
            <p className="privacy-note">Audio stays on your device</p>
          </>
        ) : (
          <section className="input-setup" aria-label="Prepare practice">
            <p className="start-kicker">Ready to practice</p>
            <div className="loaded-song"><div><h1 id="start-heading">{song.title}</h1><p className="start-copy">Choose an input or jump straight into playback mode.</p></div><button className="text-button" onClick={onReset} disabled={busy}>Change tab</button></div>
            <div className="input-label"><label htmlFor="guitar-input">Guitar input</label><button className="text-button" onClick={onFindInputs} disabled={busy}>{busy ? 'ConnectingРІР‚В¦' : 'Find inputs'}</button></div>
            <select id="guitar-input" value={deviceId} disabled={busy} onChange={(event) => onDeviceChange(event.target.value)}>
              <option value="">Default input</option>
              {devices.filter((device) => device.deviceId && device.deviceId !== 'default').map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Audio input ${index + 1}`}</option>)}
            </select>
            <button className="primary-button start-button" onClick={() => onStart(true)} disabled={busy}>{busy ? 'ConnectingРІР‚В¦' : 'Start Practice'}</button>
            <p className="privacy-note">Your guitar audio is processed locally.</p>
            <button className="secondary-button preview-button" onClick={() => onStart(false)} disabled={busy}>Continue without audio</button>
          </section>
        )}
        {error && <p role="alert" className="error-message">{error}</p>}
      </div>
    </main>
  );
}
