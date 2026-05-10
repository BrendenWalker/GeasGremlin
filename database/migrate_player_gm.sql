-- Migration: add player/GM communication tables (replaces RabbitMQ).
-- Run after schema is at least campaign_character (no characters.campaign_id).
-- New installs: use schema.sql only.

CREATE TABLE IF NOT EXISTS public.campaign_command (
	id serial4 NOT NULL,
	campaign_id int4 NOT NULL,
	recipient_character_id int4 NULL,
	"type" varchar(32) NOT NULL,
	payload jsonb NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	read_at timestamp NULL,
	CONSTRAINT campaign_command_pkey PRIMARY KEY (id),
	CONSTRAINT campaign_command_campaign_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(id) ON DELETE CASCADE,
	CONSTRAINT campaign_command_recipient_fkey FOREIGN KEY (recipient_character_id) REFERENCES public."characters"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_campaign_command_campaign ON public.campaign_command USING btree (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_command_recipient ON public.campaign_command USING btree (recipient_character_id);
CREATE INDEX IF NOT EXISTS idx_campaign_command_unread ON public.campaign_command (campaign_id, read_at) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS public.character_transfer (
	id serial4 NOT NULL,
	from_character_id int4 NOT NULL,
	to_character_id int4 NOT NULL,
	gold_cp int4 DEFAULT 0 NOT NULL,
	payload jsonb NULL,
	status varchar(16) DEFAULT 'pending' NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	resolved_at timestamp NULL,
	CONSTRAINT character_transfer_pkey PRIMARY KEY (id),
	CONSTRAINT character_transfer_from_fkey FOREIGN KEY (from_character_id) REFERENCES public."characters"(id) ON DELETE CASCADE,
	CONSTRAINT character_transfer_to_fkey FOREIGN KEY (to_character_id) REFERENCES public."characters"(id) ON DELETE CASCADE,
	CONSTRAINT character_transfer_status_check CHECK (status IN ('pending', 'accepted', 'rejected'))
);
CREATE INDEX IF NOT EXISTS idx_character_transfer_to ON public.character_transfer USING btree (to_character_id);
CREATE INDEX IF NOT EXISTS idx_character_transfer_from ON public.character_transfer USING btree (from_character_id);
CREATE INDEX IF NOT EXISTS idx_character_transfer_pending ON public.character_transfer (to_character_id, status) WHERE status = 'pending';
