-- Migration: characters -> campaign_character (many-to-many); drop pending_changes (old n-tier).
-- Run this ONCE on an existing rpghub database that has characters.campaign_id.
-- New installs: use schema.sql only (it already has campaign_character and no characters.campaign_id).

-- 0. Drop legacy table (old n-tier architecture)
DROP TABLE IF EXISTS public.pending_changes;

-- 1. Create junction table (fails if already exists; do not re-run full migration)
CREATE TABLE public.campaign_character (
	campaign_id int4 NOT NULL,
	character_id int4 NOT NULL,
	modified timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT campaign_character_pkey PRIMARY KEY (campaign_id, character_id),
	CONSTRAINT campaign_character_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(id) ON DELETE CASCADE,
	CONSTRAINT campaign_character_character_id_fkey FOREIGN KEY (character_id) REFERENCES public."characters"(id) ON DELETE CASCADE
);

CREATE INDEX idx_campaign_character_campaign ON public.campaign_character USING btree (campaign_id);
CREATE INDEX idx_campaign_character_character ON public.campaign_character USING btree (character_id);

-- 2. Migrate existing data: each character's current campaign_id becomes a row in campaign_character
INSERT INTO public.campaign_character (campaign_id, character_id, modified)
SELECT campaign_id, id, modified
FROM public."characters"
WHERE campaign_id IS NOT NULL
ON CONFLICT (campaign_id, character_id) DO NOTHING;

-- 3. Drop FK and column from characters
ALTER TABLE public."characters"
  DROP CONSTRAINT IF EXISTS characters_campaign_fk,
  DROP COLUMN IF EXISTS campaign_id;
