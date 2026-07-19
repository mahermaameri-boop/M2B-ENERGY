"use client";

import { useState } from "react";

export function ExportStock() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  function exporter(format: "csv" | "xlsx") {
    const params = new URLSearchParams({ date, format });
    window.open(`/api/export/stock?${params.toString()}`, "_blank");
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm text-gray-500">
        Date
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
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
