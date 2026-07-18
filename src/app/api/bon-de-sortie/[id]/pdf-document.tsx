import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

export interface ItemBon {
  designation: string;
  reference: string;
  numero_serie: string | null;
  quantite: number;
  qr: string | null; // data URL PNG
}

export interface DonneesBon {
  numero: string;
  date: string; // jj/mm/aaaa
  chantier: string;
  client: string;
  adresse: string;
  items: ItemBon[];
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  entete: { flexDirection: "row", justifyContent: "space-between", borderBottom: "2 solid #155cc0", paddingBottom: 10, marginBottom: 16 },
  marque: { fontSize: 20, fontWeight: "bold", color: "#12489a" },
  soustitre: { fontSize: 9, color: "#6b7280" },
  titreBon: { fontSize: 14, fontWeight: "bold" },
  bloc: { marginBottom: 14 },
  ligneInfo: { flexDirection: "row", marginBottom: 3 },
  label: { width: 90, color: "#6b7280" },
  valeur: { flex: 1, fontWeight: "bold" },
  tableEntete: { flexDirection: "row", backgroundColor: "#f3f4f6", padding: 6, fontWeight: "bold" },
  ligne: { flexDirection: "row", borderBottom: "1 solid #e5e7eb", padding: 6, alignItems: "center" },
  colArticle: { flex: 3 },
  colSerie: { flex: 2 },
  colQte: { flex: 1, textAlign: "right" },
  colQr: { width: 60, alignItems: "center" },
  qr: { width: 50, height: 50 },
  pied: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 8, color: "#9ca3af", borderTop: "1 solid #e5e7eb", paddingTop: 6, flexDirection: "row", justifyContent: "space-between" },
  ref: { fontSize: 8, color: "#9ca3af" },
});

export function BonDeSortiePDF({ data }: { data: DonneesBon }) {
  return (
    <Document title={`Bon de sortie ${data.numero}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.entete}>
          <View>
            <Text style={styles.marque}>M2B ENERGY</Text>
            <Text style={styles.soustitre}>Chauffage · Climatisation · Rénovation</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.titreBon}>BON DE SORTIE</Text>
            <Text>{data.numero}</Text>
            <Text style={styles.soustitre}>Date : {data.date}</Text>
          </View>
        </View>

        <View style={styles.bloc}>
          <View style={styles.ligneInfo}><Text style={styles.label}>Client</Text><Text style={styles.valeur}>{data.client}</Text></View>
          <View style={styles.ligneInfo}><Text style={styles.label}>Chantier</Text><Text style={styles.valeur}>{data.chantier}</Text></View>
          {data.adresse ? (
            <View style={styles.ligneInfo}><Text style={styles.label}>Adresse</Text><Text style={styles.valeur}>{data.adresse}</Text></View>
          ) : null}
        </View>

        <View style={styles.tableEntete}>
          <Text style={styles.colArticle}>Article</Text>
          <Text style={styles.colSerie}>N° de série</Text>
          <Text style={styles.colQte}>Qté</Text>
          <Text style={styles.colQr}>Code</Text>
        </View>
        {data.items.map((it, i) => (
          <View style={styles.ligne} key={i}>
            <View style={styles.colArticle}>
              <Text>{it.designation}</Text>
              <Text style={styles.ref}>{it.reference}</Text>
            </View>
            <Text style={styles.colSerie}>{it.numero_serie ?? "—"}</Text>
            <Text style={styles.colQte}>{it.quantite}</Text>
            <View style={styles.colQr}>
              {it.qr ? <Image style={styles.qr} src={it.qr} /> : <Text>—</Text>}
            </View>
          </View>
        ))}

        <View style={styles.pied} fixed>
          <Text>M2B ENERGY — Bon de sortie {data.numero}</Text>
          <Text>À coller sur le matériel — scanner le QR pour la traçabilité</Text>
        </View>
      </Page>
    </Document>
  );
}
