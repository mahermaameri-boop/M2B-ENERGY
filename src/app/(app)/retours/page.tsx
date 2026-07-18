import { requireProfil, peutVoirCa } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Badge, Vide } from "@/components/ui";
import { nombre, euro, dateFr, dateISO } from "@/lib/format";
import { LABEL_TYPE_RETOUR, type TypeRetour } from "@/lib/types";
import { RetourForm } from "./retour-form";

export const dynamic = "force-dynamic";

const COULEUR_TYPE: Record<TypeRetour, "bleu" | "orange" | "rouge"> = {
  chantier_non_installe: "bleu",
  defectueux_sav: "orange",
  commande: "rouge",
};

export default async function RetoursPage() {
  const profil = await requireProfil();
  const voitCa = peutVoirCa(profil.role);
  const supabase = createClient();

  const [{ data: bons }, { data: commandes }, { data: articles }, { data: retours }] = await Promise.all([
    supabase.from("bons_de_sortie").select("id, numero, chantiers(libelle)").order("date", { ascending: false }).limit(100),
    supabase.from("commandes").select("id, numero").not("statut", "eq", "annulee").order("date_commande", { ascending: false }).limit(100),
    supabase.from("articles").select("id, reference, designation").eq("actif", true).order("designation"),
    supabase.from("retours").select("*, articles(reference, designation)").order("date", { ascending: false }).limit(50),
  ]);

  const bonsOpt = ((bons as any[]) ?? []).map((b) => ({ id: b.id, label: `${b.numero} — ${b.chantiers?.libelle ?? ""}` }));
  const commandesOpt = ((commandes as any[]) ?? []).map((c) => ({ id: c.id, label: c.numero }));

  return (
    <>
      <EnTetePage
        titre="Retours"
        description="Trois types distincts : retour chantier (réintégration), défectueux / SAV (garantie), annulation de commande (avoir)."
      />

      <div className="mb-6">
        <Carte titre="Enregistrer un retour">
          <RetourForm
            bons={bonsOpt}
            commandes={commandesOpt}
            articles={(articles as any) ?? []}
            dateJour={dateISO()}
          />
        </Carte>
      </div>

      <Carte titre="Retours récents">
        {((retours as any[]) ?? []).length === 0 ? (
          <Vide message="Aucun retour enregistré." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Date</th><th>Type</th><th>Article</th><th className="text-right">Qté</th>
                  <th>Motif</th><th>Décision</th>{voitCa && <th className="text-right">Avoir</th>}
                </tr>
              </thead>
              <tbody>
                {((retours as any[]) ?? []).map((r) => (
                  <tr key={r.id}>
                    <td>{dateFr(r.date)}</td>
                    <td><Badge couleur={COULEUR_TYPE[r.type as TypeRetour]}>{LABEL_TYPE_RETOUR[r.type as TypeRetour]}</Badge></td>
                    <td className="font-medium">{r.articles?.designation}</td>
                    <td className="text-right">{nombre(r.quantite)}</td>
                    <td className="text-gray-500">{r.motif}</td>
                    <td className="text-gray-500">{r.decision}</td>
                    {voitCa && <td className="text-right">{r.avoir_montant != null ? euro(r.avoir_montant) : "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
    </>
  );
}
