"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Valide la préparation d'un chantier : vérifie qu'aucun matériel ne manque,
// horodate la préparation, puis redirige vers les étiquettes à imprimer.
export async function validerPreparation(formData: FormData) {
  const supabase = createClient();
  const chantier_id = String(formData.get("chantier_id") || "");
  if (!chantier_id) throw new Error("Chantier manquant.");

  // Garde-fou serveur : aucun besoin « à commander » ne doit subsister.
  const { count } = await supabase
    .from("besoins_appro")
    .select("id", { count: "exact", head: true })
    .eq("chantier_id", chantier_id)
    .eq("statut", "a_commander");
  if ((count ?? 0) > 0) {
    throw new Error("Matériel incomplet : réceptionnez d'abord les articles manquants.");
  }

  const { error } = await supabase
    .from("chantiers")
    .update({ prepare_le: new Date().toISOString() })
    .eq("id", chantier_id);
  if (error) throw new Error(error.message);

  revalidatePath("/a-preparer");
  revalidatePath("/planning");
  revalidatePath("/sorties");

  // Impression des étiquettes numérotées de la composition préparée.
  redirect("/api/etiquettes-chantier/" + chantier_id);
}
