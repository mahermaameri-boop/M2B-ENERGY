"use client";

import { useState, useRef, useEffect } from "react";

// Champ acceptant la douchette (frappe clavier + Entrée) ou la saisie manuelle.
// Empile les numéros de série ; secours : saisie et suppression manuelles.
export function ScanSeries({
  series,
  onChange,
  placeholder = "Scanner ou taper un n° de série, puis Entrée ou « Ajouter »",
  autoFocus = false,
}: {
  series: string[];
  onChange: (s: string[]) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [valeur, setValeur] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  function ajouter() {
    const v = valeur.trim();
    if (!v) return;
    if (series.includes(v)) { setValeur(""); return; }
    onChange([...series, v]);
    setValeur("");
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          ref={ref}
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); ajouter(); }
          }}
          className="champ"
          placeholder={placeholder}
        />
        <button type="button" onClick={ajouter} className="btn-secondaire shrink-0">
          Ajouter
        </button>
      </div>
      {series.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {series.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
              <span className="font-mono">{s}</span>
              <button
                type="button"
                onClick={() => onChange(series.filter((x) => x !== s))}
                className="text-brand-400 hover:text-red-600"
                aria-label="Retirer"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
