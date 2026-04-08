import type { KPIResult } from "./kpi";
import type { ParsedFile } from "./parser";

// ─── Palette ──────────────────────────────────────────────────────────────────

const PALETTE: readonly string[] = [
  "#4F81BD", "#C0504D", "#9BBB59", "#8064A2",
  "#4BACC6", "#F79646", "#2C4770", "#7F3F3F",
];

function color(idx: number): string {
  return PALETTE[idx % PALETTE.length] ?? "#4F81BD";
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(n: number): string {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(1)}k`
    : String(n);
}

// ─── generateBarSVG ───────────────────────────────────────────────────────────

/**
 * Vertical bar chart — one bar per numeric column, height = sum.
 * Returns an SVG string (560 × 220 px).
 */
export function generateBarSVG(kpis: KPIResult, _parsed: ParsedFile): string {
  const items = kpis.numeric;

  if (items.length === 0) {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="80">` +
      `<rect width="560" height="80" fill="#fff"/>` +
      `<text x="280" y="44" text-anchor="middle" font-size="14" fill="#999">` +
      `Nessuna colonna numerica</text></svg>`
    );
  }

  const W = 560;
  const H = 220;
  const PL = 62;   // padding left
  const PR = 20;   // padding right
  const PT = 20;   // padding top
  const PB = 60;   // padding bottom
  const CW = W - PL - PR;
  const CH = H - PT - PB;

  const maxVal: number = Math.max(...items.map((i) => i.sum), 1);
  const slotW: number = CW / items.length;
  const barW: number = Math.max(Math.floor(slotW * 0.6), 4);

  const bars: string = items
    .map((item, idx) => {
      const barH: number = Math.max(Math.round((item.sum / maxVal) * CH), 2);
      const x: number = Math.round(PL + idx * slotW + (slotW - barW) / 2);
      const y: number = PT + CH - barH;
      const cx: number = x + barW / 2;
      const labelY: number = PT + CH + 18;

      return [
        `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color(idx)}" rx="3"/>`,
        `<text x="${cx.toFixed(1)}" y="${y - 4}" text-anchor="middle" font-size="11" fill="#333">${escapeXml(fmt(item.sum))}</text>`,
        `<text x="${cx.toFixed(1)}" y="${labelY}" text-anchor="middle" font-size="11" fill="#555" ` +
          `transform="rotate(-20,${cx.toFixed(1)},${labelY})">${escapeXml(item.column)}</text>`,
      ].join("\n  ");
    })
    .join("\n  ");

  const yTicks: string = [0, 0.25, 0.5, 0.75, 1.0]
    .map((frac) => {
      const y: number = Math.round(PT + CH - frac * CH);
      return [
        `<line x1="${PL - 4}" y1="${y}" x2="${PL}" y2="${y}" stroke="#bbb" stroke-width="1"/>`,
        `<text x="${PL - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#888">${fmt(Math.round(maxVal * frac))}</text>`,
      ].join("\n  ");
    })
    .join("\n  ");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`,
    `  <rect width="${W}" height="${H}" fill="#fff"/>`,
    `  <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT + CH}" stroke="#ccc" stroke-width="1"/>`,
    `  <line x1="${PL}" y1="${PT + CH}" x2="${W - PR}" y2="${PT + CH}" stroke="#ccc" stroke-width="1"/>`,
    `  ${yTicks}`,
    `  ${bars}`,
    `</svg>`,
  ].join("\n");
}

// ─── generatePieSVG ───────────────────────────────────────────────────────────

/**
 * Pie chart for the first categorical column (top-5 values).
 * Returns an SVG string (340 × 260 px).
 */
export function generatePieSVG(kpis: KPIResult, _parsed: ParsedFile): string {
  const cat = kpis.categorical[0];

  if (!cat || cat.topValues.length === 0) {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="80">` +
      `<rect width="340" height="80" fill="#fff"/>` +
      `<text x="170" y="44" text-anchor="middle" font-size="14" fill="#999">` +
      `Nessuna colonna categorica</text></svg>`
    );
  }

  const W = 340;
  const H = 260;
  const CX = 120;  // pie centre x
  const CY = 130;  // pie centre y
  const R = 95;

  const total: number = cat.topValues.reduce((s, v) => s + v.count, 0);
  let angle: number = -Math.PI / 2;  // start at top

  const slices: string = cat.topValues
    .map((item, idx) => {
      const frac: number = item.count / total;
      const sweep: number = frac * 2 * Math.PI;
      const end: number = angle + sweep;

      const x1: number = CX + R * Math.cos(angle);
      const y1: number = CY + R * Math.sin(angle);
      const x2: number = CX + R * Math.cos(end);
      const y2: number = CY + R * Math.sin(end);
      const large: number = sweep > Math.PI ? 1 : 0;

      angle = end;

      return (
        `<path d="M${CX},${CY} L${x1.toFixed(2)},${y1.toFixed(2)} ` +
        `A${R},${R} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" ` +
        `fill="${color(idx)}" stroke="#fff" stroke-width="1.5"/>`
      );
    })
    .join("\n  ");

  const legend: string = cat.topValues
    .map((item, idx) => {
      const ly: number = 20 + idx * 24;
      return [
        `<rect x="228" y="${ly}" width="14" height="14" fill="${color(idx)}" rx="2"/>`,
        `<text x="248" y="${ly + 11}" font-size="11" fill="#333">${escapeXml(item.value)} (${item.percent}%)</text>`,
      ].join("\n  ");
    })
    .join("\n  ");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`,
    `  <rect width="${W}" height="${H}" fill="#fff"/>`,
    `  <text x="${CX}" y="14" text-anchor="middle" font-size="12" fill="#666" font-weight="bold">${escapeXml(cat.column)}</text>`,
    `  ${slices}`,
    `  ${legend}`,
    `</svg>`,
  ].join("\n");
}
