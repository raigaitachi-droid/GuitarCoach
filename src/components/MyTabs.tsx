import { useEffect, useRef, useState } from 'react';
import { listTabs, openTab, removeTab, SavedTab } from '../utils/myTabs';

export function MyTabs({ onBack, onOpen }: { onBack: () => void; onOpen: (file: File) => void }) {
  const [tabs, setTabs] = useState<SavedTab[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    let active = true;
    void listTabs().then((items) => { if (active) setTabs(items); })
      .catch(() => { if (active) setError('Saved tabs are unavailable. You can still load a Guitar Pro file.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const act = async (tab: SavedTab, remove: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (remove) {
        await removeTab(tab.id);
        setTabs((items) => items.filter((item) => item.id !== tab.id));
      } else onOpen(await openTab(tab));
    } catch { setError('Couldn’t access this saved tab. Please try again.'); }
    finally { setBusy(false); }
  };

  return <section className="my-tabs" aria-label="My Tabs library">
    <div className="my-tabs-heading"><h2 id="start-heading" ref={heading} tabIndex={-1}>My Tabs</h2>
      <button className="text-button" disabled={busy} onClick={onBack}>Back</button></div>
    <p className="my-tabs-caption">Your imported tabs, saved on this device.</p>
    {loading ? <p role="status">Loading tabs…</p> : !error && tabs.length === 0 ? <p className="my-tabs-empty">No saved tabs yet. Load a Guitar Pro file to add your first song.</p> : null}
    {tabs.length > 0 && <ul className="my-tabs-list">{tabs.map((tab) => <li key={tab.id}>
      <button className="my-tabs-open" disabled={busy} aria-label={`Open ${tab.title}`} onClick={() => { void act(tab, false); }}>
        <span>{tab.title}</span><small>{tab.tempo} BPM · {tab.measures} {tab.measures === 1 ? 'bar' : 'bars'}</small><small>{tab.fileName}</small>
      </button>
      <button className="text-button my-tabs-remove" disabled={busy} aria-label={`Remove ${tab.title}`} onClick={() => { void act(tab, true); }}>Remove</button>
    </li>)}</ul>}
    {error && <p role="alert" className="error-message">{error}</p>}
  </section>;
}
