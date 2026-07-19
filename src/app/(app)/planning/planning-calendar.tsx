"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { deplacerChantier } from "./actions";

export type CouleurStatut = "gris" | "orange" | "bleu" | "vert";

export interface InterventionPlanning {
  id: string;
  libelle: string;
  client: string;
  datePrevue: string; // aaaa-mm-jj
  apercu: string;
  statutLibelle: string;
  statutCouleur: CouleurStatut;
}

export interface JourPlanning {
  iso: string; // aaaa-mm-jj
  nom: string;
  libelleDate: string;
  estAujourdhui: boolean;
  interventions: InterventionPlanning[];
}

export function PlanningCalendar({ jours }: { jours: JourPlanning[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [survol, setSurvol] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  function replanifier(chantierId: string, date: string) {
    startTransition(async () => {
      await deplacerChantier(chantierId, date);
      router.refresh();
    });
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>, jour: JourPlanning) {
    e.preventDefault();
    setSurvol(null);
    setDragId(null);
    const chantierId = e.dataTransfer.getData("text/plain");
    if (!chantierId) return;
    // Ne rien faire si on relâche sur le même jour
    const dejaLa = jour.interventions.some((it) => it.id === chantierId);
    if (dejaLa) return;
    replanifier(chantierId, jour.iso);
  }

  return (
    <div className="overflow-x-auto">
      <div
        className={`grid grid-cols-1 gap-3 md:grid-cols-7 md:min-w-[900px] ${
          isPending ? "opacity-60" : ""
        }`}
      >
        {jours.map((jour) => (
          <div
            key={jour.iso}
            onDragOver={(e) => {
              e.preventDefault();
              setSurvol(jour.iso);
            }}
            onDragLeave={() => setSurvol((s) => (s === jour.iso ? null : s))}
            onDrop={(e) => onDrop(e, jour)}
            className={`flex flex-col rounded-lg border ${
              survol === jour.iso
                ? "border-brand-500 bg-brand-50"
                : jour.estAujourdhui
                  ? "border-brand-100 bg-white"
                  : "border-gray-200 bg-gray-50"
            }`}
          >
            {/* En-tête du jour */}
            <div
              className={`flex items-center justify-between border-b px-3 py-2 ${
                jour.estAujourdhui ? "border-brand-100" : "border-gray-200"
              }`}
            >
              <div>
                <div className="text-sm font-semibold text-gray-800">{jour.nom}</div>
                <div className="text-xs text-gray-500">{jour.libelleDate}</div>
              </div>
              {jour.interventions.length > 0 && (
                <Badge couleur={jour.estAujourdhui ? "bleu" : "gris"}>
                  {jour.interventions.length}
                </Badge>
              )}
            </div>

            {/* Interventions empilées */}
            <div className="flex flex-1 flex-col gap-2 p-2">
              {jour.interventions.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">—</p>
              ) : (
                jour.interventions.map((it) => (
                  <div
                    key={it.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", it.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(it.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                    className={`cursor-grab rounded-md border border-gray-200 bg-white p-2 shadow-sm transition-shadow hover:shadow ${
                      dragId === it.id ? "opacity-50" : ""
                    }`}
                    title="Glisser pour replanifier"
                  >
                    <div className="mb-1 flex items-start justify-between gap-1">
                      <span className="text-sm font-medium text-gray-900">{it.client}</span>
                      <Badge couleur={it.statutCouleur}>{it.statutLibelle}</Badge>
                    </div>
                    <div className="truncate text-xs text-gray-500" title={it.libelle}>
                      {it.libelle}
                    </div>
                    <div className="mt-1 text-xs text-gray-400" title={it.apercu}>
                      {it.apercu}
                    </div>

                    {/* Fallback sans drag & drop : choisir une nouvelle date */}
                    <div className="mt-2">
                      <label className="sr-only" htmlFor={`date-${it.id}`}>
                        Replanifier
                      </label>
                      <input
                        id={`date-${it.id}`}
                        type="date"
                        defaultValue={it.datePrevue}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v && v !== it.datePrevue) replanifier(it.id, v);
                        }}
                        className="champ !py-1 text-xs"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
