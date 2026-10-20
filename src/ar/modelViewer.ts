/**
 * Google's <model-viewer> drives the AR hand-off: WebXR on Android Chrome, AR Quick Look on iOS
 * (it converts the GLB to USDZ itself when AR is opened). We load its self-contained build, which
 * carries its own three.js, only on devices that can show AR, so it never touches the main scene.
 */
const SCRIPT = '/vendor/model-viewer-4.4.0.min.js';

export interface ModelViewerElement extends HTMLElement {
  src: string | null;
  canActivateAR: boolean;
  activateAR(): Promise<void>;
}

let scriptPromise: Promise<void> | null = null;

function loadScript() {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = SCRIPT;
    script.onload = () => customElements.whenDefined('model-viewer').then(() => resolve());
    script.onerror = () => reject(new Error('model-viewer failed to load'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

let element: ModelViewerElement | null = null;

/** The single, invisible viewer that holds the current AR model. */
export async function getViewer(): Promise<ModelViewerElement> {
  await loadScript();
  if (!element) {
    element = document.createElement('model-viewer') as ModelViewerElement;
    element.setAttribute('ar', '');
    // Scene Viewer is left out: it needs a public file URL, and our model is generated in the page.
    element.setAttribute('ar-modes', 'webxr quick-look');
    element.setAttribute('ar-scale', 'fixed'); // true size, the visitor can't shrink it
    element.setAttribute('ar-placement', 'floor');
    element.setAttribute('loading', 'eager');
    element.setAttribute('alt', 'KAVRA Lounge 01, as configured');
    element.className = 'ar-viewer';
    element.setAttribute('aria-hidden', 'true');
    document.body.appendChild(element);
  }
  return element;
}

/** Loads a new GLB into the viewer; resolves with the viewer once loaded, and whether AR can open. */
export async function loadModel(glb: ArrayBuffer): Promise<{ viewer: ModelViewerElement; canAR: boolean }> {
  const viewer = await getViewer();
  const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
  const previous = viewer.src;
  await new Promise<void>((resolve, reject) => {
    const done = () => {
      viewer.removeEventListener('load', done);
      viewer.removeEventListener('error', fail);
      resolve();
    };
    const fail = () => {
      viewer.removeEventListener('load', done);
      viewer.removeEventListener('error', fail);
      reject(new Error('AR model failed to load'));
    };
    viewer.addEventListener('load', done);
    viewer.addEventListener('error', fail);
    viewer.src = url;
  });
  if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous);
  return { viewer, canAR: viewer.canActivateAR };
}
