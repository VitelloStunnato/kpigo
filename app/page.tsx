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
  n >= 1e6 ? `${(n/1e6).toFixed(2)}M`
  : n >= 1e3 ? `${(n/1e3).toFixed(2)}k`
  : n % 1 === 0 ? String(n)
  : n.toFixed(2);

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg className="animate-spin shrink-0" style={{ width: size, height: size, color: "var(--teal-bright)" }}
      fill="none" viewBox="0 0 24 24">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

// ─── Logo mark ────────────────────────────────────────────────────────────────

function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[9px] text-xs font-black text-white"
      style={{
        width: size, height: size,
        background: "linear-gradient(145deg, #01b0bc 0%, var(--teal) 100%)",
        boxShadow: "0 0 14px -2px rgba(1,122,130,0.55), inset 0 1px 0 rgba(255,255,255,0.12)",
        letterSpacing: "-0.03em",
      }}
    >
      K
    </span>
  );
}

// ─── Demo mockup ──────────────────────────────────────────────────────────────

function DemoMockup() {
  return (
    <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-[18px]"
      style={{
        border: "1px solid var(--border-mid)",
        background: "var(--surface-1)",
        boxShadow: "0 32px 64px -16px rgba(0,0,0,0.7), 0 0 0 1px var(--border-xs)",
      }}>

      {/* browser chrome */}
      <div className="flex items-center gap-2 px-4 py-3"
        style={{ background: "var(--surface-0)", borderBottom: "1px solid var(--border-dim)" }}>
        <span className="h-2.5 w-2.5 rounded-full opacity-70" style={{ background: "#ff5f57" }} />
        <span className="h-2.5 w-2.5 rounded-full opacity-70" style={{ background: "#febc2e" }} />
        <span className="h-2.5 w-2.5 rounded-full opacity-70" style={{ background: "#28c840" }} />
        <span className="ml-3 flex-1 rounded-md px-3 py-1 font-mono text-xs"
          style={{ background: "var(--surface-3)", color: "var(--text-muted)" }}>
          kpigo.vercel.app/success?token=a3f2bc…
        </span>
        <span className="chip-success rounded-full px-2.5 py-0.5 text-xs font-semibold">✓ Sbloccato</span>
      </div>

      <div className="p-6">
        {/* report header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Report completo</h3>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              3 righe · 09/04/2026 · token a3f2bc…
            </p>
          </div>
          <span className="section-label">KPIGo</span>
        </div>

        {/* KPI cards row */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          {/* Numeric */}
          <div className="kpi-card p-4">
            <p className="section-label mb-2">Importo</p>
            <p className="stat-value">3.72k</p>
            <p className="stat-sub">totale</p>
            <div className="mt-3 grid grid-cols-3 gap-1 border-t pt-3" style={{ borderColor: "var(--border-dim)" }}>
              {[["1.24k","media"],["980","min"],["1.54k","max"]].map(([v,l])=>(
                <div key={l} className="text-center">
                  <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{v}</p>
                  <p className="text-xs" style={{ color: "var(--text-faint)" }}>{l}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Categorical */}
          <div className="kpi-card p-4">
            <p className="section-label mb-3">Categoria</p>
            {[{v:"Nord",p:67},{v:"Sud",p:33}].map(r=>(
              <div key={r.v} className="mb-2.5 flex items-center gap-2.5">
                <div className="progress-track flex-1">
                  <div className="progress-fill" style={{ width:`${r.p}%` }} />
                </div>
                <span className="w-16 text-right text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  {r.v}
                </span>
                <span className="w-7 text-right text-xs font-bold tabular-nums" style={{ color: "#4dcfcf" }}>
                  {r.p}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-2 gap-3">
          {[
            <svg key="bar" viewBox="0 0 200 90" className="w-full">
              <line x1="24" y1="8" x2="24" y2="72" stroke="#1f2327" strokeWidth="1"/>
              <line x1="24" y1="72" x2="190" y2="72" stroke="#1f2327" strokeWidth="1"/>
              {[{x:36,h:55,c:"var(--teal)"},{x:102,h:30,c:"#2d6a6e"}].map((b,i)=>(
                <g key={i}>
                  <rect x={b.x} y={72-b.h} width={52} height={b.h} fill={b.c} rx="3" opacity="0.9"/>
                </g>
              ))}
              <text x="62" y="82" textAnchor="middle" fontSize="7" fill="#5c5c6b">Serie A</text>
              <text x="128" y="82" textAnchor="middle" fontSize="7" fill="#5c5c6b">Serie B</text>
            </svg>,
            <svg key="pie" viewBox="0 0 200 90" className="w-full">
              <path d="M70,45 L70,5 A40,40 0 1,1 39.2,65 Z" fill="var(--teal)" opacity="0.9"/>
              <path d="M70,45 L39.2,65 A40,40 0 0,1 70,5 Z" fill="#2d6a6e" opacity="0.8"/>
              <rect x="122" y="18" width="8" height="8" fill="var(--teal)" rx="2"/>
              <text x="135" y="26" fontSize="7.5" fill="#9b9ba8">Nord 67%</text>
              <rect x="122" y="33" width="8" height="8" fill="#2d6a6e" rx="2"/>
              <text x="135" y="41" fontSize="7.5" fill="#9b9ba8">Sud 33%</text>
            </svg>
          ].map((chart, i) => (
            <div key={i} className="kpi-card overflow-hidden p-3">
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
    <div className="kpi-card flex flex-col gap-4 p-6 transition-all duration-200">
      {/* icon */}
      <div className="flex h-10 w-10 items-center justify-center rounded-xl text-xl"
        style={{ background: "var(--surface-3)", border: "1px solid var(--border-dim)" }}>
        {icon}
      </div>
      {/* text */}
      <div>
        <p className="mb-1.5 text-sm font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
          {title}
        </p>
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)", lineHeight: "1.6" }}>
          {desc}
        </p>
      </div>
      {/* tags */}
      <div className="mt-auto flex flex-wrap gap-1.5">
        {tags.map(t => (
          <span key={t} className="rounded-md px-2 py-0.5 text-xs"
            style={{ background: "var(--surface-4)", color: "var(--text-muted)", border: "1px solid var(--border-dim)" }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepRow({ done, active, label }: { done: boolean; active: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-3 transition-opacity duration-300 ${active || done ? "opacity-100" : "opacity-30"}`}>
      {/* dot */}
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{
          background: done ? "var(--teal)" : active ? "var(--teal-glow-md)" : "var(--surface-3)",
          border: `1px solid ${done ? "var(--teal)" : active ? "var(--teal-border)" : "var(--border-dim)"}`,
          color: done ? "white" : active ? "#4dcfcf" : "var(--text-faint)",
          transition: "all 200ms ease",
        }}>
        {done ? "✓" : active ? <Spinner size={10} /> : "·"}
      </span>
      <span className="text-sm" style={{ color: active ? "var(--text-primary)" : done ? "var(--text-secondary)" : "var(--text-faint)" }}>
        {label}
      </span>
    </div>
  );
}

// ─── KPI card (live report) ───────────────────────────────────────────────────

function KPICard({ kpi }: { kpi: NumericKPI }) {
  return (
    <div className="kpi-card p-5">
      <p className="section-label mb-3" style={{ color: "var(--text-muted)" }}>{kpi.column}</p>
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

function CatCard({ kpi }: { kpi: CatKPI }) {
  return (
    <div className="kpi-card p-5">
      <p className="section-label mb-4" style={{ color: "var(--text-muted)" }}>{kpi.column}</p>
      <ul className="space-y-3">
        {kpi.topValues.map((v) => (
          <li key={v.value} className="flex items-center gap-3">
            <div className="progress-track flex-1">
              <div className="progress-fill" style={{ width: `${v.percent}%` }} />
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

// ─── Locked overlay ───────────────────────────────────────────────────────────

function LockedOverlay({ token, onPay, paying }: { token: string; onPay: (t: string) => void; paying: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-7 rounded-[18px] px-8 py-14 text-center"
      style={{
        background: "var(--surface-1)",
        border: "1px dashed var(--border-mid)",
      }}>
      {/* lock icon */}
      <div className="icon-box-teal flex h-14 w-14 items-center justify-center rounded-2xl">
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="var(--teal-bright)">
          <rect x="3" y="11" width="18" height="11" rx="2.5" />
          <path strokeLinecap="round" d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      </div>

      <div className="max-w-xs">
        <p className="mb-2 text-base font-bold" style={{ color: "var(--text-primary)" }}>
          KPI generati — grafici bloccati
        </p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)", lineHeight: "1.65" }}>
          Sblocca il report completo con grafici SVG interattivi, una sola volta, senza abbonamento.
        </p>
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-2.5">
        <button onClick={() => onPay(token)} disabled={paying}
          className="btn-teal flex items-center gap-2.5 rounded-full px-9 py-3.5 text-sm font-bold text-white">
          {paying
            ? <><Spinner size={16} /><span>Reindirizzamento…</span></>
            : <><LockOpenIcon /><span>Sblocca report — 4,90 €</span></>
          }
        </button>
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          Pagamento sicuro via Stripe · una tantum · nessun abbonamento
        </p>
      </div>
    </div>
  );
}

function LockOpenIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path strokeLinecap="round" d="M7 11V7a5 5 0 019.9-1" />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Home() {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [paying, setPaying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isUploading  = stage.kind === "uploading";
  const isGenerating = stage.kind === "generating";
  const isBusy       = isUploading || isGenerating;
  const showLanding  = stage.kind === "idle";

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
      if (!upRes.ok) {
        const { error } = await upRes.json() as { error: string };
        setStage({ kind: "error", message: error }); return;
      }
      const { uploadId } = await upRes.json() as UploadResp;
      setStage({ kind: "generating", uploadId });

      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
      });
      if (!genRes.ok) {
        const { error } = await genRes.json() as { error: string };
        setStage({ kind: "error", message: error }); return;
      }
      const { token } = await genRes.json() as { token: string };

      const repRes = await fetch(`/api/report/${token}`);
      if (!repRes.ok) {
        const { error } = await repRes.json() as { error: string };
        setStage({ kind: "error", message: error }); return;
      }
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
      const res = await fetch("/api/stripe-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setStage({ kind: "error", message: data.error ?? "Errore Stripe." }); return;
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

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--surface-0)", color: "var(--text-primary)" }}>

      {/* Noise overlay */}
      <div className="noise-overlay" aria-hidden />

      {/* ── NAV ─────────────────────────────────────────────────────────────── */}
      <nav className="nav-glass sticky top-0 z-30">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="text-sm font-bold tracking-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              KPIGo
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs sm:block" style={{ color: "var(--text-faint)" }}>
              4,90 € / report · nessun abbonamento
            </span>
            {stage.kind === "done" && (
              <button onClick={reset}
                className="btn-ghost rounded-full px-4 py-1.5 text-xs font-medium">
                ← Nuovo file
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5">

        {/* ── LANDING ─────────────────────────────────────────────────────── */}
        {showLanding && (
          <>
            {/* HERO */}
            <section className="relative pb-20 pt-28 text-center">
              {/* ambient glow */}
              <div className="hero-glow" aria-hidden />

              {/* relative wrapper so text sits above glow */}
              <div className="relative z-10">
                {/* badge */}
                <div className="animate-fade-up mb-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold chip-teal">
                  <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--teal-bright)" }} />
                  Nessun abbonamento · paghi solo il report
                </div>

                {/* headline */}
                <h1 className="animate-fade-up-2 mx-auto mb-5 max-w-2xl text-5xl font-black leading-[1.08] tracking-tight sm:text-6xl"
                  style={{ color: "var(--text-primary)", letterSpacing: "-0.04em" }}>
                  Excel / CSV →{" "}
                  <span className="text-gradient">KPI + Grafici</span>
                  <br />in 30 secondi
                </h1>

                <p className="animate-fade-up-3 mx-auto mb-10 max-w-[380px] text-base leading-relaxed"
                  style={{ color: "var(--text-muted)", lineHeight: "1.7" }}>
                  Carica il file, ottieni analisi automatica, grafici professionali e un report
                  completo. Un pagamento, nessun account.
                </p>

                {/* CTA cluster */}
                <div className="animate-fade-up-4 flex flex-col items-center gap-3">
                  <label htmlFor="hero-file"
                    className="btn-teal inline-flex cursor-pointer items-center gap-2.5 rounded-full px-9 py-3.5 text-sm font-bold text-white">
                    <UploadIcon />
                    Carica il tuo file
                  </label>
                  <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                    .xlsx · .csv · max 5 MB · poi 4,90 € per sbloccare
                  </p>
                </div>

                {/* hidden form */}
                <form onSubmit={handleUpload} className="hidden">
                  <input id="hero-file" ref={fileRef} type="file" accept=".xlsx,.csv"
                    onChange={(e) => { if (e.target.files?.[0]) e.currentTarget.form?.requestSubmit(); }} />
                </form>

                {/* social proof / trust strip */}
                <div className="mt-12 flex flex-wrap justify-center gap-x-8 gap-y-2">
                  {[
                    "✓ Nessun account",
                    "✓ Una tantum",
                    "✓ Stripe sicuro",
                    "✓ Report via link",
                  ].map(item => (
                    <span key={item} className="text-xs font-medium" style={{ color: "var(--text-faint)" }}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            {/* DEMO */}
            <section className="animate-fade-up-2 mb-28">
              <p className="section-label mb-4 text-center">Output reale</p>
              <p className="mb-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                Ecco cosa ottieni dopo il caricamento
              </p>
              <DemoMockup />
              <div className="mt-5 flex flex-wrap justify-center gap-6">
                {["KPI numerici","Distribuzione categorica","Grafici SVG"].map(l => (
                  <span key={l} className="flex items-center gap-2 text-xs" style={{ color: "var(--text-faint)" }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--teal)" }} />
                    {l}
                  </span>
                ))}
              </div>
            </section>

            {/* USE CASES */}
            <section className="animate-fade-up-3 mb-28">
              <p className="section-label mb-2 text-center">Casi d&apos;uso</p>
              <h2 className="mb-10 text-center text-2xl font-black tracking-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
                Funziona con qualsiasi file tabellare
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <UseCaseCard icon="📈" title="Vendite & Revenue"
                  desc="Fatturato per area, prodotti top, trend mensili. Dai numeri grezzi a insight immediati."
                  tags={["Fatturato","Trend","Per area"]} />
                <UseCaseCard icon="🍽️" title="Ristorazione"
                  desc="Coperti, scontrino medio, ore di punta per giorno e fascia oraria, confronto settimane."
                  tags={["Coperti","Scontrino medio","Turni"]} />
                <UseCaseCard icon="📦" title="Inventario & Stock"
                  desc="Giacenze, rotazione prodotti, categorie a rischio esaurimento e movimentazioni."
                  tags={["Giacenze","Rotazione","Categorie"]} />
              </div>
            </section>

            {/* HOW IT WORKS */}
            <section className="mb-28">
              <p className="section-label mb-2 text-center">Come funziona</p>
              <h2 className="mb-10 text-center text-2xl font-black tracking-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
                Tre passi, zero friction
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  {
                    n: "1",
                    title: "Carica il file",
                    desc: "Excel .xlsx o CSV, fino a 5 MB. Nessuna registrazione, nessun login.",
                  },
                  {
                    n: "2",
                    title: "KPI in 30 secondi",
                    desc: "Somme, medie, distribuzioni, top-value e grafici SVG generati automaticamente.",
                  },
                  {
                    n: "3",
                    title: "Paga e scarica",
                    desc: "4,90 € una tantum via Stripe. Il report resta accessibile tramite link permanente.",
                  },
                ].map((s) => (
                  <div key={s.n} className="kpi-card flex gap-4 p-6">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white"
                      style={{
                        background: "linear-gradient(145deg, #01b0bc, var(--teal))",
                        boxShadow: "0 0 12px -3px rgba(1,122,130,0.5)",
                        letterSpacing: "-0.02em",
                      }}>
                      {s.n}
                    </span>
                    <div>
                      <p className="mb-1.5 text-sm font-bold" style={{ color: "var(--text-primary)" }}>{s.title}</p>
                      <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)", lineHeight: "1.6" }}>{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* BOTTOM CTA */}
            <section className="mb-28 overflow-hidden rounded-[18px] p-12 text-center"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-dim)",
                position: "relative",
              }}>
              {/* ambient */}
              <div className="hero-glow" aria-hidden style={{ height: "200%" }} />
              <div className="relative z-10">
                <span className="chip-teal mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold">
                  <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--teal-bright)" }} />
                  Pronto in 30 secondi
                </span>
                <p className="mb-2 text-2xl font-black tracking-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.04em" }}>
                  Analizza il tuo file ora
                </p>
                <p className="mb-8 text-sm" style={{ color: "var(--text-muted)" }}>
                  Nessun account · nessun abbonamento · 4,90 € per report
                </p>
                <label htmlFor="hero-file"
                  className="btn-teal inline-flex cursor-pointer items-center gap-2.5 rounded-full px-9 py-3.5 text-sm font-bold text-white">
                  <UploadIcon />
                  Carica Excel / CSV
                </label>
              </div>
            </section>
          </>
        )}

        {/* ── LOADING ─────────────────────────────────────────────────────── */}
        {isBusy && (
          <section className="flex min-h-[68vh] flex-col items-center justify-center gap-10 py-20">
            {/* animated ring */}
            <div className="relative flex h-18 w-18 items-center justify-center rounded-2xl"
              style={{
                width: 72, height: 72,
                background: "var(--teal-glow)",
                border: "1px solid var(--teal-border)",
                boxShadow: "0 0 28px -6px rgba(1,122,130,0.35)",
              }}>
              <Spinner size={32} />
            </div>

            <div className="flex flex-col gap-4">
              <StepRow done={false}        active={isUploading}  label="Caricamento file" />
              <StepRow done={isGenerating} active={false}        label="Parsing Excel / CSV" />
              <StepRow done={false}        active={isGenerating} label="Calcolo KPI e grafici" />
              <StepRow done={false}        active={false}        label="Report pronto" />
            </div>

            <p className="text-xs" style={{ color: "var(--text-faint)" }}>
              Di solito meno di 10 secondi
            </p>
          </section>
        )}

        {/* ── ERROR ───────────────────────────────────────────────────────── */}
        {stage.kind === "error" && (
          <section className="flex min-h-[68vh] flex-col items-center justify-center gap-6 py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl"
              style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.18)" }}>
              ⚠️
            </div>
            <div>
              <p className="mb-2 text-base font-bold" style={{ color: "var(--text-primary)" }}>
                Qualcosa è andato storto
              </p>
              <p className="max-w-xs text-sm" style={{ color: "#f87171" }}>{stage.message}</p>
            </div>
            <button onClick={reset}
              className="btn-teal rounded-full px-8 py-2.5 text-sm font-bold text-white">
              Riprova
            </button>
          </section>
        )}

        {/* ── REPORT ──────────────────────────────────────────────────────── */}
        {stage.kind === "done" && (
          <section id="result" className="animate-fade-in space-y-8 py-12">

            {/* report header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
                  <h2 className="text-xl font-black tracking-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
                    Anteprima report
                  </h2>
                  {stage.report.locked ? (
                    <span className="chip-warn rounded-full px-2.5 py-0.5 text-xs font-semibold">
                      bloccato
                    </span>
                  ) : (
                    <span className="chip-success rounded-full px-2.5 py-0.5 text-xs font-semibold">
                      ✓ sbloccato
                    </span>
                  )}
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {stage.report.rowCount} righe analizzate · generato il{" "}
                  {new Date(stage.report.generatedAt).toLocaleString("it-IT")}
                </p>
              </div>
              <button onClick={reset} className="btn-ghost rounded-full px-4 py-1.5 text-xs font-medium">
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

            {/* categorical */}
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
                    <div key={i} className="kpi-card overflow-hidden p-5 bg-white"
                      style={{ background: "#fff", border: "1px solid #f0f0f0" }}
                      dangerouslySetInnerHTML={{ __html: svg }} />
                  ))}
                </div>
              )}
            </div>

          </section>
        )}

      </main>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer className="mt-auto px-6 py-8 text-center" style={{ borderTop: "1px solid var(--border-xs)" }}>
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          KPIGo · Next.js · Vercel Blob · Stripe · SVG charts
        </p>
      </footer>

    </div>
  );
}

function UploadIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}
