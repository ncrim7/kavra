// Builds the app's texture sets from CC0 Poly Haven sources.
//
// A set borrows a source's structure (normal + roughness) and, for its colour, either keeps the
// source photo or bakes a tint: the photo is reduced to luminance detail around its mean and
// multiplied by the option's colour. Baking (instead of tinting in the shader) is what lets the
// colour survive export to iOS AR Quick Look, which ignores colour multipliers on textures.
//
// Writes public/textures/<set>/{diff,nor,rough}.jpg and public/textures/manifest.json with each
// set's real-world size in metres (the chair's UVs are in metres).
//
// Usage: node scripts/build-textures.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';

/** set name -> source texture and optional tint; `detail` scales how much of the photo's light/dark survives */
const SETS = {
  'boucle-ivory': { src: 'curly_teddy_natural', tint: '#e8e1d3', detail: 0.9 },
  'leather-cognac': { src: 'brown_leather' },
  'wood-ash': { src: 'ash_veneer' },
};

const RES = '1k';
const MAPS = { diff: 'Diffuse', nor: 'nor_gl', rough: 'Rough' };

async function source(id) {
  const dir = `textures-raw/${id}`;
  await mkdir(dir, { recursive: true });
  const [files, info] = await Promise.all([
    fetch(`https://api.polyhaven.com/files/${id}`).then((r) => r.json()),
    fetch(`https://api.polyhaven.com/info/${id}`).then((r) => r.json()),
  ]);
  for (const [short, key] of Object.entries(MAPS)) {
    const path = `${dir}/${short}.jpg`;
    if (existsSync(path)) continue;
    const url = files[key]?.[RES]?.jpg?.url;
    if (!url) throw new Error(`${id}: no ${key} ${RES} jpg`);
    await writeFile(path, Buffer.from(await (await fetch(url)).arrayBuffer()));
  }
  // dimensions are millimetres, [width, height]
  return { dir, size: info.dimensions.map((mm) => Number((mm / 1000).toFixed(4))), name: info.name };
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

async function tinted(file, tint, detail) {
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (const v of data) sum += v;
  const mean = sum / data.length;
  const [r, g, b] = hex(tint);
  const out = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0; i < data.length; i++) {
    const k = Math.max(0, 1 + (data[i] / mean - 1) * detail);
    out[i * 3] = Math.min(255, r * k);
    out[i * 3 + 1] = Math.min(255, g * k);
    out[i * 3 + 2] = Math.min(255, b * k);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } });
}

const manifest = {};
for (const [name, set] of Object.entries(SETS)) {
  const src = await source(set.src);
  const dir = `public/textures/${name}`;
  await mkdir(dir, { recursive: true });
  const diff = set.tint ? await tinted(`${src.dir}/diff.jpg`, set.tint, set.detail ?? 1) : sharp(`${src.dir}/diff.jpg`);
  await diff.jpeg({ quality: 82, mozjpeg: true }).toFile(`${dir}/diff.jpg`);
  // normals keep more quality: compression artefacts read as bumps
  await sharp(`${src.dir}/nor.jpg`).jpeg({ quality: 90, mozjpeg: true }).toFile(`${dir}/nor.jpg`);
  await sharp(`${src.dir}/rough.jpg`).jpeg({ quality: 82, mozjpeg: true }).toFile(`${dir}/rough.jpg`);
  manifest[name] = { source: set.src, sourceName: src.name, size: src.size, tint: set.tint ?? null };
  console.log(`${name.padEnd(16)} from ${set.src} (${src.size.join(' x ')} m)${set.tint ? ` tint ${set.tint}` : ''}`);
}
await writeFile('public/textures/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
