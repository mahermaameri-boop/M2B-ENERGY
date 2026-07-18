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
