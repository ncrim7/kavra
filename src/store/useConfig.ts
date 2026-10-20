import { create } from 'zustand';

// Phase A: just enough choice to prove the three material families. The full catalog
// (8 upholsteries x 5 leg finishes, prices, Shopify variants) arrives with the configurator.
export type Upholstery = 'boucle' | 'leather';
export type Legs = 'ash' | 'brass';

interface ConfigState {
  upholstery: Upholstery;
  legs: Legs;
  setUpholstery: (upholstery: Upholstery) => void;
  setLegs: (legs: Legs) => void;
}

export const useConfig = create<ConfigState>((set) => ({
  upholstery: 'boucle',
  legs: 'ash',
  setUpholstery: (upholstery) => set({ upholstery }),
  setLegs: (legs) => set({ legs }),
}));
