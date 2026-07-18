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
