// Turns the raw Sketchfab armchair into the web-ready public/models/chair.glb.
//
// Source: "Arm chair / Furniture" by maxsbond.work, CC BY 4.0
// https://sketchfab.com/3d-models/arm-chair-furniture-ec62634ebb5a41f491bbb9da04cd9dd1
//
// - bakes transforms and converts centimetres to metres (AR needs true scale)
// - splits the single mesh into its connected pieces and names them by shape:
//   the largest is the shell, the piece standing on the floor is the leg base, the tiny one is a
//   sewn-in tag (removed), the rest form the seat cushion
// - centres the chair on x/z with its feet at y = 0
// - writes box-projected UVs in metres, so fabric scales correctly whatever the original UVs were,
//   and the same UVs survive export to AR (a triplanar shader would not)
// - drops the original materials and textures; the app dresses every surface
// - welds, quantizes and meshopt-compresses
//
// Usage: node scripts/prepare-model.mjs [input.glb] [output.glb]

import { Document, NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, quantize, reorder, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const input = process.argv[2] ?? 'models-raw/model-1/source/out (13).glb';
const output = process.argv[3] ?? 'public/models/chair.glb';
const CM = 0.01;

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const src = await io.read(input);

// ---------- 1. gather world-space triangles (metres) ----------
const meshNodes = src.getRoot().listNodes().filter((n) => n.getMesh());
if (meshNodes.length !== 1) throw new Error(`expected one mesh node, found ${meshNodes.length}`);
const node = meshNodes[0];
const prim = node.getMesh().listPrimitives()[0];
const m = node.getWorldMatrix();
const pos = prim.getAttribute('POSITION');
const nor = prim.getAttribute('NORMAL');
const idx = prim.getIndices();
const vCount = pos.getCount();
const P = new Float32Array(vCount * 3);
const N = new Float32Array(vCount * 3);
const v = [0, 0, 0];
for (let i = 0; i < vCount; i++) {
  pos.getElement(i, v);
  P[i * 3] = (m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12]) * CM;
  P[i * 3 + 1] = (m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13]) * CM;
  P[i * 3 + 2] = (m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]) * CM;
  nor.getElement(i, v);
  const nx = m[0] * v[0] + m[4] * v[1] + m[8] * v[2];
  const ny = m[1] * v[0] + m[5] * v[1] + m[9] * v[2];
  const nz = m[2] * v[0] + m[6] * v[1] + m[10] * v[2];
  const len = Math.hypot(nx, ny, nz) || 1;
  N.set([nx / len, ny / len, nz / len], i * 3);
}
const triCount = idx.getCount() / 3;
const corner = (t, j) => idx.getScalar(t * 3 + j);

// ---------- 2. connected pieces (welded by position) ----------
const key = new Map();
const canon = new Int32Array(vCount);
for (let i = 0; i < vCount; i++) {
  const k = `${Math.round(P[i * 3] * 1e5)},${Math.round(P[i * 3 + 1] * 1e5)},${Math.round(P[i * 3 + 2] * 1e5)}`;
  if (!key.has(k)) key.set(k, i);
  canon[i] = key.get(k);
}
const parent = Int32Array.from({ length: vCount }, (_, i) => i);
const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
for (let t = 0; t < triCount; t++) {
  const a = find(canon[corner(t, 0)]);
  for (let j = 1; j < 3; j++) { const b = find(canon[corner(t, j)]); if (a !== b) parent[b] = a; }
}
const pieces = new Map();
for (let t = 0; t < triCount; t++) {
  const r = find(canon[corner(t, 0)]);
  if (!pieces.has(r)) pieces.set(r, { tris: [], minY: Infinity, size: [0, 0, 0], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
  const p = pieces.get(r);
  p.tris.push(t);
  for (let j = 0; j < 3; j++) {
    const i = corner(t, j);
    for (let a = 0; a < 3; a++) { p.min[a] = Math.min(p.min[a], P[i * 3 + a]); p.max[a] = Math.max(p.max[a], P[i * 3 + a]); }
  }
}
const list = [...pieces.values()].map((p) => ({ ...p, size: p.max.map((x, a) => x - p.min[a]) }));
list.sort((a, b) => b.tris.length - a.tris.length);

// ---------- 3. name pieces by shape ----------
const shell = list[0];
const legs = list.find((p) => p !== shell && p.min[1] < 0.005);
const tag = list.find((p) => Math.max(...p.size) < 0.06);
const seat = list.filter((p) => p !== shell && p !== legs && p !== tag);
if (!legs || !tag || seat.length < 1) throw new Error('piece classification failed: ' + JSON.stringify(list.map((p) => [p.tris.length, p.size])));
console.log(`shell ${shell.tris.length} tris, legs ${legs.tris.length}, seat ${seat.map((s) => s.tris.length).join('+')}, tag ${tag.tris.length} (removed)`);

// ---------- 4. centre on x/z, feet at y = 0 ----------
const kept = [shell, legs, ...seat];
const min = [0, 1, 2].map((a) => Math.min(...kept.map((p) => p.min[a])));
const max = [0, 1, 2].map((a) => Math.max(...kept.map((p) => p.max[a])));
const offset = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2];

// ---------- 5. build parts with box-projected UVs (metres) ----------
function buildPart(doc, name, triangles, material) {
  const n = triangles.length * 3;
  const position = new Float32Array(n * 3);
  const normal = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  let o = 0;
  for (const t of triangles) {
    const ids = [corner(t, 0), corner(t, 1), corner(t, 2)];
    const p = ids.map((i) => [P[i * 3] + offset[0], P[i * 3 + 1] + offset[1], P[i * 3 + 2] + offset[2]]);
    // face normal picks the projection axis for the whole triangle
    const e1 = p[1].map((x, a) => x - p[0][a]);
    const e2 = p[2].map((x, a) => x - p[0][a]);
    const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]].map(Math.abs);
    const axis = fn[0] >= fn[1] && fn[0] >= fn[2] ? 0 : fn[1] >= fn[2] ? 1 : 2;
    for (let j = 0; j < 3; j++) {
      const [x, y, z] = p[j];
      position.set([x, y, z], o * 3);
      normal.set([N[ids[j] * 3], N[ids[j] * 3 + 1], N[ids[j] * 3 + 2]], o * 3);
      uv.set(axis === 0 ? [z, y] : axis === 1 ? [x, z] : [x, y], o * 2);
      o++;
    }
  }
  const buffer = doc.getRoot().listBuffers()[0];
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(position).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(normal).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uv).setBuffer(buffer))
    .setMaterial(material);
  return doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim));
}

const out = new Document();
out.createBuffer();
const upholstery = out.createMaterial('M_Upholstery');
const legMaterial = out.createMaterial('M_Legs');
const chair = out.createNode('Chair');
chair.addChild(buildPart(out, 'Shell', shell.tris, upholstery));
chair.addChild(buildPart(out, 'Seat', seat.flatMap((s) => s.tris), upholstery));
chair.addChild(buildPart(out, 'Legs', legs.tris, legMaterial));
out.createScene('Scene').addChild(chair);

// The file carries no textures (the app supplies them), so prune must be told to keep UVs it would
// otherwise drop as unused. UVs also stay float: they are in metres, outside 0..1, and with no
// texture transform in the file there is nowhere to store a dequantization range.
await out.transform(
  weld(),
  prune({ keepAttributes: true }),
  reorder({ encoder: MeshoptEncoder }),
  quantize({ pattern: /^(POSITION|NORMAL)$/ }),
);
out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(output, out);

// ---------- report ----------
const check = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': (await import('meshoptimizer')).MeshoptDecoder }).read(output);
for (const n of check.getRoot().listNodes()) {
  if (!n.getMesh()) continue;
  const b = getBounds(n);
  const f = (a) => a.map((x) => x.toFixed(3)).join(', ');
  console.log(`${n.getName().padEnd(6)} min=[${f(b.min)}] max=[${f(b.max)}]`);
}
// UVs must still span metres, not collapse
for (const mesh of check.getRoot().listMeshes()) {
  const uv = mesh.listPrimitives()[0].getAttribute('TEXCOORD_0');
  const lo = [Infinity, Infinity];
  const hi = [-Infinity, -Infinity];
  const e = [0, 0];
  for (let i = 0; i < uv.getCount(); i++) {
    uv.getElement(i, e);
    for (let a = 0; a < 2; a++) { lo[a] = Math.min(lo[a], e[a]); hi[a] = Math.max(hi[a], e[a]); }
  }
  const span = Math.max(hi[0] - lo[0], hi[1] - lo[1]);
  console.log(`${mesh.getName().padEnd(6)} uv ${uv.getComponentType() === 5126 ? 'float' : 'QUANTIZED'} span ${span.toFixed(3)} m`);
  if (span < 0.1) throw new Error(`${mesh.getName()}: UVs collapsed (span ${span})`);
}
const all = getBounds(check.getRoot().listScenes()[0]);
console.log(`chair size (m): ${all.max.map((x, a) => (x - all.min[a]).toFixed(3)).join(' x ')}`);
