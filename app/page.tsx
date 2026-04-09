"use client";

import { useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NumericKPI {
  column: string;
  sum: number;
  mean: number;
  min: number;
  max: number;
  count: number;
}

interface CategoryFrequency {
  value: string;
  count: number;
  percent: number;
}

interface CategoricalKPI {
  column: string;
  topValues: CategoryFrequency[];
  totalCount: number;
}

interface KPIs {
  numeric: NumericKPI[];
  categorical: CategoricalKPI[];
  rowCount: number;
}

interface ReportResponse {
  token: string;
  kpis: KPIs;
  barSVG: string;
  pieSVG: string;
  locked: boolean;
  rowCount: number;
  generatedAt: string;
}

interface UploadResponse {
  uploadId: string;
  rowCount: number;
  columns: { name: string; type: string; sample: string[] }[];
}

type Stage =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "generating"; uploadId: string }
  | { kind: "done"; report: ReportResponse }
  | { kind: "error"; message: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(2)}k`
    : n % 1 === 0
    ? String(n)
    : n.toFixed(2);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="animate-spin h-5 w-5 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v8z"
      />
    </svg>
  );
}

function StepBadge({ n, label, active }: { n: number; label: string; active: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${active ? "opacity-100" : "opacity-40"}`}>
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
        style={{ background: active ? "#01696f" : "#374151" }}
      >
        {n}
      </span>
      <span className={`text-sm font-medium ${active ? "text-white" : "text-gray-400"}`}>
        {label}
      </span>
    </div>
  );
}

function KPICard({ kpi }: { kpi: NumericKPI }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        {kpi.column}
      </p>
      <p className="mb-1 text-3xl font-bold text-white">{fmt(kpi.sum)}</p>
      <p className="text-xs text-gray-500">totale</p>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-800 pt-3">
        {[
          { label: "media", val: kpi.mean },
          { label: "min", val: kpi.min },
          { label: "max", val: kpi.max },
        ].map(({ label, val }) => (
          <div key={label} className="text-center">
            <p className="text-sm font-semibold text-gray-200">{fmt(val)}</p>
            <p className="text-xs text-gray-600">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CatCard({ kpi }: { kpi: CategoricalKPI }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        {kpi.column}
      </p>
      <ul className="space-y-2">
        {kpi.topValues.map((v) => (
          <li key={v.value} className="flex items-center gap-2">
            <div className="h-1.5 rounded-full bg-gray-800 flex-1">
              <div
                className="h-1.5 rounded-full"
                style={{ width: `${v.percent}%`, background: "#01696f" }}
              />
            </div>
            <span className="w-24 truncate text-right text-xs text-gray-300">{v.value}</span>
            <span className="w-8 text-right text-xs font-medium text-gray-400">
              {v.percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LockedOverlay() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-gray-700 bg-gray-900/60 p-10 text-center backdrop-blur-sm">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ background: "#01696f22" }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="#01696f"
          strokeWidth="2"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold text-white">Grafici bloccati</p>
        <p className="mt-1 text-xs text-gray-500">
          Acquista il report completo per sbloccare i grafici SVG
        </p>
      </div>
      <button
        className="rounded-full px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-80"
        style={{ background: "#01696f" }}
      >
        Sblocca per 4,90 €
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 1 + 2: upload → generate
  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setStage({ kind: "uploading" });
    try {
      const form = new FormData();
      form.append("file", file);

      const upRes = await fetch("/api/upload", { method: "POST", body: form });
      if (!upRes.ok) {
        const { error } = (await upRes.json()) as { error: string };
        setStage({ kind: "error", message: error });
        return;
      }
      const { uploadId } = (await upRes.json()) as UploadResponse;

      setStage({ kind: "generating", uploadId });

      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
      });
      if (!genRes.ok) {
        const { error } = (await genRes.json()) as { error: string };
        setStage({ kind: "error", message: error });
        return;
      }
      const { token } = (await genRes.json()) as { token: string };

      const repRes = await fetch(`/api/report/${token}`);
      if (!repRes.ok) {
        const { error } = (await repRes.json()) as { error: string };
        setStage({ kind: "error", message: error });
        return;
      }
      const report = (await repRes.json()) as ReportResponse;
      setStage({ kind: "done", report });
    } catch {
      setStage({ kind: "error", message: "Errore di rete. Riprova." });
    }
  }

  function reset() {
    setStage({ kind: "idle" });
    if (fileRef.current) fileRef.current.value = "";
  }

  const isUploading = stage.kind === "uploading";
  const isGenerating = stage.kind === "generating";
  const isBusy = isUploading || isGenerating;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ── Nav ── */}
      <nav className="border-b border-gray-900 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-white"
              style={{ background: "#01696f" }}
            >
              K
            </span>
            <span className="text-sm font-semibold tracking-tight">KPIGo</span>
          </div>
          <span className="rounded-full border border-gray-800 px-3 py-0.5 text-xs text-gray-500">
            MVP
          </span>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-16">
        {/* ── Hero ── */}
        <div className="mb-14 text-center">
          <p
            className="mb-4 inline-block rounded-full px-3 py-1 text-xs font-medium"
            style={{ background: "#01696f22", color: "#01696f" }}
          >
            Reporting automatico
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Dal tuo Excel a un report{" "}
            <span style={{ color: "#01696f" }}>in 30 secondi</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-gray-400">
            Carica un file Excel o CSV e ottieni KPI, grafici e un report
            professionale pronto da scaricare.
          </p>
        </div>

        {/* ── Steps ── */}
        <div className="mb-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-8">
          <StepBadge n={1} label="Carica Excel / CSV" active={stage.kind === "idle" || isBusy} />
          <span className="hidden text-gray-700 sm:block">→</span>
          <StepBadge n={2} label="Genera report" active={isBusy} />
          <span className="hidden text-gray-700 sm:block">→</span>
          <StepBadge n={3} label="Visualizza KPI" active={stage.kind === "done"} />
        </div>

        {/* ── Upload form ── */}
        {(stage.kind === "idle" || isBusy) && (
          <form
            onSubmit={handleUpload}
            className="mx-auto max-w-lg rounded-2xl border border-gray-800 bg-gray-900 p-8"
          >
            <label className="mb-2 block text-sm font-medium text-gray-300">
              File Excel o CSV
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv"
              required
              disabled={isBusy}
              className="mb-6 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-200 file:mr-4 file:rounded-md file:border-0 file:bg-gray-700 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-200 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isBusy}
              className="flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ background: "#01696f" }}
            >
              {isBusy ? (
                <>
                  <Spinner />
                  {isUploading ? "Caricamento…" : "Generazione report…"}
                </>
              ) : (
                "Analizza file →"
              )}
            </button>
            <p className="mt-3 text-center text-xs text-gray-600">
              Max 5 MB · .xlsx .csv · fino a 10 000 righe
            </p>
          </form>
        )}

        {/* ── Error ── */}
        {stage.kind === "error" && (
          <div className="mx-auto max-w-lg rounded-xl border border-red-900 bg-red-950/40 p-6 text-center">
            <p className="mb-4 text-sm text-red-400">{stage.message}</p>
            <button
              onClick={reset}
              className="rounded-full border border-gray-700 px-5 py-2 text-sm text-gray-300 hover:bg-gray-800"
            >
              Riprova
            </button>
          </div>
        )}

        {/* ── Report ── */}
        {stage.kind === "done" && (
          <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">
                  Generato il{" "}
                  {new Date(stage.report.generatedAt).toLocaleString("it-IT")} ·{" "}
                  {stage.report.rowCount} righe
                </p>
                <h2 className="mt-1 text-xl font-semibold text-white">
                  Report{" "}
                  <span className="font-mono text-sm text-gray-500">
                    {stage.report.token.slice(0, 8)}…
                  </span>
                </h2>
              </div>
              <button
                onClick={reset}
                className="rounded-full border border-gray-700 px-4 py-1.5 text-xs text-gray-400 hover:bg-gray-800"
              >
                Nuovo file
              </button>
            </div>

            {/* Locked banner */}
            {stage.report.locked && (
              <div
                className="rounded-xl border px-5 py-3 text-sm"
                style={{
                  borderColor: "#01696f55",
                  background: "#01696f11",
                  color: "#01696f",
                }}
              >
                Report bloccato — i grafici sono disponibili dopo l&apos;acquisto.
              </div>
            )}

            {/* Numeric KPIs */}
            {stage.report.kpis.numeric.length > 0 && (
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Colonne numeriche
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {stage.report.kpis.numeric.map((k) => (
                    <KPICard key={k.column} kpi={k} />
                  ))}
                </div>
              </div>
            )}

            {/* Categorical KPIs */}
            {stage.report.kpis.categorical.length > 0 && (
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Distribuzione categorica
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {stage.report.kpis.categorical.map((k) => (
                    <CatCard key={k.column} kpi={k} />
                  ))}
                </div>
              </div>
            )}

            {/* Charts */}
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Grafici
              </h3>
              {stage.report.locked || !stage.report.barSVG ? (
                <LockedOverlay />
              ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div
                    className="overflow-hidden rounded-xl border border-gray-800 bg-white p-4"
                    dangerouslySetInnerHTML={{ __html: stage.report.barSVG }}
                  />
                  <div
                    className="overflow-hidden rounded-xl border border-gray-800 bg-white p-4"
                    dangerouslySetInnerHTML={{ __html: stage.report.pieSVG }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-900 px-6 py-6 text-center">
        <p className="text-xs text-gray-700">
          KPIGo MVP · Next.js · Vercel Blob · SVG charts
        </p>
      </footer>
    </div>
  );
}
