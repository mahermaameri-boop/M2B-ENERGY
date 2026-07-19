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
