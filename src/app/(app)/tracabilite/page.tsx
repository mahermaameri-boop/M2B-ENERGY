import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Badge, Vide } from "@/components/ui";
import { SousOnglets } from "@/components/sous-onglets";
import { ongletsUnivers } from "@/lib/navigation";
import { dateFr } from "@/lib/format";
import {
  LABEL_STATUT_SERIE,
  LABEL_TYPE_MOUVEMENT,
  type StatutSerie,
  type TypeMouvement,
} from "@/lib/types";

export const dynamic = "force-dynamic";

// Couleur du badge de statut de série
const COULEUR_STATUT: Record<StatutSerie, "vert" | "bleu" | "gris" | "orange"> = {
  en_stock: "vert",
  reserve: "bleu",
  sorti: "gris",
  renvoye_fournisseur: "orange",
};

interface SerieRow {
  id: string;
  numero_serie: string;
  statut: StatutSerie;
  date_entree: string | null;
  date_sortie: string | null;
  articles: { reference: string; designation: string } | null;
  clients: { nom: string } | null;
  factures_achat:
    | { numero: string; date: string | null; fournisseurs: { nom: string } | null }
    | null;
  bons_de_sortie: { numero: string; date: string | null } | null;
}

interface MouvementRow {
  id: string;
  numero_serie_id: string | null;
  type: TypeMouvement;
  quantite: number;
  date: string | null;
  motif: string | null;
}

export default async function TracabilitePage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const profil = await requireProfil();
  const supabase = createClient();

  const q = (searchParams.q ?? "").trim();

  let series: SerieRow[] = [];
  let mouvementsParSerie = new Map<string, MouvementRow[]>();

  if (q) {
    const { data } = await supabase
      .from("numeros_serie")
      .select(
        "id, numero_serie, statut, date_entree, date_sortie, articles(reference, designation), clients(nom), factures_achat(numero, date, fournisseurs(nom)), bons_de_sortie(numero, date)",
      )
      .ilike("numero_serie", `%${q}%`)
      .order("numero_serie")
      .limit(25);

    series = (data as unknown as SerieRow[] | null) ?? [];

    if (series.length > 0) {
      const ids = series.map((s) => s.id);
      const { data: mouv } = await supabase
        .from("mouvements_stock")
        .select("id, numero_serie_id, type, quantite, date, motif")
        .in("numero_serie_id", ids)
        .order("date", { ascending: true });

      mouvementsParSerie = new Map<string, MouvementRow[]>();
      for (const m of (mouv as unknown as MouvementRow[] | null) ?? []) {
        if (!m.numero_serie_id) continue;
        const l = mouvementsParSerie.get(m.numero_serie_id) ?? [];
        l.push(m);
        mouvementsParSerie.set(m.numero_serie_id, l);
      }
    }
  }

  return (
    <>
      <SousOnglets onglets={ongletsUnivers("sav", profil.role)} />
      <EnTetePage
        titre="Traçabilité SAV"
        description="Recherchez un numéro de série pour afficher sa fiche complète : article, origine, client et historique des mouvements."
      />

      <div className="mb-6">
        <Carte titre="Recherche par numéro de série">
          <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="etiquette" htmlFor="q">
                Numéro de série
              </label>
              <input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="Ex. SN-00123"
                className="champ"
                autoComplete="off"
              />
            </div>
            <div>
              <button className="btn-primaire">Rechercher</button>
            </div>
          </form>
        </Carte>
      </div>

      {!q ? (
        <Vide message="Saisissez un numéro de série pour afficher sa fiche de traçabilité." />
      ) : series.length === 0 ? (
        <Vide message={`Aucun résultat pour « ${q} ».`} />
      ) : (
        <div className="space-y-6">
          {series.map((s) => {
            const mouvements = mouvementsParSerie.get(s.id) ?? [];
            return (
              <Carte
                key={s.id}
                titre={`${s.articles?.designation ?? "Article inconnu"} — ${s.numero_serie}`}
              >
                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-gray-500">Article</dt>
                    <dd className="font-medium text-gray-900">
                      {s.articles?.designation ?? "—"}
                      {s.articles?.reference && (
                        <span className="ml-2 font-mono text-xs text-gray-400">
                          {s.articles.reference}
                        </span>
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-gray-500">Numéro de série</dt>
                    <dd className="flex items-center gap-2 font-medium text-gray-900">
                      <span className="font-mono">{s.numero_serie}</span>
                      <Badge couleur={COULEUR_STATUT[s.statut] ?? "gris"}>
                        {LABEL_STATUT_SERIE[s.statut] ?? s.statut}
                      </Badge>
                    </dd>
                  </div>

                  <div>
                    <dt className="text-gray-500">Client actuel / dernier</dt>
                    <dd className="font-medium text-gray-900">{s.clients?.nom ?? "—"}</dd>
                  </div>

                  <div>
                    <dt className="text-gray-500">Fournisseur d&apos;origine</dt>
                    <dd className="font-medium text-gray-900">
                      {s.factures_achat?.fournisseurs?.nom ?? "—"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-gray-500">Facture d&apos;achat</dt>
                    <dd className="font-medium text-gray-900">
                      {s.factures_achat ? (
                        <>
                          {s.factures_achat.numero}
                          <span className="ml-2 text-xs text-gray-400">
                            {dateFr(s.factures_achat.date)}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-gray-500">Bon de sortie</dt>
                    <dd className="font-medium text-gray-900">
                      {s.bons_de_sortie ? (
                        <>
                          {s.bons_de_sortie.numero}
                          <span className="ml-2 text-xs text-gray-400">
                            {dateFr(s.bons_de_sortie.date)}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-gray-500">Date d&apos;entrée</dt>
                    <dd className="font-medium text-gray-900">{dateFr(s.date_entree)}</dd>
                  </div>

                  <div>
                    <dt className="text-gray-500">Date de sortie</dt>
                    <dd className="font-medium text-gray-900">{dateFr(s.date_sortie)}</dd>
                  </div>
                </dl>

                <div className="mt-5">
                  <div className="mb-2 text-sm font-semibold text-gray-700">
                    Historique des mouvements
                  </div>
                  {mouvements.length === 0 ? (
                    <Vide message="Aucun mouvement enregistré pour ce numéro de série." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="table-base">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th className="text-right">Quantité</th>
                            <th>Motif</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mouvements.map((m) => (
                            <tr key={m.id}>
                              <td>{dateFr(m.date)}</td>
                              <td>{LABEL_TYPE_MOUVEMENT[m.type] ?? m.type}</td>
                              <td className="text-right">{m.quantite}</td>
                              <td className="text-gray-500">{m.motif ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </Carte>
            );
          })}
        </div>
      )}
    </>
  );
}
