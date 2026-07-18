# M2B ENERGY — Outil opérationnel interne

Application web interne de **gestion de stock, achats, traçabilité et suivi de marge**
pour M2B ENERGY (Belgique). Interface entièrement en français, montants en euros
(format `fr-BE`), dates au format `jj/mm/aaaa`.

> **État : Étape 1 (socle fonctionnel) livrée.** Voir la section « Feuille de route »
> pour le contenu de l'Étape 2.

---

## 1. Stack technique

| Couche        | Technologie |
|---------------|-------------|
| Frontend      | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Backend / BDD | Supabase (PostgreSQL + Auth + Row Level Security) |
| PDF           | `@react-pdf/renderer` + `qrcode` (bons de sortie avec QR code) |
| Déploiement   | Vercel (front) + projet Supabase (base) |

---

## 2. Modules (navigation par onglets, adaptée au rôle)

1. **Tableau de bord** — synthèse CA / marge / alertes stock (version « sans argent » pour l'opérationnel).
2. **Stock** — stock actuel, valorisation, **prévisionnel avec sélecteur de date**, états OK / Bas / Rupture.
3. **Catalogue & compositions** — articles (dont produits **composés** non stockés) et nomenclatures (BOM).
4. **À commander** — passerelle **planning → achats** : encodage des besoins (décomposition des produits composés + croisement stock), puis bouton vert **« Marquer comme commandé »** créant la commande des manquants.
5. **Commandes** — commandes fournisseurs multi-produits + **décomposition d'un produit fini** (montants masqués pour le collaborateur).
6. **Réceptions** — « à réceptionner » **et** « réceptionnées / passées » ; réception (facture + n° de série au scan, focus auto) et **entrée manuelle**.
7. **Fournisseurs & prix (admin)** — fiches, historique des prix, **meilleur prix** et **ordre d'appel au réassort**.
8. **Sorties & bons de sortie** — réservations (prévisionnel) + sorties avec **bon de sortie PDF + QR code** ; **création client/chantier inline**.
9. **Retours** — 3 types : chantier (réintégration), défectueux/SAV (garantie), annulation de commande (avoir).
10. **Clients & chantiers** — clients, chantiers, saisie du CA et de la sous-traitance (masqués pour le collaborateur).
11. **Marges (admin)** — marge par chantier et par client.
12. **Traçabilité** — historique complet d'un n° de série (article ↔ client ↔ fournisseur ↔ facture).
13. **Rôles & accès (admin)** — invitations et gestion des 2 rôles.

---

## 3. Rôles & permissions (2 rôles)

| Rôle             | Accès |
|------------------|-------|
| **admin**         | Accès complet, **y compris tout le financier** (prix d'achat, valeur du stock, prix fournisseurs, CA, marges, avoirs). Gère les comptes. (Plusieurs admins possibles.) |
| **collaborateur** | Tout l'opérationnel (tableau de bord, stock en quantités, à commander, commandes, réceptions, sorties & bons, retours, clients & chantiers, traçabilité) **sans aucune donnée financière**. Pas d'accès aux modules Marges, Fournisseurs & prix, Rôles. |

**Règle unique :** tout champ monétaire (prix, valeur, montant, CA, marge, avoir) est
visible **uniquement par l'Admin**. Le collaborateur voit les mêmes écrans, champs
monétaires masqués. **Le premier compte inscrit devient automatiquement Admin** ; les
suivants sont Collaborateur par défaut.

Les permissions sont appliquées **côté serveur** (jamais uniquement dans l'UI) :

- **RLS (base de données)** — les tables/vues purement financières
  (`prix_fournisseur`, `vue_dernier_prix`, `vue_reassort`, `vue_marge_chantier`,
  `vue_marge_client`) sont gardées par les fonctions de rôle (`est_admin()`,
  `peut_voir_prix()`, `peut_voir_marge()`) → elles ne renvoient rien au collaborateur.
- **Logique serveur (API / Server Components)** — pour les colonnes monétaires
  présentes dans des tables opérationnelles partagées (`commande_lignes.prix_unitaire`,
  `chantiers.ca`, `chantiers.cout_sous_traitance`), ces colonnes ne sont **pas
  requêtées** pour un collaborateur (requêtes tenant compte du rôle), et les Server
  Actions n'écrivent jamais ces champs pour un non-Admin. Ce filtrage s'exécute sur le
  serveur, pas dans le navigateur.

> **Note.** PostgREST n'expose qu'un seul rôle SQL (`authenticated`) pour tous les
> utilisateurs connectés : la distinction Admin/Collaborateur passe donc par les
> fonctions de rôle (RLS) pour les données financières isolables par ligne, et par la
> couche serveur pour les colonnes monétaires des tables partagées. Un durcissement
> colonne par colonne (vues dédiées) reste possible en Étape 2.

---

## 4. Modèle de données

Migrations SQL dans `supabase/migrations/` :

| Fichier | Contenu |
|---------|---------|
| `0001_schema.sql`         | Types, tables, index |
| `0002_views_functions.sql`| Fonctions de rôle, vues métier, calculs (stock, prévisionnel, réassort, marges) |
| `0003_rls.sql`            | Row Level Security + création automatique du profil à l'inscription |
| `0004_seed.sql`           | Données de démonstration |
| `0005_alignement_2roles.sql` | Passage à 2 rôles, `articles.compose`, table `besoins_appro` (À commander), RLS ajustée |

Pour une **nouvelle installation**, exécutez simplement `supabase/schema_complet.sql`
(il regroupe 0001 → 0005). Pour **mettre à jour une base déjà installée** avec les
migrations 0001–0004, exécutez uniquement `0005_alignement_2roles.sql`.

**Principe clé :** le stock courant n'est jamais un champ modifiable. Il est **calculé
à partir du journal `mouvements_stock`** (source de vérité) via la vue `vue_stock_actuel`.

**Deux ajouts au modèle initial** (documentés ici, pour la fiabilité des calculs) :
- `mouvements_stock.chantier_id` — rattache directement une sortie/retour à un chantier
  (marge par chantier fiable).
- `mouvements_stock.prix_achat` — capture le **coût réel** de l'unité au moment du
  mouvement (COGS figé), pour que la marge reflète les « prix d'achat réels » même si
  les prix fournisseur évoluent ensuite.

### Règles de calcul principales

- **Stock actuel** = somme des `quantite` des mouvements de l'article.
- **Stock prévisionnel à une date D** = stock actuel + entrées attendues (reste à
  recevoir des commandes non annulées livrables ≤ D) − sorties réservées
  (réservations `reserve` prévues ≤ D). Fonction : `fn_stock_previsionnel(date)`.
  Les alertes (Bas/Rupture) se calculent sur le **prévisionnel**.
- **Réassort** = fournisseurs de l'article triés par dernier prix croissant (+ délai) ;
  drapeau si l'article est en rupture et que le moins cher a un délai > 7 j.
- **Marge par chantier** = `ca` − coût matériel (COGS des sorties du chantier, net des
  retours chantier) − `cout_sous_traitance`. Agrégée par client au tableau de bord.

---

## 5. Mise en route (local)

### Prérequis
- Node.js 20+
- Un projet Supabase (gratuit) : <https://supabase.com>

### a) Cloner et installer
```bash
npm install
```

### b) Créer le projet Supabase et charger le schéma
1. Créez un projet sur <https://supabase.com>.
2. Dans **SQL Editor**, exécutez **dans l'ordre** le contenu de :
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_views_functions.sql`
   - `supabase/migrations/0003_rls.sql`
   - `supabase/migrations/0004_seed.sql` *(données de démo — optionnel)*

   *(Alternative : `supabase db push` avec la CLI Supabase.)*

### c) Variables d'environnement
Copiez `.env.local.example` en `.env.local` et renseignez (Supabase → Project Settings → API) :
```
NEXT_PUBLIC_SUPABASE_URL=...        # URL du projet
NEXT_PUBLIC_SUPABASE_ANON_KEY=...   # clé anon public
SUPABASE_SERVICE_ROLE_KEY=...       # clé service_role (SECRÈTE — serveur uniquement)
```

### d) Lancer
```bash
npm run dev
```
Ouvrez <http://localhost:3000>.

---

## 6. Créer le premier compte admin

**Le tout premier compte inscrit devient automatiquement Admin** (les suivants sont
Collaborateur par défaut).

1. **Supabase → Authentication → Users → Add user** : créez le premier utilisateur
   (e-mail + mot de passe, « Auto Confirm User » coché). Il sera Admin.
2. Connectez-vous, puis **invitez les collaborateurs** et gérez leurs rôles depuis
   l'onglet **Rôles & accès**.

Pour passer manuellement un compte en Admin (ex. deuxième administrateur) :
```sql
update profils set role = 'admin'
where id = (select id from auth.users where email = 'autre.admin@m2benergy.be');
```

> L'invitation de collaborateurs (onglet **Rôles & accès**) nécessite que
> `SUPABASE_SERVICE_ROLE_KEY` soit configurée. Le collaborateur reçoit un e-mail avec
> un lien pour définir son mot de passe ; son rôle est appliqué à la création du compte.

---

## 7. Déploiement en ligne (Vercel)

1. Poussez le dépôt sur GitHub.
2. Sur <https://vercel.com>, importez le dépôt (framework détecté : Next.js).
3. Renseignez les 3 variables d'environnement (mêmes valeurs que `.env.local`).
4. Déployez. Ajoutez l'URL Vercel dans **Supabase → Authentication → URL Configuration**
   (Site URL + Redirect URLs) pour que les e-mails d'invitation pointent au bon endroit.

---

## 8. Test rapide avec les données de démo

Après le seed, vous disposez de : 3 fournisseurs, ~10 articles (dont PAC LG Therma V,
Split LG, fenêtre PVC, porte…), une composition « Système PAC 12 kW », des prix
d'achat, du stock initial (avec n° de série), un client et un chantier avec CA.

Parcours conseillé : **Stock** (changez la date du prévisionnel) → **Commandes**
(nouvelle commande, testez « Décomposer » sur le système PAC) → **Réceptions**
(scannez des n° de série) → **Sorties** (générez un bon de sortie PDF) →
**Traçabilité** (cherchez un n° de série) → **Marges** (en admin).

---

## 9. Feuille de route — Étape 2

- Seuils de stock **conseillés automatiquement** (consommation moyenne × délai × 1,3).
- Drapeau prix/délai enrichi au réassort.
- Export / sauvegarde des données.
- Durcissement colonne par colonne des champs monétaires (vues dédiées par rôle).
- Améliorations UX / impression et ajustements après tests.

---

## 10. Structure du projet

```
supabase/migrations/     # schéma SQL, vues, RLS, seed
src/
  app/
    login/               # page de connexion
    (app)/               # application (protégée) : un dossier par module
      tableau-de-bord/  stock/  catalogue/  commandes/  receptions/
      fournisseurs/  sorties/  retours/  clients/  marges/
      tracabilite/  acces/
    api/bon-de-sortie/[id]/   # génération du PDF (bon de sortie + QR)
  components/            # UI partagée (nav, cartes, scan série, sélecteur date)
  lib/                   # supabase (client/serveur/admin), auth, formats, types
middleware.ts            # rafraîchissement de session + protection des routes
```
