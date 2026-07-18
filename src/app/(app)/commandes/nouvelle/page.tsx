import { requireProfil, peutVoirPrix } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage } from "@/components/ui";
import { dateISO } from "@/lib/format";
import { NouvelleCommandeForm } from "../formulaire";

export const dynamic = "force-dynamic";

export default async function NouvelleCommandePage() {
  const profil = await requireProfil();
  const voitPrix = peutVoirPrix(profil.role);
  const supabase = createClient();

  const annee = new Date().getFullYear();
  const [{ data: fournisseurs }, { data: articles }, { data: compoLignes }, { data: stock }, { data: prix }, { count }] =
    await Promise.all([
      supabase.from("fournisseurs").select("id, nom").order("nom"),
      supabase.from("articles").select("id, reference, designation").eq("actif", true).order("designation"),
      supabase.from("composition_lignes").select("composition_id, article_composant_id, quantite, compositions(article_fini_id)"),
      supabase.from("vue_stock_actuel").select("article_id, stock"),
      supabase.from("vue_dernier_prix").select("article_id, dernier_prix"),
      supabase.from("commandes").select("id", { count: "exact", head: true }),
    ]);

  const compositions: Record<string, { article_composant_id: string; quantite: number }[]> = {};
  for (const l of (compoLignes as any[]) ?? []) {
    const fini = l.compositions?.article_fini_id;
    if (!fini) continue;
    (compositions[fini] ??= []).push({ article_composant_id: l.article_composant_id, quantite: Number(l.quantite) });
  }

  const stockMap: Record<string, number> = {};
  for (const s of (stock as any[]) ?? []) stockMap[s.article_id] = Number(s.stock);
  const prixMap: Record<string, number> = {};
  for (const p of (prix as any[]) ?? []) prixMap[p.article_id] = Number(p.dernier_prix);

  const numeroPropose = `CMD-${annee}-${String((count ?? 0) + 1).padStart(4, "0")}`;

  return (
    <>
      <EnTetePage
        titre="Nouvelle commande"
        description="Commande fournisseur multi-produits. Un produit fini peut être décomposé pour ne commander que les composants manquants."
      />
      <NouvelleCommandeForm
        fournisseurs={(fournisseurs as any) ?? []}
        articles={(articles as any) ?? []}
        compositions={compositions}
        stockMap={stockMap}
        prixMap={prixMap}
        numeroPropose={numeroPropose}
        dateJour={dateISO()}
        voitPrix={voitPrix}
      />
    </>
  );
}
