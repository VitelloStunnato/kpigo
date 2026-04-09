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

interface CatFreq {
  value: string;
  count: number;
  percent: number;
}

interface CategoricalKPI {
  column: string;
  topValues: CatFreq[];
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
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(2)}k`;
  if (n % 1 === 0)    return String(n);
  return n.toFixed(2);
}

function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg className="animate-spin shrink-0" style={{ width: size, height: size, color: "var(--teal-bright)" }}
      fill="none" viewBox="0 0 24 24">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

function LogoMark() {
  return (
    <a href="/" className="flex items-center gap-2.5 group">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-xs font-black text-white"
        style={{
          background: "linear-gradient(145deg, #01b0bc 0%, var(--teal) 100%)",
          boxShadow: "0 0 14px -2px rgba(1,122,130,0.5), inset 0 1px 0 rgba(255,255,255,0.12)",
          letterSpacing: "-0.03em",
        }}
      >K</span>
      <span className="text-sm font-bold tracking-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
        KPIGo
      </span>
    </a>
  );
}

// ─── Full-screen states ───────────────────────────────────────────────────────

function LoadingScreen({ attempt }: { attempt?: number }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5"
      style={{ background: "var(--surface-0)" }}>
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: "var(--teal-glow)", border: "1px solid var(--teal-border)", boxShadow: "0 0 24px -6px rgba(1,122,130,0.3)" }}>
        <Spinner size={28} />
      </div>
      <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
        {attempt
          ? `Attesa conferma pagamento… (${attempt}/6)`
          : "Caricamento report…"}
      </p>
      {attempt && (
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          Il webhook Stripe può richiedere qualche secondo
        </p>
      )}
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6"
      style={{ background: "var(--surface-0)" }}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl"
        style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.18)" }}>
        ⚠️
      </div>
      <div className="max-w-xs text-center">
        <p className="mb-1.5 text-sm font-bold" style={{ color: "#f87171" }}>Errore</p>
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{message}</p>
      </div>
      <a href="/"
        className="btn-ghost rounded-full px-5 py-2 text-xs font-semibold">
        ← Torna alla home
      </a>
    </div>
  );
}

// ─── KPI cards ────────────────────────────────────────────────────────────────

function NumKPICard({ kpi }: { kpi: NumericKPI }) {
  return (
    <div className="kpi-card p-5">
      <p className="section-label mb-3">{kpi.column}</p>
      <p className="stat-value">{fmt(kpi.sum)}</p>
      <p className="stat-sub mb-4">totale · {kpi.count} valori</p>
      <div className="grid grid-cols-3 gap-3 border-t pt-4" style={{ borderColor: "var(--border-dim)" }}>
        {([["media", kpi.mean], ["min", kpi.min], ["max", kpi.max]] as const).map(([l, v]) => (
          <div key={l} className="text-center">
            <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-secondary)" }}>
              {fmt(Number(v))}
            </p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-faint)" }}>{l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CatKPICard({ kpi }: { kpi: CategoricalKPI }) {
  const max = kpi.topValues[0]?.percent ?? 100;
  return (
    <div className="kpi-card p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <p className="section-label">{kpi.column}</p>
        <span className="text-xs tabular-nums" style={{ color: "var(--text-faint)" }}>
          {kpi.totalCount} righe
        </span>
      </div>
      <ul className="space-y-3">
        {kpi.topValues.map((v) => (
          <li key={v.value} className="flex items-center gap-3">
            {/* bar scaled to max for visual punch */}
            <div className="progress-track flex-1">
              <div className="progress-fill" style={{ width: `${(v.percent / max) * 100}%` }} />
            </div>
            <span className="w-28 truncate text-right text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {v.value}
            </span>
            <span className="w-9 text-right text-xs font-bold tabular-nums" style={{ color: "#4dcfcf" }}>
              {v.percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Inner component (uses useSearchParams) ───────────────────────────────────

function SuccessInner() {
  const params = useSearchParams();
  const token  = params.get("token");
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setStatus({ kind: "error", message: "Token mancante nell'URL." });
      return;
    }

    let attempt = 0;
    const MAX = 6;
    const DELAY = 2000;

    async function poll() {
      try {
        const res = await fetch(`/api/report/${token}`);
        if (!res.ok) {
          const { error } = (await res.json()) as { error: string };
          throw new Error(error);
        }
        const report = (await res.json()) as ReportResponse;

        if (report.locked && attempt < MAX) {
          attempt++;
          setStatus({ kind: "retrying", attempt });
          setTimeout(poll, DELAY);
          return;
        }
        setStatus({ kind: "done", report });
      } catch (err) {
        setStatus({ kind: "error", message: err instanceof Error ? err.message : "Errore sconosciuto." });
      }
    }

    poll();
  }, [token]);

  if (status.kind === "loading")  return <LoadingScreen />;
  if (status.kind === "retrying") return <LoadingScreen attempt={status.attempt} />;
  if (status.kind === "error")    return <ErrorScreen message={status.message} />;

  const { report } = status;
  const date = new Date(report.generatedAt).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="min-h-screen" style={{ background: "var(--surface-0)", color: "var(--text-primary)" }}>

      {/* Noise overlay */}
      <div className="noise-overlay" aria-hidden />

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav className="nav-glass sticky top-0 z-30">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3.5">
          <LogoMark />
          <span className="chip-success rounded-full px-3 py-1 text-xs font-semibold">
            ✓ Report sbloccato
          </span>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-5 py-12">

        {/* ── HEADER ──────────────────────────────────────────────────── */}
        <div className="animate-fade-up mb-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.04em" }}>
              Report completo
            </h1>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Generato il {date} · {report.rowCount} righe · token{" "}
              <span className="font-mono">{report.token.slice(0, 8)}…</span>
            </p>
          </div>
          <a href="/" className="btn-ghost rounded-full px-4 py-1.5 text-xs font-semibold">
            ← Nuovo file
          </a>
        </div>

        <hr className="divider mb-10" />

        {/* ── NUMERIC KPIs ────────────────────────────────────────────── */}
        {report.kpis.numeric.length > 0 && (
          <section className="animate-fade-up-2 mb-10">
            <div className="mb-5 flex items-center gap-3">
              <p className="section-label">KPI Numerici</p>
              <span className="text-xs tabular-nums" style={{ color: "var(--text-faint)" }}>
                {report.kpis.numeric.length} colonne
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {report.kpis.numeric.map(k => <NumKPICard key={k.column} kpi={k} />)}
            </div>
          </section>
        )}

        {/* ── CATEGORICAL KPIs ────────────────────────────────────────── */}
        {report.kpis.categorical.length > 0 && (
          <section className="animate-fade-up-3 mb-10">
            <div className="mb-5 flex items-center gap-3">
              <p className="section-label">Distribuzione categorica</p>
              <span className="text-xs tabular-nums" style={{ color: "var(--text-faint)" }}>
                {report.kpis.categorical.length} colonne
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {report.kpis.categorical.map(k => <CatKPICard key={k.column} kpi={k} />)}
            </div>
          </section>
        )}

        {/* ── CHARTS ──────────────────────────────────────────────────── */}
        {(report.barSVG || report.pieSVG) && (
          <section className="animate-fade-up-4 mb-10">
            <p className="section-label mb-5">Grafici SVG</p>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {report.barSVG && (
                <div className="overflow-hidden rounded-[14px] bg-white p-5 shadow-lg"
                  style={{ border: "1px solid #e8e8e8" }}
                  dangerouslySetInnerHTML={{ __html: report.barSVG }} />
              )}
              {report.pieSVG && (
                <div className="overflow-hidden rounded-[14px] bg-white p-5 shadow-lg"
                  style={{ border: "1px solid #e8e8e8" }}
                  dangerouslySetInnerHTML={{ __html: report.pieSVG }} />
              )}
            </div>
          </section>
        )}

        {/* ── FOOTER CTA ──────────────────────────────────────────────── */}
        <div className="mt-16 rounded-[14px] p-8 text-center"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-dim)" }}>
          <p className="mb-1.5 text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            Hai un altro file da analizzare?
          </p>
          <p className="mb-5 text-xs" style={{ color: "var(--text-muted)" }}>
            Ogni report è indipendente · 4,90 € · nessun abbonamento
          </p>
          <a href="/"
            className="btn-teal inline-flex items-center gap-2 rounded-full px-7 py-2.5 text-sm font-bold text-white">
            Nuovo report
          </a>
        </div>

      </main>

    </div>
  );
}

// ─── Page export ─────────────────────────────────────────────────────────────

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center"
          style={{ background: "var(--surface-0)" }}>
          <svg className="animate-spin h-6 w-6" style={{ color: "var(--teal-bright)" }}
            fill="none" viewBox="0 0 24 24">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" />
            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        </div>
      }
    >
      <SuccessInner />
    </Suspense>
  );
}
