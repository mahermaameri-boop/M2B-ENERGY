import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfil, peutVoirCa } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Badge, Vide, Stepper } from "@/components/ui";
import { euro, nombre, dateFr } from "@/lib/format";
import {
  etapeChantier, ETAPES_CHANTIER, LABEL_ETAPE, COULEUR_ETAPE,
} from "@/lib/chantier-statut";
import { ficheCommander, ficheSousTraitance } from "../actions";
import { validerPreparation } from "../../a-preparer/actions";

export const dynamic = "force-dynamic";

export default async function FicheChantier({ params }: { params: { id: string } }) {
  const profil = await requireProfil();
  const admin = peutVoirCa(profil.role);
  const supabase = createClient();

  const champs = admin
    ? "id, libelle, date_prevue, statut, prepare_le, ca, cout_sous_traitance, clients(nom, adresse, contact)"
    : "id, libelle, date_prevue, statut, prepare_le, clients(nom, adresse, contact)";

  const { data: chantier } = await supabase.from("chantiers").select(champs).eq("id", params.id).single();
  if (!chantier) notFound();
  const ch = chantier as any;

  const [{ data: reservations }, { data: besoins }, { data: series }, { data: fournisseurs }, marge] =
    await Promise.all([
      supabase.from("reservations")
        .select("article_id, quantite, statut, articles(reference, designation, serialise)")
        .eq("chantier_id", params.id).eq("statut", "reserve"),
      supabase.from("besoins_appro")
        .select("article_id, quantite, statut, commande_id, articles(reference, designation), commandes(numero, date_livraison_prevue)")
        .eq("chantier_id", params.id),
      supabase.from("mouvements_stock")
        .select("numero_serie_id, numeros_serie(numero_serie, articles(designation))")
        .eq("chantier_id", params.id).eq("type", "sortie").not("numero_serie_id", "is", null),
      supabase.from("fournisseurs").select("id, nom").order("nom"),
      admin
        ? supabase.from("vue_marge_chantier").select("ca, cout_materiel, cout_sous_traitance, marge, marge_pct").eq("chantier_id", params.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const besoinsStatuts = ((besoins as any[]) ?? []).map((b) => b.statut);
  const etape = etapeChantier(
    { statut: ch.statut, prepare_le: ch.prepare_le, cout_sous_traitance: admin ? (ch.cout_sous_traitance ?? null) : null },
    besoinsStatuts,
  );

  // Agrège le statut par composant (réservé / à commander / commandé / reçu)
  type Comp = { reference: string; designation: string; reserve: number; a_commander: number; commande: number; recu: number; livraison: string | null };
  const comps = new Map<string, Comp>();
  const get = (id: string, ref: string, des: string) =>
    comps.get(id) ?? comps.set(id, { reference: ref, designation: des, reserve: 0, a_commander: 0, commande: 0, recu: 0, livraison: null }).get(id)!;
  for (const r of (reservations as any[]) ?? []) {
    const c = get(r.article_id, r.articles?.reference ?? "", r.articles?.designation ?? "");
    c.reserve += Number(r.quantite);
  }
  for (const b of (besoins as any[]) ?? []) {
    const c = get(b.article_id, b.articles?.reference ?? "", b.articles?.designation ?? "");
    if (b.statut === "a_commander") c.a_commander += Number(b.quantite);
    else if (b.statut === "commande") { c.commande += Number(b.quantite); c.livraison = b.commandes?.date_livraison_prevue ?? c.livraison; }
    else if (b.statut === "recu") c.recu += Number(b.quantite);
  }
  const composants = [...comps.values()];
  const nbManquant = ((besoins as any[]) ?? []).filter((b) => b.statut === "a_commander").length;
  const m = (marge as any)?.data ?? null;

  return (
    <>
      <EnTetePage
        titre={ch.libelle}
        description={`${ch.clients?.nom ?? "—"}${ch.clients?.adresse ? " · " + ch.clients.adresse : ""} · Pose le ${dateFr(ch.date_prevue)}`}
        action={<Badge couleur={COULEUR_ETAPE[etape]}>{LABEL_ETAPE[etape]}</Badge>}
      />

      <div className="mb-4">
        <Carte><Stepper etapes={ETAPES_CHANTIER} courante={etape} /></Carte>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Carte titre="Matériel à poser">
            {composants.length === 0 ? (
              <Vide message="Aucun matériel déclaré. Ajoutez-le dans l'onglet Clients (fiche du chantier)." />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr><th>Composant</th><th className="text-right">Qté</th><th>Statut</th></tr>
                  </thead>
                  <tbody>
                    {composants.map((c) => {
                      const total = c.reserve + c.a_commander + c.commande + c.recu;
                      return (
                        <tr key={c.reference}>
                          <td className="font-medium">{c.designation} <span className="font-mono text-xs text-gray-400">{c.reference}</span></td>
                          <td className="text-right">{nombre(total)}</td>
                          <td className="space-x-1">
                            {c.reserve > 0 && <Badge couleur="vert">En stock · réservé {nombre(c.reserve)}</Badge>}
                            {c.commande > 0 && <Badge couleur="bleu">Commandé {nombre(c.commande)}{c.livraison ? ` · ${dateFr(c.livraison)}` : ""}</Badge>}
                            {c.a_commander > 0 && <Badge couleur="orange">À commander {nombre(c.a_commander)}</Badge>}
                            {c.recu > 0 && <Badge couleur="gris">Reçu {nombre(c.recu)}</Badge>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Carte>

          {((series as any[]) ?? []).length > 0 && (
            <Carte titre="Numéros de série posés">
              <div className="flex flex-wrap gap-1.5">
                {((series as any[]) ?? []).map((s, i) => (
                  <Link key={i} href={`/tracabilite?q=${encodeURIComponent(s.numeros_serie?.numero_serie ?? "")}`}
                    className="inline-flex items-center gap-1 rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-100">
                    <span className="font-mono">{s.numeros_serie?.numero_serie}</span>
                    <span className="text-gray-400">{s.numeros_serie?.articles?.designation}</span>
                  </Link>
                ))}
              </div>
            </Carte>
          )}
        </div>

        <div className="space-y-4">
          <Carte titre="Actions">
            {etape === "a_commander" && (
              <form action={ficheCommander} className="space-y-2">
                <input type="hidden" name="chantier_id" value={ch.id} />
                <label className="etiquette">Commander le manquant ({nombre(nbManquant)})</label>
                <select name="fournisseur_id" required className="champ">
                  <option value="">— Fournisseur —</option>
                  {((fournisseurs as any[]) ?? []).map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                </select>
                <button className="btn-primaire w-full">Créer la commande</button>
              </form>
            )}
            {etape === "commande" && (
              <div className="text-sm text-gray-600">
                Matériel commandé, en attente de réception.
                <Link href="/receptions" className="mt-2 block text-brand-600 hover:underline">Aller aux réceptions →</Link>
              </div>
            )}
            {etape === "pret" && (
              <form action={validerPreparation}>
                <input type="hidden" name="chantier_id" value={ch.id} />
                <p className="mb-2 text-sm text-gray-600">Tout le matériel est disponible.</p>
                <button className="btn-primaire w-full">Préparer + imprimer étiquettes</button>
              </form>
            )}
            {etape === "prepare" && (
              <div className="text-sm text-gray-600">
                Matériel préparé.
                <Link href="/sorties" className="mt-2 block text-brand-600 hover:underline">Enregistrer la pose (sortie) →</Link>
                <a href={`/api/etiquettes-chantier/${ch.id}`} target="_blank" rel="noreferrer" className="mt-1 block text-brand-600 hover:underline">Réimprimer les étiquettes</a>
              </div>
            )}
            {etape === "pose" && admin && (
              <form action={ficheSousTraitance} className="space-y-2">
                <input type="hidden" name="chantier_id" value={ch.id} />
                <label className="etiquette">Coût sous-traitant (€)</label>
                <input name="cout_sous_traitance" type="number" min="0" step="0.01" required className="champ" />
                <button className="btn-primaire w-full">Clôturer la marge</button>
              </form>
            )}
            {etape === "pose" && !admin && <div className="text-sm text-gray-600">Posé. Clôture par l'administrateur.</div>}
            {etape === "cloture" && <div className="text-sm text-emerald-700">✓ Chantier clôturé.</div>}
          </Carte>

          {admin && (
            <Carte titre="Finances">
              {m ? (
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between"><dt className="text-gray-500">CA</dt><dd>{euro(Number(m.ca))}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Coût matériel</dt><dd>{euro(Number(m.cout_materiel))}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Sous-traitance</dt><dd>{ch.cout_sous_traitance != null ? euro(Number(ch.cout_sous_traitance)) : "à saisir"}</dd></div>
                  <div className="flex justify-between border-t border-gray-100 pt-1 font-semibold"><dt>Marge</dt><dd className={Number(m.marge) >= 0 ? "text-emerald-600" : "text-red-600"}>{euro(Number(m.marge))}</dd></div>
                </dl>
              ) : <Vide message="Marge indisponible." />}
            </Carte>
          )}
        </div>
      </div>
    </>
  );
}
