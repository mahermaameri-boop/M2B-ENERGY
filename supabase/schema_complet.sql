-- M2B ENERGY — SCHÉMA COMPLET (exécuter en une fois dans Supabase → SQL Editor)

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 0001_schema.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 0002_views_functions.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- M2B ENERGY — Migration 0002 : fonctions rôle, vues métier, calculs
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Helpers de rôle (SECURITY DEFINER pour éviter la récursion RLS sur profils)
-- ----------------------------------------------------------------------------
create or replace function mon_role()
returns role_utilisateur
language sql stable security definer set search_path = public
as $$ select role from profils where id = auth.uid() $$;

create or replace function est_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role = 'admin' from profils where id = auth.uid()), false) $$;

-- Peut voir le CA et les prix d'achat : admin + bureau
create or replace function peut_voir_ca()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role in ('admin','bureau') from profils where id = auth.uid()), false) $$;

-- Prix d'achat : admin + bureau (l'opérationnel travaille "sans argent")
create or replace function peut_voir_prix()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role in ('admin','bureau') from profils where id = auth.uid()), false) $$;

-- Marges : admin uniquement
create or replace function peut_voir_marge()
returns boolean
language sql stable security definer set search_path = public
as $$ select est_admin() $$;

-- ----------------------------------------------------------------------------
-- Stock actuel = somme des mouvements par article
-- ----------------------------------------------------------------------------
create or replace view vue_stock_actuel as
select a.id as article_id,
       coalesce(sum(m.quantite), 0)::numeric as stock
from articles a
left join mouvements_stock m on m.article_id = a.id
group by a.id;

-- ----------------------------------------------------------------------------
-- Dernier prix d'achat connu par article (dernière ligne prix_fournisseur)
-- security_invoker : soumis au RLS de prix_fournisseur -> null pour l'opérationnel
-- ----------------------------------------------------------------------------
create or replace view vue_dernier_prix
with (security_invoker = on) as
select distinct on (pf.article_id)
       pf.article_id,
       pf.prix as dernier_prix,
       pf.fournisseur_id,
       pf.date
from prix_fournisseur pf
order by pf.article_id, pf.date desc, pf.id desc;

-- ----------------------------------------------------------------------------
-- Ordre d'appel au réassort : fournisseurs d'un article, du - cher au + cher
-- (dernier prix connu par fournisseur), avec le délai indicatif.
-- ----------------------------------------------------------------------------
create or replace view vue_reassort
with (security_invoker = on) as
with dernier as (
  select distinct on (pf.article_id, pf.fournisseur_id)
         pf.article_id, pf.fournisseur_id, pf.prix, pf.date
  from prix_fournisseur pf
  order by pf.article_id, pf.fournisseur_id, pf.date desc, pf.id desc
)
select d.article_id,
       d.fournisseur_id,
       f.nom as fournisseur_nom,
       d.prix,
       f.delai_livraison_jours,
       d.date as date_prix,
       row_number() over (partition by d.article_id order by d.prix asc, f.delai_livraison_jours asc) as rang
from dernier d
join fournisseurs f on f.id = d.fournisseur_id;

-- ----------------------------------------------------------------------------
-- Stock prévisionnel à une date cible
--   prévisionnel = stock actuel
--                + entrées attendues (reste à recevoir des commandes non
--                  annulées dont date_livraison_prevue <= D)
--                - sorties réservées (réservations 'reserve' dont date_prevue <= D)
-- ----------------------------------------------------------------------------
create or replace function fn_stock_previsionnel(d_cible date)
returns table (
  article_id         uuid,
  stock_actuel       numeric,
  entrees_attendues  numeric,
  sorties_reservees  numeric,
  previsionnel       numeric
)
language sql stable
as $$
  select
    a.id as article_id,
    coalesce(sa.stock, 0) as stock_actuel,
    coalesce(ent.q, 0) as entrees_attendues,
    coalesce(res.q, 0) as sorties_reservees,
    coalesce(sa.stock, 0) + coalesce(ent.q, 0) - coalesce(res.q, 0) as previsionnel
  from articles a
  left join vue_stock_actuel sa on sa.article_id = a.id
  left join (
    select cl.article_id, sum(greatest(cl.quantite - cl.quantite_recue, 0)) as q
    from commande_lignes cl
    join commandes c on c.id = cl.commande_id
    where c.statut <> 'annulee'
      and c.date_livraison_prevue is not null
      and c.date_livraison_prevue <= d_cible
    group by cl.article_id
  ) ent on ent.article_id = a.id
  left join (
    select r.article_id, sum(r.quantite) as q
    from reservations r
    where r.statut = 'reserve'
      and r.date_prevue <= d_cible
    group by r.article_id
  ) res on res.article_id = a.id;
$$;

-- ----------------------------------------------------------------------------
-- Marge par chantier (admin uniquement — garde dans le WHERE)
--   coût matériel = somme des coûts d'achat capturés sur les sorties du chantier
--                   (déduction faite des retours chantier réintégrés)
--   marge = ca - coût matériel - cout_sous_traitance
-- ----------------------------------------------------------------------------
create or replace view vue_marge_chantier as
select
  ch.id as chantier_id,
  ch.client_id,
  ch.libelle,
  ch.ca,
  ch.cout_sous_traitance,
  coalesce(mat.cout, 0) as cout_materiel,
  (ch.ca - coalesce(mat.cout, 0) - ch.cout_sous_traitance) as marge,
  case when ch.ca > 0
       then round((ch.ca - coalesce(mat.cout, 0) - ch.cout_sous_traitance) / ch.ca * 100, 1)
       else null end as marge_pct
from chantiers ch
left join (
  select m.chantier_id, sum(-m.quantite * coalesce(m.prix_achat, 0)) as cout
  from mouvements_stock m
  where m.chantier_id is not null
    and m.type in ('sortie', 'retour_chantier')
  group by m.chantier_id
) mat on mat.chantier_id = ch.id
where peut_voir_marge();

-- ----------------------------------------------------------------------------
-- Marge agrégée par client (admin uniquement)
-- ----------------------------------------------------------------------------
create or replace view vue_marge_client as
select
  c.id as client_id,
  c.nom,
  coalesce(sum(ch.ca), 0) as ca,
  coalesce(sum(mat.cout), 0) as cout_materiel,
  coalesce(sum(ch.cout_sous_traitance), 0) as cout_sous_traitance,
  coalesce(sum(ch.ca), 0) - coalesce(sum(mat.cout), 0) - coalesce(sum(ch.cout_sous_traitance), 0) as marge,
  case when coalesce(sum(ch.ca), 0) > 0
       then round((coalesce(sum(ch.ca),0) - coalesce(sum(mat.cout),0) - coalesce(sum(ch.cout_sous_traitance),0))
                  / sum(ch.ca) * 100, 1)
       else null end as marge_pct
from clients c
left join chantiers ch on ch.client_id = c.id
left join (
  select m.chantier_id, sum(-m.quantite * coalesce(m.prix_achat, 0)) as cout
  from mouvements_stock m
  where m.chantier_id is not null
    and m.type in ('sortie', 'retour_chantier')
  group by m.chantier_id
) mat on mat.chantier_id = ch.id
where peut_voir_marge()
group by c.id, c.nom;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 0003_rls.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- M2B ENERGY — Migration 0003 : Row Level Security + création de profil
-- =============================================================================
-- Modèle de sécurité :
--   * Accès LIGNE (RLS) : appliqué ci-dessous.
--   * Confidentialité de certaines COLONNES monétaires partagées
--     (commande_lignes.prix_unitaire, chantiers.ca / cout_sous_traitance,
--      mouvements_stock.prix_achat) : ces colonnes ne sont jamais requêtées
--     côté serveur pour un rôle non autorisé. PostgREST n'ayant qu'un seul
--     rôle `authenticated`, la distinction admin/bureau/opérationnel se fait
--     via les fonctions de rôle (RLS) + la couche applicative (voir README).
--   * Les vues de marge / prix sont gardées par peut_voir_marge()/peut_voir_prix().
-- =============================================================================

-- Création automatique du profil à l'inscription
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profils (id, nom, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nom', ''),
    coalesce((new.raw_user_meta_data->>'role')::role_utilisateur, 'operationnel')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ----------------------------------------------------------------------------
-- Activation RLS
-- ----------------------------------------------------------------------------
alter table profils            enable row level security;
alter table fournisseurs       enable row level security;
alter table articles           enable row level security;
alter table compositions       enable row level security;
alter table composition_lignes enable row level security;
alter table prix_fournisseur   enable row level security;
alter table factures_achat     enable row level security;
alter table commandes          enable row level security;
alter table commande_lignes    enable row level security;
alter table clients            enable row level security;
alter table chantiers          enable row level security;
alter table reservations       enable row level security;
alter table bons_de_sortie     enable row level security;
alter table numeros_serie      enable row level security;
alter table retours            enable row level security;
alter table mouvements_stock   enable row level security;

-- Raccourci : est authentifié ?
-- (auth.uid() is not null)

-- ----------------------------------------------------------------------------
-- PROFILS
-- ----------------------------------------------------------------------------
create policy profils_select on profils for select
  using (id = auth.uid() or est_admin());
create policy profils_update on profils for update
  using (est_admin()) with check (est_admin());
create policy profils_insert on profils for insert
  with check (est_admin());

-- ----------------------------------------------------------------------------
-- FOURNISSEURS — lecture tous, écriture bureau/admin
-- ----------------------------------------------------------------------------
create policy fournisseurs_select on fournisseurs for select
  using (auth.uid() is not null);
create policy fournisseurs_write on fournisseurs for all
  using (peut_voir_ca()) with check (peut_voir_ca());

-- ----------------------------------------------------------------------------
-- ARTICLES / COMPOSITIONS — lecture tous, écriture bureau/admin
-- ----------------------------------------------------------------------------
create policy articles_select on articles for select
  using (auth.uid() is not null);
create policy articles_write on articles for all
  using (peut_voir_ca()) with check (peut_voir_ca());

create policy compositions_select on compositions for select
  using (auth.uid() is not null);
create policy compositions_write on compositions for all
  using (peut_voir_ca()) with check (peut_voir_ca());

create policy complignes_select on composition_lignes for select
  using (auth.uid() is not null);
create policy complignes_write on composition_lignes for all
  using (peut_voir_ca()) with check (peut_voir_ca());

-- ----------------------------------------------------------------------------
-- PRIX FOURNISSEUR — réservé admin/bureau (lecture ET écriture)
-- ----------------------------------------------------------------------------
create policy prix_select on prix_fournisseur for select
  using (peut_voir_prix());
create policy prix_write on prix_fournisseur for all
  using (peut_voir_prix()) with check (peut_voir_prix());

-- ----------------------------------------------------------------------------
-- FACTURES ACHAT — lecture tous, insertion tous (réception), maj bureau/admin
-- ----------------------------------------------------------------------------
create policy factures_select on factures_achat for select
  using (auth.uid() is not null);
create policy factures_insert on factures_achat for insert
  with check (auth.uid() is not null);
create policy factures_update on factures_achat for update
  using (peut_voir_ca()) with check (peut_voir_ca());
create policy factures_delete on factures_achat for delete
  using (peut_voir_ca());

-- ----------------------------------------------------------------------------
-- COMMANDES — lecture tous (réception), création/suppression bureau/admin,
--             mise à jour tous (statut / quantite_recue à la réception)
-- ----------------------------------------------------------------------------
create policy commandes_select on commandes for select
  using (auth.uid() is not null);
create policy commandes_insert on commandes for insert
  with check (peut_voir_ca());
create policy commandes_update on commandes for update
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy commandes_delete on commandes for delete
  using (peut_voir_ca());

create policy cmdlignes_select on commande_lignes for select
  using (auth.uid() is not null);
create policy cmdlignes_insert on commande_lignes for insert
  with check (peut_voir_ca());
create policy cmdlignes_update on commande_lignes for update
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy cmdlignes_delete on commande_lignes for delete
  using (peut_voir_ca());

-- ----------------------------------------------------------------------------
-- CLIENTS / CHANTIERS — lecture tous, écriture bureau/admin
-- ----------------------------------------------------------------------------
create policy clients_select on clients for select
  using (auth.uid() is not null);
create policy clients_write on clients for all
  using (peut_voir_ca()) with check (peut_voir_ca());

create policy chantiers_select on chantiers for select
  using (auth.uid() is not null);
create policy chantiers_write on chantiers for all
  using (peut_voir_ca()) with check (peut_voir_ca());

-- ----------------------------------------------------------------------------
-- RÉSERVATIONS / BONS DE SORTIE / SÉRIES / RETOURS — opérationnel + autres
-- ----------------------------------------------------------------------------
create policy resa_select on reservations for select using (auth.uid() is not null);
create policy resa_write  on reservations for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy bons_select on bons_de_sortie for select using (auth.uid() is not null);
create policy bons_write  on bons_de_sortie for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy series_select on numeros_serie for select using (auth.uid() is not null);
create policy series_write  on numeros_serie for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy retours_select on retours for select using (auth.uid() is not null);
create policy retours_write  on retours for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ----------------------------------------------------------------------------
-- MOUVEMENTS DE STOCK — lecture tous, insertion tous, maj/suppression admin
-- ----------------------------------------------------------------------------
create policy mouv_select on mouvements_stock for select
  using (auth.uid() is not null);
create policy mouv_insert on mouvements_stock for insert
  with check (auth.uid() is not null);
create policy mouv_update on mouvements_stock for update
  using (est_admin()) with check (est_admin());
create policy mouv_delete on mouvements_stock for delete
  using (est_admin());


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 0004_seed.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- M2B ENERGY — Migration 0004 : données de démonstration (seed)
-- =============================================================================
-- À exécuter APRÈS avoir créé au moins un compte admin. Les mouvements de stock
-- sont attribués au premier admin trouvé (utilisateur_id) s'il existe.
-- Idempotent sur les clés naturelles (référence / nom).
-- =============================================================================

-- ---- Fournisseurs ----------------------------------------------------------
insert into fournisseurs (nom, email, telephone, delai_livraison_jours, notes) values
  ('LG Belgium',    'commande@lg.be',        '+32 2 111 22 33', 10, 'Fournisseur principal PAC / splits'),
  ('Clim Distri',   'ventes@climdistri.be',  '+32 2 444 55 66', 5,  'Distributeur multi-marques, rapide'),
  ('PVC Wholesale', 'info@pvcwholesale.be',  '+32 2 777 88 99', 14, 'Menuiserie PVC')
on conflict do nothing;

-- ---- Articles --------------------------------------------------------------
insert into articles (reference, designation, categorie, unite, serialise, seuil_manuel) values
  ('PAC-TV-R290-9',   'PAC LG Therma V R290 9 kW',    'pac',        'pièce',    true,  2),
  ('PAC-TV-R290-12',  'PAC LG Therma V R290 12 kW',   'pac',        'pièce',    true,  2),
  ('PAC-TV-R290-16',  'PAC LG Therma V R290 16 kW',   'pac',        'pièce',    true,  1),
  ('SPL-LG-12000',    'Split LG 12000 BTU',           'split',      'pièce',    true,  3),
  ('FEN-PVC-100120',  'Fenêtre PVC 100x120',          'fenetre',    'pièce',    false, 5),
  ('POR-INT-STD',     'Porte intérieure standard',    'porte',      'pièce',    false, 4),
  ('KIT-HYDRO',       'Kit hydraulique PAC',          'accessoire', 'pièce',    false, 3),
  ('LIA-FRIGO-5M',    'Liaison frigorifique 5 m',     'accessoire', 'pièce',    false, 6),
  ('ACC-SUPPORT',     'Support mural anti-vibration', 'accessoire', 'pièce',    false, 8),
  ('SYS-PAC-12',      'Système PAC 12 kW (complet)',  'pac',        'ensemble', false, 0)
on conflict (reference) do nothing;

-- ---- Composition du "Système PAC 12 kW" ------------------------------------
insert into compositions (article_fini_id)
select id from articles where reference = 'SYS-PAC-12'
on conflict (article_fini_id) do nothing;

insert into composition_lignes (composition_id, article_composant_id, quantite)
select c.id, a.id, v.q
from compositions c
join articles fini on fini.id = c.article_fini_id and fini.reference = 'SYS-PAC-12'
join (values
  ('PAC-TV-R290-12', 1),
  ('KIT-HYDRO',      1),
  ('LIA-FRIGO-5M',   1),
  ('ACC-SUPPORT',    2)
) as v(ref, q) on true
join articles a on a.reference = v.ref
where not exists (
  select 1 from composition_lignes cl
  where cl.composition_id = c.id and cl.article_composant_id = a.id
);

-- ---- Prix fournisseur (historique / meilleur prix / réassort) --------------
insert into prix_fournisseur (article_id, fournisseur_id, prix, date)
select a.id, f.id, v.prix, v.d::date
from (values
  ('PAC-TV-R290-12', 'LG Belgium',    3450, '2026-01-15'),
  ('PAC-TV-R290-12', 'Clim Distri',   3590, '2026-02-01'),
  ('PAC-TV-R290-9',  'LG Belgium',    2980, '2026-01-15'),
  ('PAC-TV-R290-16', 'LG Belgium',    4120, '2026-01-15'),
  ('SPL-LG-12000',   'LG Belgium',     620, '2026-01-20'),
  ('SPL-LG-12000',   'Clim Distri',    599, '2026-02-10'),
  ('FEN-PVC-100120', 'PVC Wholesale',  245, '2026-01-10'),
  ('POR-INT-STD',    'PVC Wholesale',  135, '2026-01-10'),
  ('KIT-HYDRO',      'LG Belgium',     380, '2026-01-15'),
  ('KIT-HYDRO',      'Clim Distri',    360, '2026-02-05'),
  ('LIA-FRIGO-5M',   'Clim Distri',     85, '2026-02-05'),
  ('ACC-SUPPORT',    'Clim Distri',     22, '2026-02-05')
) as v(ref, fnom, prix, d)
join articles a on a.reference = v.ref
join fournisseurs f on f.nom = v.fnom
where not exists (
  select 1 from prix_fournisseur pf
  where pf.article_id = a.id and pf.fournisseur_id = f.id and pf.date = v.d::date
);

-- ---- Client & chantier -----------------------------------------------------
insert into clients (nom, adresse, contact, notes) values
  ('Résidence Les Tilleuls', 'Rue des Tilleuls 12, 1400 Nivelles', 'M. Dubois — 0475 12 34 56', 'Copropriété, 3 logements')
on conflict do nothing;

insert into chantiers (client_id, libelle, date_prevue, statut, ca, cout_sous_traitance)
select c.id, 'CH-2026-001 — Installation PAC bâtiment A', '2026-08-15', 'en_cours', 12500, 2800
from clients c
where c.nom = 'Résidence Les Tilleuls'
  and not exists (select 1 from chantiers ch where ch.libelle like 'CH-2026-001%');

-- ---- Facture d'achat + stock initial (réception démo) ----------------------
insert into factures_achat (numero, fournisseur_id, date)
select 'FA-2026-0001', f.id, '2026-02-12'
from fournisseurs f where f.nom = 'LG Belgium'
  and not exists (select 1 from factures_achat fa where fa.numero = 'FA-2026-0001');

-- Réception d'articles non sérialisés -> mouvements d'entrée (avec COGS)
insert into mouvements_stock (article_id, type, quantite, date, facture_achat_id, prix_achat, motif, utilisateur_id)
select a.id, 'reception', v.q, '2026-02-12', fa.id, v.prix, 'Réception initiale (démo)',
       (select id from profils where role = 'admin' order by cree_le limit 1)
from (values
  ('FEN-PVC-100120', 8, 245),
  ('POR-INT-STD',    6, 135),
  ('KIT-HYDRO',      5, 360),
  ('LIA-FRIGO-5M',  10,  85),
  ('ACC-SUPPORT',   20,  22)
) as v(ref, q, prix)
join articles a on a.reference = v.ref
join factures_achat fa on fa.numero = 'FA-2026-0001'
where not exists (
  select 1 from mouvements_stock m
  where m.article_id = a.id and m.motif = 'Réception initiale (démo)'
);

-- Réception d'articles sérialisés (PAC / splits) : séries + mouvements
with fa as (select id from factures_achat where numero = 'FA-2026-0001'),
     ins as (
  insert into numeros_serie (article_id, numero_serie, facture_achat_id, statut, date_entree)
  select a.id, v.ns, (select id from fa), 'en_stock', '2026-02-12'
  from (values
    ('PAC-TV-R290-12', 'LG-TV12-0001'),
    ('PAC-TV-R290-12', 'LG-TV12-0002'),
    ('PAC-TV-R290-9',  'LG-TV09-0001'),
    ('SPL-LG-12000',   'LG-SPL-0001'),
    ('SPL-LG-12000',   'LG-SPL-0002'),
    ('SPL-LG-12000',   'LG-SPL-0003')
  ) as v(ref, ns)
  join articles a on a.reference = v.ref
  where not exists (
    select 1 from numeros_serie n where n.numero_serie = v.ns
  )
  returning id, article_id, facture_achat_id
)
insert into mouvements_stock (article_id, type, quantite, date, facture_achat_id, numero_serie_id, prix_achat, motif, utilisateur_id)
select ins.article_id, 'reception', 1, '2026-02-12', ins.facture_achat_id, ins.id,
       coalesce((select prix from prix_fournisseur pf where pf.article_id = ins.article_id order by pf.date desc limit 1), 0),
       'Réception initiale (démo)',
       (select id from profils where role = 'admin' order by cree_le limit 1)
from ins;

-- ---- Réservation démo (montre le stock prévisionnel) -----------------------
insert into reservations (chantier_id, article_id, quantite, date_prevue, statut)
select ch.id, a.id, 1, '2026-08-10', 'reserve'
from chantiers ch, articles a
where ch.libelle like 'CH-2026-001%'
  and a.reference = 'PAC-TV-R290-12'
  and not exists (
    select 1 from reservations r where r.chantier_id = ch.id and r.article_id = a.id
  );


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 0005_alignement_2roles.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- M2B ENERGY — Migration 0005 : alignement sur la spécification consolidée
--   * Passage à 2 rôles : admin / collaborateur
--   * Financier réservé à l'Admin (fonctions de rôle simplifiées)
--   * Premier utilisateur inscrit = Admin
--   * articles.compose (produits finis non stockés)
--   * Nouvelle table besoins_appro (onglet « À commander »)
--   * Mise à jour des policies RLS pour l'accès opérationnel du collaborateur
-- Ce script s'applique sur une base déjà initialisée (0001→0004) ET se concatène
-- proprement à la fin de schema_complet.sql pour les nouvelles installations.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Articles : colonne compose (produit fini défini par nomenclature)
-- ----------------------------------------------------------------------------
alter table articles add column if not exists compose boolean not null default false;
update articles set compose = true where reference = 'SYS-PAC-12';

-- ----------------------------------------------------------------------------
-- 2. Rôles : passage à 2 valeurs (admin / collaborateur)
--    On convertit la colonne en text + contrainte (évite les écueils enum).
-- ----------------------------------------------------------------------------
alter table profils alter column role drop default;
alter table profils alter column role type text using role::text;
update profils set role = 'collaborateur' where role <> 'admin';
alter table profils alter column role set default 'collaborateur';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profils_role_chk') then
    alter table profils add constraint profils_role_chk check (role in ('admin','collaborateur'));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Fonctions de rôle : tout le financier = Admin uniquement
-- ----------------------------------------------------------------------------
drop function if exists mon_role();
create or replace function mon_role()
  returns text language sql stable security definer set search_path = public
  as $$ select role from profils where id = auth.uid() $$;

create or replace function est_admin()
  returns boolean language sql stable security definer set search_path = public
  as $$ select coalesce((select role = 'admin' from profils where id = auth.uid()), false) $$;

create or replace function peut_voir_ca()
  returns boolean language sql stable security definer set search_path = public
  as $$ select est_admin() $$;

create or replace function peut_voir_prix()
  returns boolean language sql stable security definer set search_path = public
  as $$ select est_admin() $$;

create or replace function peut_voir_marge()
  returns boolean language sql stable security definer set search_path = public
  as $$ select est_admin() $$;

-- ----------------------------------------------------------------------------
-- 4. Premier utilisateur inscrit = Admin (sinon collaborateur)
-- ----------------------------------------------------------------------------
create or replace function handle_new_user()
  returns trigger language plpgsql security definer set search_path = public
as $$
declare v_role text; v_count int;
begin
  select count(*) into v_count from public.profils;
  if v_count = 0 then
    v_role := 'admin';
  else
    v_role := coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'collaborateur');
    if v_role not in ('admin','collaborateur') then v_role := 'collaborateur'; end if;
  end if;
  insert into public.profils (id, nom, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'nom', ''), v_role)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Table besoins_appro (onglet « À commander » : planning → achats)
-- ----------------------------------------------------------------------------
create table if not exists besoins_appro (
  id          uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references chantiers(id) on delete cascade,
  article_id  uuid not null references articles(id) on delete restrict,
  quantite    numeric not null check (quantite > 0),
  date_besoin date not null default current_date,
  statut      text not null default 'a_commander' check (statut in ('a_commander','commande','recu')),
  commande_id uuid references commandes(id) on delete set null,
  cree_par    uuid references profils(id) on delete set null,
  notes       text,
  cree_le     timestamptz not null default now()
);
create index if not exists idx_besoins_statut on besoins_appro (statut);
create index if not exists idx_besoins_chantier on besoins_appro (chantier_id);

alter table besoins_appro enable row level security;
drop policy if exists besoins_select on besoins_appro;
drop policy if exists besoins_write on besoins_appro;
create policy besoins_select on besoins_appro for select using (auth.uid() is not null);
create policy besoins_write  on besoins_appro for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ----------------------------------------------------------------------------
-- 6. Policies RLS : le collaborateur gère l'opérationnel
--    (catalogue, clients/chantiers, commandes) sans le financier.
--    Les tables/vues purement financières restent gardées par est_admin()
--    via peut_voir_prix()/peut_voir_marge() (donc admin uniquement désormais).
-- ----------------------------------------------------------------------------
drop policy if exists articles_write on articles;
drop policy if exists compositions_write on compositions;
drop policy if exists complignes_write on composition_lignes;
drop policy if exists clients_write on clients;
drop policy if exists chantiers_write on chantiers;
drop policy if exists commandes_insert on commandes;
drop policy if exists commandes_delete on commandes;
drop policy if exists cmdlignes_insert on commande_lignes;
drop policy if exists cmdlignes_delete on commande_lignes;

create policy articles_write on articles for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy compositions_write on compositions for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy complignes_write on composition_lignes for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy clients_write on clients for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy chantiers_write on chantiers for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy commandes_insert on commandes for insert
  with check (auth.uid() is not null);
create policy commandes_delete on commandes for delete
  using (auth.uid() is not null);
create policy cmdlignes_insert on commande_lignes for insert
  with check (auth.uid() is not null);
create policy cmdlignes_delete on commande_lignes for delete
  using (auth.uid() is not null);

-- ----------------------------------------------------------------------------
-- 7. Seed de démonstration pour « À commander » (idempotent)
-- ----------------------------------------------------------------------------
insert into besoins_appro (chantier_id, article_id, quantite, date_besoin, statut, notes)
select ch.id, a.id, 3, '2026-08-20', 'a_commander', 'Besoin démo (planning)'
from chantiers ch, articles a
where ch.libelle like 'CH-2026-001%' and a.reference = 'SPL-LG-12000'
  and not exists (select 1 from besoins_appro b where b.chantier_id = ch.id and b.article_id = a.id);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 0006_prix_categories_historique.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- M2B ENERGY — Migration 0006 : prix depuis les commandes, catégories fermées,
--   statut chantier (planifié/réalisé), relance sous-traitance, historique.
-- S'applique sur une base déjà migrée (→0005) et se concatène à schema_complet.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Catégories fermées (5 valeurs) — remappe uniquement les anciennes valeurs
-- ----------------------------------------------------------------------------
update articles set categorie = case categorie
    when 'pac' then 'R/R Ext'
    when 'split' then 'R/R Int'
    when 'fenetre' then 'BT'
    when 'porte' then 'BT'
    when 'accessoire' then 'Accessoires'
    else categorie end
  where categorie in ('pac','split','fenetre','porte','accessoire');

alter table articles alter column categorie set default 'Accessoires';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'articles_categorie_chk') then
    alter table articles add constraint articles_categorie_chk
      check (categorie in ('R/R Ext','R/R Int','R/O','BT','Accessoires'));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Chantier : statut planifie / realise + coût sous-traitance nullable
-- ----------------------------------------------------------------------------
update chantiers set statut = case statut
    when 'en_cours' then 'planifie'
    when 'termine' then 'realise'
    when 'annule' then 'planifie'
    else statut end
  where statut in ('en_cours','termine','annule');
alter table chantiers alter column statut set default 'planifie';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chantiers_statut_chk') then
    alter table chantiers add constraint chantiers_statut_chk check (statut in ('planifie','realise'));
  end if;
end $$;

-- coût sous-traitance : null = « non saisi » (déclenche la relance)
alter table chantiers alter column cout_sous_traitance drop not null;
alter table chantiers alter column cout_sous_traitance set default null;
update chantiers set cout_sous_traitance = null where cout_sous_traitance = 0;

-- ----------------------------------------------------------------------------
-- 3. Prix fournisseurs = commandes réellement passées (plus prix_fournisseur)
-- ----------------------------------------------------------------------------
-- Dernier prix d'achat connu par article = dernière ligne de commande (non annulée)
create or replace view vue_dernier_prix
with (security_invoker = on) as
select distinct on (cl.article_id)
       cl.article_id,
       cl.prix_unitaire as dernier_prix,
       c.fournisseur_id,
       c.date_commande as date
from commande_lignes cl
join commandes c on c.id = cl.commande_id
where c.statut <> 'annulee' and cl.prix_unitaire > 0
order by cl.article_id, c.date_commande desc, cl.id desc;

-- Réassort : par fournisseur, dernier prix commandé, trié du - cher au + cher
create or replace view vue_reassort
with (security_invoker = on) as
with dernier as (
  select distinct on (cl.article_id, c.fournisseur_id)
         cl.article_id, c.fournisseur_id, cl.prix_unitaire as prix, c.date_commande as date
  from commande_lignes cl
  join commandes c on c.id = cl.commande_id
  where c.statut <> 'annulee' and cl.prix_unitaire > 0
  order by cl.article_id, c.fournisseur_id, c.date_commande desc, cl.id desc
)
select d.article_id,
       d.fournisseur_id,
       f.nom as fournisseur_nom,
       d.prix,
       f.delai_livraison_jours,
       d.date as date_prix,
       row_number() over (partition by d.article_id order by d.prix asc, f.delai_livraison_jours asc) as rang
from dernier d
join fournisseurs f on f.id = d.fournisseur_id;

-- ----------------------------------------------------------------------------
-- 4. Vues de marge : coût sous-traitance en coalesce (car nullable désormais)
-- ----------------------------------------------------------------------------
create or replace view vue_marge_chantier as
select
  ch.id as chantier_id, ch.client_id, ch.libelle, ch.ca,
  coalesce(ch.cout_sous_traitance, 0) as cout_sous_traitance,
  coalesce(mat.cout, 0) as cout_materiel,
  (ch.ca - coalesce(mat.cout, 0) - coalesce(ch.cout_sous_traitance, 0)) as marge,
  case when ch.ca > 0
       then round((ch.ca - coalesce(mat.cout, 0) - coalesce(ch.cout_sous_traitance, 0)) / ch.ca * 100, 1)
       else null end as marge_pct
from chantiers ch
left join (
  select m.chantier_id, sum(-m.quantite * coalesce(m.prix_achat, 0)) as cout
  from mouvements_stock m
  where m.chantier_id is not null and m.type in ('sortie', 'retour_chantier')
  group by m.chantier_id
) mat on mat.chantier_id = ch.id
where peut_voir_marge();

create or replace view vue_marge_client as
select
  c.id as client_id, c.nom,
  coalesce(sum(ch.ca), 0) as ca,
  coalesce(sum(mat.cout), 0) as cout_materiel,
  coalesce(sum(ch.cout_sous_traitance), 0) as cout_sous_traitance,
  coalesce(sum(ch.ca), 0) - coalesce(sum(mat.cout), 0) - coalesce(sum(ch.cout_sous_traitance), 0) as marge,
  case when coalesce(sum(ch.ca), 0) > 0
       then round((coalesce(sum(ch.ca),0) - coalesce(sum(mat.cout),0) - coalesce(sum(ch.cout_sous_traitance),0))
                  / sum(ch.ca) * 100, 1)
       else null end as marge_pct
from clients c
left join chantiers ch on ch.client_id = c.id
left join (
  select m.chantier_id, sum(-m.quantite * coalesce(m.prix_achat, 0)) as cout
  from mouvements_stock m
  where m.chantier_id is not null and m.type in ('sortie', 'retour_chantier')
  group by m.chantier_id
) mat on mat.chantier_id = ch.id
where peut_voir_marge()
group by c.id, c.nom;

-- ----------------------------------------------------------------------------
-- 5. Seed : commandes passées (source de l'historique des prix / réassort)
--    Deux fournisseurs sur certains articles pour illustrer le meilleur prix.
-- ----------------------------------------------------------------------------
insert into commandes (numero, fournisseur_id, date_commande, date_livraison_prevue, statut, notes)
select 'CMD-2026-0001', f.id, '2026-01-15', '2026-01-25', 'livree', 'Commande démo (prix)'
from fournisseurs f where f.nom = 'LG Belgium'
  and not exists (select 1 from commandes where numero = 'CMD-2026-0001');

insert into commandes (numero, fournisseur_id, date_commande, date_livraison_prevue, statut, notes)
select 'CMD-2026-0002', f.id, '2026-02-05', '2026-02-12', 'livree', 'Commande démo (prix)'
from fournisseurs f where f.nom = 'Clim Distri'
  and not exists (select 1 from commandes where numero = 'CMD-2026-0002');

insert into commande_lignes (commande_id, article_id, quantite, prix_unitaire, quantite_recue)
select cmd.id, a.id, v.q, v.prix, v.q
from (values
  ('CMD-2026-0001', 'PAC-TV-R290-12', 2, 3450),
  ('CMD-2026-0001', 'KIT-HYDRO',      5,  380),
  ('CMD-2026-0001', 'SPL-LG-12000',   3,  620),
  ('CMD-2026-0002', 'KIT-HYDRO',      5,  360),
  ('CMD-2026-0002', 'SPL-LG-12000',   3,  599)
) as v(cmd_num, ref, q, prix)
join commandes cmd on cmd.numero = v.cmd_num
join articles a on a.reference = v.ref
where not exists (
  select 1 from commande_lignes cl
  where cl.commande_id = cmd.id and cl.article_id = a.id
);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 0007_chantier_lignes_variantes.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- M2B ENERGY — Migration 0007 : le chantier porte sa composition,
--   variantes de nomenclature, état de préparation, index de performance.
-- Idempotente ; s'applique sur une base déjà migrée (→0006) et se concatène
-- à schema_complet.sql. Contient tout le schéma de cette évolution.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Variantes de composition (plusieurs nomenclatures nommées par produit)
-- ----------------------------------------------------------------------------
alter table compositions add column if not exists nom_variante text not null default 'Standard';
-- Retire l'ancienne unicité (une seule composition par produit fini)
alter table compositions drop constraint if exists compositions_article_fini_id_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'compositions_fini_variante_key') then
    alter table compositions add constraint compositions_fini_variante_key unique (article_fini_id, nom_variante);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Le chantier porte sa composition : lignes de matériel à poser
-- ----------------------------------------------------------------------------
create table if not exists chantier_lignes (
  id             uuid primary key default gen_random_uuid(),
  chantier_id    uuid not null references chantiers(id) on delete cascade,
  article_id     uuid not null references articles(id) on delete restrict,
  composition_id uuid references compositions(id) on delete set null,  -- variante choisie (produit composé)
  quantite       numeric not null default 1 check (quantite > 0),
  cree_le        timestamptz not null default now()
);
create index if not exists idx_chantier_lignes_chantier on chantier_lignes (chantier_id);

alter table chantier_lignes enable row level security;
drop policy if exists chlignes_select on chantier_lignes;
drop policy if exists chlignes_write on chantier_lignes;
create policy chlignes_select on chantier_lignes for select using (auth.uid() is not null);
create policy chlignes_write  on chantier_lignes for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ----------------------------------------------------------------------------
-- 3. État de préparation du chantier (module « À préparer »)
-- ----------------------------------------------------------------------------
alter table chantiers add column if not exists prepare_le timestamptz;

-- Tracer la variante sur la réservation (facultatif mais utile)
alter table reservations add column if not exists composition_id uuid references compositions(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 4. Index de performance
-- ----------------------------------------------------------------------------
create index if not exists idx_chantiers_date_prevue on chantiers (date_prevue);
create index if not exists idx_chantiers_statut on chantiers (statut);
create index if not exists idx_besoins_commande on besoins_appro (commande_id);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 0008_seed_composition_variante.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- M2B ENERGY — Migration 0008 : nomenclature de démonstration (variante)
--   Seede une composition complète « Variante A » pour SYS-PAC-12 afin que la
--   décomposition des produits composés et le choix de variante soient testables.
--   Idempotent.
-- =============================================================================

-- Composant manquant : vase d'expansion
insert into articles (reference, designation, categorie, unite, serialise, compose, seuil_manuel)
values ('ACC-VASE', 'Vase d''expansion 8 L', 'Accessoires', 'pièce', false, false, 4)
on conflict (reference) do nothing;

-- Composition « Variante A » du Système PAC 12 kW
insert into compositions (article_fini_id, nom_variante)
select a.id, 'Variante A'
from articles a
where a.reference = 'SYS-PAC-12'
  and not exists (
    select 1 from compositions c where c.article_fini_id = a.id and c.nom_variante = 'Variante A'
  );

insert into composition_lignes (composition_id, article_composant_id, quantite)
select comp.id, ac.id, v.q
from compositions comp
join articles fini on fini.id = comp.article_fini_id
  and fini.reference = 'SYS-PAC-12' and comp.nom_variante = 'Variante A'
join (values
  ('PAC-TV-R290-12', 1),
  ('KIT-HYDRO',      1),
  ('LIA-FRIGO-5M',   1),
  ('ACC-SUPPORT',    1),
  ('ACC-VASE',       1)
) as v(ref, q) on true
join articles ac on ac.reference = v.ref
where not exists (
  select 1 from composition_lignes cl
  where cl.composition_id = comp.id and cl.article_composant_id = ac.id
);


