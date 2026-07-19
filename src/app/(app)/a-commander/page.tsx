import { requireProfil, peutVoirPrix } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Badge } from "@/components/ui";
import { SousOnglets } from "@/components/sous-onglets";
import { ongletsUnivers } from "@/lib/navigation";
import { nombre, dateISO } from "@/lib/format";
import { LABEL_STATUT_BESOIN, type StatutBesoin } from "@/lib/types";
import { SelectionAchats, type LigneArticle } from "./selection-achats";

export const dynamic = "force-dynamic";

interface Besoin {
  id: string; chantier_id: string; article_id: string; quantite: number;
  date_besoin: string; statut: StatutBesoin; commande_id: string | null;
  articles: { reference: string; designation: string } | null;
  chantiers: { libelle: string; date_prevue: string | null; clients: { nom: string } | null } | null;
}

export default async function ACommanderPage() {
  const profil = await requireProfil();
  const voitPrix = peutVoirPrix(profil.role);
  const supabase = createClient();

  const aujourdhui = dateISO();
  // Seuil d'urgence : pose dans les 7 jours (aujourd'hui + 7)
  const dans7 = new Date();
  dans7.setDate(dans7.getDate() + 7);
  const seuilUrgence = dateISO(dans7);

  const [{ data: besoinsData }, { data: prevData }, reassortRes] = await Promise.all([
    supabase.from("besoins_appro")
      .select("id, chantier_id, article_id, quantite, date_besoin, statut, commande_id, articles(reference, designation), chantiers(libelle, date_prevue, clients(nom))")
      .in("statut", ["a_commander", "commande"])
      .order("date_besoin"),
    // Prévisionnel du jour : sert au drapeau « rupture »
    supabase.rpc("fn_stock_previsionnel", { d_cible: aujourdhui }),
    // Masquage financier serveur : le réassort (prix/fournisseur/délai) n'est requêté que pour l'Admin.
    voitPrix
      ? supabase.from("vue_reassort")
          .select("article_id, fournisseur_id, fournisseur_nom, prix, delai_livraison_jours, rang")
          .eq("rang", 1)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const besoins = (besoinsData as unknown as Besoin[]) ?? [];
  const prevMap = new Map(((prevData as any[]) ?? []).map((p) => [p.article_id, Number(p.previsionnel)]));
  const reassortMap = new Map(
    ((reassortRes.data as any[]) ?? []).map((r) => [r.article_id, r]),
  );

  const aCommander = besoins.filter((b) => b.statut === "a_commander");

  // ---------------------------------------------------------------------------
  // Consolidation PAR ARTICLE (tous chantiers confondus)
  // ---------------------------------------------------------------------------
  const parArticle = new Map<
    string,
    {
      designation: string; reference: string; quantite: number;
      chantiers: Map<string, { libelle: string; date_prevue: string | null; urgent: boolean }>;
    }
  >();
  for (const b of aCommander) {
    const cur = parArticle.get(b.article_id) ?? {
      designation: b.articles?.designation ?? "—",
      reference: b.articles?.reference ?? "",
      quantite: 0,
      chantiers: new Map<string, { libelle: string; date_prevue: string | null; urgent: boolean }>(),
    };
    cur.quantite += Number(b.quantite);
    const pose = b.chantiers?.date_prevue ?? null;
    const urgent = pose != null && pose < seuilUrgence;
    if (!cur.chantiers.has(b.chantier_id)) {
      cur.chantiers.set(b.chantier_id, {
        libelle: b.chantiers?.libelle ?? "—", date_prevue: pose, urgent,
      });
    }
    parArticle.set(b.article_id, cur);
  }

  const lignes: LigneArticle[] = [...parArticle.entries()]
    .map(([article_id, a]) => {
      const chantiers = [...a.chantiers.values()];
      const reassort = reassortMap.get(article_id);
      const delaiLong = voitPrix && reassort ? Number(reassort.delai_livraison_jours) > 7 : false;
      return {
        article_id,
        designation: a.designation,
        reference: a.reference,
        quantite: a.quantite,
        chantiers,
        urgence: chantiers.some((c) => c.urgent),
        rupture: (prevMap.get(article_id) ?? 0) <= 0,
        delaiLong,
        fournisseur: voitPrix && reassort
          ? {
              id: reassort.fournisseur_id,
              nom: reassort.fournisseur_nom,
              prix: reassort.prix != null ? Number(reassort.prix) : null,
              delai: reassort.delai_livraison_jours != null ? Number(reassort.delai_livraison_jours) : null,
            }
          : null,
      } satisfies LigneArticle;
    })
    .sort((x, y) => x.designation.localeCompare(y.designation));

  const enCours = besoins.filter((b) => b.statut === "commande");

  return (
    <>
      <SousOnglets onglets={ongletsUnivers("achats", profil.role)} />
      <EnTetePage
        titre="À commander"
        description="Vue consolidée par article, tous chantiers confondus : regroupe les besoins, désigne le fournisseur le moins cher et génère les commandes."
      />

      <p className="mb-6 rounded-md border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600">
        Cochez les articles à commander, puis générez une commande par fournisseur.
        Un article est signalé <span className="font-medium text-red-600">urgent</span> lorsqu&apos;une pose est prévue dans les 7 jours.
      </p>

      <div className="mb-6">
        <SelectionAchats lignes={lignes} voitPrix={voitPrix} />
      </div>

      {/* Besoins déjà passés en commande (lecture) */}
      {enCours.length > 0 && (
        <Carte titre="Besoins commandés (en attente de réception)">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>Chantier</th><th>Article</th><th className="text-right">Qté</th><th>Statut</th></tr>
              </thead>
              <tbody>
                {enCours.map((b) => (
                  <tr key={b.id}>
                    <td className="text-gray-500">{b.chantiers?.libelle ?? "—"}</td>
                    <td className="font-medium">
                      {b.articles?.designation}{" "}
                      <span className="font-mono text-xs text-gray-400">{b.articles?.reference}</span>
                    </td>
                    <td className="text-right">{nombre(b.quantite)}</td>
                    <td><Badge couleur="bleu">{LABEL_STATUT_BESOIN[b.statut]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Carte>
      )}
    </>
  );
}
