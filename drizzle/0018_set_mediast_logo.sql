-- The seed now sets logo_url on insert, but the organization already running
-- was created before that and has no way yet to set one for itself -- see
-- DECISIONS.md and KNOWN-GAPS.md's "logo is a URL, not an upload" row. Only
-- backfills the one seeded organization, and only if nothing has set a logo
-- for it since: this is real letterhead content for a named organization,
-- not a default correcting itself the way the currency migration was.
UPDATE "organizations"
SET "logo_url" = '/brand/mediast-wordmark.svg'
WHERE "slug" = 'mediast' AND "logo_url" IS NULL;
