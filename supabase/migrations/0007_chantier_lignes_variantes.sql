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
