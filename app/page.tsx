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

interface CategoricalKPI {
  column: string;
  topValues: { value: string; count: number; percent: number }[];
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

// ─── Shared primitives ────────────────────────────────────────────────────────

function Spinner({ size = 5, color = "white" }: { size?: number; color?: string }) {
  return (
    <svg
      className={`animate-spin h-${size} w-${size}`}
      style={{ color }}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

// ─── Demo mockup (static SVG preview) ────────────────────────────────────────

function DemoMockup() {
  return (
    <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl">
      {/* fake browser bar */}
      <div className="flex items-center gap-1.5 border-b border-gray-800 bg-gray-950 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
        <span className="ml-3 rounded-md bg-gray-800 px-3 py-0.5 text-xs text-gray-500">
          kpigo.vercel.app/success
        </span>
        <span className="ml-auto rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "#01696f33", color: "#01696f" }}>
          ✓ Pagato
        </span>
      </div>

      <div className="p-5">
        {/* header */}
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <p className="text-base font-bold text-white">Report completo</p>
            <p className="text-xs text-gray-500">3 righe · token a3f2bc…</p>
          </div>
        </div>

        {/* kpi cards */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          {[
            { label: "IMPORTO", sum: "3.72k", mean: "1.24k", min: "980", max: "1.54k" },
            { label: "CATEGORIA", isBar: true },
          ].map((k, i) =>
            k.isBar ? (
              <div key={i} className="rounded-xl border border-gray-800 bg-gray-950 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  CATEGORIA
                </p>
                {[
                  { v: "Nord", p: 67 },
                  { v: "Sud", p: 33 },
                ].map((row) => (
                  <div key={row.v} className="mb-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-gray-800">
                      <div
                        className="h-1.5 rounded-full"
                        style={{ width: `${row.p}%`, background: "#01696f" }}
                      />
                    </div>
                    <span className="text-xs text-gray-400">
                      {row.v} {row.p}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div key={i} className="rounded-xl border border-gray-800 bg-gray-950 p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {k.label}
                </p>
                <p className="text-2xl font-bold text-white">{k.sum}</p>
                <p className="mb-2 text-xs text-gray-500">totale</p>
                <div className="grid grid-cols-3 gap-1 border-t border-gray-800 pt-2">
                  {[["media", k.mean], ["min", k.min], ["max", k.max]].map(([l, v]) => (
                    <div key={l} className="text-center">
                      <p className="text-xs font-semibold text-gray-300">{v}</p>
                      <p className="text-xs text-gray-600">{l}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>

        {/* fake charts row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="overflow-hidden rounded-xl border border-gray-800 bg-white p-2">
            <svg viewBox="0 0 200 80" className="w-full">
              <rect x="30" y="10" width="60" height="55" fill="#4F81BD" rx="2" />
              <rect x="110" y="30" width="60" height="35" fill="#C0504D" rx="2" />
              <line x1="20" y1="65" x2="185" y2="65" stroke="#ccc" strokeWidth="1" />
              <text x="60" y="6" textAnchor="middle" fontSize="7" fill="#333">3.72k</text>
              <text x="140" y="26" textAnchor="middle" fontSize="7" fill="#333">1.54k</text>
              <text x="60" y="74" textAnchor="middle" fontSize="7" fill="#666">Importo</text>
              <text x="140" y="74" textAnchor="middle" fontSize="7" fill="#666">Media</text>
            </svg>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-800 bg-white p-2">
            <svg viewBox="0 0 200 80" className="w-full">
              <path d="M70,40 L70,5 A35,35 0 1,1 35.4,57.5 Z" fill="#4F81BD" />
              <path d="M70,40 L35.4,57.5 A35,35 0 0,1 70,5 Z" fill="#C0504D" />
              <rect x="115" y="18" width="8" height="8" fill="#4F81BD" rx="1" />
              <text x="128" y="26" fontSize="7" fill="#333">Nord (67%)</text>
              <rect x="115" y="34" width="8" height="8" fill="#C0504D" rx="1" />
              <text x="128" y="42" fontSize="7" fill="#333">Sud (33%)</text>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Use case card ────────────────────────────────────────────────────────────

function UseCaseCard({
  icon,
  title,
  desc,
  tags,
}: {
  icon: string;
  title: string;
  desc: string;
  tags: string[];
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 transition-colors hover:border-gray-700">
      <div className="mb-3 text-2xl">{icon}</div>
      <p className="mb-1 text-sm font-semibold text-white">{title}</p>
      <p className="mb-3 text-xs leading-relaxed text-gray-500">{desc}</p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="rounded-full border border-gray-700 px-2 py-0.5 text-xs text-gray-500"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

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
  );
}

// ─── Loading step indicator ───────────────────────────────────────────────────

function LoadingStep({
  active,
  done,
  label,
}: {
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <div className={`flex items-center gap-2 text-sm ${active ? "text-white" : done ? "text-gray-500" : "text-gray-700"}`}>
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{
          background: done ? "#01696f" : active ? "#01696f44" : "#1f2937",
          color: done || active ? "white" : "#4b5563",
        }}
      >
        {done ? "✓" : active ? <Spinner size={3} /> : "·"}
      </span>
      {label}
    </div>
  );
}

// ─── Locked overlay ───────────────────────────────────────────────────────────

function LockedOverlay({
  token,
  onPay,
  paying,
}: {
  token: string;
  onPay: (token: string) => void;
  paying: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-dashed border-gray-700 bg-gray-900/60 p-10 text-center backdrop-blur-sm">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: "#01696f22" }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="#01696f" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      </div>
      <div>
        <p className="text-base font-semibold text-white">Grafici pronti, report bloccato</p>
        <p className="mt-1 text-sm text-gray-500">
          Acquista una volta per sbloccare grafici SVG e KPI completi
        </p>
      </div>
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => onPay(token)}
          disabled={paying}
          className="flex items-center gap-2 rounded-full px-7 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ background: "#01696f" }}
        >
          {paying ? <><Spinner size={4} /> Reindirizzamento…</> : "Sblocca per 4,90 €  →"}
        </button>
        <p className="text-xs text-gray-600">Pagamento sicuro via Stripe · una tantum</p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [paying, setPaying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isUploading = stage.kind === "uploading";
  const isGenerating = stage.kind === "generating";
  const isBusy = isUploading || isGenerating;

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    // client-side validation
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "xlsx" && ext !== "csv") {
      setStage({ kind: "error", message: "Formato non supportato. Carica un file .xlsx o .csv." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setStage({ kind: "error", message: "File troppo grande. Il limite è 5 MB." });
      return;
    }

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

      // scroll to result
      setTimeout(() => {
        document.getElementById("result")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch {
      setStage({ kind: "error", message: "Errore di rete. Controlla la connessione e riprova." });
    }
  }

  async function handlePay(token: string) {
    setPaying(true);
    try {
      const res = await fetch("/api/stripe-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setStage({ kind: "error", message: data.error ?? "Errore Stripe. Riprova." });
        return;
      }
      window.location.href = data.url;
    } catch {
      setStage({ kind: "error", message: "Errore di rete. Riprova." });
    } finally {
      setPaying(false);
    }
  }

  function reset() {
    setStage({ kind: "idle" });
    if (fileRef.current) fileRef.current.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const showLanding = stage.kind === "idle";

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ── Nav ────────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-10 border-b border-gray-900 bg-gray-950/90 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-white"
              style={{ background: "#01696f" }}
            >
              K
            </span>
            <span className="text-sm font-semibold tracking-tight">KPIGo</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-gray-500 sm:block">
              4,90€ / report · no abbonamento
            </span>
            {stage.kind === "done" && (
              <button
                onClick={reset}
                className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-400 hover:bg-gray-800"
              >
                Nuovo file
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-6">

        {/* ── HERO ───────────────────────────────────────────────────────────── */}
        {showLanding && (
          <>
            <section className="py-20 text-center">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-gray-800 bg-gray-900 px-4 py-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "#01696f" }} />
                <span className="text-xs text-gray-400">Nessun abbonamento · paghi solo il report</span>
              </div>

              <h1 className="mx-auto mb-4 max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                Excel/CSV →{" "}
                <span style={{ color: "#01696f" }}>KPI + Grafici</span>
                <br />in 30 secondi
              </h1>

              <p className="mx-auto mb-8 max-w-lg text-base text-gray-400">
                Carica il tuo file, ottieni analisi automatica dei dati, grafici professionali
                e un report completo. Un pagamento, nessun abbonamento.
              </p>

              <div className="mb-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <label
                  htmlFor="hero-file"
                  className="flex cursor-pointer items-center gap-2 rounded-full px-8 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-80"
                  style={{ background: "#01696f" }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Prova KPIGo — carica il tuo file
                </label>
                <span className="text-xs text-gray-600">poi 4,90€ per sbloccare il report</span>
              </div>

              <p className="text-xs text-gray-700">Max 5 MB · .xlsx .csv · fino a 10 000 righe</p>

              {/* hidden file input tied to hero CTA */}
              <form onSubmit={handleUpload}>
                <input
                  id="hero-file"
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
              </form>
            </section>

            {/* ── DEMO MOCKUP ──────────────────────────────────────────────── */}
            <section className="mb-20">
              <p className="mb-4 text-center text-xs font-medium uppercase tracking-widest text-gray-600">
                Esempio di report generato
              </p>
              <DemoMockup />
            </section>

            {/* ── USE CASES ────────────────────────────────────────────────── */}
            <section className="mb-20">
              <p className="mb-2 text-center text-xs font-medium uppercase tracking-widest text-gray-600">
                Perfetto per
              </p>
              <h2 className="mb-8 text-center text-2xl font-bold text-white">
                Qualsiasi file con dati tabellari
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <UseCaseCard
                  icon="📈"
                  title="Vendite"
                  desc="Analizza fatturato, prodotti top, performance per area geografica o periodo."
                  tags={["Fatturato", "Trend", "Aree"]}
                />
                <UseCaseCard
                  icon="🍽️"
                  title="Ristorante"
                  desc="Confronta coperti, scontrino medio, ore di punta e performance per giorno."
                  tags={["Coperti", "Scontrino medio", "Turni"]}
                />
                <UseCaseCard
                  icon="📦"
                  title="Inventario"
                  desc="Monitora giacenze, rotazione prodotti, categorie a rischio esaurimento."
                  tags={["Giacenze", "Rotazione", "Categorie"]}
                />
              </div>
            </section>

            {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
            <section className="mb-20">
              <h2 className="mb-8 text-center text-2xl font-bold text-white">Come funziona</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  { n: "1", title: "Carica il file", desc: "Excel o CSV, fino a 5 MB. Nessuna registrazione richiesta." },
                  { n: "2", title: "KPI calcolati in 30s", desc: "Somme, medie, distribuzioni e grafici SVG generati automaticamente." },
                  { n: "3", title: "Paga e scarica", desc: "4,90€ una tantum. Il report rimane disponibile tramite link." },
                ].map((s) => (
                  <div key={s.n} className="flex gap-4 rounded-xl border border-gray-800 bg-gray-900 p-5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ background: "#01696f" }}
                    >
                      {s.n}
                    </span>
                    <div>
                      <p className="mb-1 text-sm font-semibold text-white">{s.title}</p>
                      <p className="text-xs leading-relaxed text-gray-500">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── BOTTOM CTA ───────────────────────────────────────────────── */}
            <section className="mb-20 rounded-2xl border border-gray-800 bg-gray-900 p-10 text-center">
              <p className="mb-2 text-2xl font-bold text-white">Pronto in 30 secondi</p>
              <p className="mb-6 text-sm text-gray-500">
                Nessun account · nessun abbonamento · 4,90€ per report
              </p>
              <label
                htmlFor="hero-file"
                className="inline-flex cursor-pointer items-center gap-2 rounded-full px-8 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-80"
                style={{ background: "#01696f" }}
              >
                Carica il tuo file Excel/CSV
              </label>
            </section>
          </>
        )}

        {/* ── LOADING STATE ──────────────────────────────────────────────────── */}
        {isBusy && (
          <section className="flex min-h-[60vh] flex-col items-center justify-center gap-6 py-20">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: "#01696f22" }}
            >
              <Spinner size={7} color="#01696f" />
            </div>
            <div className="flex flex-col gap-3">
              <LoadingStep done={false} active={isUploading} label="Caricamento file…" />
              <LoadingStep done={isGenerating} active={false} label="Parsing Excel/CSV" />
              <LoadingStep done={false} active={isGenerating} label="Calcolo KPI e grafici…" />
              <LoadingStep done={false} active={false} label="Report pronto" />
            </div>
            <p className="text-xs text-gray-600">Di solito meno di 10 secondi</p>
          </section>
        )}

        {/* ── ERROR STATE ────────────────────────────────────────────────────── */}
        {stage.kind === "error" && (
          <section className="flex min-h-[60vh] flex-col items-center justify-center gap-5 py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-950/50 text-2xl">
              ⚠️
            </div>
            <div className="text-center">
              <p className="mb-1 text-base font-semibold text-white">Qualcosa è andato storto</p>
              <p className="text-sm text-red-400">{stage.message}</p>
            </div>
            <button
              onClick={reset}
              className="rounded-full px-6 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80"
              style={{ background: "#01696f" }}
            >
              Riprova
            </button>
          </section>
        )}

        {/* ── REPORT ─────────────────────────────────────────────────────────── */}
        {stage.kind === "done" && (
          <section id="result" className="space-y-8 py-10">
            {/* header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white">Anteprima report</h2>
                  {stage.report.locked && (
                    <span className="rounded-full border border-yellow-800 bg-yellow-950/50 px-2 py-0.5 text-xs text-yellow-500">
                      bloccato
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {stage.report.rowCount} righe analizzate · generato il{" "}
                  {new Date(stage.report.generatedAt).toLocaleString("it-IT")}
                </p>
              </div>
              <button
                onClick={reset}
                className="rounded-full border border-gray-700 px-4 py-1.5 text-xs text-gray-400 hover:bg-gray-800"
              >
                Nuovo file
              </button>
            </div>

            {/* numeric KPIs */}
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

            {/* categorical KPIs */}
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

            {/* charts / locked */}
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Grafici
              </h3>
              {stage.report.locked || !stage.report.barSVG ? (
                <LockedOverlay
                  token={stage.report.token}
                  onPay={handlePay}
                  paying={paying}
                />
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
          </section>
        )}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="mt-10 border-t border-gray-900 px-6 py-6 text-center">
        <p className="text-xs text-gray-700">
          KPIGo · Next.js · Vercel Blob · Stripe · SVG charts
        </p>
      </footer>
    </div>
  );
}
