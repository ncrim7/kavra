# KAVRA — Lounge 01

A 3D product configurator for a fictional Istanbul furniture workshop: configure a lounge chair,
see it in your room in AR, and order it through a real Shopify checkout.

Work in progress. Phase A (this commit): the chair at true scale, rendered with three.js'
WebGPU renderer (automatic WebGL 2 fallback, including when a GPU starts WebGPU and then hangs),
with four material families — bouclé, leather, ash and brushed brass — at real-world texture scale.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 — add ?debug to see which renderer runs, ?webgl to force WebGL 2
npm run model        # rebuild public/models/chair.glb from models-raw/ (not in the repo)
npm run textures     # rebuild public/textures/ from Poly Haven
npm run build && npm run preview
node scripts/shoot.mjs   # screenshot + behaviour check against the preview server
```

## Credits

- Chair: [“Arm chair / Furniture”](https://sketchfab.com/3d-models/arm-chair-furniture-ec62634ebb5a41f491bbb9da04cd9dd1)
  by maxsbond.work, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified by
  `scripts/prepare-model.mjs`: converted to metres, split into shell, seat and legs, sewn-in tag
  removed, new UVs, original materials replaced.
- Textures: [Poly Haven](https://polyhaven.com) (CC0) — Curly Teddy Natural (recoloured), Brown Leather, Ash Veneer.
- AR: [`<model-viewer>`](https://modelviewer.dev) 4.4.0 by Google, Apache-2.0 (self-contained build in
  `public/vendor/`, licence alongside).
- Font: Instrument Sans (SIL Open Font License), via Google Fonts.

KAVRA is a fictional brand, made as a design study.
