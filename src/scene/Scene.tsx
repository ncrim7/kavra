import { Suspense, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Color, NeutralToneMapping, PCFShadowMap, PMREMGenerator, ShadowNodeMaterial, WebGPURenderer } from 'three/webgpu';
import { Chair } from './Chair';

const BACKGROUND = '#ece7e0';
const params = new URLSearchParams(window.location.search);
/**
 * WebGL 2 is the default backend; `?webgpu` opts in to WebGPU. On the dev machine (AMD integrated
 * GPU) Chrome's WebGPU hung the display adapter hard enough to black out the screen — a driver
 * timeout no page code can catch or recover from. This scene gains nothing visible from WebGPU,
 * and the node materials (TSL) run unchanged on both backends.
 */
const forceWebGL = !params.has('webgpu');
// diagnostics: switch off one feature at a time
const noShadow = params.has('noshadow');
const noEnv = params.has('noenv');

/** Soft studio light baked into the environment: reflections for leather, brass and sheen. */
function Studio() {
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer;
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const target = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.85;
    scene.background = new Color(BACKGROUND);
    return () => {
      target.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Controls() {
  const camera = useThree((s) => s.camera);
  const dom = useThree((s) => s.gl.domElement);
  const controls = useThree((s) => s.controls) as OrbitControls | null;
  const set = useThree((s) => s.set);
  useEffect(() => {
    const c = new OrbitControls(camera, dom);
    c.target.set(0, 0.42, 0);
    c.enableDamping = true;
    c.enablePan = false;
    c.minDistance = 1.4;
    c.maxDistance = 4;
    c.minPolarAngle = 0.35;
    c.maxPolarAngle = Math.PI / 2 - 0.05; // never below the floor
    c.update();
    set({ controls: c });
    return () => c.dispose();
  }, [camera, dom, set]);
  useFrame(() => controls?.update());
  return null;
}

/** Which backend actually runs, for the debug badge and the test scripts. */
function ReportBackend({ onBackend }: { onBackend: (name: string) => void }) {
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer;
  useEffect(() => {
    const name = (gl.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
    onBackend(name);
    (window as unknown as { __kavra?: object }).__kavra = { backend: name };
  }, [gl, onBackend]);
  return null;
}

/** Remembers, for this tab, that WebGPU failed here, so a reload goes straight to WebGL 2. */
const FALLBACK_KEY = 'kavra:webgl-fallback';
const INIT_TIMEOUT_MS = 4000;

function rememberedFallback() {
  try {
    return sessionStorage.getItem(FALLBACK_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberFallback() {
  try {
    sessionStorage.setItem(FALLBACK_KEY, '1');
  } catch {
    // storage blocked: the fallback still happens, it just isn't remembered
  }
}

export default function Scene({ onBackend }: { onBackend: (name: string) => void }) {
  // Some GPU/driver combinations start WebGPU and then hang or lose the device while drawing.
  // Either way the scene is rebuilt on WebGL 2 instead of leaving an empty canvas.
  const [webgl, setWebgl] = useState(() => forceWebGL || rememberedFallback());

  const createRenderer = async (props: object) => {
    if (!webgl) {
      const renderer = new WebGPURenderer({ ...props, antialias: true });
      renderer.onDeviceLost = () => {
        rememberFallback();
        setWebgl(true);
      };
      const ready = await Promise.race([
        renderer.init().then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), INIT_TIMEOUT_MS)),
      ]);
      if (ready) return renderer;
      rememberFallback();
    }
    const renderer = new WebGPURenderer({ ...props, antialias: true, forceWebGL: true });
    await renderer.init();
    return renderer;
  };

  return (
    <div className="scene">
      <Canvas
        key={webgl ? 'webgl' : 'webgpu'}
        shadows={noShadow ? false : { type: PCFShadowMap }}
        camera={{ position: [1.5, 1.05, 2.1], fov: 30, near: 0.05, far: 30 }}
        gl={(props) => createRenderer(props as object) as never}
        onCreated={({ gl }) => {
          // product colours must read true: neutral tone mapping, no filmic colour shift
          gl.toneMapping = NeutralToneMapping;
        }}
      >
        <ReportBackend onBackend={onBackend} />
        {noEnv ? <color attach="background" args={[BACKGROUND]} /> : <Studio />}
        <Controls />
        <directionalLight
          position={[1.8, 3.2, 2.2]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-1.2}
          shadow-camera-right={1.2}
          shadow-camera-top={1.2}
          shadow-camera-bottom={-1.2}
          shadow-camera-near={0.5}
          shadow-camera-far={8}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
        />
        <Suspense fallback={null}>
          <Chair />
        </Suspense>
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[8, 8]} />
          <primitive object={new ShadowNodeMaterial({ opacity: 0.32, transparent: true })} attach="material" />
        </mesh>
      </Canvas>
    </div>
  );
}
