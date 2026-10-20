import { create } from 'zustand';

// Phase A/B: just enough choice to prove the material families and AR. The full catalog
// (8 upholsteries x 5 leg finishes, prices, Shopify variants) arrives with the configurator.
export const UPHOLSTERIES = ['boucle', 'leather'] as const;
export const LEG_FINISHES = ['ash', 'brass'] as const;
export type Upholstery = (typeof UPHOLSTERIES)[number];
export type Legs = (typeof LEG_FINISHES)[number];

interface ConfigState {
  upholstery: Upholstery;
  legs: Legs;
  setUpholstery: (upholstery: Upholstery) => void;
  setLegs: (legs: Legs) => void;
}

/** The configuration lives in the URL (?u=…&l=…), so a link or QR code reopens the same chair. */
function fromUrl(): Pick<ConfigState, 'upholstery' | 'legs'> {
  const q = new URLSearchParams(window.location.search);
  const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback; // unknown values fall back, never throw
  return { upholstery: pick(q.get('u'), UPHOLSTERIES, 'boucle'), legs: pick(q.get('l'), LEG_FINISHES, 'ash') };
}

export const useConfig = create<ConfigState>((set) => ({
  ...fromUrl(),
  setUpholstery: (upholstery) => set({ upholstery }),
  setLegs: (legs) => set({ legs }),
}));

/** Writes the configuration back into the URL, keeping any other parameters (?debug etc.). */
export function configUrl(state: Pick<ConfigState, 'upholstery' | 'legs'>, base = window.location.href) {
  const url = new URL(base);
  url.searchParams.set('u', state.upholstery);
  url.searchParams.set('l', state.legs);
  return url.toString();
}

useConfig.subscribe((state) => {
  window.history.replaceState(null, '', configUrl(state));
});
