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

// Bande secondaire (KPIs, sous-blocs)
export function Bande({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-gray-50 p-3 ${className}`}>{children}</div>;
}

// Carte « à traiter » : grand compteur cliquable vers l'écran concerné.
const COULEURS_ACTION: Record<string, string> = {
  bleu: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  orange: "bg-amber-100 text-amber-800 hover:bg-amber-200",
  vert: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
  rouge: "bg-red-100 text-red-800 hover:bg-red-200",
  gris: "bg-gray-100 text-gray-700 hover:bg-gray-200",
};
export function CarteAction({
  libelle, compteur, href, couleur = "bleu",
}: {
  libelle: string; compteur: number; href: string; couleur?: keyof typeof COULEURS_ACTION;
}) {
  return (
    <Link href={href} className={`flex items-center justify-between rounded-xl p-4 transition-colors ${COULEURS_ACTION[couleur]}`}>
      <div>
        <div className="text-2xl font-semibold tracking-tight">{compteur}</div>
        <div className="text-sm font-medium">{libelle}</div>
      </div>
      <span className="text-lg opacity-60">→</span>
    </Link>
  );
}

// Pipeline horizontal (étapes du chantier).
export interface EtapePipeline { cle: string; libelle: string }
export function Stepper({ etapes, courante }: { etapes: EtapePipeline[]; courante: string }) {
  const idx = Math.max(0, etapes.findIndex((e) => e.cle === courante));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {etapes.map((e, i) => {
        const fait = i < idx;
        const actuel = i === idx;
        const cls = actuel
          ? "bg-brand-50 text-brand-700 font-medium ring-1 ring-inset ring-brand-200"
          : fait
          ? "text-emerald-700"
          : "text-gray-400";
        return (
          <span key={e.cle} className="flex items-center gap-1.5">
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs ${cls}`}>
              {fait ? "✓ " : ""}{e.libelle}
            </span>
            {i < etapes.length - 1 && <span className="text-gray-300">›</span>}
          </span>
        );
      })}
    </div>
  );
}
