import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ── Types ─────────────────────────────────────────────────────────────────────
export type VarianceObjective = "revenue" | "materials" | "labor" | "overhead";

export interface VarianceRowResult {
  id: string;
  element: string;
  standardPrice: number;
  standardQty: number;
  actualPrice: number;
  actualQty: number;
  extra1?: number; // overhead: coutStdUnitaire (CS)
  extra2?: number; // overhead: charges fixes (CF)
  priceVariance: number;
  qtyVariance: number;
  var3?: number;   // overhead: Écart/Activité
  var4?: number;   // overhead: Écart/Sous-activité = CF*(1−Nr/Nh)
  totalVariance: number;
}

export interface VarianceTotals {
  priceVariance: number;
  qtyVariance: number;
  var3?: number;   // overhead: Écart/Activité
  var4?: number;   // overhead: Écart/Sous-activité
  totalVariance: number;
}

export interface VariancePDFOptions {
  problemName: string;
  sector: string;
  objective: VarianceObjective;
  rows: VarianceRowResult[];
  totals: VarianceTotals;
  dominantFactor: "price" | "qty" | "var3" | "var4" | "equal";
  analysisLines: { icon: string; text: string; color: string }[];
  suggestions: { icon: string; title?: string; desc: string; color?: string; borderColor?: string }[];
  managerName?: string;
  institutionName?: string;
  onProgress?: (step: string, pct: number) => void;
}

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  primary:      "#004d40",
  primaryLight: "#e0f2f1",
  accent:       "#f4a261",
  bg:           "#fbf8f1",
  text:         "#0c2621",
  muted:        "#5f7b77",
  border:       "#c8dad6",
  white:        "#ffffff",
  green:        "#2e7d32",
  greenLight:   "#e8f5e9",
  red:          "#c62828",
  redLight:     "#ffebee",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function genId(): string {
  return `VAR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function fDA(n: number): string {
  const abs = Math.abs(n);
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const s = abs >= 1_000_000
    ? (abs / 1_000_000).toFixed(2) + " M DA"
    : abs >= 1_000
    ? (abs / 1_000).toFixed(1) + " k DA"
    : Math.round(abs).toLocaleString("fr-DZ") + " DA";
  return (sign ? sign + "\u202F" : "") + s;
}

function fNum(n: number): string {
  return n.toLocaleString("fr-DZ", { maximumFractionDigits: 2 });
}

function favorableColor(n: number, fav: "positive" | "negative"): string {
  if (n === 0) return C.muted;
  const isGood = fav === "positive" ? n > 0 : n < 0;
  return isGood ? C.green : C.red;
}

// Convert Tailwind bg class → inline CSS background color
function twBg(cls: string): string {
  const map: Record<string, string> = {
    "bg-primary/10":    "rgba(0,77,64,0.1)",
    "bg-primary/5":     "rgba(0,77,64,0.05)",
    "bg-secondary/10":  "rgba(58,125,68,0.1)",
    "bg-green-50":      "#f0fdf4",
    "bg-red-50":        "#fef2f2",
    "bg-orange-50":     "#fff7ed",
    "bg-amber-50":      "#fffbeb",
    "bg-teal-50":       "#f0fdfa",
    "bg-slate-50":      "#f8fafc",
  };
  for (const [k, v] of Object.entries(map)) {
    if (cls.includes(k)) return v;
  }
  return C.primaryLight;
}

// Convert Tailwind border class → inline CSS border/left-border color
function twBorder(cls: string): string {
  const map: Record<string, string> = {
    "border-primary/30":   "rgba(0,77,64,0.3)",
    "border-primary":      "#004d40",
    "border-secondary/30": "rgba(58,125,68,0.3)",
    "border-green-200":    "#bbf7d0",
    "border-green-300":    "#86efac",
    "border-red-200":      "#fecaca",
    "border-red-300":      "#fca5a5",
    "border-orange-300":   "#fdba74",
    "border-amber-300":    "#fcd34d",
    "border-teal-300":     "#5eead4",
    "border-l-primary":    "#004d40",
    "border-l-green-600":  "#16a34a",
    "border-l-green-500":  "#22c55e",
    "border-l-red-500":    "#ef4444",
    "border-l-amber-500":  "#f59e0b",
    "border-l-orange-500": "#f97316",
    "border-l-teal-500":   "#14b8a6",
    "border-l-slate-400":  "#94a3b8",
  };
  for (const [k, v] of Object.entries(map)) {
    if (cls.includes(k)) return v;
  }
  return C.accent;
}

// ── Page shell ────────────────────────────────────────────────────────────────
function pageShell(content: string, pg: number, total: number, subtitle: string) {
  return `
<div style="width:794px;min-height:1123px;background:${C.bg};font-family:'Cairo','Inter',sans-serif;
  color:${C.text};box-sizing:border-box;display:flex;flex-direction:column;">
  <div style="background:${C.primary};padding:10px 32px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="width:28px;height:28px;background:${C.white};border-radius:6px;display:flex;align-items:center;justify-content:center;">
        <div style="width:16px;height:16px;background:${C.primary};border-radius:3px;"></div>
      </div>
      <span style="color:${C.white};font-weight:700;font-size:16px;">OptimDZ</span>
    </div>
    <span style="color:rgba(255,255,255,0.75);font-size:11px;">${subtitle}</span>
    <span style="color:rgba(255,255,255,0.6);font-size:10px;">${pg} / ${total}</span>
  </div>
  <div style="flex:1;padding:28px 36px 20px;display:flex;flex-direction:column;gap:0;">${content}</div>
  <div style="border-top:1px solid ${C.border};padding:8px 36px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
    <span style="font-size:9px;color:${C.muted};">نظام OptimDZ — تحليل الانحرافات · Analyse des Écarts</span>
    <span style="font-size:9px;color:${C.muted};">www.optimdz.replit.app</span>
  </div>
</div>`;
}

function secTitle(fr: string, ar: string) {
  return `<div style="margin-bottom:12px;margin-top:20px;">
    <h2 style="font-size:15px;font-weight:800;color:${C.primary};margin:0 0 4px;">${ar} · ${fr}</h2>
    <div style="width:40px;height:3px;background:${C.accent};border-radius:2px;"></div>
  </div>`;
}

// ── Objective labels ──────────────────────────────────────────────────────────
function objLabels(obj: VarianceObjective) {
  const map = {
    revenue:   { fr: "Écarts sur Revenus",              ar: "انحرافات الإيرادات",            priceFr: "Écart/Prix",    priceAr: "انحراف السعر",      qtyFr: "Écart/Volume",   qtyAr: "انحراف الحجم",         var3Fr: undefined as string|undefined, var3Ar: undefined as string|undefined, var4Fr: undefined as string|undefined, var4Ar: undefined as string|undefined, fav: "positive" as const },
    materials: { fr: "Écarts sur Matières",              ar: "انحرافات المواد الأولية",        priceFr: "Écart/Prix",    priceAr: "انحراف السعر",      qtyFr: "Écart/Qté",      qtyAr: "انحراف الكمية",        var3Fr: undefined as string|undefined, var3Ar: undefined as string|undefined, var4Fr: undefined as string|undefined, var4Ar: undefined as string|undefined, fav: "negative" as const },
    labor:     { fr: "Écarts sur Main-d'œuvre",          ar: "انحرافات اليد العاملة",          priceFr: "Écart/Taux",    priceAr: "انحراف الأجر",      qtyFr: "Écart/Rend.",    qtyAr: "انحراف المردودية",     var3Fr: undefined as string|undefined, var3Ar: undefined as string|undefined, var4Fr: undefined as string|undefined, var4Ar: undefined as string|undefined, fav: "negative" as const },
    overhead:  { fr: "Écarts sur Charges Indirectes",   ar: "انحرافات التكاليف غير المباشرة", priceFr: "Écart/Budget",  priceAr: "انحراف الميزانية", qtyFr: "Écart/Rendement", qtyAr: "انحراف المردودية",    var3Fr: "Écart/Activité", var3Ar: "انحراف النشاط",  var4Fr: "É/Sous-activité", var4Ar: "انحراف قصور النشاط", fav: "negative" as const },
  };
  return map[obj];
}

// ── Page 1: Cover ─────────────────────────────────────────────────────────────
function buildCover(
  opts: VariancePDFOptions,
  reportId: string, generatedAt: string, totalPages: number,
) {
  const lbl = objLabels(opts.objective);
  const tot = opts.totals;
  const favColor = (n: number) => favorableColor(n, lbl.fav);

  const isOverhead = opts.objective === "overhead";
  const kpis = isOverhead ? [
    { label: `${lbl.priceAr} / ${lbl.priceFr}`,    value: fDA(tot.priceVariance),  color: favColor(tot.priceVariance) },
    { label: `${lbl.var4Ar} / ${lbl.var4Fr}`,        value: fDA(tot.var4 ?? 0),      color: favColor(tot.var4 ?? 0) },
    { label: `${lbl.var3Ar} / ${lbl.var3Fr}`,         value: fDA(tot.var3 ?? 0),      color: favColor(tot.var3 ?? 0) },
    { label: `${lbl.qtyAr} / ${lbl.qtyFr}`,           value: fDA(tot.qtyVariance),   color: favColor(tot.qtyVariance) },
    { label: "الانحراف الإجمالي / Écart Total",       value: fDA(tot.totalVariance), color: favColor(tot.totalVariance) },
  ] : [
    { label: "انحراف السعر / Écart Prix",        value: fDA(tot.priceVariance),  color: favColor(tot.priceVariance) },
    { label: "انحراف الكمية / Écart Qté",         value: fDA(tot.qtyVariance),   color: favColor(tot.qtyVariance) },
    { label: "الانحراف الإجمالي / Écart Total",  value: fDA(tot.totalVariance), color: favColor(tot.totalVariance) },
    { label: "عدد العناصر / Nb. éléments",        value: String(opts.rows.length), color: C.primary },
  ];

  return `
<div style="width:794px;min-height:1123px;background:${C.primary};font-family:'Cairo','Inter',sans-serif;
  color:${C.white};box-sizing:border-box;display:flex;flex-direction:column;">
  <div style="height:6px;background:${C.accent};"></div>
  <div style="padding:28px 40px 0;display:flex;align-items:center;gap:12px;">
    <div style="width:40px;height:40px;background:${C.white};border-radius:10px;display:flex;align-items:center;justify-content:center;">
      <div style="width:22px;height:22px;background:${C.primary};border-radius:5px;"></div>
    </div>
    <div>
      <div style="font-size:22px;font-weight:800;letter-spacing:1px;">OptimDZ</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.65);margin-top:1px;">نظام دعم القرار للمؤسسة الجزائرية</div>
    </div>
  </div>
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 40px;text-align:center;gap:14px;">
    <div style="font-size:11px;letter-spacing:3px;color:${C.accent};text-transform:uppercase;font-weight:600;">تقرير رسمي · Rapport Officiel</div>
    <div style="font-size:24px;font-weight:800;line-height:1.3;direction:rtl;">${lbl.ar}</div>
    <div style="font-size:15px;font-weight:400;color:rgba(255,255,255,0.8);">${lbl.fr}</div>
    <div style="width:60px;height:3px;background:${C.accent};border-radius:2px;margin:4px 0;"></div>
    <div style="font-size:22px;font-weight:700;color:${C.accent};">${opts.problemName}</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.7);">
      ${opts.rows.length} ${opts.rows.length === 1 ? "élément analysé" : "éléments analysés"}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;max-width:580px;margin-top:8px;">
      ${kpis.map(k => `
        <div style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:10px;padding:12px 16px;text-align:left;">
          <div style="font-size:9px;color:rgba(255,255,255,0.55);margin-bottom:4px;">${k.label}</div>
          <div style="font-size:18px;font-weight:800;color:${C.accent};">${k.value}</div>
        </div>`).join("")}
    </div>
  </div>
  <div style="padding:0 40px 28px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
    ${[
      ["المسألة / Problème", opts.problemName],
      ["القطاع / Secteur", opts.sector],
      ["النوع / Type", lbl.fr],
      ["عدد العناصر / Nb. éléments", String(opts.rows.length)],
      ["المسؤول / Responsable", opts.managerName || "—"],
      ["المؤسسة / Institution", opts.institutionName || "—"],
      ["رقم التقرير / N° Rapport", reportId],
      ["تاريخ الإصدار / Date", generatedAt],
    ].map(([l, v]) => `
      <div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:11px 14px;">
        <div style="font-size:9px;color:rgba(255,255,255,0.55);margin-bottom:4px;">${l}</div>
        <div style="font-size:11.5px;font-weight:700;">${v}</div>
      </div>`).join("")}
  </div>
  <div style="height:6px;background:rgba(255,255,255,0.15);"></div>
</div>`;
}

// ── Page 2: Results table + bar chart ─────────────────────────────────────────
function buildResultsPage(opts: VariancePDFOptions, totalPages: number) {
  const lbl = objLabels(opts.objective);
  const fav = lbl.fav;
  const fc = (n: number) => favorableColor(n, fav);
  const isOverhead = opts.objective === "overhead";

  // Variance table rows
  const tableRows = opts.rows.map((r, i) => {
    const bg = i % 2 === 0 ? C.white : "#f7f7f7";
    const favBadge = (n: number) => {
      const good = fav === "positive" ? n > 0 : n < 0;
      const color = n === 0 ? C.muted : good ? C.green : C.red;
      const txt   = n === 0 ? "محايد" : good ? "✓" : "✗";
      return `<span style="color:${color};font-weight:700;">${txt}</span>`;
    };
    if (isOverhead) {
      return `<tr style="background:${bg};">
        <td style="padding:4px 5px;border-bottom:1px solid ${C.border};font-size:8.5px;font-weight:600;">${r.element}</td>
        <td style="padding:4px 4px;border-bottom:1px solid ${C.border};text-align:right;font-size:8px;font-family:monospace;">${fNum(r.standardPrice)}</td>
        <td style="padding:4px 4px;border-bottom:1px solid ${C.border};text-align:right;font-size:8px;font-family:monospace;">${fNum(r.actualPrice)}</td>
        <td style="padding:4px 4px;border-bottom:1px solid ${C.border};text-align:right;font-size:8px;font-family:monospace;">${fNum(r.standardQty)}</td>
        <td style="padding:4px 4px;border-bottom:1px solid ${C.border};text-align:right;font-size:8px;font-family:monospace;">${fNum(r.actualQty)}</td>
        <td style="padding:4px 4px;border-bottom:1px solid ${C.border};text-align:right;font-size:8px;font-family:monospace;">${fNum(r.extra1 ?? 0)}</td>
        <td style="padding:4px 4px;border-bottom:1px solid ${C.border};text-align:right;font-size:8px;font-family:monospace;color:#5c35c9;">${fNum(r.extra2 ?? 0)}</td>
        <td style="padding:4px 4px;border-bottom:1px solid ${C.border};text-align:right;font-size:8px;font-family:monospace;font-weight:700;color:${fc(r.priceVariance)};">${fDA(r.priceVariance)}</td>
        <td style="padding:4px 4px;border-bottom:1px solid ${C.border};text-align:right;font-size:8px;font-family:monospace;font-weight:700;color:${fc(r.var4 ?? 0)};">${fDA(r.var4 ?? 0)}</td>
        <td style="padding:4px 4px;border-bottom:1px solid ${C.border};text-align:right;font-size:8px;font-family:monospace;font-weight:700;color:${fc(r.var3 ?? 0)};">${fDA(r.var3 ?? 0)}</td>
        <td style="padding:4px 4px;border-bottom:1px solid ${C.border};text-align:right;font-size:8px;font-family:monospace;font-weight:700;color:${fc(r.qtyVariance)};">${fDA(r.qtyVariance)}</td>
        <td style="padding:4px 4px;border-bottom:1px solid ${C.border};text-align:right;font-size:8px;font-family:monospace;font-weight:800;color:${fc(r.totalVariance)};">
          ${fDA(r.totalVariance)} ${favBadge(r.totalVariance)}
        </td>
      </tr>`;
    }
    return `<tr style="background:${bg};">
      <td style="padding:5px 8px;border-bottom:1px solid ${C.border};font-size:10px;font-weight:600;">${r.element}</td>
      <td style="padding:5px 6px;border-bottom:1px solid ${C.border};text-align:right;font-size:9px;font-family:monospace;">${fNum(r.standardPrice)}</td>
      <td style="padding:5px 6px;border-bottom:1px solid ${C.border};text-align:right;font-size:9px;font-family:monospace;">${fNum(r.actualPrice)}</td>
      <td style="padding:5px 6px;border-bottom:1px solid ${C.border};text-align:right;font-size:9px;font-family:monospace;">${fNum(r.standardQty)}</td>
      <td style="padding:5px 6px;border-bottom:1px solid ${C.border};text-align:right;font-size:9px;font-family:monospace;">${fNum(r.actualQty)}</td>
      <td style="padding:5px 6px;border-bottom:1px solid ${C.border};text-align:right;font-size:9.5px;font-family:monospace;font-weight:700;color:${fc(r.priceVariance)};">${fDA(r.priceVariance)}</td>
      <td style="padding:5px 6px;border-bottom:1px solid ${C.border};text-align:right;font-size:9.5px;font-family:monospace;font-weight:700;color:${fc(r.qtyVariance)};">${fDA(r.qtyVariance)}</td>
      <td style="padding:5px 6px;border-bottom:1px solid ${C.border};text-align:right;font-size:9.5px;font-family:monospace;font-weight:800;color:${fc(r.totalVariance)};">
        ${fDA(r.totalVariance)} ${favBadge(r.totalVariance)}
      </td>
    </tr>`;
  }).join("");

  // Totals row
  const tot = opts.totals;
  const totalsRow = isOverhead
    ? `<tr style="background:${C.primaryLight};">
        <td colspan="7" style="padding:5px 7px;font-size:10px;font-weight:800;color:${C.primary};">الإجمالي / TOTAL</td>
        <td style="padding:5px 4px;text-align:right;font-size:9px;font-family:monospace;font-weight:800;color:${fc(tot.priceVariance)};">${fDA(tot.priceVariance)}</td>
        <td style="padding:5px 4px;text-align:right;font-size:9px;font-family:monospace;font-weight:800;color:${fc(tot.var4 ?? 0)};">${fDA(tot.var4 ?? 0)}</td>
        <td style="padding:5px 4px;text-align:right;font-size:9px;font-family:monospace;font-weight:800;color:${fc(tot.var3 ?? 0)};">${fDA(tot.var3 ?? 0)}</td>
        <td style="padding:5px 4px;text-align:right;font-size:9px;font-family:monospace;font-weight:800;color:${fc(tot.qtyVariance)};">${fDA(tot.qtyVariance)}</td>
        <td style="padding:5px 4px;text-align:right;font-size:9px;font-family:monospace;font-weight:800;color:${fc(tot.totalVariance)};">${fDA(tot.totalVariance)}</td>
      </tr>`
    : `<tr style="background:${C.primaryLight};">
        <td colspan="5" style="padding:6px 8px;font-size:10.5px;font-weight:800;color:${C.primary};">الإجمالي / TOTAL</td>
        <td style="padding:6px 6px;text-align:right;font-size:10px;font-family:monospace;font-weight:800;color:${fc(tot.priceVariance)};">${fDA(tot.priceVariance)}</td>
        <td style="padding:6px 6px;text-align:right;font-size:10px;font-family:monospace;font-weight:800;color:${fc(tot.qtyVariance)};">${fDA(tot.qtyVariance)}</td>
        <td style="padding:6px 6px;text-align:right;font-size:10px;font-family:monospace;font-weight:800;color:${fc(tot.totalVariance)};">${fDA(tot.totalVariance)}</td>
      </tr>`;

  // Bar chart: total variance per element
  const maxAbs = Math.max(...opts.rows.map(r => Math.abs(r.totalVariance)), 1);
  const maxBarW = 320;
  const bars = opts.rows.map(r => {
    const w = (Math.abs(r.totalVariance) / maxAbs) * maxBarW;
    const color = fc(r.totalVariance);
    return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
      <div style="width:110px;font-size:9px;color:${C.muted};text-align:right;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.element}</div>
      <div style="width:${maxBarW}px;height:18px;background:#f0f0f0;border-radius:3px;position:relative;flex-shrink:0;">
        <div style="width:${w.toFixed(0)}px;height:18px;background:${color};border-radius:3px;opacity:0.85;"></div>
      </div>
      <div style="font-size:9px;font-family:monospace;color:${color};font-weight:700;white-space:nowrap;">${fDA(r.totalVariance)}</div>
    </div>`;
  }).join("");

  const overheadHeaders = isOverhead ? `
    <th style="padding:5px 4px;text-align:right;font-size:7.5px;">CB</th>
    <th style="padding:5px 4px;text-align:right;font-size:7.5px;">CR</th>
    <th style="padding:5px 4px;text-align:right;font-size:7.5px;">Nh</th>
    <th style="padding:5px 4px;text-align:right;font-size:7.5px;">Nr</th>
    <th style="padding:5px 4px;text-align:right;font-size:7.5px;">CS</th>
    <th style="padding:5px 4px;text-align:right;font-size:7.5px;color:#5c35c9;">CF</th>
    <th style="padding:5px 4px;text-align:right;font-size:7.5px;">${lbl.priceFr}</th>
    <th style="padding:5px 4px;text-align:right;font-size:7.5px;">${lbl.var4Fr}</th>
    <th style="padding:5px 4px;text-align:right;font-size:7.5px;">${lbl.var3Fr}</th>
    <th style="padding:5px 4px;text-align:right;font-size:7.5px;">${lbl.qtyFr}</th>
    <th style="padding:5px 4px;text-align:right;font-size:7.5px;">Total</th>` : `
    <th style="padding:6px 6px;text-align:right;font-size:9px;">P. std</th>
    <th style="padding:6px 6px;text-align:right;font-size:9px;">P. réel</th>
    <th style="padding:6px 6px;text-align:right;font-size:9px;">Q. std</th>
    <th style="padding:6px 6px;text-align:right;font-size:9px;">Q. réelle</th>
    <th style="padding:6px 6px;text-align:right;font-size:9px;">${lbl.priceFr}</th>
    <th style="padding:6px 6px;text-align:right;font-size:9px;">${lbl.qtyFr}</th>
    <th style="padding:6px 6px;text-align:right;font-size:9px;">Total</th>`;

  const content = `
    ${secTitle("Tableau Détaillé des Écarts", "جدول الانحرافات التفصيلي")}
    <div style="overflow:auto;margin-bottom:16px;">
      <table style="width:100%;border-collapse:collapse;font-size:9px;">
        <thead>
          <tr style="background:${C.primary};color:${C.white};">
            <th style="padding:6px 8px;text-align:left;font-size:9px;">Élément / العنصر</th>
            ${overheadHeaders}
          </tr>
        </thead>
        <tbody>${tableRows}${totalsRow}</tbody>
      </table>
    </div>

    ${secTitle("Écart Total par Élément", "الانحراف الإجمالي حسب العنصر")}
    <div style="padding:8px 0;">${bars}</div>`;

  return pageShell(content, 2, totalPages, "جدول النتائج · Tableau des Résultats");
}

// ── Page 3: Analysis + Recommendations ───────────────────────────────────────
function buildAnalysisPage(opts: VariancePDFOptions, totalPages: number) {
  const analysisHtml = opts.analysisLines.map(line => {
    const bg  = twBg(line.color);
    const bdr = twBorder(line.color);
    return `
    <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 12px;background:${bg};border:1px solid ${bdr};border-radius:6px;margin-bottom:7px;font-size:10px;line-height:1.65;">
      <span style="font-size:14px;flex-shrink:0;">${line.icon}</span>
      <span>${line.text}</span>
    </div>`;
  }).join("");

  const suggestionsHtml = opts.suggestions.map(s => {
    const bg  = twBg(s.color ?? "bg-white");
    const bdr = twBorder(s.borderColor ?? "border-l-amber-500");
    return `
    <div style="border-left:4px solid ${bdr};padding:8px 12px;background:${bg};border-radius:0 6px 6px 0;margin-bottom:8px;">
       ${s.title ? `<div style="font-size:10.5px;font-weight:700;color:${C.text};margin-bottom:3px;">${s.icon} ${s.title}</div>` : ""}
      <div style="font-size:9.5px;color:${C.muted};line-height:1.65;">${s.desc}</div>
    </div>`;
  }).join("");

  const lbl = objLabels(opts.objective);
  const fav = lbl.fav;
  const fc = (n: number) => favorableColor(n, fav);
  const tot = opts.totals;

  // KPI summary grid (overhead gets all 4+1 components)
  const isOverheadPage = opts.objective === "overhead";
  const kpis = [
    { label: `${lbl.priceAr} · ${lbl.priceFr}`,   value: fDA(tot.priceVariance),  color: fc(tot.priceVariance) },
    ...(isOverheadPage && lbl.var4Fr ? [{ label: `${lbl.var4Ar ?? ""} · ${lbl.var4Fr}`, value: fDA(tot.var4 ?? 0), color: fc(tot.var4 ?? 0) }] : []),
    ...(isOverheadPage && lbl.var3Fr ? [{ label: `${lbl.var3Ar ?? ""} · ${lbl.var3Fr}`, value: fDA(tot.var3 ?? 0), color: fc(tot.var3 ?? 0) }] : []),
    { label: `${lbl.qtyAr} · ${lbl.qtyFr}`,        value: fDA(tot.qtyVariance),    color: fc(tot.qtyVariance) },
    { label: "الإجمالي · Total",                    value: fDA(tot.totalVariance),  color: fc(tot.totalVariance) },
    { label: "العوامل المسيطرة · Facteur dominant", value:
        opts.dominantFactor === "price" ? lbl.priceFr :
        opts.dominantFactor === "qty"   ? lbl.qtyFr :
        opts.dominantFactor === "var3"  ? (lbl.var3Fr ?? lbl.qtyFr) :
        opts.dominantFactor === "var4"  ? (lbl.var4Fr ?? lbl.priceFr) :
        "Équilibrés", color: C.primary },
  ];

  const kpiGrid = kpis.map(k => `
    <div style="background:${C.white};border:1px solid ${C.border};border-radius:8px;padding:10px 12px;">
      <div style="font-size:8.5px;color:${C.muted};margin-bottom:3px;">${k.label}</div>
      <div style="font-size:15px;font-weight:800;color:${k.color};">${k.value}</div>
    </div>`).join("");

  // Ratios card
  const totalBase = opts.rows.reduce((s, r) =>
    s + (opts.objective === "overhead" ? r.standardPrice : r.standardPrice * r.standardQty), 0);

  const ratioItems: { label: string; v: number }[] = [
    { label: `${lbl.priceAr} · ${lbl.priceFr}`, v: tot.priceVariance },
    ...(isOverheadPage && lbl.var4Fr ? [{ label: `${lbl.var4Ar ?? ""} · ${lbl.var4Fr}`, v: tot.var4 ?? 0 }] : []),
    ...(isOverheadPage && lbl.var3Fr ? [{ label: `${lbl.var3Ar ?? ""} · ${lbl.var3Fr}`, v: tot.var3 ?? 0 }] : []),
    { label: `${lbl.qtyAr} · ${lbl.qtyFr}`, v: tot.qtyVariance },
    { label: "الانحراف الإجمالي · Écart Total", v: tot.totalVariance },
  ];

  const ratiosHtml = totalBase > 0 ? ratioItems.map(item => {
    const p    = (item.v / totalBase) * 100;
    const ap   = Math.abs(p);
    const col  = ap < 5 ? C.green : ap < 15 ? "#e65100" : C.red;
    const bdg  = ap < 5 ? "مقبول · Acceptable" : ap < 15 ? "يستدعي انتباه · Vigilance" : "حرج · Critique";
    const bBg  = ap < 5 ? "#e8f5e9" : ap < 15 ? "#fff3e0" : C.redLight;
    const barW = Math.min(ap * 4, 100);
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:${C.white};border:1px solid ${C.border};border-radius:6px;margin-bottom:5px;">
      <div style="width:110px;font-size:8.5px;color:${C.text};font-weight:600;flex-shrink:0;">${item.label}</div>
      <div style="flex:1;height:8px;background:#f0f0f0;border-radius:4px;max-width:120px;">
        <div style="width:${barW.toFixed(0)}%;height:8px;background:${col};border-radius:4px;opacity:0.85;"></div>
      </div>
      <div style="font-size:9px;font-family:monospace;color:${col};font-weight:700;width:44px;text-align:right;">${p >= 0 ? "+" : ""}${p.toFixed(1)}%</div>
      <div style="font-size:8px;font-weight:700;color:${col};background:${bBg};padding:2px 6px;border-radius:4px;white-space:nowrap;">${bdg}</div>
    </div>`;
  }).join("") : "";

  const content = `
    ${secTitle("Synthèse des Indicateurs", "ملخص المؤشرات")}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px;">${kpiGrid}</div>

    ${secTitle("مؤشرات ونسب التسيير · Ratios de Gestion", "مؤشرات ونسب التسيير")}
    <div style="margin-bottom:6px;font-size:8.5px;color:${C.muted};">القاعدة المعيارية: ${fDA(totalBase)} · Seuils : vert &lt;5% · orange 5–15% · rouge &gt;15%</div>
    <div style="margin-bottom:12px;">${ratiosHtml}</div>

    ${secTitle("Analyse de la Situation", "تحليل الوضع")}
    <div style="margin-bottom:14px;">${analysisHtml}</div>

    ${secTitle("Recommandations Managériales", "التوصيات الإدارية")}
    <div>${suggestionsHtml}</div>`;

  return pageShell(content, 3, totalPages, "التحليل والتوصيات · Analyse & Recommandations");
}

// ── Page 4: Digital stamp ─────────────────────────────────────────────────────
function buildStampPage(reportId: string, generatedAt: string, totalPages: number) {
  const content = `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;text-align:center;">
      <div style="width:80px;height:80px;background:${C.primary};border-radius:50%;display:flex;align-items:center;justify-content:center;">
        <div style="width:50px;height:50px;background:${C.white};border-radius:50%;display:flex;align-items:center;justify-content:center;">
          <div style="width:28px;height:28px;background:${C.primary};border-radius:50%;"></div>
        </div>
      </div>
      <div>
        <div style="font-size:22px;font-weight:800;color:${C.primary};">تقرير انحرافات معتمد · Rapport d'Écarts Certifié</div>
        <div style="font-size:13px;color:${C.muted};margin-top:4px;">نظام OptimDZ لتحليل الانحرافات</div>
      </div>
      <div style="border:2px dashed ${C.border};border-radius:12px;padding:20px 40px;display:inline-block;">
        <div style="font-size:11px;color:${C.muted};margin-bottom:6px;">رقم التقرير · Numéro du rapport</div>
        <div style="font-size:18px;font-family:monospace;font-weight:700;color:${C.primary};letter-spacing:2px;">${reportId}</div>
        <div style="font-size:10px;color:${C.muted};margin-top:6px;">${generatedAt}</div>
      </div>
      <div style="font-size:11px;color:${C.muted};max-width:440px;line-height:1.7;">
        هذا التقرير صادر تلقائياً من نظام OptimDZ لتحليل الانحرافات.
        النتائج مبنية على البيانات المُدخلة وتُعدّ أداة دعم قرار للمديرين الجزائريين.
        <br/><br/>
        Ce rapport a été généré automatiquement par le système OptimDZ — Analyse des Écarts.
        Il constitue un outil d'aide à la décision basé sur les données saisies.
      </div>
    </div>`;
  return pageShell(content, totalPages, totalPages, "الختم الرقمي · Cachet Numérique");
}

// ── Render helper ─────────────────────────────────────────────────────────────
async function addHtmlPage(pdf: jsPDF, html: string, pw: number) {
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;left:-9999px;top:-9999px;z-index:-1;";
  div.innerHTML = html;
  document.body.appendChild(div);
  try {
    const canvas = await html2canvas(div.firstElementChild as HTMLElement, {
      scale: 2, useCORS: true, logging: false,
    });
    const img = canvas.toDataURL("image/jpeg", 0.92);
    const ph  = (canvas.height / canvas.width) * pw;
    pdf.addPage([pw, ph]);
    pdf.addImage(img, "JPEG", 0, 0, pw, ph);
  } finally {
    document.body.removeChild(div);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateVariancePDFReport(opts: VariancePDFOptions): Promise<void> {
  const prog = opts.onProgress ?? (() => {});
  const reportId    = genId();
  const generatedAt = new Date().toLocaleDateString("fr-DZ", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const PAGE_W     = 210;
  const totalPages = 4;

  prog("Génération de la couverture…", 10);
  const coverHtml   = buildCover(opts, reportId, generatedAt, totalPages);
  const resHtml     = buildResultsPage(opts, totalPages);
  const analysisHtml = buildAnalysisPage(opts, totalPages);
  const stampHtml   = buildStampPage(reportId, generatedAt, totalPages);

  prog("Rendu de la couverture…", 20);
  const coverDiv = document.createElement("div");
  coverDiv.style.cssText = "position:fixed;left:-9999px;top:-9999px;z-index:-1;";
  coverDiv.innerHTML = coverHtml;
  document.body.appendChild(coverDiv);
  const coverCanvas = await html2canvas(coverDiv.firstElementChild as HTMLElement, {
    scale: 2, useCORS: true, logging: false,
  });
  const coverImg  = coverCanvas.toDataURL("image/jpeg", 0.92);
  const coverPageH = (coverCanvas.height / coverCanvas.width) * PAGE_W;
  document.body.removeChild(coverDiv);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [PAGE_W, coverPageH] });
  pdf.addImage(coverImg, "JPEG", 0, 0, PAGE_W, coverPageH);

  prog("Rendu des résultats…", 45);
  await addHtmlPage(pdf, resHtml, PAGE_W);

  prog("Rendu de l'analyse…", 65);
  await addHtmlPage(pdf, analysisHtml, PAGE_W);

  prog("Rendu du cachet…", 85);
  await addHtmlPage(pdf, stampHtml, PAGE_W);

  prog("Téléchargement…", 95);
  const safe = (opts.problemName || "variance").replace(/\s+/g, "_").slice(0, 30);
  pdf.save(`OptimDZ_Écarts_${safe}_${Date.now()}.pdf`);
  prog("Terminé.", 100);
}
