import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "M2B ENERGY — Outil opérationnel",
  description: "Gestion de stock, achats, traçabilité et marges — M2B ENERGY",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
