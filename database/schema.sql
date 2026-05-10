-- RPGHub: Schema for the rpghub PostgreSQL database
-- Matches the structure migrated from the original Firebird/Delphi RPG system.
-- Ruleset-aware catalog data (multiple RPG systems in one DB).
-- Idempotent: safe to run repeatedly (CREATE … IF NOT EXISTS; seed uses ON CONFLICT DO NOTHING).

-- DROP SCHEMA public;

CREATE SCHEMA IF NOT EXISTS public AUTHORIZATION pg_database_owner;

-- DROP SEQUENCE public.campaign_id_seq;

CREATE SEQUENCE IF NOT EXISTS public.campaign_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;

-- public.ability_categories definition

-- DROP TABLE public.ability_categories;

CREATE TABLE IF NOT EXISTS public.ability_categories (
	id int4 NOT NULL,
	"name" varchar(80) NOT NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT ability_categories_name_key UNIQUE (name),
	CONSTRAINT ability_categories_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ability_categories_ability_categories_modified ON public.ability_categories USING btree (modified);


-- public.ruleset definition

-- DROP TABLE public.ruleset;

CREATE TABLE IF NOT EXISTS public.ruleset (
	id serial4 NOT NULL,
	"name" varchar(40) NOT NULL,
	modified timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT ruleset_name_key UNIQUE (name),
	CONSTRAINT ruleset_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ruleset_ruleset_modified ON public.ruleset USING btree (modified);

-- public.campaign definition

-- DROP TABLE public.campaign;

CREATE TABLE IF NOT EXISTS public.campaign (
	id serial4 NOT NULL,
	"name" varchar(80) NOT NULL,
	modified timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	ruleset_id int4 NOT NULL DEFAULT 1,
	CONSTRAINT campaign_ruleset_name_key UNIQUE (ruleset_id, name),
	CONSTRAINT campaign_pkey PRIMARY KEY (id),
	CONSTRAINT campaign_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES public.ruleset(id) ON DELETE RESTRICT
);


-- public.classes definition

-- DROP TABLE public.classes;

CREATE TABLE IF NOT EXISTS public.classes (
	id int4 NOT NULL,
	"name" varchar(80) NOT NULL,
	hitdie int4 NULL,
	min_str int4 NULL,
	min_int int4 NULL,
	min_wis int4 NULL,
	min_dex int4 NULL,
	min_con int4 NULL,
	min_chr int4 NULL,
	xpadjustment int4 NULL,
	armor varchar(200) NULL,
	weapons varchar(200) NULL,
	description text NULL,
	modified timestamp DEFAULT now() NOT NULL,
	ruleset_id int4 NOT NULL DEFAULT 1,
	subclass_of int4 NULL,
	CONSTRAINT classes_ruleset_name_key UNIQUE (ruleset_id, name),
	CONSTRAINT classes_pkey PRIMARY KEY (id),
	CONSTRAINT classes_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES public.ruleset(id) ON DELETE RESTRICT,
	CONSTRAINT classes_subclass_not_self CHECK (subclass_of IS NULL OR subclass_of <> id),
	CONSTRAINT classes_subclass_of_fkey FOREIGN KEY (subclass_of) REFERENCES public.classes(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS classes_classes_modified ON public.classes USING btree (modified);


-- public.item_categories definition

-- DROP TABLE public.item_categories;

CREATE TABLE IF NOT EXISTS public.item_categories (
	id int4 NOT NULL,
	"name" varchar(80) NOT NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT item_categories_name_key UNIQUE (name),
	CONSTRAINT item_categories_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS item_categories_item_categories_modified ON public.item_categories USING btree (modified);


-- public.item_types definition

-- DROP TABLE public.item_types;

CREATE TABLE IF NOT EXISTS public.item_types (
	id int4 NOT NULL,
	"name" varchar(80) NOT NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT item_types_name_key UNIQUE (name),
	CONSTRAINT item_types_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS item_types_item_types_modified ON public.item_types USING btree (modified);


-- public.races definition

-- DROP TABLE public.races;

CREATE TABLE IF NOT EXISTS public.races (
	id int4 NOT NULL,
	"name" varchar(80) NOT NULL,
	avgweight int4 NOT NULL,
	avgheight int4 NOT NULL,
	min_str int4 NULL,
	min_int int4 NULL,
	min_wis int4 NULL,
	min_dex int4 NULL,
	min_con int4 NULL,
	min_chr int4 NULL,
	max_str int4 NULL,
	max_int int4 NULL,
	max_wis int4 NULL,
	max_dex int4 NULL,
	max_con int4 NULL,
	max_chr int4 NULL,
	xpadjustment int4 NULL,
	armor varchar(200) NULL,
	weapons varchar(200) NULL,
	description text NULL,
	rangedbonus int4 NULL,
	max_hd int4 NULL,
	modified timestamp DEFAULT now() NOT NULL,
	hd_mod int4 NULL,
	ruleset_id int4 NOT NULL DEFAULT 1,
	CONSTRAINT races_ruleset_name_key UNIQUE (ruleset_id, name),
	CONSTRAINT races_pkey PRIMARY KEY (id),
	CONSTRAINT races_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES public.ruleset(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS races_races_modified ON public.races USING btree (modified);


-- public.spells definition

-- DROP TABLE public.spells;

CREATE TABLE IF NOT EXISTS public.spells (
	id int4 NOT NULL,
	"name" varchar(80) NOT NULL,
	"range" varchar(80) NULL,
	duration varchar(80) NULL,
	description text NULL,
	modified timestamp DEFAULT now() NOT NULL,
	ruleset_id int4 NOT NULL DEFAULT 1,
	CONSTRAINT spells_ruleset_name_key UNIQUE (ruleset_id, name),
	CONSTRAINT spells_pkey PRIMARY KEY (id),
	CONSTRAINT spells_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES public.ruleset(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS spells_spells_modified ON public.spells USING btree (modified);


-- public.abilities definition

-- DROP TABLE public.abilities;

CREATE TABLE IF NOT EXISTS public.abilities (
	id int4 NOT NULL,
	description varchar(200) NOT NULL,
	modified timestamp DEFAULT now() NOT NULL,
	category int4 NULL,
	ruleset_id int4 NOT NULL DEFAULT 1,
	CONSTRAINT abilities_ruleset_description_key UNIQUE (ruleset_id, description),
	CONSTRAINT abilities_pkey PRIMARY KEY (id),
	CONSTRAINT integ_69 FOREIGN KEY (category) REFERENCES public.ability_categories(id),
	CONSTRAINT abilities_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES public.ruleset(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS abilities_abilities_modified ON public.abilities USING btree (modified);


-- public."characters" definition

-- DROP TABLE public."characters";

CREATE TABLE IF NOT EXISTS public."characters" (
	id int4 NOT NULL,
	"name" varchar(80) NOT NULL,
	"user" varchar(80) DEFAULT 'TEMP$USER'::character varying NOT NULL,
	gender varchar(80) NULL,
	age int4 NULL,
	hair varchar(80) NULL,
	eyes varchar(80) NULL,
	height varchar(80) NULL,
	weight varchar(80) NULL,
	race int4 NULL,
	str int4 NULL,
	"int" int4 NULL,
	wis int4 NULL,
	dex int4 NULL,
	con int4 NULL,
	chr int4 NULL,
	hp int4 NULL,
	notes text NULL,
	quasiclass int4 NULL,
	"level" int4 NULL,
	ac int4 NULL,
	xp int4 NULL,
	skillpoints int4 NULL,
	"money" int4 NULL,
	modified timestamp DEFAULT now() NOT NULL,
	equipped_melee_primary_id int4 NULL,
	equipped_melee_secondary_id int4 NULL,
	equipped_ranged_id int4 NULL,
	equipped_armor_id int4 NULL,
	equipped_shield_id int4 NULL,
	ruleset_id int4 NOT NULL DEFAULT 1,
	CONSTRAINT characters_ruleset_name_key UNIQUE (ruleset_id, name),
	CONSTRAINT characters_pkey PRIMARY KEY (id),
	CONSTRAINT characters_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES public.ruleset(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS characters_characters_modified ON public.characters USING btree (modified);


-- public.character_classes definition (character 1-n classes; primary = lowest sort_order, then class_id)

-- DROP TABLE public.character_classes;

CREATE TABLE IF NOT EXISTS public.character_classes (
	character_id int4 NOT NULL,
	class_id int4 NOT NULL,
	class_level int4 NULL,
	sort_order int2 NOT NULL DEFAULT 0,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT character_classes_pkey PRIMARY KEY (character_id, class_id),
	CONSTRAINT character_classes_character_id_fkey FOREIGN KEY (character_id) REFERENCES public."characters"(id) ON DELETE CASCADE,
	CONSTRAINT character_classes_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_character_classes_character ON public.character_classes USING btree (character_id);
CREATE INDEX IF NOT EXISTS idx_character_classes_class ON public.character_classes USING btree (class_id);


-- public.campaign_character definition (character <-> campaign many-to-many)

-- DROP TABLE public.campaign_character;

CREATE TABLE IF NOT EXISTS public.campaign_character (
	campaign_id int4 NOT NULL,
	character_id int4 NOT NULL,
	modified timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT campaign_character_pkey PRIMARY KEY (campaign_id, character_id),
	CONSTRAINT campaign_character_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(id) ON DELETE CASCADE,
	CONSTRAINT campaign_character_character_id_fkey FOREIGN KEY (character_id) REFERENCES public."characters"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_campaign_character_campaign ON public.campaign_character USING btree (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_character_character ON public.campaign_character USING btree (character_id);


-- public.class_abilities definition

-- DROP TABLE public.class_abilities;

CREATE TABLE IF NOT EXISTS public.class_abilities (
	class_id int4 NOT NULL,
	ability_id int4 NOT NULL,
	"level" int4 NOT NULL,
	int_param int4 NULL,
	str_param varchar(20) NULL,
	modified timestamp DEFAULT now() NOT NULL,
	ruleset_id int4 NOT NULL DEFAULT 1,
	CONSTRAINT class_abilities_pkey PRIMARY KEY (class_id, ability_id, level),
	CONSTRAINT integ_71 FOREIGN KEY (ability_id) REFERENCES public.abilities(id),
	CONSTRAINT integ_72 FOREIGN KEY (class_id) REFERENCES public.classes(id),
	CONSTRAINT class_abilities_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES public.ruleset(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS class_abilities_class_abilities_modified ON public.class_abilities USING btree (modified);
CREATE INDEX IF NOT EXISTS idx_class_abilities_ruleset ON public.class_abilities USING btree (ruleset_id);


-- public.class_leveling definition

-- DROP TABLE public.class_leveling;

CREATE TABLE IF NOT EXISTS public.class_leveling (
	class_id int4 NOT NULL,
	"level" int4 NOT NULL,
	xp int4 NOT NULL,
	hd int4 NULL,
	hp int4 NULL,
	ab int4 NULL,
	modified timestamp DEFAULT now() NOT NULL,
	ruleset_id int4 NOT NULL DEFAULT 1,
	CONSTRAINT class_leveling_pkey PRIMARY KEY (class_id, level),
	CONSTRAINT integ_79 FOREIGN KEY (class_id) REFERENCES public.classes(id),
	CONSTRAINT class_leveling_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES public.ruleset(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS class_leveling_class_leveling_modified ON public.class_leveling USING btree (modified);
CREATE INDEX IF NOT EXISTS idx_class_leveling_ruleset ON public.class_leveling USING btree (ruleset_id);


-- public.class_spells definition

-- DROP TABLE public.class_spells;

CREATE TABLE IF NOT EXISTS public.class_spells (
	class_id int4 NOT NULL,
	char_level int4 NOT NULL,
	level1 int4 NULL,
	level2 int4 NULL,
	level3 int4 NULL,
	level4 int4 NULL,
	level5 int4 NULL,
	level6 int4 NULL,
	level7 int4 NULL,
	modified timestamp DEFAULT now() NOT NULL,
	ruleset_id int4 NOT NULL DEFAULT 1,
	CONSTRAINT class_spells_pkey PRIMARY KEY (class_id, char_level),
	CONSTRAINT integ_74 FOREIGN KEY (class_id) REFERENCES public.classes(id),
	CONSTRAINT class_spells_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES public.ruleset(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS class_spells_class_spells_modified ON public.class_spells USING btree (modified);
CREATE INDEX IF NOT EXISTS idx_class_spells_ruleset ON public.class_spells USING btree (ruleset_id);


-- public.items definition

-- DROP TABLE public.items;

CREATE TABLE IF NOT EXISTS public.items (
	id int4 NOT NULL,
	category int4 NULL,
	"type" int4 NULL,
	"name" varchar(80) NOT NULL,
	price int4 NULL,
	"size" varchar(20) NULL,
	weight int4 NULL,
	attackbonus int4 NULL,
	damagebonus int4 NULL,
	defensebonus int4 NULL,
	damage varchar(20) NULL,
	range_short int4 NULL,
	range_medium int4 NULL,
	range_long int4 NULL,
	rof varchar(20) NULL,
	ac int4 NULL,
	ac_melee int4 NULL,
	ac_ranged int4 NULL,
	notes varchar(250) NULL,
	modified timestamp DEFAULT now() NOT NULL,
	effect int4 NULL,
	value int4 NULL,
	duration int4 NULL,
	charges int4 NULL,
	perday int4 DEFAULT 0 NULL,
	ruleset_id int4 NOT NULL DEFAULT 1,
	CONSTRAINT items_ruleset_category_type_name_size_key UNIQUE (ruleset_id, category, type, name, size),
	CONSTRAINT items_pkey PRIMARY KEY (id),
	CONSTRAINT integ_98 FOREIGN KEY (category) REFERENCES public.item_categories(id),
	CONSTRAINT integ_99 FOREIGN KEY ("type") REFERENCES public.item_types(id),
	CONSTRAINT items_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES public.ruleset(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS items_items_modified ON public.items USING btree (modified);


-- public.race_abilities definition

-- DROP TABLE public.race_abilities;

CREATE TABLE IF NOT EXISTS public.race_abilities (
	race_id int4 NOT NULL,
	ability_id int4 NOT NULL,
	int_param int4 NULL,
	str_param varchar(20) NULL,
	modified timestamp DEFAULT now() NOT NULL,
	ruleset_id int4 NOT NULL DEFAULT 1,
	CONSTRAINT race_abilities_pkey PRIMARY KEY (race_id, ability_id),
	CONSTRAINT integ_80 FOREIGN KEY (race_id) REFERENCES public.races(id),
	CONSTRAINT integ_81 FOREIGN KEY (ability_id) REFERENCES public.abilities(id),
	CONSTRAINT race_abilities_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES public.ruleset(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS race_abilities_race_abilities_modified ON public.race_abilities USING btree (modified);
CREATE INDEX IF NOT EXISTS idx_race_abilities_ruleset ON public.race_abilities USING btree (ruleset_id);


-- public.spell_class definition

-- DROP TABLE public.spell_class;

CREATE TABLE IF NOT EXISTS public.spell_class (
	class_id int4 NOT NULL,
	spell_id int4 NOT NULL,
	"level" int4 NOT NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT spell_class_pkey PRIMARY KEY (class_id, spell_id),
	CONSTRAINT integ_75 FOREIGN KEY (class_id) REFERENCES public.classes(id),
	CONSTRAINT integ_76 FOREIGN KEY (spell_id) REFERENCES public.spells(id)
);
CREATE INDEX IF NOT EXISTS spell_class_spell_class_modified ON public.spell_class USING btree (modified);


-- public.character_abilities definition

-- DROP TABLE public.character_abilities;

CREATE TABLE IF NOT EXISTS public.character_abilities (
	character_id int4 NOT NULL,
	ability_id int4 NOT NULL,
	"mod" int4 NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT character_abilities_pkey PRIMARY KEY (character_id, ability_id),
	CONSTRAINT integ_86 FOREIGN KEY (ability_id) REFERENCES public.abilities(id),
	CONSTRAINT integ_87 FOREIGN KEY (character_id) REFERENCES public."characters"(id)
);
CREATE INDEX IF NOT EXISTS character_abilities_character_abilities_modified ON public.character_abilities USING btree (modified);
CREATE INDEX IF NOT EXISTS idx_character_abilities_char ON public.character_abilities USING btree (character_id);


-- public.character_effects definition

-- DROP TABLE public.character_effects;

CREATE TABLE IF NOT EXISTS public.character_effects (
	id int4 NOT NULL,
	character_id int4 NOT NULL,
	effect int4 NULL,
	note bpchar(100) NULL,
	value int4 NULL,
	duration int4 NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT character_effects_pkey PRIMARY KEY (id, character_id),
	CONSTRAINT integ_84 FOREIGN KEY (character_id) REFERENCES public."characters"(id)
);
CREATE INDEX IF NOT EXISTS character_effects_character_effects_modified ON public.character_effects USING btree (modified);


-- public.character_items definition

-- DROP TABLE public.character_items;

CREATE TABLE IF NOT EXISTS public.character_items (
	id int4 NOT NULL,
	character_id int4 NOT NULL,
	item_id int4 NULL,
	bonus int4 DEFAULT 0 NULL,
	value int4 DEFAULT 0 NULL,
	"name" varchar(80) NULL,
	description text NULL,
	quantity int4 DEFAULT 1 NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT character_items_pkey PRIMARY KEY (id, character_id),
	CONSTRAINT integ_101 FOREIGN KEY (character_id) REFERENCES public."characters"(id),
	CONSTRAINT integ_102 FOREIGN KEY (item_id) REFERENCES public.items(id)
);
CREATE INDEX IF NOT EXISTS character_items_char_items_char ON public.character_items USING btree (character_id);
CREATE INDEX IF NOT EXISTS character_items_character_items_modified ON public.character_items USING btree (modified);
CREATE INDEX IF NOT EXISTS idx_character_items_char ON public.character_items USING btree (character_id);


-- public.character_spells definition

-- DROP TABLE public.character_spells;

CREATE TABLE IF NOT EXISTS public.character_spells (
	character_id int4 NOT NULL,
	spell_id int4 NOT NULL,
	memorized int4 NULL,
	known int4 NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT character_spells_pkey PRIMARY KEY (character_id, spell_id),
	CONSTRAINT integ_89 FOREIGN KEY (spell_id) REFERENCES public.spells(id),
	CONSTRAINT integ_90 FOREIGN KEY (character_id) REFERENCES public."characters"(id)
);
CREATE INDEX IF NOT EXISTS character_spells_character_spells_modified ON public.character_spells USING btree (modified);
CREATE INDEX IF NOT EXISTS idx_character_spells_char ON public.character_spells USING btree (character_id);


-- public.character_spells_cast definition

-- DROP TABLE public.character_spells_cast;

CREATE TABLE IF NOT EXISTS public.character_spells_cast (
	character_id int4 NOT NULL,
	spell_level int4 NOT NULL,
	numcast int4 NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT character_spells_cast_pkey PRIMARY KEY (character_id, spell_level),
	CONSTRAINT integ_92 FOREIGN KEY (character_id) REFERENCES public."characters"(id)
);
CREATE INDEX IF NOT EXISTS character_spells_cast_character_spells_cast_modified ON public.character_spells_cast USING btree (modified);


-- ==================== Player/GM communication (replaces RabbitMQ) ====================

-- GM commands to campaign or specific character (give_xp, give_gold, give_item, open_shop, new_round, new_day, switch_tab)
-- DROP TABLE public.campaign_command;
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

-- Player-to-player item/gold transfers (send stuff)
-- DROP TABLE public.character_transfer;
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
