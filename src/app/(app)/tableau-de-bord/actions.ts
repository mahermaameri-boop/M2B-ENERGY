"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfil } from "@/lib/auth";

// Saisie du coût de sous-traitance d'un chantier — réservé à l'Admin (financier).
export async function enregistrerSousTraitance(formData: FormData) {
  const profil = await getProfil();
  if (profil?.role !== "admin") throw new Error("Accès refusé");

  const supabase = createClient();
  const id = String(formData.get("chantier_id"));
  const cout = Number(formData.get("cout_sous_traitance") || 0);
  await supabase.from("chantiers").update({ cout_sous_traitance: cout }).eq("id", id);

  revalidatePath("/tableau-de-bord");
  revalidatePath("/marges");
  revalidatePath("/historique");
  revalidatePath("/clients");
}
