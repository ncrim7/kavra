/** Which AR path this device can take, decided before loading anything AR-related. */
export type ArPlatform = 'ios' | 'android' | 'desktop';

export function arPlatform(): ArPlatform {
  const ua = navigator.userAgent;
  // AR Quick Look support is announced through <a rel="ar">
  const quickLook = document.createElement('a').relList?.supports?.('ar') ?? false;
  if (quickLook || /iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}
