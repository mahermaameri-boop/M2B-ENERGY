"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const today = () => new Date().toISOString().slice(0, 10);

async function userId(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// COGS d'une série = prix d'achat capturé sur son mouvement de réception
async function coutSerie(supabase: ReturnType<typeof createClient>, serieId: string): Promise<number> {
  const { data } = await supabase
    .from("mouvements_stock")
    .select("prix_achat")
    .eq("numero_serie_id", serieId)
    .in("type", ["reception", "entree_manuelle"])
    .order("date", { ascending: false })
    .limit(1).maybeSingle();
  return Number(data?.prix_achat ?? 0);
}

// COGS d'un article non sérialisé = dernier prix d'achat capturé (journal)
async function coutArticle(supabase: ReturnType<typeof createClient>, articleId: string): Promise<number> {
  const { data } = await supabase
    .from("mouvements_stock")
    .select("prix_achat")
    .eq("article_id", articleId)
    .in("type", ["reception", "entree_manuelle"])
    .not("prix_achat", "is", null)
    .order("date", { ascending: false })
    .limit(1).maybeSingle();
  return Number(data?.prix_achat ?? 0);
}

async function marquerReservationSortie(
  supabase: ReturnType<typeof createClient>, chantierId: string, articleId: string,
) {
  const { data } = await supabase
    .from("reservations")
    .select("id")
    .eq("chantier_id", chantierId)
    .eq("article_id", articleId)
    .eq("statut", "reserve")
    .limit(1).maybeSingle();
  if (data?.id) {
    await supabase.from("reservations").update({ statut: "sortie" }).eq("id", data.id);
  }
}

// Création rapide d'un client + chantier depuis l'écran des sorties.
export async function creerClientChantierRapide(formData: FormData) {
  const supabase = createClient();

  const clientNom = String(formData.get("client_nom") || "").trim();
  const chantierLibelle = String(formData.get("chantier_libelle") || "").trim();
  if (!clientNom || !chantierLibelle) return;

  const { data: client, error: errClient } = await supabase
    .from("clients")
    .insert({
      nom: clientNom,
      adresse: String(formData.get("client_adresse") || "").trim() || null,
    })
    .select("id").single();
  if (errClient || !client) throw new Error(errClient?.message || "Création du client impossible");

  const { error: errChantier } = await supabase.from("chantiers").insert({
    client_id: client.id,
    libelle: chantierLibelle,
    date_prevue: String(formData.get("chantier_date") || "").trim() || null,
  });
  if (errChantier) throw new Error(errChantier.message || "Création du chantier impossible");

  revalidatePath("/sorties");
}

export async function creerReservation(formData: FormData) {
  const supabase = createClient();
  await supabase.from("reservations").insert({
    chantier_id: String(formData.get("chantier_id")),
    article_id: String(formData.get("article_id")),
    quantite: Number(formData.get("quantite") || 1),
    date_prevue: String(formData.get("date_prevue") || today()),
    statut: "reserve",
  });
  revalidatePath("/sorties");
  revalidatePath("/stock");
}

export async function annulerReservation(formData: FormData) {
  const supabase = createClient();
  await supabase.from("reservations").update({ statut: "annulee" }).eq("id", String(formData.get("id")));
  revalidatePath("/sorties");
  revalidatePath("/stock");
}

export async function effectuerSortie(formData: FormData) {
  const supabase = createClient();
  const uid = await userId(supabase);
  const chantier_id = String(formData.get("chantier_id"));
  const dateSortie = String(formData.get("date") || today());
  const series: string[] = JSON.parse(String(formData.get("series") || "[]"));
  const lignes: { article_id: string; quantite: number }[] = JSON.parse(String(formData.get("lignes") || "[]"));

  const { data: chantier } = await supabase
    .from("chantiers").select("id, client_id").eq("id", chantier_id).single();
  if (!chantier) throw new Error("Chantier introuvable");

  // Numéro de bon BS-AAAA-NNNN
  const annee = new Date().getFullYear();
  const { count } = await supabase.from("bons_de_sortie").select("id", { count: "exact", head: true });
  const numero = `BS-${annee}-${String((count ?? 0) + 1).padStart(4, "0")}`;

  const { data: bon, error } = await supabase
    .from("bons_de_sortie")
    .insert({ numero, chantier_id, date: dateSortie })
    .select("id").single();
  if (error || !bon) throw new Error(error?.message || "Création du bon impossible");

  // Séries scannées
  for (const ns of series.map((s) => s.trim()).filter(Boolean)) {
    const { data: serie } = await supabase
      .from("numeros_serie")
      .select("id, article_id")
      .eq("numero_serie", ns)
      .in("statut", ["en_stock", "reserve"])
      .limit(1).maybeSingle();
    if (!serie) continue; // série inconnue ou déjà sortie -> ignorée
    const cogs = await coutSerie(supabase, serie.id);
    await supabase.from("numeros_serie").update({
      statut: "sorti", client_id: chantier.client_id,
      bon_de_sortie_id: bon.id, date_sortie: dateSortie,
    }).eq("id", serie.id);
    await supabase.from("mouvements_stock").insert({
      article_id: serie.article_id, type: "sortie", quantite: -1,
      reference: bon.id, numero_serie_id: serie.id,
      client_id: chantier.client_id, chantier_id, prix_achat: cogs,
      motif: "Sortie chantier", utilisateur_id: uid, date: dateSortie,
    });
    await marquerReservationSortie(supabase, chantier_id, serie.article_id);
  }

  // Lignes non sérialisées
  for (const l of lignes.filter((x) => x.article_id && x.quantite > 0)) {
    const cogs = await coutArticle(supabase, l.article_id);
    await supabase.from("mouvements_stock").insert({
      article_id: l.article_id, type: "sortie", quantite: -Math.abs(l.quantite),
      reference: bon.id, client_id: chantier.client_id, chantier_id, prix_achat: cogs,
      motif: "Sortie chantier", utilisateur_id: uid, date: dateSortie,
    });
    await marquerReservationSortie(supabase, chantier_id, l.article_id);
  }

  // Le chantier passe en « réalisé » (installation faite → apparaît dans l'Historique)
  await supabase.from("chantiers").update({ statut: "realise" }).eq("id", chantier_id);

  revalidatePath("/sorties");
  revalidatePath("/stock");
  revalidatePath("/historique");
  redirect(`/api/bon-de-sortie/${bon.id}`);
}
