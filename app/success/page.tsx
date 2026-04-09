"use client";

import { Suspense, useEffect, useState } from "react";
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

function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg
      className="animate-spin"
      style={{ width: size, height: size, color: "var(--teal)" }}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

// ─── Inner component (uses useSearchParams — must be inside Suspense) ─────────

function SuccessInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setStatus({ kind: "error", message: "Token mancante nell'URL." });
      return;
    }

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
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4"
        style={{ background: "var(--surface-0)" }}
      >
        <Spinner size={28} />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {status.kind === "retrying"
            ? `Attesa conferma pagamento… (${status.attempt}/6)`
            : "Caricamento report…"}
        </p>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (status.kind === "error") {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4"
        style={{ background: "var(--surface-0)" }}
      >
        <div
          className="rounded-xl p-6 text-center"
          style={{
            background: "var(--surface-1)",
            border: "1px solid rgba(239,68,68,0.25)",
            maxWidth: 360,
          }}
        >
          <p className="mb-1 text-sm font-medium" style={{ color: "#f87171" }}>
            Errore
          </p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {status.message}
          </p>
        </div>
        <a
          href="/"
          className="text-xs underline"
          style={{ color: "var(--text-muted)" }}
        >
          Torna alla home
        </a>
      </div>
    );
  }

  const { report } = status;

  // ── Report unlocked ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: "var(--surface-0)", color: "var(--text-primary)" }}>

      {/* Nav */}
      <nav
        className="sticky top-0 z-50 px-6 py-4"
        style={{
          background: "rgba(9,9,11,0.85)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid var(--border-dim)",
        }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 group">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-white"
              style={{
                background: "linear-gradient(135deg, #01818a 0%, var(--teal) 100%)",
                boxShadow: "0 0 12px -2px rgba(1,105,111,0.5)",
              }}
            >
              K
            </span>
            <span
              className="text-sm font-semibold tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              KPIGo
            </span>
          </a>
          <span
            className="chip-teal rounded-full px-3 py-0.5 text-xs font-medium"
          >
            ✓ Pagato
          </span>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl space-y-10 px-6 py-12">

        {/* Header */}
        <div className="animate-fade-up flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
              Report completo
            </h1>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Generato il {new Date(report.generatedAt).toLocaleString("it-IT")} ·{" "}
              {report.rowCount} righe · token{" "}
              <span className="font-mono">{report.token.slice(0, 8)}…</span>
            </p>
          </div>
          <a
            href="/"
            className="rounded-full px-4 py-1.5 text-xs transition-colors"
            style={{
              border: "1px solid var(--border-mid)",
              color: "var(--text-secondary)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--surface-2)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            Nuovo file
          </a>
        </div>

        {/* Numeric KPIs */}
        {report.kpis.numeric.length > 0 && (
          <section className="animate-fade-up-2">
            <p className="section-label mb-4">KPI Numerici</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {report.kpis.numeric.map((k) => (
                <div key={k.column} className="kpi-card p-5">
                  <p
                    className="section-label mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {k.column}
                  </p>
                  <p
                    className="text-3xl font-bold tracking-tight"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {fmt(k.sum)}
                  </p>
                  <p
                    className="mb-4 text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    totale
                  </p>
                  <div
                    className="grid grid-cols-3 gap-2 pt-4"
                    style={{ borderTop: "1px solid var(--border-dim)" }}
                  >
                    {[
                      { label: "media", val: k.mean },
                      { label: "min", val: k.min },
                      { label: "max", val: k.max },
                    ].map(({ label, val }) => (
                      <div key={label} className="text-center">
                        <p
                          className="text-sm font-semibold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {fmt(val)}
                        </p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {label}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Categorical KPIs */}
        {report.kpis.categorical.length > 0 && (
          <section className="animate-fade-up-3">
            <p className="section-label mb-4">Distribuzione Categorica</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {report.kpis.categorical.map((k) => (
                <div key={k.column} className="kpi-card p-5">
                  <p
                    className="section-label mb-4"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {k.column}
                  </p>
                  <ul className="space-y-3">
                    {k.topValues.map((v) => (
                      <li key={v.value} className="flex items-center gap-3">
                        <div
                          className="h-1.5 flex-1 rounded-full"
                          style={{ background: "var(--surface-3)" }}
                        >
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{
                              width: `${v.percent}%`,
                              background: "linear-gradient(90deg, var(--teal) 0%, #01c4c4 100%)",
                            }}
                          />
                        </div>
                        <span
                          className="w-24 truncate text-right text-xs"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {v.value}
                        </span>
                        <span
                          className="w-8 text-right text-xs font-semibold tabular-nums"
                          style={{ color: "#5ecfcf" }}
                        >
                          {v.percent}%
                        </span>
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
            <p className="section-label mb-4">Grafici</p>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {report.barSVG && (
                <div
                  className="kpi-card overflow-hidden p-5"
                  dangerouslySetInnerHTML={{ __html: report.barSVG }}
                />
              )}
              {report.pieSVG && (
                <div
                  className="kpi-card overflow-hidden p-5"
                  dangerouslySetInnerHTML={{ __html: report.pieSVG }}
                />
              )}
            </div>
          </section>
        )}

        {/* Footer */}
        <div
          className="divider pt-8 text-center"
        >
          <p className="text-xs" style={{ color: "var(--text-faint)" }}>
            Genera un nuovo report su{" "}
            <a
              href="/"
              className="underline"
              style={{ color: "var(--text-muted)" }}
            >
              kpigo.vercel.app
            </a>
          </p>
        </div>

      </main>
    </div>
  );
}

// ─── Page export — wraps inner component in Suspense (required for useSearchParams) ──

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center"
          style={{ background: "var(--surface-0)" }}
        >
          <svg
            className="animate-spin h-6 w-6"
            style={{ color: "var(--teal)" }}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        </div>
      }
    >
      <SuccessInner />
    </Suspense>
  );
}
