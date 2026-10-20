import { Color, MeshPhysicalNodeMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector2, type Texture } from 'three/webgpu';
import manifest from '../../public/textures/manifest.json';

type TextureSet = keyof typeof manifest;

const loader = new TextureLoader();
const cache = new Map<string, Texture>();

/**
 * One map of a texture set. The chair's UVs are in metres, so repeating a texture once per its
 * real-world size makes the loops, pores or grain appear at true scale.
 */
function map(set: TextureSet, kind: 'diff' | 'nor' | 'rough') {
  const key = `${set}/${kind}`;
  let texture = cache.get(key);
  if (!texture) {
    texture = loader.load(`/textures/${set}/${kind}.jpg`);
    const [w, h] = manifest[set].size;
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(1 / w, 1 / h);
    texture.anisotropy = 8;
    if (kind === 'diff') texture.colorSpace = SRGBColorSpace;
    cache.set(key, texture);
  }
  return texture;
}

const pbr = (set: TextureSet) => ({ map: map(set, 'diff'), normalMap: map(set, 'nor'), roughnessMap: map(set, 'rough'), roughness: 1 });

/** Bouclé: deep, matte loops with a soft sheen grazing the edges. */
export const boucleMaterial = () =>
  new MeshPhysicalNodeMaterial({
    ...pbr('boucle-ivory'),
    normalScale: new Vector2(1.4, 1.4),
    sheen: 0.6,
    sheenRoughness: 0.8,
    sheenColor: new Color('#ffffff'),
  });

/** Leather: soft satin, a faint lacquer that catches the light. */
export const leatherMaterial = () =>
  new MeshPhysicalNodeMaterial({ ...pbr('leather-cognac'), clearcoat: 0.2, clearcoatRoughness: 0.45 });

/** Ash: open grain under a satin varnish. */
export const ashMaterial = () =>
  new MeshPhysicalNodeMaterial({ ...pbr('wood-ash'), clearcoat: 0.3, clearcoatRoughness: 0.35 });

/** Brushed brass: anisotropic highlights stretched along the legs. */
export const brassMaterial = () =>
  new MeshPhysicalNodeMaterial({ color: new Color('#b08a52'), metalness: 1, roughness: 0.3, anisotropy: 0.6 });
