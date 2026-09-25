import { PracticeResult as SessionResult } from '../utils/practiceSession';

interface Props {
  songTitle: string;
  result: SessionResult;
  onReplay: () => void;
  onLoadAnother: () => void;
  isStarting: boolean;
  error: string | null;
}

export function PracticeResult({ songTitle, result, onReplay, onLoadAnother, isStarting, error }: Props) {
  return (
    <main className="centered-screen" aria-labelledby="result-heading">
      <div className="result-content">
        <p className="eyebrow">{songTitle}</p>
        <h1 id="result-heading">{result.accuracy === null ? 'Practice complete' : <><span className="accuracy">{result.accuracy}%</span> accuracy</>}</h1>
        <p className="muted">
          {!result.hadAudio
            ? 'Connect your guitar input to get feedback.'
            : result.attempted === 0
            ? 'No single notes were assessed. Play a little longer to get feedback.'
            : `${result.correct} of ${result.attempted} single notes played correctly.`}
        </p>
        {error && <p role="alert" className="error-message">{error}</p>}
        <div className="result-actions">
          <button className="primary-button" onClick={onReplay} disabled={isStarting}>{isStarting ? 'Connecting…' : 'Play again'}</button>
          <button className="text-button" onClick={onLoadAnother} disabled={isStarting}>Load another tab</button>
        </div>
      </div>
    </main>
  );
}
