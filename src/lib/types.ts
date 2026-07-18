// Types partagés (modèle de données M2B ENERGY)

export type Role = "admin" | "collaborateur";

export type StatutCommande =
  | "brouillon" | "en_transit" | "livree_partiel" | "livree" | "annulee";
export type StatutReservation = "reserve" | "sortie" | "annulee";
export type StatutSerie = "en_stock" | "reserve" | "sorti" | "renvoye_fournisseur";
export type TypeRetour = "chantier_non_installe" | "defectueux_sav" | "commande";
export type TypeMouvement =
  | "reception" | "entree_manuelle" | "retour_chantier"
  | "sortie" | "retour_fournisseur" | "ajustement";

export interface Profil { id: string; nom: string; role: Role; cree_le: string }

export type StatutBesoin = "a_commander" | "commande" | "recu";

export interface Fournisseur {
  id: string; nom: string; email: string | null; telephone: string | null;
  delai_livraison_jours: number; notes: string | null;
}

export interface Article {
  id: string; reference: string; designation: string; categorie: string;
  unite: string; serialise: boolean; compose: boolean; seuil_manuel: number; actif: boolean;
}

export interface Commande {
  id: string; numero: string; fournisseur_id: string; date_commande: string;
  date_livraison_prevue: string | null; statut: StatutCommande; notes: string | null;
}

export interface CommandeLigne {
  id: string; commande_id: string; article_id: string; quantite: number;
  prix_unitaire: number; quantite_recue: number;
}

export interface Client {
  id: string; nom: string; adresse: string | null; contact: string | null; notes: string | null;
}

export interface Chantier {
  id: string; client_id: string; libelle: string; date_prevue: string | null;
  statut: string; ca: number; cout_sous_traitance: number;
}

export interface NumeroSerie {
  id: string; article_id: string; numero_serie: string;
  facture_achat_id: string | null; client_id: string | null;
  bon_de_sortie_id: string | null; statut: StatutSerie;
  date_entree: string | null; date_sortie: string | null;
}

// Libellés d'affichage
export const LABEL_ROLE: Record<Role, string> = {
  admin: "Admin",
  collaborateur: "Collaborateur",
};

export const LABEL_STATUT_BESOIN: Record<StatutBesoin, string> = {
  a_commander: "À commander",
  commande: "Commandé",
  recu: "Reçu",
};

export const LABEL_STATUT_COMMANDE: Record<StatutCommande, string> = {
  brouillon: "Brouillon",
  en_transit: "En transit",
  livree_partiel: "Livrée partiellement",
  livree: "Livrée",
  annulee: "Annulée",
};

export const LABEL_STATUT_SERIE: Record<StatutSerie, string> = {
  en_stock: "En stock",
  reserve: "Réservé",
  sorti: "Sorti",
  renvoye_fournisseur: "Renvoyé fournisseur",
};

export const LABEL_TYPE_MOUVEMENT: Record<TypeMouvement, string> = {
  reception: "Réception",
  entree_manuelle: "Entrée manuelle",
  retour_chantier: "Retour chantier",
  sortie: "Sortie",
  retour_fournisseur: "Retour fournisseur",
  ajustement: "Ajustement",
};

export const LABEL_TYPE_RETOUR: Record<TypeRetour, string> = {
  chantier_non_installe: "Retour chantier (non installé)",
  defectueux_sav: "Défectueux / SAV",
  commande: "Annulation / retour de commande",
};
