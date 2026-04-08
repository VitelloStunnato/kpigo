import { NextRequest, NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type { KPIResult } from "@/lib/kpi";

// ─── Filesystem fallback ──────────────────────────────────────────────────────

const LOCAL_BLOB_DIR: string = path.join(process.cwd(), ".local-blobs");

function localBlobPath(blobName: string): string {
  return path.join(LOCAL_BLOB_DIR, blobName);
}

async function fetchBlob(blobName: string): Promise<string | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const filePath: string = localBlobPath(blobName);
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, "utf-8");
  }

  try {
    const { blobs } = await list({ prefix: blobName });
    const match = blobs.find(
      (b) => b.pathname === blobName || b.url.includes(blobName)
    );
    if (!match) return null;
    const res: Response = await fetch(match.url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function saveBlob(blobName: string, content: string): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    mkdirSync(LOCAL_BLOB_DIR, { recursive: true });
    writeFileSync(localBlobPath(blobName), content, "utf-8");
    return;
  }

  const { put } = await import("@vercel/blob");
  await put(blobName, content, {
    access: "public",
    contentType: "application/json",
  });
}

// ─── Stored report shape ───────────────────────────────────────────────────────

interface ReportPayload {
  kpis: KPIResult;
  barSVG: string;
  pieSVG: string;
  rowCount: number;
  generatedAt: string;
}

// ─── Response types ────────────────────────────────────────────────────────────

interface ReportResponse {
  token: string;
  kpis: KPIResult;
  barSVG: string;
  pieSVG: string;
  locked: boolean;
  rowCount: number;
  generatedAt: string;
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  // 1. Read token from params
  const { token } = await params;

  if (!token || token.trim().length === 0) {
    return NextResponse.json(
      { error: "Token mancante." },
      { status: 400 }
    );
  }

  // 2. Validate token — reject path traversal and unexpected characters
  if (!/^[\w-]{8,64}$/.test(token)) {
    return NextResponse.json(
      { error: "Token non valido." },
      { status: 400 }
    );
  }

  // 3. Load report from storage
  let rawReport: string | null;
  try {
    rawReport = await fetchBlob(`report_${token}.json`);
  } catch {
    return NextResponse.json(
      { error: "Errore durante il recupero del report. Riprova." },
      { status: 500 }
    );
  }

  if (rawReport === null) {
    return NextResponse.json(
      { error: "Report non trovato. Potrebbe essere scaduto. Carica di nuovo il file." },
      { status: 404 }
    );
  }

  let report: ReportPayload;
  try {
    report = JSON.parse(rawReport) as ReportPayload;
  } catch {
    return NextResponse.json(
      { error: "Dati del report corrotti. Carica di nuovo il file." },
      { status: 422 }
    );
  }

  // 4. Check payment status
  let paid: boolean;
  try {
    const paidBlob: string | null = await fetchBlob(`paid_${token}`);
    paid = paidBlob !== null;
  } catch {
    // If payment check fails, default to locked — never expose data for free
    paid = false;
  }

  // 5. Build response
  const body: ReportResponse = {
    token,
    kpis: report.kpis,
    barSVG: paid ? report.barSVG : "",
    pieSVG: paid ? report.pieSVG : "",
    locked: !paid,
    rowCount: report.rowCount,
    generatedAt: report.generatedAt,
  };

  return NextResponse.json(body, { status: 200 });
}

// ─── Dev-only: mark a report as paid (POST /api/report/[token]?pay=1) ─────────
// Remove before production deployment.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Non disponibile." }, { status: 404 });
  }

  const { token } = await params;

  if (!token || !/^[\w-]{8,64}$/.test(token)) {
    return NextResponse.json({ error: "Token non valido." }, { status: 400 });
  }

  const url: URL = new URL(request.url);
  if (url.searchParams.get("pay") !== "1") {
    return NextResponse.json({ error: "Parametro 'pay=1' richiesto." }, { status: 400 });
  }

  try {
    await saveBlob(`paid_${token}`, JSON.stringify({ paidAt: new Date().toISOString() }));
  } catch {
    return NextResponse.json(
      { error: "Errore durante la marcatura del pagamento." },
      { status: 500 }
    );
  }

  return NextResponse.json({ token, paid: true }, { status: 200 });
}
