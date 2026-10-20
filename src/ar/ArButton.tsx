import { useEffect, useRef, useState } from 'react';
import { configUrl, useConfig } from '../store/useConfig';
import { arPlatform } from './platform';
import type { ModelViewerElement } from './modelViewer';

type Status = 'idle' | 'preparing' | 'ready' | 'unsupported' | 'error';

/** Time the configuration must stay unchanged before the AR model is rebuilt. */
const SETTLE_MS = 600;

/**
 * "View in your room". On phones the AR model of the current configuration is prepared in the
 * background, so the tap opens AR immediately (iOS only honours AR launches that follow a tap
 * closely). On desktop it shows a QR code that opens the same configuration on a phone.
 */
export function ArButton({ sceneReady }: { sceneReady: boolean }) {
  const platform = useRef(arPlatform()).current;
  const upholstery = useConfig((s) => s.upholstery);
  const legs = useConfig((s) => s.legs);
  const [status, setStatus] = useState<Status>('idle');
  const [qr, setQr] = useState<string | null>(null);
  const viewer = useRef<ModelViewerElement | null>(null);

  useEffect(() => {
    if (platform === 'desktop' || !sceneReady) return;
    let cancelled = false;
    setStatus('preparing');
    const timer = window.setTimeout(async () => {
      try {
        const [{ exportChairGLB }, { loadModel }] = await Promise.all([import('./exportChair'), import('./modelViewer')]);
        const glb = await exportChairGLB();
        if (cancelled) return;
        const { viewer: loaded, canAR } = await loadModel(glb);
        viewer.current = loaded;
        if (!cancelled) setStatus(canAR ? 'ready' : 'unsupported');
      } catch (error) {
        console.error(error);
        if (!cancelled) setStatus('error');
      }
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [platform, sceneReady, upholstery, legs]);

  // called synchronously inside the tap: iOS refuses AR launches that aren't tied to a gesture
  const openAR = () => void viewer.current?.activateAR();

  const showQr = async () => {
    const QRCode = await import('qrcode');
    setQr(await QRCode.toDataURL(configUrl({ upholstery, legs }), { margin: 1, width: 240, color: { dark: '#23211f', light: '#ece7e0' } }));
  };

  if (platform === 'desktop') {
    return (
      <>
        <button type="button" className="ar-cta" onClick={showQr}>
          View in your room
        </button>
        {qr && (
          <div className="qr" role="dialog" aria-label="Scan to view in your room" onClick={() => setQr(null)}>
            <div className="qr__card" onClick={(e) => e.stopPropagation()}>
              <img src={qr} width={240} height={240} alt="QR code that opens this chair on your phone" />
              <p>Scan with your phone to place this chair in your room.</p>
              <button type="button" className="link" onClick={() => setQr(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  const label = {
    idle: 'View in your room',
    preparing: 'Preparing AR…',
    ready: 'View in your room',
    unsupported: 'AR is not available on this device',
    error: 'AR could not be prepared',
  }[status];
  return (
    <button type="button" className="ar-cta" data-status={status} disabled={status !== 'ready'} onClick={openAR}>
      {label}
    </button>
  );
}
