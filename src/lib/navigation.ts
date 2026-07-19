import type { Role } from "@/lib/types";

const TOUS: Role[] = ["admin", "collaborateur"];
const ADMIN: Role[] = ["admin"];

export interface SousOngletDef { href: string; libelle: string; roles: Role[] }
export interface UniversDef { cle: string; libelle: string; onglets: SousOngletDef[] }

// 7 univers ; chaque univers regroupe des sous-onglets (modules).
export const UNIVERS: UniversDef[] = [
  {
    cle: "tableau", libelle: "Tableau de bord",
    onglets: [{ href: "/tableau-de-bord", libelle: "Tableau de bord", roles: TOUS }],
  },
  {
    cle: "chantiers", libelle: "Chantiers",
    onglets: [
      { href: "/chantiers", libelle: "Chantiers", roles: TOUS },
      { href: "/planning", libelle: "Planning", roles: TOUS },
      { href: "/clients", libelle: "Clients", roles: TOUS },
    ],
  },
  {
    cle: "achats", libelle: "Achats",
    onglets: [
      { href: "/a-commander", libelle: "À commander", roles: TOUS },
      { href: "/commandes", libelle: "Commandes", roles: TOUS },
      { href: "/receptions", libelle: "Réceptions", roles: TOUS },
      { href: "/fournisseurs", libelle: "Fournisseurs & prix", roles: ADMIN },
    ],
  },
  {
    cle: "atelier", libelle: "Atelier & stock",
    onglets: [
      { href: "/stock", libelle: "Stock", roles: TOUS },
      { href: "/a-preparer", libelle: "À préparer", roles: TOUS },
      { href: "/sorties", libelle: "Sorties", roles: TOUS },
    ],
  },
  {
    cle: "marges", libelle: "Marges & historique",
    onglets: [
      { href: "/marges", libelle: "Marges", roles: ADMIN },
      { href: "/historique", libelle: "Historique", roles: TOUS },
    ],
  },
  {
    cle: "sav", libelle: "SAV & retours",
    onglets: [
      { href: "/tracabilite", libelle: "Traçabilité", roles: TOUS },
      { href: "/retours", libelle: "Retours", roles: TOUS },
    ],
  },
  {
    cle: "reglages", libelle: "Réglages",
    onglets: [
      { href: "/catalogue", libelle: "Catalogue & compositions", roles: TOUS },
      { href: "/acces", libelle: "Utilisateurs & rôles", roles: ADMIN },
    ],
  },
];

// Sous-onglets d'un univers filtrés par rôle (pour <SousOnglets>).
export function ongletsUnivers(cle: string, role: Role): SousOngletDef[] {
  const u = UNIVERS.find((x) => x.cle === cle);
  if (!u) return [];
  return u.onglets.filter((o) => o.roles.includes(role));
}
