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
3. **Catalogue & compositions** — articles et nomenclatures (BOM) des produits finis.
4. **Commandes** — commandes fournisseurs multi-produits + **décomposition d'un produit fini** (ne commander que ce qui manque).
5. **Réceptions** — réception totale/partielle (facture d'achat + n° de série au scan) et **entrée manuelle**.
6. **Fournisseurs & prix** — fiches, historique des prix, **meilleur prix** et **ordre d'appel au réassort**.
7. **Sorties & bons de sortie** — réservations (prévisionnel) + sorties avec **bon de sortie PDF + QR code**.
8. **Retours** — 3 types : chantier (réintégration), défectueux/SAV (garantie), annulation de commande (avoir).
9. **Clients & CA** — clients, chantiers, saisie du chiffre d'affaires et de la sous-traitance.
10. **Marges (admin)** — marge par chantier et par client.
11. **Traçabilité SAV** — historique complet d'un n° de série (article ↔ client ↔ fournisseur ↔ facture).
12. **Rôles & accès (admin)** — invitations et gestion des rôles.

---

## 3. Rôles & permissions

| Rôle          | Accès |
|---------------|-------|
| **admin**         | Tout, **y compris les marges et le CA**. Gère les comptes/rôles. (Plusieurs admins possibles.) |
| **operationnel**  | Stock, réceptions, sorties + bons, retours, traçabilité. **Ne voit ni CA ni marges** (« version sans argent »). |
| **bureau**        | Commandes, fournisseurs & prix d'achat, clients & **CA**. **Ne voit pas les marges**. |

Les permissions sont appliquées **à deux niveaux** :

- **RLS (base de données)** — policies PostgreSQL (`supabase/migrations/0003_rls.sql`).
  Les tables/vues sensibles sont protégées par des fonctions de rôle
  (`est_admin()`, `peut_voir_ca()`, `peut_voir_prix()`, `peut_voir_marge()`) :
  `prix_fournisseur`, `vue_dernier_prix`, `vue_reassort`, `vue_marge_chantier`,
  `vue_marge_client` ne renvoient rien aux rôles non autorisés.
- **Interface** — onglets masqués et colonnes monétaires non requêtées selon le rôle.

> **Note d'implémentation.** PostgREST n'expose qu'un seul rôle SQL (`authenticated`)
> pour tous les utilisateurs connectés ; la confidentialité *au niveau colonne* de
> quelques champs monétaires partagés (`commande_lignes.prix_unitaire`,
> `chantiers.ca`, `mouvements_stock.prix_achat`) est donc assurée par la couche
> applicative (les Server Components ne sélectionnent pas ces colonnes pour un rôle
> non autorisé), tandis que les données purement monétaires (prix fournisseur, vues
> de marge) sont isolées au niveau ligne par RLS. Un durcissement colonne par colonne
> est prévu en Étape 2.

---

## 4. Modèle de données

Migrations SQL dans `supabase/migrations/` :

| Fichier | Contenu |
|---------|---------|
| `0001_schema.sql`         | Types, tables, index |
| `0002_views_functions.sql`| Fonctions de rôle, vues métier, calculs (stock, prévisionnel, réassort, marges) |
| `0003_rls.sql`            | Row Level Security + création automatique du profil à l'inscription |
| `0004_seed.sql`           | Données de démonstration |

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

Les nouveaux comptes reçoivent par défaut le rôle **operationnel**. Pour le tout premier
administrateur :

1. **Supabase → Authentication → Users → Add user** : créez un utilisateur
   (e-mail + mot de passe, « Auto Confirm User » coché).
2. **Supabase → SQL Editor**, promouvez-le admin :
   ```sql
   update profils set role = 'admin'
   where id = (select id from auth.users where email = 'votre.email@m2benergy.be');
   ```
3. Connectez-vous à l'application. Vous pouvez ensuite **inviter les collaborateurs**
   et gérer leurs rôles depuis l'onglet **Rôles & accès**.

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
