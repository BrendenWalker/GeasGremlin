-- RPGHub: Schema for the rpghub PostgreSQL database
-- Matches the structure migrated from the original Firebird/Delphi RPG system.
-- Game-agnostic: supports D&D, Pathfinder, Basic Fantasy, etc. via data in these tables.

-- DROP SCHEMA public;

CREATE SCHEMA public AUTHORIZATION pg_database_owner;

-- DROP SEQUENCE public.campaign_id_seq;

CREATE SEQUENCE public.campaign_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;

-- DROP SEQUENCE public.source_id_seq;

CREATE SEQUENCE public.source_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;

-- public.ability_categories definition

-- DROP TABLE public.ability_categories;

CREATE TABLE public.ability_categories (
	id int4 NOT NULL,
	"name" varchar(80) NOT NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT ability_categories_name_key UNIQUE (name),
	CONSTRAINT ability_categories_pkey PRIMARY KEY (id)
);
CREATE INDEX ability_categories_ability_categories_modified ON public.ability_categories USING btree (modified);


-- public.campaign definition

-- DROP TABLE public.campaign;

CREATE TABLE public.campaign (
	id serial4 NOT NULL,
	"name" varchar(80) NOT NULL,
	modified timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT campaign_name_key UNIQUE (name),
	CONSTRAINT campaign_pkey PRIMARY KEY (id)
);


-- public.classes definition

-- DROP TABLE public.classes;

CREATE TABLE public.classes (
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
	CONSTRAINT classes_name_key UNIQUE (name),
	CONSTRAINT classes_pkey PRIMARY KEY (id)
);
CREATE INDEX classes_classes_modified ON public.classes USING btree (modified);


-- public.item_categories definition

-- DROP TABLE public.item_categories;

CREATE TABLE public.item_categories (
	id int4 NOT NULL,
	"name" varchar(80) NOT NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT item_categories_name_key UNIQUE (name),
	CONSTRAINT item_categories_pkey PRIMARY KEY (id)
);
CREATE INDEX item_categories_item_categories_modified ON public.item_categories USING btree (modified);


-- public.item_types definition

-- DROP TABLE public.item_types;

CREATE TABLE public.item_types (
	id int4 NOT NULL,
	"name" varchar(80) NOT NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT item_types_name_key UNIQUE (name),
	CONSTRAINT item_types_pkey PRIMARY KEY (id)
);
CREATE INDEX item_types_item_types_modified ON public.item_types USING btree (modified);


-- public.races definition

-- DROP TABLE public.races;

CREATE TABLE public.races (
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
	CONSTRAINT races_name_key UNIQUE (name),
	CONSTRAINT races_pkey PRIMARY KEY (id)
);
CREATE INDEX races_races_modified ON public.races USING btree (modified);


-- public."source" definition

-- DROP TABLE public."source";

CREATE TABLE public."source" (
	id serial4 NOT NULL,
	"name" varchar(80) NOT NULL,
	modified timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT source_name_key UNIQUE (name),
	CONSTRAINT source_pkey PRIMARY KEY (id)
);


-- public.spells definition

-- DROP TABLE public.spells;

CREATE TABLE public.spells (
	id int4 NOT NULL,
	"name" varchar(80) NOT NULL,
	"range" varchar(80) NULL,
	duration varchar(80) NULL,
	description text NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT spells_name_key UNIQUE (name),
	CONSTRAINT spells_pkey PRIMARY KEY (id)
);
CREATE INDEX spells_spells_modified ON public.spells USING btree (modified);


-- public.abilities definition

-- DROP TABLE public.abilities;

CREATE TABLE public.abilities (
	id int4 NOT NULL,
	description varchar(200) NOT NULL,
	modified timestamp DEFAULT now() NOT NULL,
	category int4 NULL,
	CONSTRAINT abilities_description_key UNIQUE (description),
	CONSTRAINT abilities_pkey PRIMARY KEY (id),
	CONSTRAINT integ_69 FOREIGN KEY (category) REFERENCES public.ability_categories(id)
);
CREATE INDEX abilities_abilities_modified ON public.abilities USING btree (modified);


-- public.campaign_sources definition

-- DROP TABLE public.campaign_sources;

CREATE TABLE public.campaign_sources (
	campaign_id int4 NOT NULL,
	source_id int4 NOT NULL,
	modified timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT campaign_sources_pkey PRIMARY KEY (campaign_id, source_id),
	CONSTRAINT campaign_sources_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(id) ON DELETE CASCADE,
	CONSTRAINT campaign_sources_source_id_fkey FOREIGN KEY (source_id) REFERENCES public."source"(id) ON DELETE CASCADE
);


-- public."characters" definition

-- DROP TABLE public."characters";

CREATE TABLE public."characters" (
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
	"class" int4 NULL,
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
	CONSTRAINT characters_name_key UNIQUE (name),
	CONSTRAINT characters_pkey PRIMARY KEY (id)
);
CREATE INDEX characters_characters_modified ON public.characters USING btree (modified);
CREATE INDEX idx_characters_name ON public.characters USING btree (name);


-- public.campaign_character definition (character <-> campaign many-to-many)

-- DROP TABLE public.campaign_character;

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


-- public.class_abilities definition

-- DROP TABLE public.class_abilities;

CREATE TABLE public.class_abilities (
	class_id int4 NOT NULL,
	ability_id int4 NOT NULL,
	"level" int4 NOT NULL,
	int_param int4 NULL,
	str_param varchar(20) NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT class_abilities_pkey PRIMARY KEY (class_id, ability_id, level),
	CONSTRAINT integ_71 FOREIGN KEY (ability_id) REFERENCES public.abilities(id),
	CONSTRAINT integ_72 FOREIGN KEY (class_id) REFERENCES public.classes(id)
);
CREATE INDEX class_abilities_class_abilities_modified ON public.class_abilities USING btree (modified);


-- public.class_leveling definition

-- DROP TABLE public.class_leveling;

CREATE TABLE public.class_leveling (
	class_id int4 NOT NULL,
	"level" int4 NOT NULL,
	xp int4 NOT NULL,
	hd int4 NULL,
	hp int4 NULL,
	ab int4 NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT class_leveling_pkey PRIMARY KEY (class_id, level),
	CONSTRAINT integ_79 FOREIGN KEY (class_id) REFERENCES public.classes(id)
);
CREATE INDEX class_leveling_class_leveling_modified ON public.class_leveling USING btree (modified);


-- public.class_spells definition

-- DROP TABLE public.class_spells;

CREATE TABLE public.class_spells (
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
	CONSTRAINT class_spells_pkey PRIMARY KEY (class_id, char_level),
	CONSTRAINT integ_74 FOREIGN KEY (class_id) REFERENCES public.classes(id)
);
CREATE INDEX class_spells_class_spells_modified ON public.class_spells USING btree (modified);


-- public.items definition

-- DROP TABLE public.items;

CREATE TABLE public.items (
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
	CONSTRAINT items_category_type_name_size_key UNIQUE (category, type, name, size),
	CONSTRAINT items_pkey PRIMARY KEY (id),
	CONSTRAINT integ_98 FOREIGN KEY (category) REFERENCES public.item_categories(id),
	CONSTRAINT integ_99 FOREIGN KEY ("type") REFERENCES public.item_types(id)
);
CREATE INDEX items_items_modified ON public.items USING btree (modified);


-- public.race_abilities definition

-- DROP TABLE public.race_abilities;

CREATE TABLE public.race_abilities (
	race_id int4 NOT NULL,
	ability_id int4 NOT NULL,
	int_param int4 NULL,
	str_param varchar(20) NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT race_abilities_pkey PRIMARY KEY (race_id, ability_id),
	CONSTRAINT integ_80 FOREIGN KEY (race_id) REFERENCES public.races(id),
	CONSTRAINT integ_81 FOREIGN KEY (ability_id) REFERENCES public.abilities(id)
);
CREATE INDEX race_abilities_race_abilities_modified ON public.race_abilities USING btree (modified);


-- public.spell_class definition

-- DROP TABLE public.spell_class;

CREATE TABLE public.spell_class (
	class_id int4 NOT NULL,
	spell_id int4 NOT NULL,
	"level" int4 NOT NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT spell_class_pkey PRIMARY KEY (class_id, spell_id),
	CONSTRAINT integ_75 FOREIGN KEY (class_id) REFERENCES public.classes(id),
	CONSTRAINT integ_76 FOREIGN KEY (spell_id) REFERENCES public.spells(id)
);
CREATE INDEX spell_class_spell_class_modified ON public.spell_class USING btree (modified);


-- public.character_abilities definition

-- DROP TABLE public.character_abilities;

CREATE TABLE public.character_abilities (
	character_id int4 NOT NULL,
	ability_id int4 NOT NULL,
	"mod" int4 NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT character_abilities_pkey PRIMARY KEY (character_id, ability_id),
	CONSTRAINT integ_86 FOREIGN KEY (ability_id) REFERENCES public.abilities(id),
	CONSTRAINT integ_87 FOREIGN KEY (character_id) REFERENCES public."characters"(id)
);
CREATE INDEX character_abilities_character_abilities_modified ON public.character_abilities USING btree (modified);
CREATE INDEX idx_character_abilities_char ON public.character_abilities USING btree (character_id);


-- public.character_effects definition

-- DROP TABLE public.character_effects;

CREATE TABLE public.character_effects (
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
CREATE INDEX character_effects_character_effects_modified ON public.character_effects USING btree (modified);


-- public.character_items definition

-- DROP TABLE public.character_items;

CREATE TABLE public.character_items (
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
CREATE INDEX character_items_char_items_char ON public.character_items USING btree (character_id);
CREATE INDEX character_items_character_items_modified ON public.character_items USING btree (modified);
CREATE INDEX idx_character_items_char ON public.character_items USING btree (character_id);


-- public.character_spells definition

-- DROP TABLE public.character_spells;

CREATE TABLE public.character_spells (
	character_id int4 NOT NULL,
	spell_id int4 NOT NULL,
	memorized int4 NULL,
	known int4 NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT character_spells_pkey PRIMARY KEY (character_id, spell_id),
	CONSTRAINT integ_89 FOREIGN KEY (spell_id) REFERENCES public.spells(id),
	CONSTRAINT integ_90 FOREIGN KEY (character_id) REFERENCES public."characters"(id)
);
CREATE INDEX character_spells_character_spells_modified ON public.character_spells USING btree (modified);
CREATE INDEX idx_character_spells_char ON public.character_spells USING btree (character_id);


-- public.character_spells_cast definition

-- DROP TABLE public.character_spells_cast;

CREATE TABLE public.character_spells_cast (
	character_id int4 NOT NULL,
	spell_level int4 NOT NULL,
	numcast int4 NULL,
	modified timestamp DEFAULT now() NOT NULL,
	CONSTRAINT character_spells_cast_pkey PRIMARY KEY (character_id, spell_level),
	CONSTRAINT integ_92 FOREIGN KEY (character_id) REFERENCES public."characters"(id)
);
CREATE INDEX character_spells_cast_character_spells_cast_modified ON public.character_spells_cast USING btree (modified);


-- ==================== Player/GM communication (replaces RabbitMQ) ====================

-- GM commands to campaign or specific character (give_xp, give_gold, give_item, open_shop, new_round, new_day, switch_tab)
-- DROP TABLE public.campaign_command;
CREATE TABLE public.campaign_command (
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
CREATE INDEX idx_campaign_command_campaign ON public.campaign_command USING btree (campaign_id);
CREATE INDEX idx_campaign_command_recipient ON public.campaign_command USING btree (recipient_character_id);
CREATE INDEX idx_campaign_command_unread ON public.campaign_command (campaign_id, read_at) WHERE read_at IS NULL;

-- Player-to-player item/gold transfers (send stuff)
-- DROP TABLE public.character_transfer;
CREATE TABLE public.character_transfer (
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
CREATE INDEX idx_character_transfer_to ON public.character_transfer USING btree (to_character_id);
CREATE INDEX idx_character_transfer_from ON public.character_transfer USING btree (from_character_id);
CREATE INDEX idx_character_transfer_pending ON public.character_transfer (to_character_id, status) WHERE status = 'pending';
