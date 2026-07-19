import Link from "next/link";
import type { ReactNode } from "react";

export function EnTetePage({
  titre,
  description,
  action,
}: {
  titre: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4 border-b border-gray-200 pb-4">
      <div>
        <h1 className="text-[1.35rem] font-semibold text-gray-900">{titre}</h1>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Carte({
  titre,
  children,
  className = "",
}: {
  titre?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`carte ${className}`}>
      {titre && (
        <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-700">
          {titre}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function CarteStat({
  libelle,
  valeur,
  accent,
}: {
  libelle: string;
  valeur: string;
  accent?: "vert" | "rouge" | "bleu" | "neutre";
}) {
  const couleur =
    accent === "vert" ? "text-emerald-600"
    : accent === "rouge" ? "text-red-600"
    : accent === "bleu" ? "text-brand-600"
    : "text-gray-900";
  return (
    <div className="carte p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{libelle}</div>
      <div className={`mt-1.5 text-2xl font-semibold tracking-tight ${couleur}`}>{valeur}</div>
    </div>
  );
}

export function Vide({ message }: { message: string }) {
  return (
    <div className="py-12 text-center text-sm text-gray-400">{message}</div>
  );
}

const COULEURS_BADGE: Record<string, string> = {
  vert: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  rouge: "bg-red-50 text-red-700 ring-red-600/20",
  orange: "bg-amber-50 text-amber-700 ring-amber-600/20",
  gris: "bg-gray-50 text-gray-600 ring-gray-500/20",
  bleu: "bg-brand-50 text-brand-700 ring-brand-600/20",
};

export function Badge({
  children,
  couleur = "gris",
}: {
  children: ReactNode;
  couleur?: keyof typeof COULEURS_BADGE;
}) {
  return <span className={`badge ${COULEURS_BADGE[couleur]}`}>{children}</span>;
}

export function LienBouton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="btn-primaire">
      {children}
    </Link>
  );
}
