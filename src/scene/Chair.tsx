import { useEffect, useMemo, useRef } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { BufferAttribute, BufferGeometry, Mesh, type Group } from 'three/webgpu';
import { setChair } from '../ar/registry';
import { useConfig } from '../store/useConfig';
import { ashMaterial, boucleMaterial, brassMaterial, leatherMaterial } from './materials';

export const MODEL_URL = '/models/chair.glb';
type Part = 'Shell' | 'Seat' | 'Legs';

/**
 * The GLB is quantized: positions and UVs are stored as normalized integers and each node carries
 * the transform that restores real metres. Here every part becomes plain float geometry in chair
 * space, once, so nothing downstream (shadows, AR export) has to know about quantization.
 */
function bake(mesh: Mesh): BufferGeometry {
  const source = mesh.geometry;
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const a = attribute as BufferAttribute;
    const floats = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) floats[i * a.itemSize + c] = a.getComponent(i, c);
    geometry.setAttribute(name, new BufferAttribute(floats, a.itemSize));
  }
  if (source.index) geometry.setIndex(source.index.clone());
  mesh.updateMatrix();
  geometry.applyMatrix4(mesh.matrix);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function Chair() {
  const gltf = useLoader(GLTFLoader, MODEL_URL, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  const upholstery = useConfig((s) => s.upholstery);
  const legs = useConfig((s) => s.legs);

  const parts = useMemo(() => {
    const out = {} as Record<Part, BufferGeometry>;
    gltf.scene.traverse((o) => {
      if ((o as Mesh).isMesh) out[o.name as Part] = bake(o as Mesh);
    });
    for (const name of ['Shell', 'Seat', 'Legs'] as const) if (!out[name]) throw new Error(`chair.glb has no ${name}`);
    return out;
  }, [gltf]);

  const materials = useMemo(
    () => ({ boucle: boucleMaterial(), leather: leatherMaterial(), ash: ashMaterial(), brass: brassMaterial() }),
    [],
  );
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  // the AR export reads the chair straight from the scene
  const group = useRef<Group>(null);
  useEffect(() => {
    setChair(group.current);
    return () => setChair(null);
  }, []);

  const cover = materials[upholstery];
  return (
    <group name="Chair" ref={group}>
      <mesh name="Shell" geometry={parts.Shell} material={cover} castShadow receiveShadow />
      <mesh name="Seat" geometry={parts.Seat} material={cover} castShadow receiveShadow />
      <mesh name="Legs" geometry={parts.Legs} material={materials[legs]} castShadow />
    </group>
  );
}
