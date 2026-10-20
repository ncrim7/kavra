import { lazy, Suspense, useState } from 'react';
import { useConfig, type Legs, type Upholstery } from './store/useConfig';

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
  const debug = new URLSearchParams(window.location.search).has('debug');

  return (
    <div className="app">
      <Suspense fallback={<div className="scene scene--loading" />}>
        <Scene onBackend={setBackend} />
      </Suspense>
      <aside className="panel">
        <p className="eyebrow">KAVRA</p>
        <h1>Lounge 01</h1>
        <Choice legend="Upholstery" options={UPHOLSTERY} value={upholstery} onChange={setUpholstery} />
        <Choice legend="Legs" options={LEGS} value={legs} onChange={setLegs} />
        {debug && <p className="badge" data-backend={backend}>Renderer: {backend}</p>}
      </aside>
    </div>
  );
}
