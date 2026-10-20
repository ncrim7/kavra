import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import {
  BufferAttribute,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  type BufferGeometry,
  type MeshPhysicalNodeMaterial,
  type Texture,
} from 'three/webgpu';
import { getChair } from './registry';

/**
 * Turns the chair on screen into a GLB for AR, exactly as configured.
 *
 * Two translations are needed for the AR viewers:
 * - Node materials (TSL) are unknown to the exporters, so every part gets a classic
 *   MeshPhysicalMaterial carrying the same textures and settings.
 * - iOS Quick Look ignores texture repeat, so the repeat is written into the UVs and the exported
 *   textures repeat once. The weave then has the same real-world scale on screen and in AR.
 *
 * Colours are already baked into the textures (scripts/build-textures.mjs); Quick Look ignores
 * colour multiplied onto a texture, so textured materials export with a white base colour.
 */
export async function exportChairGLB(): Promise<ArrayBuffer> {
  const chair = getChair();
  if (!chair) throw new Error('chair not in the scene yet');

  const group = new Group();
  group.name = 'KAVRA Lounge 01';
  chair.updateMatrixWorld(true);
  const textures = new Map<Texture, Texture>();

  const flat = (texture: Texture | null) => {
    if (!texture) return null;
    let copy = textures.get(texture);
    if (!copy) {
      copy = texture.clone();
      copy.repeat.set(1, 1);
      copy.offset.set(0, 0);
      // keep the files small: JPEG instead of the exporter's default PNG
      copy.userData = { ...copy.userData, mimeType: 'image/jpeg' };
      copy.needsUpdate = true;
      textures.set(texture, copy);
    }
    return copy;
  };

  chair.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const source = mesh.material as MeshPhysicalNodeMaterial;
    const repeat = source.map?.repeat ?? source.normalMap?.repeat ?? null;

    const geometry = (mesh.geometry as BufferGeometry).clone();
    const uv = geometry.getAttribute('uv') as BufferAttribute | undefined;
    if (uv && repeat) {
      const scaled = new Float32Array(uv.count * 2);
      for (let i = 0; i < uv.count; i++) {
        scaled[i * 2] = uv.getX(i) * repeat.x;
        scaled[i * 2 + 1] = uv.getY(i) * repeat.y;
      }
      geometry.setAttribute('uv', new BufferAttribute(scaled, 2));
    }

    const material = new MeshPhysicalMaterial({
      name: source.name || mesh.name,
      color: source.map ? 0xffffff : source.color,
      map: flat(source.map),
      normalMap: flat(source.normalMap),
      normalScale: source.normalScale,
      roughnessMap: flat(source.roughnessMap),
      roughness: source.roughness,
      metalness: source.metalness,
      clearcoat: source.clearcoat,
      clearcoatRoughness: source.clearcoatRoughness,
      sheen: source.sheen,
      sheenRoughness: source.sheenRoughness,
      sheenColor: source.sheenColor,
      anisotropy: source.anisotropy,
    });

    const copy = new Mesh(geometry, material);
    copy.name = mesh.name;
    copy.applyMatrix4(mesh.matrixWorld);
    group.add(copy);
  });

  const result = await new GLTFExporter().parseAsync(group, { binary: true, maxTextureSize: 1024 });
  group.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as MeshPhysicalMaterial).dispose();
    }
  });
  textures.forEach((t) => t.dispose());
  return result as ArrayBuffer;
}
