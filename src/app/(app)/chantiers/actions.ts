"use server";

import { revalidatePath } from "next/cache";
import { marquerCommande } from "../a-commander/actions";
import { enregistrerSousTraitance } from "../tableau-de-bord/actions";

// Actions contextuelles de la fiche chantier (réutilisent la logique existante),
// avec revalidation de la fiche.
export async function ficheCommander(formData: FormData) {
  await marquerCommande(formData);
  revalidatePath(`/chantiers/${formData.get("chantier_id")}`);
}

export async function ficheSousTraitance(formData: FormData) {
  await enregistrerSousTraitance(formData);
  revalidatePath(`/chantiers/${formData.get("chantier_id")}`);
}
