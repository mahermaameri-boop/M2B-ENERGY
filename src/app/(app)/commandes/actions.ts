"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { StatutCommande } from "@/lib/types";

interface LignePayload {
  article_id: string;
  quantite: number;
  prix_unitaire: number;
}

async function prochainNumero(supabase: ReturnType<typeof createClient>): Promise<string> {
  const annee = new Date().getFullYear();
  const { count } = await supabase
    .from("commandes")
    .select("id", { count: "exact", head: true });
  const n = (count ?? 0) + 1;
  return `CMD-${annee}-${String(n).padStart(4, "0")}`;
}

export async function creerCommande(formData: FormData) {
  const supabase = createClient();
  let numero = String(formData.get("numero") || "").trim();
  if (!numero) numero = await prochainNumero(supabase);

  const lignes: LignePayload[] = JSON.parse(String(formData.get("lignes") || "[]"));
  const lignesValides = lignes.filter((l) => l.article_id && l.quantite > 0);
  if (lignesValides.length === 0) {
    throw new Error("Ajoutez au moins une ligne à la commande.");
  }

  const { data: commande, error } = await supabase
    .from("commandes")
    .insert({
      numero,
      fournisseur_id: String(formData.get("fournisseur_id")),
      date_commande: String(formData.get("date_commande") || new Date().toISOString().slice(0, 10)),
      date_livraison_prevue: String(formData.get("date_livraison_prevue") || "") || null,
      statut: (String(formData.get("statut") || "brouillon") as StatutCommande),
      notes: String(formData.get("notes") || "").trim() || null,
    })
    .select("id")
    .single();

  if (error || !commande) throw new Error(error?.message || "Création impossible");

  await supabase.from("commande_lignes").insert(
    lignesValides.map((l) => ({
      commande_id: commande.id,
      article_id: l.article_id,
      quantite: l.quantite,
      prix_unitaire: l.prix_unitaire || 0,
    })),
  );

  revalidatePath("/commandes");
  revalidatePath("/stock");
  redirect(`/commandes/${commande.id}`);
}

export async function changerStatutCommande(formData: FormData) {
  const supabase = createClient();
  const id = String(formData.get("id"));
  await supabase
    .from("commandes")
    .update({ statut: String(formData.get("statut")) as StatutCommande })
    .eq("id", id);
  revalidatePath("/commandes");
  revalidatePath(`/commandes/${id}`);
  revalidatePath("/stock");
}

export async function supprimerCommande(formData: FormData) {
  const supabase = createClient();
  await supabase.from("commandes").delete().eq("id", String(formData.get("id")));
  revalidatePath("/commandes");
  redirect("/commandes");
}
