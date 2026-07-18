import { notFound } from "next/navigation";
import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage } from "@/components/ui";
import { dateISO } from "@/lib/format";
import { ReceptionForm } from "../reception-form";

export const dynamic = "force-dynamic";

export default async function ReceptionCommande({ params }: { params: { id: string } }) {
  await requireProfil();
  const supabase = createClient();

  const { data: commande } = await supabase
    .from("commandes").select("id, numero, fournisseurs(nom)").eq("id", params.id).single();
  if (!commande) notFound();

  const { data: lignes } = await supabase
    .from("commande_lignes")
    .select("id, article_id, quantite, quantite_recue, prix_unitaire, articles(reference, designation, serialise)")
    .eq("commande_id", params.id);

  const lignesIn = ((lignes as any[]) ?? []).map((l) => ({
    id: l.id,
    article_id: l.article_id,
    reference: l.articles?.reference ?? "",
    designation: l.articles?.designation ?? "",
    serialise: !!l.articles?.serialise,
    quantite: Number(l.quantite),
    quantite_recue: Number(l.quantite_recue),
    prix_unitaire: Number(l.prix_unitaire),
  }));

  return (
    <>
      <EnTetePage
        titre={`Réception — ${commande.numero}`}
        description={`Fournisseur : ${(commande as any).fournisseurs?.nom ?? "—"}. Saisissez la facture, les quantités reçues et les numéros de série.`}
      />
      <ReceptionForm
        commande={{ id: commande.id, numero: commande.numero, fournisseur_nom: (commande as any).fournisseurs?.nom ?? "—" }}
        lignes={lignesIn}
        dateJour={dateISO()}
      />
    </>
  );
}
