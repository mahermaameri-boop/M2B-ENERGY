import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Badge, Vide } from "@/components/ui";
import { euro, nombre, pourcentage, dateFr } from "@/lib/format";
import { LABEL_STATUT_CHANTIER } from "@/lib/types";

export const dynamic = "force-dynamic";

interface ChantierRealise {
  id: string;
  libelle: string;
  date_prevue: string | null;
  clients: { nom: string } | null;
}

interface MouvementSortie {
  chantier_id: string | null;
  quantite: number;
  articles: { reference: string; designation: string } | null;
}

interface BesoinCommande {
  chantier_id: string | null;
  commande_id: string | null;
  commandes: { fournisseurs: { nom: string } | null } | null;
}

interface LigneMarge {
  chantier_id: string;
  ca: number;
  cout_sous_traitance: number;
  cout_materiel: number;
  marge: number;
  marge_pct: number | null;
}

export default async function HistoriquePage() {
  const profil = await requireProfil();
  const estAdmin = profil.role === "admin";
  const supabase = createClient();

  const { data: chantiersData } = await supabase
    .from("chantiers")
    .select("id, libelle, date_prevue, clients(nom)")
    .eq("statut", "realise")
    .order("date_prevue", { ascending: false });

  const chantiers = (chantiersData as unknown as ChantierRealise[] | null) ?? [];
  const ids = chantiers.map((c) => c.id);

  // Rien à charger de plus s'il n'y a aucun chantier réalisé.
  if (ids.length === 0) {
    return (
      <>
        <EnTetePage
          titre="Historique"
          description="Chantiers réalisés : matériel posé, fournisseurs et rentabilité."
        />
        <Carte>
          <Vide message="Aucun chantier réalisé pour le moment." />
        </Carte>
      </>
    );
  }

  const [{ data: mouvementsData }, { data: besoinsData }, { data: margeData }] =
    await Promise.all([
      supabase
        .from("mouvements_stock")
        .select("chantier_id, quantite, articles(reference, designation)")
        .eq("type", "sortie")
        .in("chantier_id", ids),
      supabase
        .from("besoins_appro")
        .select("chantier_id, commande_id, commandes(fournisseurs(nom))")
        .in("chantier_id", ids)
        .not("commande_id", "is", null),
      estAdmin
        ? supabase
            .from("vue_marge_chantier")
            .select(
              "chantier_id, ca, cout_sous_traitance, cout_materiel, marge, marge_pct",
            )
            .in("chantier_id", ids)
        : Promise.resolve({ data: [] as LigneMarge[] }),
    ]);

  // Matériel posé : cumul des quantités sorties par (chantier, article).
  // Les sorties sont enregistrées en quantité négative → on additionne -quantite.
  const mouvements = (mouvementsData as unknown as MouvementSortie[] | null) ?? [];
  const materielParChantier = new Map<
    string,
    Map<string, { designation: string; reference: string; qte: number }>
  >();
  for (const m of mouvements) {
    if (!m.chantier_id || !m.articles) continue;
    const parArticle =
      materielParChantier.get(m.chantier_id) ?? new Map();
    const cle = m.articles.reference;
    const cur = parArticle.get(cle) ?? {
      designation: m.articles.designation,
      reference: m.articles.reference,
      qte: 0,
    };
    cur.qte += -Number(m.quantite);
    parArticle.set(cle, cur);
    materielParChantier.set(m.chantier_id, parArticle);
  }

  // Fournisseur(s) : noms distincts issus des besoins liés à une commande.
  const besoins = (besoinsData as unknown as BesoinCommande[] | null) ?? [];
  const fournisseursParChantier = new Map<string, Set<string>>();
  for (const b of besoins) {
    if (!b.chantier_id) continue;
    const nom = b.commandes?.fournisseurs?.nom;
    if (!nom) continue;
    const set = fournisseursParChantier.get(b.chantier_id) ?? new Set<string>();
    set.add(nom);
    fournisseursParChantier.set(b.chantier_id, set);
  }

  const marges = (margeData as unknown as LigneMarge[] | null) ?? [];
  const margeParChantier = new Map(marges.map((m) => [m.chantier_id, m]));

  return (
    <>
      <EnTetePage
        titre="Historique"
        description="Chantiers réalisés : matériel posé, fournisseurs et rentabilité."
      />

      <Carte>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Statut</th>
                <th>Matériel posé</th>
                <th>Fournisseur(s)</th>
                {estAdmin && (
                  <>
                    <th className="text-right">Prix d&apos;installation</th>
                    <th className="text-right">CA</th>
                    <th className="text-right">Marge</th>
                    <th className="text-right">Marge %</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {chantiers.map((c) => {
                const materiel = [
                  ...(materielParChantier.get(c.id)?.values() ?? []),
                ].filter((a) => a.qte !== 0);
                const fournisseurs = [
                  ...(fournisseursParChantier.get(c.id) ?? []),
                ];
                const marge = margeParChantier.get(c.id);
                return (
                  <tr key={c.id}>
                    <td>{dateFr(c.date_prevue)}</td>
                    <td className="font-medium">{c.clients?.nom ?? "—"}</td>
                    <td>
                      <Badge couleur="vert">
                        {LABEL_STATUT_CHANTIER.realise}
                      </Badge>
                    </td>
                    <td>
                      {materiel.length === 0 ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span className="text-sm">
                          {materiel
                            .map((a) => `${a.designation} ×${nombre(a.qte)}`)
                            .join(", ")}
                        </span>
                      )}
                    </td>
                    <td>
                      {fournisseurs.length === 0 ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        fournisseurs.join(", ")
                      )}
                    </td>
                    {estAdmin && (
                      <>
                        <td className="text-right">
                          {euro(marge?.cout_sous_traitance)}
                        </td>
                        <td className="text-right">{euro(marge?.ca)}</td>
                        <td className="text-right">
                          <span
                            className={
                              Number(marge?.marge) < 0
                                ? "text-red-600"
                                : "text-emerald-600"
                            }
                          >
                            {euro(marge?.marge)}
                          </span>
                        </td>
                        <td className="text-right">
                          {pourcentage(marge?.marge_pct)}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Carte>
    </>
  );
}
