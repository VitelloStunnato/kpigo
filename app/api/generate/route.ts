import { NextRequest, NextResponse } from "next/server";
import { put, list } from "@vercel/blob";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { generateKPIs, KPIResult } from "@/lib/kpi";
import { generateBarSVG, generatePieSVG } from "@/lib/charts";
import type { ParsedFile } from "@/lib/parser";

// ─── Blob helpers ─────────────────────────────────────────────────────────────

const LOCAL_BLOB_DIR: string = path.join(process.cwd(), ".local-blobs");

function localBlobPath(blobName: string): string {
  return path.join(LOCAL_BLOB_DIR, blobName);
}

/**
 * Fetch the content of a previously saved blob by name.
 *
 * Local dev  → reads from .local-blobs/{blobName}
 * Production → uses Vercel Blob list() to locate the URL, then fetches it
 *
 * Returns null if the blob does not exist.
 */
async function fetchBlob(blobName: string): Promise<string | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // ── local filesystem fallback ──────────────────────────────────────────
    const filePath: string = localBlobPath(blobName);
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, "utf-8");
  }

  // ── Vercel Blob (production) ─────────────────────────────────────────────
  try {
    const { blobs } = await list({ prefix: blobName });
    const match = blobs.find((b) => b.pathname === blobName || b.url.includes(blobName));
    if (!match) return null;
    const res: Response = await fetch(match.url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Persist a string as a blob.
 *
 * Local dev  → writes to .local-blobs/{blobName}
 * Production → uses Vercel Blob put()
 */
async function saveBlob(blobName: string, content: string): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    mkdirSync(LOCAL_BLOB_DIR, { recursive: true });
    writeFileSync(localBlobPath(blobName), content, "utf-8");
    return;
  }

  await put(blobName, content, {
    access: "public",
    contentType: "application/json",
  });
}

// ─── Request / response types ─────────────────────────────────────────────────

interface GenerateRequest {
  uploadId: string;
}

interface ReportPayload {
  kpis: KPIResult;
  barSVG: string;
  pieSVG: string;
  rowCount: number;
  generatedAt: string;
}

interface GenerateResponse {
  token: string;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Parse request body
  let body: Partial<GenerateRequest>;
  try {
    body = (await request.json()) as Partial<GenerateRequest>;
  } catch {
    return NextResponse.json(
      { error: "Corpo della richiesta non valido. Atteso JSON." },
      { status: 400 }
    );
  }

  const uploadId: string | undefined = body.uploadId?.trim();

  if (!uploadId || uploadId.length === 0) {
    return NextResponse.json(
      { error: "Campo 'uploadId' mancante." },
      { status: 400 }
    );
  }

  // Validate uploadId is a UUID-like string to prevent path traversal
  if (!/^[\w-]{8,64}$/.test(uploadId)) {
    return NextResponse.json(
      { error: "uploadId non valido." },
      { status: 400 }
    );
  }

  // 2. Fetch raw parsed file from storage
  const blobName: string = `raw_${uploadId}.json`;
  let rawData: string | null;

  try {
    rawData = await fetchBlob(blobName);
  } catch {
    return NextResponse.json(
      { error: "Errore durante il recupero del file. Riprova." },
      { status: 500 }
    );
  }

  if (rawData === null) {
    return NextResponse.json(
      { error: "Upload non trovato. Carica di nuovo il file." },
      { status: 404 }
    );
  }

  // 3. Parse stored JSON back into ParsedFile
  let parsed: ParsedFile;
  try {
    parsed = JSON.parse(rawData) as ParsedFile;
  } catch {
    return NextResponse.json(
      { error: "Dati del file corrotti. Carica di nuovo il file." },
      { status: 422 }
    );
  }

  // 4. Generate KPIs
  let kpis: KPIResult;
  try {
    kpis = generateKPIs(parsed);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Errore nel calcolo dei KPI. ${
          err instanceof Error ? err.message : "Errore sconosciuto."
        }`,
      },
      { status: 500 }
    );
  }

  // 5. Generate SVG charts
  let barSVG: string;
  let pieSVG: string;
  try {
    barSVG = generateBarSVG(kpis, parsed);
    pieSVG = generatePieSVG(kpis, parsed);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Errore nella generazione dei grafici. ${
          err instanceof Error ? err.message : "Errore sconosciuto."
        }`,
      },
      { status: 500 }
    );
  }

  // 6. Build report payload
  const token: string = crypto.randomUUID();
  const generatedAt: string = new Date().toISOString();

  const report: ReportPayload = {
    kpis,
    barSVG,
    pieSVG,
    rowCount: parsed.rowCount,
    generatedAt,
  };

  // 7. Persist report
  try {
    await saveBlob(`report_${token}.json`, JSON.stringify(report));
  } catch {
    return NextResponse.json(
      { error: "Errore durante il salvataggio del report. Riprova." },
      { status: 500 }
    );
  }

  // 8. Return token
  const response: GenerateResponse = { token };
  return NextResponse.json(response, { status: 200 });
}
