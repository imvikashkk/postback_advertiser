import type { PoolClient } from 'pg';

export const OFFER_SELECT = `
  SELECT o.id, o.name, o.advertiser_id, o.landing_url_template, o.postback_key, o.payout, o.currency,
         o.is_active, o.created_at, o.updated_at,
         a.name AS advertiser_name, a.slug AS advertiser_slug,
         COALESCE(array_agg(op.publisher_id ORDER BY op.publisher_id) FILTER (WHERE op.publisher_id IS NOT NULL), '{}') AS publisher_ids
  FROM adv_offers o
  LEFT JOIN adv_advertisers a       ON a.id = o.advertiser_id
  LEFT JOIN adv_offer_publishers op ON op.offer_id = o.id`;
export const OFFER_GROUP = `GROUP BY o.id, a.name, a.slug`;

export interface OfferInput {
  name: string;
  advertiser_id: number | null;
  landing_url_template: string | null;
  payout: number | null;
  currency: string;
  is_active: boolean;
  publisher_ids: number[];
}

// An offer either wraps an advertiser OR has its own landing URL — never neither.
export function parseOfferInput(body: Record<string, unknown>): OfferInput | string {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return 'name is required';

  const advertiserId = body.advertiser_id ? Number(body.advertiser_id) : null;
  const landing = typeof body.landing_url_template === 'string' ? body.landing_url_template.trim() : '';
  if (!advertiserId) {
    if (!/^https?:\/\//i.test(landing)) return 'Pick an advertiser, or give a landing URL starting with http:// or https://';
    if (!landing.includes('{click_id}')) return 'landing_url_template must contain a {click_id} placeholder';
  }

  const payout = body.payout !== null && body.payout !== undefined && body.payout !== '' ? Number(body.payout) : null;
  if (payout !== null && !Number.isFinite(payout)) return 'payout must be a number';

  const publisherIds = Array.isArray(body.publisher_ids)
    ? [...new Set(body.publisher_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];

  return {
    name,
    advertiser_id: advertiserId,
    landing_url_template: advertiserId ? null : landing,
    payout,
    currency: typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim() : 'INR',
    is_active: body.is_active !== false,
    publisher_ids: publisherIds,
  };
}

export async function setOfferPublishers(client: PoolClient, offerId: number, publisherIds: number[]) {
  await client.query(`DELETE FROM adv_offer_publishers WHERE offer_id = $1`, [offerId]);
  if (publisherIds.length > 0) {
    await client.query(
      `INSERT INTO adv_offer_publishers (offer_id, publisher_id) SELECT $1, UNNEST($2::int[])`,
      [offerId, publisherIds],
    );
  }
}
