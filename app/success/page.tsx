"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NumericKPI {
  column: string;
  sum: number;
  mean: number;
  min: number;
  max: number;
  count: number;
}

interface CategoricalKPI {
  column: string;
  topValues: { value: string; count: number; percent: number }[];
  totalCount: number;
}

interface ReportResponse {
  token: string;
  kpis: { numeric: NumericKPI[]; categorical: CategoricalKPI[]; rowCount: number };
  barSVG: string;
  pieSVG: string;
  locked: boolean;
  rowCount: number;
  generatedAt: string;
}

type Status =
  | { kind: "loading" }
  | { kind: "retrying"; attempt: number }
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

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

// ─── Success page ─────────────────────────────────────────────────────────────

export default function SuccessPage() {
  const params = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setStatus({ kind: "error", message: "Token mancante nell'URL." });
      return;
    }

    // Stripe webhook may arrive slightly after the redirect — retry up to 6×
    let attempt = 0;
    const MAX_ATTEMPTS = 6;
    const DELAY_MS = 2000;

    async function fetchReport() {
      try {
        const res = await fetch(`/api/report/${token}`);
        if (!res.ok) {
          const { error } = (await res.json()) as { error: string };
          throw new Error(error);
        }
        const report = (await res.json()) as ReportResponse;

        if (report.locked && attempt < MAX_ATTEMPTS) {
          attempt++;
          setStatus({ kind: "retrying", attempt });
          setTimeout(fetchReport, DELAY_MS);
          return;
        }

        setStatus({ kind: "done", report });
      } catch (err) {
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : "Errore sconosciuto.",
        });
      }
    }

    fetchReport();
  }, [token]);

  // ── Loading / retrying ────────────────────────────────────────────────────
  if (status.kind === "loading" || status.kind === "retrying") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 text-white">
        <span style={{ color: "#01696f" }}><Spinner /></span>
        <p className="text-sm text-gray-400">
          {status.kind === "retrying"
            ? `Attesa conferma pagamento… (${status.attempt}/${6})`
            : "Caricamento report…"}
        </p>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (status.kind === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 text-white">
        <p className="text-sm text-red-400">{status.message}</p>
        <a href="/" className="text-xs text-gray-500 underline">Torna alla home</a>
      </div>
    );
  }

  const { report } = status;

  // ── Report unlocked ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="border-b border-gray-900 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-white"
              style={{ background: "#01696f" }}
            >
              K
            </span>
            <span className="text-sm font-semibold tracking-tight">KPIGo</span>
          </a>
          <span
            className="rounded-full px-3 py-0.5 text-xs font-medium text-white"
            style={{ background: "#01696f33", color: "#01696f" }}
          >
            ✓ Pagato
          </span>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Report completo</h1>
            <p className="mt-1 text-xs text-gray-500">
              Generato il {new Date(report.generatedAt).toLocaleString("it-IT")} ·{" "}
              {report.rowCount} righe · token{" "}
              <span className="font-mono">{report.token.slice(0, 8)}…</span>
            </p>
          </div>
          <a
            href="/"
            className="rounded-full border border-gray-700 px-4 py-1.5 text-xs text-gray-400 hover:bg-gray-800"
          >
            Nuovo file
          </a>
        </div>

        {/* Numeric KPIs */}
        {report.kpis.numeric.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              KPI Numerici
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {report.kpis.numeric.map((k) => (
                <div key={k.column} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {k.column}
                  </p>
                  <p className="text-3xl font-bold text-white">{fmt(k.sum)}</p>
                  <p className="mb-3 text-xs text-gray-500">totale</p>
                  <div className="grid grid-cols-3 gap-2 border-t border-gray-800 pt-3">
                    {[{ label: "media", val: k.mean }, { label: "min", val: k.min }, { label: "max", val: k.max }].map(
                      ({ label, val }) => (
                        <div key={label} className="text-center">
                          <p className="text-sm font-semibold text-gray-200">{fmt(val)}</p>
                          <p className="text-xs text-gray-600">{label}</p>
                        </div>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Categorical KPIs */}
        {report.kpis.categorical.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Distribuzione Categorica
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {report.kpis.categorical.map((k) => (
                <div key={k.column} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {k.column}
                  </p>
                  <ul className="space-y-2">
                    {k.topValues.map((v) => (
                      <li key={v.value} className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-gray-800">
                          <div
                            className="h-1.5 rounded-full"
                            style={{ width: `${v.percent}%`, background: "#01696f" }}
                          />
                        </div>
                        <span className="w-24 truncate text-right text-xs text-gray-300">{v.value}</span>
                        <span className="w-8 text-right text-xs font-medium text-gray-400">{v.percent}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SVG Charts */}
        {(report.barSVG || report.pieSVG) && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Grafici
            </h2>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {report.barSVG && (
                <div
                  className="overflow-hidden rounded-xl border border-gray-800 bg-white p-4"
                  dangerouslySetInnerHTML={{ __html: report.barSVG }}
                />
              )}
              {report.pieSVG && (
                <div
                  className="overflow-hidden rounded-xl border border-gray-800 bg-white p-4"
                  dangerouslySetInnerHTML={{ __html: report.pieSVG }}
                />
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
