-- =============================================================================
-- M2B ENERGY — Schéma de base (Étape 1)
-- Migration 0001 : types, tables, index
-- =============================================================================
-- Convention : le stock courant n'est JAMAIS un champ modifiable. Il se calcule
-- toujours à partir du journal `mouvements_stock` (source de vérité).
-- =============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Types énumérés
-- ----------------------------------------------------------------------------
create type role_utilisateur as enum ('admin', 'operationnel', 'bureau');
create type statut_commande  as enum ('brouillon', 'en_transit', 'livree_partiel', 'livree', 'annulee');
create type statut_reservation as enum ('reserve', 'sortie', 'annulee');
create type statut_serie     as enum ('en_stock', 'reserve', 'sorti', 'renvoye_fournisseur');
create type type_retour       as enum ('chantier_non_installe', 'defectueux_sav', 'commande');
create type type_mouvement    as enum ('reception', 'entree_manuelle', 'retour_chantier', 'sortie', 'retour_fournisseur', 'ajustement');

-- ----------------------------------------------------------------------------
-- Profils (1 ligne par utilisateur Supabase Auth)
-- ----------------------------------------------------------------------------
create table profils (
  id    uuid primary key references auth.users(id) on delete cascade,
  nom   text not null default '',
  role  role_utilisateur not null default 'operationnel',
  cree_le timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Fournisseurs
-- ----------------------------------------------------------------------------
create table fournisseurs (
  id                    uuid primary key default gen_random_uuid(),
  nom                   text not null,
  email                 text,
  telephone             text,
  delai_livraison_jours integer not null default 7,
  notes                 text,
  cree_le               timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Articles
-- ----------------------------------------------------------------------------
create table articles (
  id           uuid primary key default gen_random_uuid(),
  reference    text not null unique,
  designation  text not null,
  categorie    text not null default 'accessoire',   -- pac, split, fenetre, porte, accessoire, ...
  unite        text not null default 'pièce',
  serialise    boolean not null default false,        -- vrai pour PAC / splits
  seuil_manuel integer not null default 0,
  actif        boolean not null default true,
  cree_le      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Compositions (nomenclature / BOM d'un produit fini)
-- ----------------------------------------------------------------------------
create table compositions (
  id              uuid primary key default gen_random_uuid(),
  article_fini_id uuid not null references articles(id) on delete cascade,
  unique (article_fini_id)
);

create table composition_lignes (
  id                   uuid primary key default gen_random_uuid(),
  composition_id       uuid not null references compositions(id) on delete cascade,
  article_composant_id uuid not null references articles(id) on delete restrict,
  quantite             numeric not null default 1 check (quantite > 0)
);

-- ----------------------------------------------------------------------------
-- Prix fournisseur (historique)
-- ----------------------------------------------------------------------------
create table prix_fournisseur (
  id             uuid primary key default gen_random_uuid(),
  article_id     uuid not null references articles(id) on delete cascade,
  fournisseur_id uuid not null references fournisseurs(id) on delete cascade,
  prix           numeric not null check (prix >= 0),
  date           date not null default current_date
);
create index idx_prix_article on prix_fournisseur (article_id, fournisseur_id, date desc);

-- ----------------------------------------------------------------------------
-- Factures d'achat (n° + fournisseur + date, pas de PDF)
-- ----------------------------------------------------------------------------
create table factures_achat (
  id             uuid primary key default gen_random_uuid(),
  numero         text not null,
  fournisseur_id uuid not null references fournisseurs(id) on delete restrict,
  date           date not null default current_date,
  cree_le        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Commandes fournisseurs (multi-produits)
-- ----------------------------------------------------------------------------
create table commandes (
  id                    uuid primary key default gen_random_uuid(),
  numero                text not null unique,
  fournisseur_id        uuid not null references fournisseurs(id) on delete restrict,
  date_commande         date not null default current_date,
  date_livraison_prevue date,
  statut                statut_commande not null default 'brouillon',
  notes                 text,
  cree_le               timestamptz not null default now()
);

create table commande_lignes (
  id             uuid primary key default gen_random_uuid(),
  commande_id    uuid not null references commandes(id) on delete cascade,
  article_id     uuid not null references articles(id) on delete restrict,
  quantite       numeric not null check (quantite > 0),
  prix_unitaire  numeric not null default 0 check (prix_unitaire >= 0),
  quantite_recue numeric not null default 0 check (quantite_recue >= 0)
);
create index idx_cmdlignes_commande on commande_lignes (commande_id);

-- ----------------------------------------------------------------------------
-- Clients & chantiers
-- ----------------------------------------------------------------------------
create table clients (
  id      uuid primary key default gen_random_uuid(),
  nom     text not null,
  adresse text,
  contact text,
  notes   text,
  cree_le timestamptz not null default now()
);

create table chantiers (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references clients(id) on delete cascade,
  libelle            text not null,
  date_prevue        date,
  statut             text not null default 'en_cours',
  ca                 numeric not null default 0,   -- chiffre d'affaires saisi
  cout_sous_traitance numeric not null default 0,  -- saisi manuellement
  cree_le            timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Réservations (sorties planifiées)
-- ----------------------------------------------------------------------------
create table reservations (
  id          uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references chantiers(id) on delete cascade,
  article_id  uuid not null references articles(id) on delete restrict,
  quantite    numeric not null check (quantite > 0),
  date_prevue date not null default current_date,
  statut      statut_reservation not null default 'reserve',
  cree_le     timestamptz not null default now()
);
create index idx_resa_article on reservations (article_id, statut, date_prevue);

-- ----------------------------------------------------------------------------
-- Bons de sortie
-- ----------------------------------------------------------------------------
create table bons_de_sortie (
  id          uuid primary key default gen_random_uuid(),
  numero      text not null unique,            -- ex. BS-2026-0412
  chantier_id uuid not null references chantiers(id) on delete restrict,
  date        date not null default current_date,
  pdf_url     text,
  cree_le     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Numéros de série (traçabilité)
-- ----------------------------------------------------------------------------
create table numeros_serie (
  id               uuid primary key default gen_random_uuid(),
  article_id       uuid not null references articles(id) on delete restrict,
  numero_serie     text not null,
  facture_achat_id uuid references factures_achat(id) on delete set null,   -- origine d'achat
  client_id        uuid references clients(id) on delete set null,          -- client actuel / dernier
  bon_de_sortie_id uuid references bons_de_sortie(id) on delete set null,
  statut           statut_serie not null default 'en_stock',
  date_entree      date,
  date_sortie      date,
  unique (article_id, numero_serie)
);
create index idx_serie_numero on numeros_serie (numero_serie);
create index idx_serie_statut on numeros_serie (statut);

-- ----------------------------------------------------------------------------
-- Retours (3 types)
-- ----------------------------------------------------------------------------
create table retours (
  id              uuid primary key default gen_random_uuid(),
  type            type_retour not null,
  reference       uuid,                    -- bon_de_sortie_id / commande_id selon le type
  article_id      uuid not null references articles(id) on delete restrict,
  numero_serie_id uuid references numeros_serie(id) on delete set null,
  quantite        numeric not null check (quantite > 0),
  motif           text,
  decision        text,
  avoir_montant   numeric,
  date            date not null default current_date,
  cree_le         timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Journal des mouvements de stock — SOURCE DE VÉRITÉ
-- ----------------------------------------------------------------------------
-- Ajouts au modèle initial (documentés dans le README) :
--   * chantier_id    : rattache directement une sortie/retour à un chantier
--                      (marge par chantier fiable, sans reconstruire le lien).
--   * prix_achat     : capture le coût réel de l'unité au moment du mouvement
--                      (COGS figé -> marge = "prix d'achat réels" même si les
--                      prix fournisseur évoluent ensuite).
-- ----------------------------------------------------------------------------
create table mouvements_stock (
  id               uuid primary key default gen_random_uuid(),
  article_id       uuid not null references articles(id) on delete restrict,
  type             type_mouvement not null,
  quantite         numeric not null,        -- positif (entrée) ou négatif (sortie)
  date             timestamptz not null default now(),
  reference        uuid,                    -- id de commande / bon / retour selon le type
  numero_serie_id  uuid references numeros_serie(id) on delete set null,
  client_id        uuid references clients(id) on delete set null,
  chantier_id      uuid references chantiers(id) on delete set null,
  facture_achat_id uuid references factures_achat(id) on delete set null,
  prix_achat       numeric,                 -- coût unitaire capturé (COGS)
  motif            text,
  utilisateur_id   uuid references profils(id) on delete set null
);
create index idx_mouv_article on mouvements_stock (article_id);
create index idx_mouv_chantier on mouvements_stock (chantier_id);
create index idx_mouv_type on mouvements_stock (type);
