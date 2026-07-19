"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Déplace un chantier vers une nouvelle date prévue (drag & drop ou champ date).
// Accessible à tous : aucune donnée financière n'est touchée ici.
export async function deplacerChantier(chantierId: string, datePrevue: string) {
  if (!chantierId || !datePrevue) throw new Error("Chantier ou date manquant.");
  // Validation simple du format aaaa-mm-jj
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePrevue)) throw new Error("Date invalide.");

  const supabase = createClient();
  const { error } = await supabase
    .from("chantiers")
    .update({ date_prevue: datePrevue })
    .eq("id", chantierId);
  if (error) throw new Error(error.message);

  revalidatePath("/planning");
  revalidatePath("/tableau-de-bord");
  revalidatePath("/stock");
}

// Variante compatible <form action={...}> (fallback sans JS).
export async function deplacerChantierForm(formData: FormData) {
  const chantierId = String(formData.get("chantier_id") || "");
  const datePrevue = String(formData.get("date_prevue") || "");
  await deplacerChantier(chantierId, datePrevue);
}
