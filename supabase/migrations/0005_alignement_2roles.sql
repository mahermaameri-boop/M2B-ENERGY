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
