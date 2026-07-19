"use client";

import { useState } from "react";

function debutMoisCourant(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function ExportMarges() {
  const [debut, setDebut] = useState(debutMoisCourant);
  const [fin, setFin] = useState(() => new Date().toISOString().slice(0, 10));

  function exporter(format: "csv" | "xlsx") {
    const params = new URLSearchParams({ debut, fin, format });
    window.open(`/api/export/marges?${params.toString()}`, "_blank");
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm text-gray-500">
        Début
        <input
          type="date"
          value={debut}
          onChange={(e) => setDebut(e.target.value)}
          className="champ w-auto"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-500">
        Fin
        <input
          type="date"
          value={fin}
          onChange={(e) => setFin(e.target.value)}
          className="champ w-auto"
        />
      </label>
      <button type="button" className="btn-primaire" onClick={() => exporter("csv")}>
        Exporter CSV
      </button>
      <button type="button" className="btn-secondaire" onClick={() => exporter("xlsx")}>
        Exporter Excel
      </button>
    </div>
  );
}
