-- Run this once to set up the DB schema, on its own dedicated "postbackadvertise" database.

-- ── Migration: rename "publisher" → "advertiser" (must run first, before the
-- CREATE TABLE/INDEX statements below that assume the new names already exist;
-- safe no-op on a brand-new database) ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'adv_publishers')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'adv_advertisers') THEN
    ALTER TABLE adv_publishers RENAME TO adv_advertisers;
  END IF;
  -- Guarded on advertiser_id not existing yet: adv_clicks.publisher_id is reused
  -- below for the (new) traffic publishers, and must not be renamed on re-runs.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adv_clicks' AND column_name = 'publisher_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adv_clicks' AND column_name = 'advertiser_id') THEN
    ALTER TABLE adv_clicks RENAME COLUMN publisher_id TO advertiser_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adv_conversions' AND column_name = 'publisher_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adv_conversions' AND column_name = 'advertiser_id') THEN
    ALTER TABLE adv_conversions RENAME COLUMN publisher_id TO advertiser_id;
  END IF;
END $$;

-- ── Migration: drop the "default pixel" concept — a tracking link now names its
-- pixel explicitly (?px=), so there's no ambiguity to resolve with a default
-- (guarded: adv_pixels may not exist yet on a brand-new database) ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'adv_pixels') THEN
    DROP INDEX IF EXISTS idx_adv_pixels_one_default;
    ALTER TABLE adv_pixels DROP COLUMN IF EXISTS is_default;
  END IF;
END $$;

-- An external website/offer we drive traffic to. Their landing_url_template
-- carries THEIR macros (whatever their platform uses, e.g. {pixel}, {pubid}) —
-- we substitute our own click_id and pubid into it before redirecting.
CREATE TABLE IF NOT EXISTS adv_advertisers (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(150) NOT NULL,
  slug                VARCHAR(60)  NOT NULL UNIQUE,       -- used in our /go/{slug} link
  landing_url_template TEXT        NOT NULL,              -- e.g. https://tikyetz.com/lp/IN-5935/?aff_sub={click_id}&pubid={pubid}
  pubid               VARCHAR(100),                       -- our tracking/affiliate id on their platform
  postback_key        VARCHAR(64)  NOT NULL,              -- secret required as ?key= on our postback endpoint
  payout              NUMERIC(10,2),                      -- default/expected payout per conversion
  currency            VARCHAR(10)  NOT NULL DEFAULT 'INR',
  is_active           BOOLEAN      NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_adv_advertisers_slug ON adv_advertisers(slug);

-- An external traffic source (affiliate/network) that sends clicks to our /go/
-- links with their own click id (?pub={id}&sub={their_click_id}). They give us
-- THEIR postback URL — we fire it whenever one of their clicks converts.
CREATE TABLE IF NOT EXISTS adv_publishers (
  id                    SERIAL PRIMARY KEY,
  name                  VARCHAR(150) NOT NULL,
  postback_url_template TEXT         NOT NULL,              -- e.g. https://their-tracker.com/postback?clickid={click_id}&payout={payout}
  payout                NUMERIC(10,2),                      -- what we report to them per conversion; NULL = pass the advertiser payout through
  currency              VARCHAR(10)  NOT NULL DEFAULT 'INR',
  is_active             BOOLEAN      NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Our own offer that publishers run. Either wraps an advertiser (traffic goes to
-- their landing page and the conversion arrives on the advertiser's postback), or
-- has its own landing URL (conversion arrives on /api/offer-postback/{id}).
CREATE TABLE IF NOT EXISTS adv_offers (
  id                   SERIAL PRIMARY KEY,
  name                 VARCHAR(150) NOT NULL,
  advertiser_id        INTEGER      REFERENCES adv_advertisers(id),
  landing_url_template TEXT,                                -- only when advertiser_id IS NULL; must contain {click_id}
  postback_key         VARCHAR(64)  NOT NULL,              -- secret for /api/offer-postback/{id} (own-landing offers)
  payout               NUMERIC(10,2),                      -- what publishers get; NULL = publisher's own payout / pass-through
  currency             VARCHAR(10)  NOT NULL DEFAULT 'INR',
  is_active            BOOLEAN      NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (advertiser_id IS NOT NULL OR landing_url_template IS NOT NULL)
);

-- Which publishers may run which offer — a /o/ link for an unassigned publisher 404s.
CREATE TABLE IF NOT EXISTS adv_offer_publishers (
  offer_id     INTEGER NOT NULL REFERENCES adv_offers(id) ON DELETE CASCADE,
  publisher_id INTEGER NOT NULL REFERENCES adv_publishers(id) ON DELETE CASCADE,
  PRIMARY KEY (offer_id, publisher_id)
);

-- A media buyer of ours who runs ads pointing at our /go/ links. They log into
-- their own portal, pick an advertiser, and get a tracking link tagged with their id.
CREATE TABLE IF NOT EXISTS adv_media_buyers (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  email         VARCHAR(150) UNIQUE,
  password_hash TEXT,
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Each media buyer's own Meta pixel + CAPI access token, used to report conversions
-- on the ads they ran (we don't own the pixel — it's their ad account). A media
-- buyer can have several (different campaigns/ad accounts); a tracking link names
-- which one it belongs to explicitly (?px=), so there's no "default" to guess.
CREATE TABLE IF NOT EXISTS adv_pixels (
  id             SERIAL PRIMARY KEY,
  media_buyer_id INTEGER      NOT NULL REFERENCES adv_media_buyers(id),
  label          VARCHAR(100) NOT NULL,
  pixel_id       VARCHAR(20)  NOT NULL,
  access_token   TEXT         NOT NULL,
  ad_account_id  VARCHAR(30),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_adv_pixels_mb ON adv_pixels(media_buyer_id);

-- One row per click we send out to an advertiser's landing page.
CREATE TABLE IF NOT EXISTS adv_clicks (
  id             SERIAL PRIMARY KEY,
  click_id       VARCHAR(40)  NOT NULL UNIQUE,   -- random token embedded as {click_id} in the outbound link
  advertiser_id  INTEGER      NOT NULL REFERENCES adv_advertisers(id),
  media_buyer_id INTEGER      REFERENCES adv_media_buyers(id),  -- who sent this click, if tagged via ?mb=
  pixel_id       INTEGER      REFERENCES adv_pixels(id),        -- which of their pixels, if tagged via ?px=
  meta           JSONB,                          -- passthrough params: utm_*, fbclid, gclid, etc.
  ip             VARCHAR(64),
  user_agent     TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
-- In case adv_clicks already existed from an earlier run — must run before the
-- indexes below, which assume the columns are there:
ALTER TABLE adv_clicks ADD COLUMN IF NOT EXISTS media_buyer_id INTEGER REFERENCES adv_media_buyers(id);
ALTER TABLE adv_clicks ADD COLUMN IF NOT EXISTS pixel_id       INTEGER REFERENCES adv_pixels(id);
-- Publisher traffic: who sent the click, and their own click id to echo back in their postback.
ALTER TABLE adv_clicks ADD COLUMN IF NOT EXISTS publisher_id   INTEGER REFERENCES adv_publishers(id);
ALTER TABLE adv_clicks ADD COLUMN IF NOT EXISTS pub_click_id   VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_adv_clicks_advertiser ON adv_clicks(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_adv_clicks_publisher ON adv_clicks(publisher_id);
-- Own-landing offers have no advertiser, so clicks/conversions can't require one.
ALTER TABLE adv_clicks ALTER COLUMN advertiser_id DROP NOT NULL;
ALTER TABLE adv_clicks ADD COLUMN IF NOT EXISTS offer_id INTEGER REFERENCES adv_offers(id);
CREATE INDEX IF NOT EXISTS idx_adv_clicks_offer ON adv_clicks(offer_id);
CREATE INDEX IF NOT EXISTS idx_adv_clicks_mb ON adv_clicks(media_buyer_id);

-- One row per server-to-server postback the advertiser fires back at us.
CREATE TABLE IF NOT EXISTS adv_conversions (
  id            SERIAL PRIMARY KEY,
  advertiser_id INTEGER      NOT NULL REFERENCES adv_advertisers(id),
  click_id      VARCHAR(40),                    -- echoed back click_id; NULL if unmatched/unknown
  event         VARCHAR(30)  NOT NULL DEFAULT 'conversion',
  payout        NUMERIC(10,2),
  status        VARCHAR(20)  NOT NULL DEFAULT 'received',
  raw_query     JSONB,                          -- full incoming query string, for debugging unknown param formats
  ip            VARCHAR(64),
  capi_sent     BOOLEAN      NOT NULL DEFAULT false,  -- did we successfully notify Meta CAPI?
  capi_error    TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_adv_conversions_advertiser ON adv_conversions(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_adv_conversions_click ON adv_conversions(click_id);
-- In case adv_conversions already existed from an earlier run, before CAPI forwarding existed:
ALTER TABLE adv_conversions ADD COLUMN IF NOT EXISTS capi_sent  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE adv_conversions ADD COLUMN IF NOT EXISTS capi_error TEXT;
-- Outbound postback to the publisher who sent the click (if any):
ALTER TABLE adv_conversions ADD COLUMN IF NOT EXISTS pub_payout         NUMERIC(10,2);
ALTER TABLE adv_conversions ADD COLUMN IF NOT EXISTS pub_postback_url   TEXT;
ALTER TABLE adv_conversions ADD COLUMN IF NOT EXISTS pub_postback_sent  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE adv_conversions ADD COLUMN IF NOT EXISTS pub_postback_error TEXT;
ALTER TABLE adv_conversions ALTER COLUMN advertiser_id DROP NOT NULL;
ALTER TABLE adv_conversions ADD COLUMN IF NOT EXISTS offer_id INTEGER REFERENCES adv_offers(id);
CREATE INDEX IF NOT EXISTS idx_adv_conversions_offer ON adv_conversions(offer_id);
