import { normalizeNumber } from "./parser";
import type { ParsedFile } from "./parser";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NumericKPI {
  column: string;
  sum: number;
  mean: number;
  min: number;
  max: number;
  count: number;
}

export interface CategoryFrequency {
  value: string;
  count: number;
  percent: number;
}

export interface CategoricalKPI {
  column: string;
  topValues: CategoryFrequency[];
  totalCount: number;
}

export interface KPIResult {
  numeric: NumericKPI[];
  categorical: CategoricalKPI[];
  rowCount: number;
}

// ─── generateKPIs ─────────────────────────────────────────────────────────────

/**
 * Compute KPIs for every typed column in a ParsedFile.
 *
 * - numeric  → sum, mean, min, max, non-null count  (rounded to 2dp)
 * - categorical → top-5 values with count + percent
 * - unknown columns are silently skipped
 */
export function generateKPIs(parsed: ParsedFile): KPIResult {
  const numeric: NumericKPI[] = [];
  const categorical: CategoricalKPI[] = [];

  for (const col of parsed.columns) {
    const values: unknown[] = parsed.rows.map(
      (r: Record<string, unknown>) => r[col.name]
    );

    if (col.type === "numeric") {
      const nums: number[] = values
        .map((v: unknown) => normalizeNumber(v))
        .filter((n): n is number => n !== null);

      if (nums.length === 0) continue;

      const sum: number = nums.reduce((a: number, b: number) => a + b, 0);
      const round = (n: number): number => Math.round(n * 100) / 100;

      numeric.push({
        column: col.name,
        sum: round(sum),
        mean: round(sum / nums.length),
        min: Math.min(...nums),
        max: Math.max(...nums),
        count: nums.length,
      });
    } else if (col.type === "categorical") {
      const freq: Record<string, number> = {};
      let total: number = 0;

      for (const v of values) {
        if (v === null || v === undefined || String(v).trim() === "") continue;
        const key: string = String(v).trim();
        freq[key] = (freq[key] ?? 0) + 1;
        total++;
      }

      const topValues: CategoryFrequency[] = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(
          ([value, count]): CategoryFrequency => ({
            value,
            count,
            percent: total > 0 ? Math.round((count / total) * 100) : 0,
          })
        );

      categorical.push({ column: col.name, topValues, totalCount: total });
    }
  }

  return { numeric, categorical, rowCount: parsed.rowCount };
}
