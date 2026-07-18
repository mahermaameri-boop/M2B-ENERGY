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
