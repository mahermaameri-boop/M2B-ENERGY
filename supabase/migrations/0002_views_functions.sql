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
