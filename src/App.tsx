import { lazy, Suspense, useState } from 'react';
import { useConfig, type Legs, type Upholstery } from './store/useConfig';
import { ArButton } from './ar/ArButton';

// ?debug: test scripts can export the AR model and inspect it
if (new URLSearchParams(window.location.search).has('debug')) {
  (window as unknown as { __kavraExportAR: () => Promise<number[]> }).__kavraExportAR = async () => {
    const { exportChairGLB } = await import('./ar/exportChair');
    return Array.from(new Uint8Array(await exportChairGLB()));
  };
}

const Scene = lazy(() => import('./scene/Scene'));

const UPHOLSTERY: { id: Upholstery; label: string }[] = [
  { id: 'boucle', label: 'Bouclé — Ivory' },
  { id: 'leather', label: 'Leather — Cognac' },
];
const LEGS: { id: Legs; label: string }[] = [
  { id: 'ash', label: 'Ash — Natural' },
  { id: 'brass', label: 'Brushed Brass' },
];

function Choice<T extends string>({ legend, options, value, onChange }: { legend: string; options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset className="choice">
      <legend>{legend}</legend>
      {options.map((o) => (
        <label key={o.id} className="choice__option">
          <input type="radio" name={legend} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export default function App() {
  const { upholstery, legs, setUpholstery, setLegs } = useConfig();
  const [backend, setBackend] = useState('…');
  const [progress, setProgress] = useState(0);
  const debug = new URLSearchParams(window.location.search).has('debug');
  const ready = progress >= 100;

  return (
    <div className="app">
      <div className="stage">
        <Suspense fallback={null}>
          <Scene onBackend={setBackend} onProgress={setProgress} />
        </Suspense>
        {/* shown until the 3D engine, model and textures have all arrived */}
        <div className="loading" data-done={ready} aria-hidden={ready}>
          <p role="status">Preparing your chair · {progress}%</p>
          <div className="loading__bar" style={{ transform: `scaleX(${progress / 100})` }} />
        </div>
      </div>
      <aside className="panel">
        <p className="eyebrow">KAVRA</p>
        <h1>Lounge 01</h1>
        <Choice legend="Upholstery" options={UPHOLSTERY} value={upholstery} onChange={setUpholstery} />
        <Choice legend="Legs" options={LEGS} value={legs} onChange={setLegs} />
        <ArButton sceneReady={ready} />
        {debug && <p className="badge" data-backend={backend}>Renderer: {backend}</p>}
      </aside>
    </div>
  );
}
