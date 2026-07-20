// Sends a server-to-server Conversions API event to Meta, so ads pointed at
// external advertiser offers still get credited even though the actual sale
// happens on a site we don't control (and can't fire a browser pixel from).

// Fallback for when the /go bridge page's pixel never fired (blocked, slow
// network) and we never captured a real _fbc cookie — build one from fbclid
// per Meta's documented format so match quality doesn't fully drop to zero.
function fbcFromClickId(fbclid: string, clickTimeMs: number): string {
  return `fb.1.${clickTimeMs}.${fbclid}`;
}

export async function sendMetaConversionEvent({
  pixelId, accessToken, eventId, value, currency, ip, userAgent,
  sourceUrl, fbp, fbc, fbclid, clickTimeMs, eventName = 'Purchase',
}: {
  pixelId: string; accessToken: string;
  eventId: string; value: number | null; currency: string;
  ip: string; userAgent: string; sourceUrl: string;
  fbp?: string | null; fbc?: string | null;
  fbclid?: string | null; clickTimeMs?: number | null;
  eventName?: string;
}): Promise<string | null> {
  try {
    const userData: Record<string, unknown> = {
      client_ip_address: ip,
      client_user_agent: userAgent,
    };
    if (fbp) userData.fbp = fbp;
    const resolvedFbc = fbc || (fbclid && clickTimeMs ? fbcFromClickId(fbclid, clickTimeMs) : null);
    if (resolvedFbc) userData.fbc = resolvedFbc;

    const payload = {
      data: [{
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: 'website',
        event_source_url: sourceUrl,
        user_data: userData,
        custom_data: value !== null ? { currency, value } : { currency },
      }],
    };

    const response = await fetch(
      `https://graph.facebook.com/v23.0/${pixelId}/events?access_token=${accessToken}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    );
    const result = await response.json();
    console.log('Meta CAPI:', result);
    if (result.error) return result.error.message ?? 'CAPI error';
    if (!response.ok) return `CAPI HTTP ${response.status}`;
    return null;
  } catch (err) {
    console.error('Meta CAPI error:', err);
    return String(err);
  }
}
