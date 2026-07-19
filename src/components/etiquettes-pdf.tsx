import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

// Étiquettes pour imprimante à étiquettes (Brother QL, rouleau 62 mm).
// 1 page = 1 étiquette. Format facile à ajuster ci-dessous.
const MM = 2.835; // mm -> points
export const ETIQUETTE_LARGEUR = 62 * MM; // ~176 pt
export const ETIQUETTE_HAUTEUR = 40 * MM; // ~113 pt

// Mettre à false pour retirer le petit mot « Installation » au-dessus de la date.
const AFFICHER_LIBELLE_INSTALLATION = true;

export interface Unite { index: number; total: number }
export interface DonneesEtiquettes {
  client: string;
  date_installation: string; // jj/mm/aaaa
  unites: Unite[];
}

const styles = StyleSheet.create({
  page: { paddingVertical: 8, paddingHorizontal: 10, fontFamily: "Helvetica", justifyContent: "space-between" },
  compteur: { fontSize: 9, color: "#6b7280", textAlign: "right" },
  client: { fontSize: 15, fontWeight: "bold", color: "#111827" },
  bloc: { flexDirection: "column" },
  libelle: { fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 },
  date: { fontSize: 13, fontWeight: "bold", color: "#111827" },
});

export function EtiquettesPDF({ data }: { data: DonneesEtiquettes }) {
  return (
    <Document title={`Étiquettes ${data.client}`}>
      {data.unites.map((u) => (
        <Page key={u.index} size={[ETIQUETTE_LARGEUR, ETIQUETTE_HAUTEUR]} style={styles.page}>
          <Text style={styles.compteur}>{u.index} / {u.total}</Text>
          <Text style={styles.client}>{data.client}</Text>
          <View style={styles.bloc}>
            {AFFICHER_LIBELLE_INSTALLATION && <Text style={styles.libelle}>Installation</Text>}
            <Text style={styles.date}>{data.date_installation}</Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}
