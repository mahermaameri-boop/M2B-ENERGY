import type { EtapePipeline } from "@/components/ui";

// Pipeline de chantier (calculé, jamais stocké tel quel).
export type EtapeChantier =
  | "a_commander" | "commande" | "pret" | "prepare" | "pose" | "cloture";

export const ETAPES_CHANTIER: EtapePipeline[] = [
  { cle: "a_commander", libelle: "À commander" },
  { cle: "commande", libelle: "Commandé" },
  { cle: "pret", libelle: "Prêt" },
  { cle: "prepare", libelle: "Préparé" },
  { cle: "pose", libelle: "Posé" },
  { cle: "cloture", libelle: "Clôturé" },
];

export const LABEL_ETAPE: Record<EtapeChantier, string> = {
  a_commander: "À commander",
  commande: "Commandé",
  pret: "Prêt",
  prepare: "Préparé",
  pose: "Posé",
  cloture: "Clôturé",
};

export const COULEUR_ETAPE: Record<EtapeChantier, "orange" | "bleu" | "vert" | "gris"> = {
  a_commander: "orange",
  commande: "bleu",
  pret: "vert",
  prepare: "bleu",
  pose: "gris",
  cloture: "vert",
};

// Calcule l'étape courante d'un chantier à partir de son état + ses besoins.
export function etapeChantier(
  c: { statut: string; prepare_le: string | null; cout_sous_traitance: number | null },
  besoinsStatuts: string[],
): EtapeChantier {
  const pose = c.statut === "realise";
  if (pose && c.cout_sous_traitance != null) return "cloture";
  if (pose) return "pose";
  if (c.prepare_le) return "prepare";
  if (besoinsStatuts.includes("a_commander")) return "a_commander";
  if (besoinsStatuts.includes("commande")) return "commande";
  return "pret";
}
