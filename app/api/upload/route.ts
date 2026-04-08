import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { kv } from "@vercel/kv";
import path from "path";
import { mkdirSync, writeFileSync } from "fs";
import { parseBuffer, ParsedFile, ColumnInfo, ColumnType } from "@/lib/parser";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_BYTES: number = 5 * 1024 * 1024;
const MAX_ROWS: number = 10_000;
const RATE_LIMIT_MAX: number = 10;
const RATE_LIMIT_TTL: number = 3600;
const PREVIEW_ROWS: number = 3;
const PREVIEW_COLS: number = 3;
const SAMPLE_SIZE: number = 2;

const ALLOWED_EXTS: ReadonlySet<string> = new Set(["xlsx", "csv"]);

// ─── Response types ───────────────────────────────────────────────────────────

interface ColumnMeta {
  name: string;
  type: ColumnType;
  sample: string[];
}

interface UploadResponse {
  uploadId: string;
  rowCount: number;
  columns: ColumnMeta[];
  preview: Record<string, unknown>[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClientIp(req: NextRequest): string {
  const forwarded: string | null = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return "unknown";
}

function fileExtension(filename: string): string {
  const parts: string[] = filename.toLowerCase().split(".");
  return parts[parts.length - 1] ?? "";
}

function buildColumns(parsed: ParsedFile): ColumnMeta[] {
  return parsed.columns.map((col: ColumnInfo): ColumnMeta => {
    const sample: string[] = parsed.rows
      .map((row: Record<string, unknown>) => row[col.name])
      .flatMap((v: unknown): string[] => {
        if (v === null || v === undefined) return [];
        const s: string = String(v).trim();
        return s !== "" ? [s] : [];
      })
      .slice(0, SAMPLE_SIZE);
    return { name: col.name, type: col.type, sample };
  });
}

function buildPreview(parsed: ParsedFile): Record<string, unknown>[] {
  const cols: string[] = parsed.headers.slice(0, PREVIEW_COLS);
  return parsed.rows
    .slice(0, PREVIEW_ROWS)
    .map((row: Record<string, unknown>): Record<string, unknown> => {
      const obj: Record<string, unknown> = {};
      cols.forEach((col: string) => {
        obj[col] = row[col] ?? null;
      });
      return obj;
    });
}

// ─── Rate limiter ─────────────────────────────────────────────────────────────

async function checkRateLimit(ip: string): Promise<boolean> {
  try {
    const kvKey: string = `rl:upload:${ip}`;
    const count: number = await kv.incr(kvKey);
    if (count === 1) {
      await kv.expire(kvKey, RATE_LIMIT_TTL);
    }
    return count <= RATE_LIMIT_MAX;
  } catch {
    return true;
  }
}

// ─── Blob storage (Vercel in prod, filesystem in local dev) ───────────────────

async function saveBlob(blobName: string, content: string): Promise<void> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await put(blobName, content, {
      access: "public",
      contentType: "application/json",
    });
  } else {
    const dir: string = path.join(process.cwd(), ".local-blobs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, blobName), content, "utf-8");
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip: string = getClientIp(request);
  const allowed: boolean = await checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Troppi upload. Riprova tra un'ora." },
      { status: 429 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Richiesta non valida." },
      { status: 400 }
    );
  }

  const entry = formData.get("file");
  if (!(entry instanceof File)) {
    return NextResponse.json(
      { error: "Campo 'file' mancante o non valido." },
      { status: 400 }
    );
  }

  const file: File = entry;

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File troppo grande. Limite: 5MB." },
      { status: 413 }
    );
  }

  const ext: string = fileExtension(file.name);
  if (!ALLOWED_EXTS.has(ext)) {
    return NextResponse.json(
      { error: "Formato non supportato. Usa .xlsx o .csv." },
      { status: 415 }
    );
  }

  let parsed: ParsedFile;
  try {
    const buffer: Buffer = Buffer.from(await file.arrayBuffer());
    parsed = parseBuffer(buffer, ext);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Errore durante il parsing del file. ${
          err instanceof Error ? err.message : "Formato non leggibile."
        }`,
      },
      { status: 422 }
    );
  }

  if (parsed.rowCount > MAX_ROWS) {
    return NextResponse.json(
      { error: `File con troppi dati. Limite: ${MAX_ROWS.toLocaleString("it-IT")} righe.` },
      { status: 413 }
    );
  }

  const uploadId: string = crypto.randomUUID();
  try {
    await saveBlob(`raw_${uploadId}.json`, JSON.stringify(parsed));
  } catch {
    return NextResponse.json(
      { error: "Errore durante il salvataggio. Riprova." },
      { status: 500 }
    );
  }

  const body: UploadResponse = {
    uploadId,
    rowCount: parsed.rowCount,
    columns: buildColumns(parsed),
    preview: buildPreview(parsed),
  };

  return NextResponse.json(body, { status: 200 });
}
