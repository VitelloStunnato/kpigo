import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ColumnType = "numeric" | "categorical" | "unknown";

export interface ColumnInfo {
  /** Column header name (original or generated) */
  name: string;
  /** Detected data type */
  type: ColumnType;
  /** Zero-based column index in the original sheet */
  index: number;
}

export interface ParsedFile {
  /** Column headers (original or auto-generated Col1, Col2, ... */
  headers: string[];
  /** Data rows as objects keyed by header name */
  rows: Record<string, unknown>[];
  /** Column metadata with detected types */
  columns: ColumnInfo[];
  /** Number of data rows (excluding header) */
  rowCount: number;
  /** True when the first row was all-numeric and headers were auto-generated */
  hasGeneratedHeaders: boolean;
}

// ─── normalizeNumber ──────────────────────────────────────────────────────────

export function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return null;

  if (typeof value === "number") {
    return isFinite(value) ? value : null;
  }

  if (typeof value !== "string") return null;

  const s = value.trim();
  if (s === "") return null;

  const lower = s.toLowerCase();
  if (
    lower === "n/a" ||
    lower === "na" ||
    lower === "-" ||
    lower === "\u2013" ||
    lower === "#n/a" ||
    lower === "null" ||
    lower === "undefined" ||
    lower === "#value!" ||
    lower === "#ref!"
  ) {
    return null;
  }

  const clean = s.replace(/^[\u20ac$\u00a3\s+]+|[\u20ac$\u00a3\s%]+$/g, "").trim();
  if (clean === "") return null;

  // Italian format: 1.234,56 or 1.234.567
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(clean)) {
    return parseFloat(clean.replace(/\./g, "").replace(",", "."));
  }

  // English format: 1,234.56 or 1,234,567
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(clean)) {
    return parseFloat(clean.replace(/,/g, ""));
  }

  // Simple comma as decimal separator: 3,14
  if (/^-?\d+,\d+$/.test(clean)) {
    return parseFloat(clean.replace(",", "."));
  }

  const n = parseFloat(clean);
  if (!isNaN(n) && isFinite(n)) return n;

  return null;
}

// ─── detectType ───────────────────────────────────────────────────────────────

export function detectType(values: unknown[]): ColumnType {
  const nonNull: unknown[] = values.filter(
    (v) => v !== null && v !== undefined && v !== ""
  );
  if (nonNull.length === 0) return "unknown";

  const numericCount: number = nonNull.filter(
    (v) => normalizeNumber(v) !== null
  ).length;
  const numericRatio: number = numericCount / nonNull.length;

  if (numericRatio >= 0.7) return "numeric";

  const strings: string[] = nonNull.map((v) => String(v));
  const uniqueRatio: number = new Set(strings).size / strings.length;
  const avgLength: number =
    strings.reduce((acc, str) => acc + str.length, 0) / strings.length;

  if (uniqueRatio > 0.8 && avgLength > 15) return "unknown";

  return "categorical";
}

// ─── parseBuffer ─────────────────────────────────────────────────────────────

export function parseBuffer(buffer: Buffer, ext: string): ParsedFile {
  const lowerExt: string = ext.toLowerCase().replace(/^\./, "");

  if (
    lowerExt !== "csv" &&
    lowerExt !== "tsv" &&
    lowerExt !== "xlsx" &&
    lowerExt !== "xls"
  ) {
    throw new Error(`Unsupported file extension: .${lowerExt}`);
  }

  let workbook: XLSX.WorkBook;

  try {
    if (lowerExt === "csv" || lowerExt === "tsv") {
      const text: string = buffer.toString("utf-8");
      const firstLine: string = text.split(/\r?\n/)[0] ?? "";
      const nSemicolon: number = (firstLine.match(/;/g) ?? []).length;
      const nComma: number = (firstLine.match(/,/g) ?? []).length;
      const separator: string =
        lowerExt === "tsv" ? "\t" : nSemicolon > nComma ? ";" : ",";
      workbook = XLSX.read(text, { type: "string", FS: separator });
    } else {
      workbook = XLSX.read(buffer, { type: "buffer" });
    }
  } catch (err) {
    throw new Error(
      `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const sheetName: string | undefined = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("File contains no sheets");
  }

  const sheet: XLSX.WorkSheet | undefined = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  const rawData: unknown[][] = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  });

  if (rawData.length === 0) {
    return {
      headers: [],
      rows: [],
      columns: [],
      rowCount: 0,
      hasGeneratedHeaders: false,
    };
  }

  const firstRow: unknown[] = rawData[0] ?? [];

  const isFirstRowNumeric: boolean =
    firstRow.length > 0 &&
    firstRow.every(
      (cell) =>
        cell === null ||
        cell === undefined ||
        String(cell).trim() === "" ||
        normalizeNumber(cell) !== null
    );

  let headers: string[];
  let dataRows: unknown[][];
  let hasGeneratedHeaders: boolean;

  if (isFirstRowNumeric) {
    headers = firstRow.map((_, i) => `Col${i + 1}`);
    dataRows = rawData;
    hasGeneratedHeaders = true;
  } else {
    headers = firstRow.map((h, i): string => {
      const str: string =
        h !== null && h !== undefined ? String(h).trim() : "";
      return str !== "" ? str : `Col${i + 1}`;
    });
    dataRows = rawData.slice(1);
    hasGeneratedHeaders = false;
  }

  const rows: Record<string, unknown>[] = dataRows
    .map((row): Record<string, unknown> => {
      const obj: Record<string, unknown> = {};
      headers.forEach((header, i) => {
        obj[header] = row[i] ?? null;
      });
      return obj;
    })
    .filter((row: Record<string, unknown>) =>
      Object.values(row).some(
        (v) => v !== null && v !== undefined && v !== ""
      )
    );

  const columns: ColumnInfo[] = headers.map(
    (name, index): ColumnInfo => ({
      name,
      type: detectType(rows.map((row: Record<string, unknown>) => row[name])),
      index,
    })
  );

  return {
    headers,
    rows,
    columns,
    rowCount: rows.length,
    hasGeneratedHeaders,
  };
}

// ─── eq ───────────────────────────────────────────────────────────────────────

export function eq<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object" || typeof b !== "object") return false;

  const aRec: Record<string, unknown> = a as Record<string, unknown>;
  const bRec: Record<string, unknown> = b as Record<string, unknown>;
  const aKeys: string[] = Object.keys(aRec).sort();
  const bKeys: string[] = Object.keys(bRec).sort();

  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!eq<unknown>(aRec[k], bRec[k])) return false;
  }
  return true;
}
