"use client";

import { useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NumericKPI  { column: string; sum: number; mean: number; min: number; max: number; count: number; }
interface CatFreq     { value: string; count: number; percent: number; }
interface CatKPI      { column: string; topValues: CatFreq[]; totalCount: number; }
interface KPIs        { numeric: NumericKPI[]; categorical: CatKPI[]; rowCount: number; }
interface UploadResp  { uploadId: string; rowCount: number; }
interface ReportResp  { token: string; kpis: KPIs; barSVG: string; pieSVG: string; locked: boolean; rowCount: number; generatedAt: string; }

type Stage =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "generating"; uploadId: string }
  | { kind: "done"; report: ReportResp }
  | { kind: "error"; message: string };

// ─── Util ─────────────────────────────────────────────────────────────────────

const fmt = (n: number): string =>
  n >= 1e6 ? `${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `${(n/1e3).toFixed(2)}k` : n%1===0 ? String(n) : n.toFixed(2);

// ─── Primitives ───────────────────────────────────────────────────────────────

function Spinner({ sz = 5, c = "currentColor" }: { sz?: number; c?: string }) {
  return (
    <svg className={`animate-spin h-${sz} w-${sz} shrink-0`} style={{ color: c }} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border px-2.5 py-0.5 text-xs"
      style={{ borderColor: "var(--border-mid)", color: "var(--text-muted)" }}>
      {children}
    </span>
  );
}

// ─── Demo mockup ──────────────────────────────────────────────────────────────

function DemoMockup() {
  return (
    <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-2xl shadow-2xl"
      style={{ border: "1px solid var(--border-mid)", background: "var(--surface-1)" }}>
      {/* browser chrome */}
      <div className="flex items-center gap-2 border-b px-4 py-3"
        style={{ borderColor: "var(--border-dim)", background: "var(--surface-0)" }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ef4444" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#f59e0b" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#22c55e" }} />
        <span className="ml-3 flex-1 rounded-md px-3 py-1 text-xs font-mono"
          style={{ background: "var(--surface-3)", color: "var(--text-muted)" }}>
          kpigo.vercel.app/success
        </span>
        <span className="chip-teal rounded-full px-2.5 py-0.5 text-xs font-medium">✓ Pagato</span>
      </div>

      <div className="p-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Report completo</p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>3 righe · generato 09/04/2026 · token a3f2bc…</p>
          </div>
        </div>

        {/* KPI cards */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div className="kpi-card p-4">
            <p className="section-label mb-2">Importo</p>
            <p className="mb-0.5 text-2xl font-bold" style={{ color: "var(--text-primary)" }}>3.72k</p>
            <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>totale</p>
            <div className="grid grid-cols-3 gap-1 border-t pt-3" style={{ borderColor: "var(--border-dim)" }}>
              {[["1.24k","media"],["980","min"],["1.54k","max"]].map(([v,l])=>(
                <div key={l} className="text-center">
                  <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{v}</p>
                  <p className="text-xs" style={{ color: "var(--text-faint)" }}>{l}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="kpi-card p-4">
            <p className="section-label mb-3">Categoria</p>
            {[{v:"Nord",p:67},{v:"Sud",p:33}].map(r=>(
              <div key={r.v} className="mb-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-3)" }}>
                  <div className="h-1.5 rounded-full" style={{ width:`${r.p}%`, background:"var(--teal)" }} />
                </div>
                <span className="w-20 text-right text-xs" style={{ color: "var(--text-secondary)" }}>{r.v} {r.p}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-2 gap-3">
          {[
            <svg key="bar" viewBox="0 0 200 90" className="w-full">
              <line x1="24" y1="8" x2="24" y2="72" stroke="#27272a" strokeWidth="1"/>
              <line x1="24" y1="72" x2="190" y2="72" stroke="#27272a" strokeWidth="1"/>
              {[{x:40,h:58,v:"3.72k",c:"#4F81BD"},{x:110,h:32,v:"1.54k",c:"#01696f"}].map(b=>(
                <g key={b.x}>
                  <rect x={b.x} y={72-b.h} width={48} height={b.h} fill={b.c} rx="3"/>
                  <text x={b.x+24} y={72-b.h-5} textAnchor="middle" fontSize="8" fill="#a1a1aa">{b.v}</text>
                </g>
              ))}
            </svg>,
            <svg key="pie" viewBox="0 0 200 90" className="w-full">
              <path d="M75,45 L75,5 A40,40 0 1,1 42.2,68 Z" fill="#4F81BD"/>
              <path d="M75,45 L42.2,68 A40,40 0 0,1 75,5 Z" fill="#01696f"/>
              <rect x="125" y="22" width="9" height="9" fill="#4F81BD" rx="2"/>
              <text x="139" y="30" fontSize="8" fill="#a1a1aa">Nord 67%</text>
              <rect x="125" y="38" width="9" height="9" fill="#01696f" rx="2"/>
              <text x="139" y="46" fontSize="8" fill="#a1a1aa">Sud 33%</text>
            </svg>
          ].map((chart, i) => (
            <div key={i} className="overflow-hidden rounded-xl bg-white p-3"
              style={{ border: "1px solid #f4f4f5" }}>
              {chart}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Use-case card ────────────────────────────────────────────────────────────

function UseCaseCard({ icon, title, desc, tags }: { icon: string; title: string; desc: string; tags: string[] }) {
  return (
    <div className="kpi-card flex flex-col gap-4 p-6">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl"
        style={{ background: "var(--surface-3)", border: "1px solid var(--border-dim)" }}>
        {icon}
      </div>
      <div>
        <p className="mb-1.5 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</p>
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{desc}</p>
      </div>
      <div className="mt-auto flex flex-wrap gap-1.5">
        {tags.map(t => <Tag key={t}>{t}</Tag>)}
      </div>
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDot({ done, active, label }: { done: boolean; active: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-3 text-sm transition-opacity duration-300 ${active||done ? "opacity-100":"opacity-35"}`}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{
          background: done ? "var(--teal)" : active ? "var(--teal-glow)" : "var(--surface-3)",
          border: `1px solid ${done ? "var(--teal)" : active ? "var(--teal-border)" : "var(--border-dim)"}`,
          color: done||active ? "white" : "var(--text-faint)",
        }}>
        {done ? "✓" : active ? <Spinner sz={3} c="#5ecfcf" /> : "·"}
      </span>
      <span style={{ color: active ? "var(--text-primary)" : done ? "var(--text-muted)" : "var(--text-faint)" }}>
        {label}
      </span>
    </div>
  );
}

// ─── KPI card (report) ────────────────────────────────────────────────────────

function KPICard({ kpi }: { kpi: NumericKPI }) {
  return (
    <div className="kpi-card p-5">
      <p className="section-label mb-3">{kpi.column}</p>
      <p className="mb-0.5 text-3xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
        {fmt(kpi.sum)}
      </p>
      <p className="mb-4 text-xs" style={{ color: "var(--text-muted)" }}>totale · {kpi.count} valori</p>
      <div className="grid grid-cols-3 gap-2 border-t pt-4" style={{ borderColor: "var(--border-dim)" }}>
        {[["media", kpi.mean], ["min", kpi.min], ["max", kpi.max]].map(([l, v]) => (
          <div key={String(l)} className="text-center">
            <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>{fmt(Number(v))}</p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-faint)" }}>{l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CatCard({ kpi }: { kpi: CatKPI }) {
  return (
    <div className="kpi-card p-5">
      <p className="section-label mb-4">{kpi.column}</p>
      <ul className="space-y-3">
        {kpi.topValues.map((v) => (
          <li key={v.value} className="flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-3)" }}>
              <div className="h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${v.percent}%`, background: "var(--teal)" }} />
            </div>
            <span className="w-28 truncate text-right text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {v.value}
            </span>
            <span className="w-9 text-right text-xs" style={{ color: "var(--text-muted)" }}>{v.percent}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Locked overlay ───────────────────────────────────────────────────────────

function LockedOverlay({ token, onPay, paying }: { token: string; onPay: (t: string) => void; paying: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 rounded-2xl p-12 text-center"
      style={{
        background: "linear-gradient(160deg, var(--surface-1) 0%, var(--surface-0) 100%)",
        border: "1px dashed var(--border-mid)",
      }}>
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: "var(--teal-glow)", border: "1px solid var(--teal-border)" }}>
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="var(--teal)" strokeWidth="1.8">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      </div>
      <div>
        <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          KPI pronti — grafici bloccati
        </p>
        <p className="mt-2 max-w-xs text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Acquista il report completo una sola volta per sbloccare i grafici SVG interattivi.
        </p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <button onClick={() => onPay(token)} disabled={paying}
          className="btn-teal flex items-center gap-2 rounded-full px-8 py-3 text-sm font-semibold text-white">
          {paying ? <><Spinner sz={4} /> Reindirizzamento…</> : "Sblocca report  — 4,90 €"}
        </button>
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          Pagamento sicuro via Stripe · una tantum · nessun abbonamento
        </p>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [paying, setPaying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isUploading  = stage.kind === "uploading";
  const isGenerating = stage.kind === "generating";
  const isBusy       = isUploading || isGenerating;

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

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
      if (!upRes.ok) { const { error } = await upRes.json() as { error: string }; setStage({ kind: "error", message: error }); return; }
      const { uploadId } = await upRes.json() as UploadResp;

      setStage({ kind: "generating", uploadId });

      const genRes = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId }) });
      if (!genRes.ok) { const { error } = await genRes.json() as { error: string }; setStage({ kind: "error", message: error }); return; }
      const { token } = await genRes.json() as { token: string };

      const repRes = await fetch(`/api/report/${token}`);
      if (!repRes.ok) { const { error } = await repRes.json() as { error: string }; setStage({ kind: "error", message: error }); return; }
      const report = await repRes.json() as ReportResp;

      setStage({ kind: "done", report });
      setTimeout(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth" }), 80);
    } catch {
      setStage({ kind: "error", message: "Errore di rete. Controlla la connessione e riprova." });
    }
  }

  async function handlePay(token: string) {
    setPaying(true);
    try {
      const res = await fetch("/api/stripe-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) { setStage({ kind: "error", message: data.error ?? "Errore Stripe." }); return; }
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--surface-0)" }}>

      {/* NAV */}
      <nav className="sticky top-0 z-20 flex items-center justify-between px-6 py-3.5 backdrop-blur-xl"
        style={{ borderBottom: "1px solid var(--border-dim)", background: "rgba(9,9,11,0.82)" }}>
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, #01818a, var(--teal))", boxShadow: "0 0 12px rgba(1,105,111,0.4)" }}>
            K
          </span>
          <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>KPIGo</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-xs sm:block" style={{ color: "var(--text-faint)" }}>
            4,90€ / report · no abbonamento
          </span>
          {stage.kind === "done" && (
            <button onClick={reset}
              className="rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
              style={{ borderColor: "var(--border-mid)", color: "var(--text-secondary)" }}>
              ← Nuovo file
            </button>
          )}
        </div>
      </nav>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5">

        {/* ── LANDING ─────────────────────────────────────────────────────── */}
        {showLanding && (
          <>
            {/* HERO */}
            <section className="animate-fade-up pb-16 pt-24 text-center">
              {/* badge */}
              <div className="chip-teal mb-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium">
                <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--teal)" }} />
                Nessun abbonamento · paghi solo il report
              </div>

              {/* headline */}
              <h1 className="mx-auto mb-5 max-w-2xl text-5xl font-bold leading-tight tracking-tight sm:text-6xl"
                style={{ color: "var(--text-primary)" }}>
                Excel / CSV →{" "}
                <span className="text-gradient">KPI + Grafici</span>
                <br />in 30 secondi
              </h1>

              <p className="mx-auto mb-10 max-w-md text-base leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Carica il file, ottieni analisi automatica, grafici professionali e un report
                completo. Un pagamento, nessun account.
              </p>

              {/* CTA */}
              <div className="flex flex-col items-center gap-3">
                <label htmlFor="hero-file"
                  className="btn-teal inline-flex cursor-pointer items-center gap-2.5 rounded-full px-8 py-3.5 text-sm font-semibold text-white">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Carica il tuo file
                </label>
                <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                  poi 4,90€ per sbloccare · .xlsx .csv · max 5 MB
                </p>
              </div>

              {/* hidden form */}
              <form onSubmit={handleUpload} className="hidden">
                <input id="hero-file" ref={fileRef} type="file" accept=".xlsx,.csv"
                  onChange={(e) => { if (e.target.files?.[0]) e.currentTarget.form?.requestSubmit(); }} />
              </form>
            </section>

            {/* DEMO */}
            <section className="animate-fade-up-2 mb-24">
              <p className="section-label mb-5 text-center">Esempio report generato</p>
              <DemoMockup />
              <div className="mt-4 flex justify-center gap-6 text-xs" style={{ color: "var(--text-faint)" }}>
                {["KPI numerici","Distribuzione categorica","Grafici SVG"].map(l => (
                  <span key={l} className="flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full" style={{ background: "var(--teal)" }} />{l}
                  </span>
                ))}
              </div>
            </section>

            {/* USE CASES */}
            <section className="animate-fade-up-3 mb-24">
              <p className="section-label mb-2 text-center">Casi d&apos;uso</p>
              <h2 className="mb-10 text-center text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                Funziona con qualsiasi file tabellare
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <UseCaseCard icon="📈" title="Vendite"
                  desc="Analizza fatturato, prodotti top, performance per area geografica o periodo."
                  tags={["Fatturato","Trend","Per area"]} />
                <UseCaseCard icon="🍽️" title="Ristorante"
                  desc="Confronta coperti, scontrino medio, ore di punta e performance per giorno."
                  tags={["Coperti","Scontrino medio","Turni"]} />
                <UseCaseCard icon="📦" title="Inventario"
                  desc="Monitora giacenze, rotazione prodotti, categorie a rischio esaurimento."
                  tags={["Giacenze","Rotazione","Categorie"]} />
              </div>
            </section>

            {/* HOW IT WORKS */}
            <section className="mb-24">
              <h2 className="mb-10 text-center text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                Come funziona
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  { n:"1", title:"Carica il file", desc:"Excel o CSV, fino a 5 MB. Nessuna registrazione." },
                  { n:"2", title:"KPI in 30 secondi", desc:"Somme, medie, distribuzioni e grafici SVG generati automaticamente." },
                  { n:"3", title:"Paga e accedi", desc:"4,90€ una tantum. Il report rimane accessibile tramite link." },
                ].map((s) => (
                  <div key={s.n} className="kpi-card flex gap-4 p-6">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                      style={{ background: "linear-gradient(135deg,#01818a,var(--teal))" }}>
                      {s.n}
                    </span>
                    <div>
                      <p className="mb-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{s.title}</p>
                      <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* BOTTOM CTA */}
            <section className="mb-24 rounded-2xl p-10 text-center"
              style={{ background: "linear-gradient(160deg, var(--surface-1) 0%, var(--surface-0) 100%)", border: "1px solid var(--border-dim)" }}>
              <p className="mb-1.5 text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Inizia ora</p>
              <p className="mb-8 text-sm" style={{ color: "var(--text-muted)" }}>
                Nessun account · nessun abbonamento · 4,90€ per report
              </p>
              <label htmlFor="hero-file"
                className="btn-teal inline-flex cursor-pointer items-center gap-2 rounded-full px-8 py-3.5 text-sm font-semibold text-white">
                Carica Excel / CSV
              </label>
            </section>
          </>
        )}

        {/* ── LOADING ─────────────────────────────────────────────────────── */}
        {isBusy && (
          <section className="flex min-h-[65vh] flex-col items-center justify-center gap-8 py-20">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl"
              style={{ background: "var(--teal-glow)", border: "1px solid var(--teal-border)" }}>
              <Spinner sz={8} c="#5ecfcf" />
            </div>
            <div className="flex flex-col gap-3.5">
              <StepDot done={false}        active={isUploading}  label="Caricamento file" />
              <StepDot done={isGenerating} active={false}        label="Parsing Excel / CSV" />
              <StepDot done={false}        active={isGenerating} label="Calcolo KPI e grafici" />
              <StepDot done={false}        active={false}        label="Report pronto" />
            </div>
            <p className="text-xs" style={{ color: "var(--text-faint)" }}>Di solito meno di 10 secondi</p>
          </section>
        )}

        {/* ── ERROR ───────────────────────────────────────────────────────── */}
        {stage.kind === "error" && (
          <section className="flex min-h-[65vh] flex-col items-center justify-center gap-6 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
              ⚠️
            </div>
            <div>
              <p className="mb-2 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                Qualcosa è andato storto
              </p>
              <p className="max-w-xs text-sm" style={{ color: "#f87171" }}>{stage.message}</p>
            </div>
            <button onClick={reset}
              className="btn-teal rounded-full px-7 py-2.5 text-sm font-semibold text-white">
              Riprova
            </button>
          </section>
        )}

        {/* ── REPORT ──────────────────────────────────────────────────────── */}
        {stage.kind === "done" && (
          <section id="result" className="space-y-8 py-12">
            {/* header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                    Anteprima report
                  </h2>
                  {stage.report.locked ? (
                    <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
                      style={{ borderColor:"rgba(234,179,8,0.3)", background:"rgba(234,179,8,0.08)", color:"#ca8a04" }}>
                      bloccato
                    </span>
                  ) : (
                    <span className="chip-teal rounded-full px-2.5 py-0.5 text-xs font-medium">✓ sbloccato</span>
                  )}
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {stage.report.rowCount} righe analizzate · generato il{" "}
                  {new Date(stage.report.generatedAt).toLocaleString("it-IT")}
                </p>
              </div>
              <button onClick={reset}
                className="rounded-full border px-4 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
                style={{ borderColor: "var(--border-mid)", color: "var(--text-secondary)" }}>
                ← Nuovo file
              </button>
            </div>

            <hr className="divider" />

            {/* numeric KPIs */}
            {stage.report.kpis.numeric.length > 0 && (
              <div>
                <p className="section-label mb-4">Colonne numeriche</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {stage.report.kpis.numeric.map(k => <KPICard key={k.column} kpi={k} />)}
                </div>
              </div>
            )}

            {/* categorical KPIs */}
            {stage.report.kpis.categorical.length > 0 && (
              <div>
                <p className="section-label mb-4">Distribuzione categorica</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {stage.report.kpis.categorical.map(k => <CatCard key={k.column} kpi={k} />)}
                </div>
              </div>
            )}

            {/* charts / locked */}
            <div>
              <p className="section-label mb-4">Grafici</p>
              {stage.report.locked || !stage.report.barSVG ? (
                <LockedOverlay token={stage.report.token} onPay={handlePay} paying={paying} />
              ) : (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  {[stage.report.barSVG, stage.report.pieSVG].map((svg, i) => (
                    <div key={i}
                      className="overflow-hidden rounded-2xl bg-white p-5 shadow-lg"
                      style={{ border: "1px solid #f4f4f5" }}
                      dangerouslySetInnerHTML={{ __html: svg }} />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

      </main>

      {/* FOOTER */}
      <footer className="mt-16 px-6 py-8 text-center" style={{ borderTop: "1px solid var(--border-dim)" }}>
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          KPIGo · Next.js · Vercel Blob · Stripe · SVG charts
        </p>
      </footer>
    </div>
  );
}
