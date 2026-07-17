'use client';

import { useEffect, useRef } from 'react';
import Script from 'next/script';

declare global {
  interface Window {
    fbq: ((...args: unknown[]) => void) & { queue: unknown[]; loaded: boolean; version: string; push: (...args: unknown[]) => void };
    _fbq: unknown;
  }
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

// Fires the media buyer's Meta pixel (so Facebook sets its _fbp/_fbc cookies),
// saves them against this click, then forwards to the publisher's landing page.
// There's no other moment we can do this — the redirect target isn't our page,
// so this bridge page is the only place a browser pixel can ever fire.
export default function GoRedirectClient({
  pixelId, destination, clickId,
}: {
  pixelId: string | null;
  destination: string;
  clickId: string;
}) {
  const redirected = useRef(false);

  function redirect() {
    if (redirected.current) return;
    redirected.current = true;
    window.location.replace(destination);
  }

  useEffect(() => {
    if (!pixelId) { redirect(); return; }
    const fallback = setTimeout(redirect, 1200);
    return () => clearTimeout(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixelId]);

  function onPixelBaseLoaded() {
    if (!pixelId || typeof window.fbq !== 'function') { redirect(); return; }
    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');

    setTimeout(() => {
      const fbp = getCookie('_fbp');
      const fbc = getCookie('_fbc');
      if (fbp || fbc) {
        fetch(`/api/click/${clickId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fbp, fbc }),
          keepalive: true,
        }).catch(() => {});
      }
      redirect();
    }, 350);
  }

  return (
    <>
      {pixelId && (
        <Script id="meta-pixel-go" strategy="afterInteractive" onLoad={onPixelBaseLoaded}>{`
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
          (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
        `}</Script>
      )}
      <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <div style={{ width: 22, height: 22, border: '3px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'gospin .6s linear infinite' }} />
        <style>{`@keyframes gospin { to { transform: rotate(360deg); } }`}</style>
      </main>
    </>
  );
}
