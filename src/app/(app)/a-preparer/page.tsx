import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Badge, Vide } from "@/components/ui";
import { SousOnglets } from "@/components/sous-onglets";
import { ongletsUnivers } from "@/lib/navigation";
import { SelecteurDate } from "@/components/selecteur-date";
import { dateFr, dateISO, nombre } from "@/lib/format";
import { validerPreparation } from "./actions";

export const dynamic = "force-dynamic";

interface ChantierAPreparer {
  id: string;
  libelle: string;
  date_prevue: string | null;
  clients: { nom: string } | null;
}

interface LigneComposant {
  chantier_id: string;
  quantite: number;
  articles: { reference: string; designation: string } | null;
}

export default async function APreparerPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const profil = await requireProfil();
  const supabase = createClient();

  // Date par défaut = lendemain (aujourd'hui + 1 jour), au format aaaa-mm-jj.
  const lendemain = new Date();
  lendemain.setDate(lendemain.getDate() + 1);
  const date = searchParams.date || dateISO(lendemain);

  // Chantiers à préparer pour cette date : planifiés, non encore préparés.
  const { data: chantiersData } = await supabase
    .from("chantiers")
    .select("id, libelle, date_prevue, clients(nom)")
    .eq("date_prevue", date)
    .eq("statut", "planifie")
    .is("prepare_le", null)
    .order("libelle");

  const chantiers = (chantiersData as unknown as ChantierAPreparer[]) ?? [];
  const chantierIds = chantiers.map((c) => c.id);

  // Composition par chantier : réservations (en stock) + besoins (manquant).
  const [{ data: resaData }, { data: besoinsData }] = chantierIds.length
    ? await Promise.all([
        supabase
          .from("reservations")
          .select("chantier_id, quantite, articles(reference, designation)")
          .in("chantier_id", chantierIds)
          .eq("statut", "reserve"),
        supabase
          .from("besoins_appro")
          .select("chantier_id, quantite, articles(reference, designation)")
          .in("chantier_id", chantierIds)
          .eq("statut", "a_commander"),
      ])
    : [{ data: [] }, { data: [] }];

  const reservations = (resaData as unknown as LigneComposant[]) ?? [];
  const besoins = (besoinsData as unknown as LigneComposant[]) ?? [];

  // Regroupement en JS par chantier.
  const enStockParChantier = new Map<string, LigneComposant[]>();
  for (const r of reservations) {
    const arr = enStockParChantier.get(r.chantier_id) ?? [];
    arr.push(r);
    enStockParChantier.set(r.chantier_id, arr);
  }
  const manquantParChantier = new Map<string, LigneComposant[]>();
  for (const b of besoins) {
    const arr = manquantParChantier.get(b.chantier_id) ?? [];
    arr.push(b);
    manquantParChantier.set(b.chantier_id, arr);
  }

  return (
    <>
      <SousOnglets onglets={ongletsUnivers("atelier", profil.role)} />
      <EnTetePage
        titre="À préparer"
        description="Étape atelier : préparer la composition des chantiers avant sortie, valider la préparation et imprimer les étiquettes."
        action={<SelecteurDate valeur={date} />}
      />

      {chantiers.length === 0 ? (
        <Vide message="Aucun chantier à préparer pour cette date." />
      ) : (
        <div className="space-y-4">
          {chantiers.map((c) => {
            const enStock = enStockParChantier.get(c.id) ?? [];
            const manquant = manquantParChantier.get(c.id) ?? [];
            const incomplet = manquant.length > 0;
            return (
              <Carte key={c.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {c.clients?.nom ?? "—"}
                      {c.libelle && (
                        <span className="ml-2 font-normal text-gray-500">{c.libelle}</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Pose le {dateFr(c.date_prevue)}
                    </div>
                  </div>
                  {incomplet && <Badge couleur="orange">Matériel incomplet</Badge>}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* En stock (réservé) */}
                  <div>
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                      En stock
                    </div>
                    {enStock.length === 0 ? (
                      <p className="text-sm text-gray-400">Aucun composant réservé.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {enStock.map((l, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-gray-700">
                              {l.articles?.designation}{" "}
                              <span className="font-mono text-xs text-gray-400">
                                {l.articles?.reference}
                              </span>
                            </span>
                            <span className="shrink-0 text-gray-500">
                              {nombre(l.quantite)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Manquant (à commander) */}
                  <div>
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Manquant
                    </div>
                    {manquant.length === 0 ? (
                      <p className="text-sm text-gray-400">Rien ne manque.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {manquant.map((l, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-gray-700">
                              {l.articles?.designation}{" "}
                              <span className="font-mono text-xs text-gray-400">
                                {l.articles?.reference}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="text-gray-500">{nombre(l.quantite)}</span>
                              <Badge couleur="orange">Manquant</Badge>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
                  <form action={validerPreparation}>
                    <input type="hidden" name="chantier_id" value={c.id} />
                    <button
                      className="btn inline-flex bg-emerald-600 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={incomplet}
                      title={
                        incomplet
                          ? "Matériel incomplet : réceptionnez d'abord les articles manquants."
                          : "Valider la préparation et imprimer les étiquettes"
                      }
                    >
                      ✓ Valider la préparation
                    </button>
                  </form>
                  <a
                    href={`/api/etiquettes-chantier/${c.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-brand-600 hover:underline"
                  >
                    Imprimer les étiquettes
                  </a>
                </div>
              </Carte>
            );
          })}
        </div>
      )}
    </>
  );
}
