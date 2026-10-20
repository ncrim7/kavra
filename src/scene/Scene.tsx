import { Suspense, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Color,
  DefaultLoadingManager,
  MathUtils,
  NeutralToneMapping,
  PMREMGenerator,
  ShadowNodeMaterial,
  VSMShadowMap,
  WebGPURenderer,
  type PerspectiveCamera,
} from 'three/webgpu';
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

/** The chair's bounding sphere (metres): centre height and radius, plus a margin around it. */
const FOCUS_Y = 0.42;
const CHAIR_RADIUS = 0.62;
const MARGIN = 1.12;

/** Distance at which the chair's bounding sphere fits the view both vertically and horizontally. */
function fitDistance(camera: PerspectiveCamera) {
  const vHalf = MathUtils.degToRad(camera.fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  return (CHAIR_RADIUS * MARGIN) / Math.sin(Math.min(vHalf, hHalf));
}

function Controls() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const dom = useThree((s) => s.gl.domElement);
  const aspect = useThree((s) => s.size.width / s.size.height);
  const controls = useThree((s) => s.controls) as OrbitControls | null;
  const set = useThree((s) => s.set);
  useEffect(() => {
    const c = new OrbitControls(camera, dom);
    c.target.set(0, FOCUS_Y, 0);
    c.enableDamping = true;
    c.enablePan = false;
    c.minPolarAngle = 0.35;
    c.maxPolarAngle = Math.PI / 2 - 0.05; // never below the floor
    set({ controls: c });
    return () => c.dispose();
  }, [camera, dom, set]);

  // Frame the chair for this canvas: on a tall phone canvas the horizontal field of view is the
  // limit, so the camera backs off; zoom limits follow the fitted distance.
  useEffect(() => {
    if (!controls) return;
    const d = fitDistance(camera);
    const dir = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, d);
    controls.minDistance = d * 0.6;
    controls.maxDistance = d * 1.6;
    controls.update();
  }, [camera, controls, aspect]);

  useFrame(() => controls?.update());
  return null;
}

/** Hands three.js asset-loading progress (model + textures) to the page's loading overlay. */
function ReportProgress({ onProgress }: { onProgress: (percent: number) => void }) {
  useEffect(() => {
    const manager = DefaultLoadingManager;
    manager.onProgress = (_url, loaded, total) => onProgress(Math.round((loaded / total) * 100));
    manager.onLoad = () => onProgress(100);
    return () => {
      manager.onProgress = () => {};
      manager.onLoad = () => {};
    };
  }, [onProgress]);
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

export default function Scene({ onBackend, onProgress }: { onBackend: (name: string) => void; onProgress: (percent: number) => void }) {
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
        shadows={noShadow ? false : { type: VSMShadowMap }}
        camera={{ position: [1.5, 1.05, 2.1], fov: 30, near: 0.05, far: 30 }}
        gl={(props) => createRenderer(props as object) as never}
        onCreated={({ gl }) => {
          // product colours must read true: neutral tone mapping, no filmic colour shift
          gl.toneMapping = NeutralToneMapping;
        }}
      >
        <ReportBackend onBackend={onBackend} />
        <ReportProgress onProgress={onProgress} />
        {noEnv ? <color attach="background" args={[BACKGROUND]} /> : <Studio />}
        <Controls />
        {/* A soft, nearly overhead light: the shadow pools under the chair like studio daylight
            instead of stretching across the floor. Its frustum covers the floor around the chair
            generously, so the shadow never ends in a straight cut. VSM blurs the edge. */}
        <directionalLight
          position={[0.7, 4, 1.1]}
          intensity={1.4}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-radius={14}
          shadow-blurSamples={16}
          shadow-camera-left={-1.4}
          shadow-camera-right={1.4}
          shadow-camera-top={1.4}
          shadow-camera-bottom={-1.4}
          shadow-camera-near={1}
          shadow-camera-far={7}
          shadow-bias={-0.0005}
        />
        {/* a cooler, shadowless side light so the shell keeps its form */}
        <directionalLight position={[2.5, 1.6, 1.5]} intensity={0.6} color="#f3f1ff" />
        <Suspense fallback={null}>
          <Chair />
        </Suspense>
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[8, 8]} />
          <primitive object={new ShadowNodeMaterial({ opacity: 0.26, transparent: true })} attach="material" />
        </mesh>
      </Canvas>
    </div>
  );
}
