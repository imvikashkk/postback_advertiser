import pool from '@/lib/db';

// Fires a publisher's own postback URL when a click they sent us converts —
// the mirror image of /api/postback, where advertisers fire OUR postback.

export function buildPublisherPostbackUrl(template: string, vars: {
  clickId: string; payout: number | null; currency: string; event: string; conversionId: number;
}): string {
  return template
    .replaceAll('{click_id}', encodeURIComponent(vars.clickId))
    .replaceAll('{payout}', vars.payout !== null ? encodeURIComponent(String(vars.payout)) : '')
    .replaceAll('{currency}', encodeURIComponent(vars.currency))
    .replaceAll('{event}', encodeURIComponent(vars.event))
    .replaceAll('{txn_id}', encodeURIComponent(String(vars.conversionId)));
}

// Returns null on success, or an error message to store against the conversion.
export async function firePublisherPostback(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000), cache: 'no-store' });
    console.log('Publisher postback:', url, response.status);
    if (!response.ok) return `HTTP ${response.status}`;
    return null;
  } catch (err) {
    console.error('Publisher postback error:', err);
    return String(err);
  }
}

// Called after any conversion is logged (advertiser postback or own-offer postback):
// links it to the click's offer, and if a publisher sent that click, fires their postback.
// Payout to the publisher: offer payout → publisher payout → the conversion's own payout.
export async function notifyPublisherForConversion({
  conversionId, clickId, payout, event,
}: {
  conversionId: number; clickId: string; payout: number | null; event: string;
}): Promise<void> {
  const res = await pool.query(
    `SELECT c.offer_id, c.pub_click_id,
            pb.postback_url_template, pb.payout AS pub_payout, pb.currency AS pub_currency,
            o.payout AS offer_payout, o.currency AS offer_currency
     FROM adv_clicks c
     LEFT JOIN adv_publishers pb ON pb.id = c.publisher_id AND pb.is_active = true
     LEFT JOIN adv_offers o      ON o.id = c.offer_id
     WHERE c.click_id = $1`,
    [clickId],
  );
  const click = res.rows[0];
  if (!click) return;

  if (click.offer_id) {
    await pool.query(`UPDATE adv_conversions SET offer_id=$1 WHERE id=$2`, [click.offer_id, conversionId]);
  }
  if (!click.postback_url_template || !click.pub_click_id) return;

  const pubPayout = click.offer_payout !== null ? Number(click.offer_payout)
    : click.pub_payout !== null ? Number(click.pub_payout)
    : payout;
  const url = buildPublisherPostbackUrl(click.postback_url_template, {
    clickId: click.pub_click_id,
    payout: pubPayout,
    currency: click.offer_payout !== null ? click.offer_currency : click.pub_currency,
    event,
    conversionId,
  });
  const error = await firePublisherPostback(url);

  await pool.query(
    `UPDATE adv_conversions SET pub_payout=$1, pub_postback_url=$2, pub_postback_sent=$3, pub_postback_error=$4 WHERE id=$5`,
    [pubPayout, url, error === null, error, conversionId],
  );
}
