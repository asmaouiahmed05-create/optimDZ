import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { SensitivityAnalysisResult, VariableSensitivity } from "./sensitivityAnalysisAlgorithm";
import { breakEvenRisk } from "./sensitivityAnalysisAlgorithm";
import { fmtYears } from "./investmentAppraisalAlgorithm";

// ── Brand tokens ──────────────────────────────────────────────────────────────
const C = {
  primary: "#004d40", primaryLight: "#e0f2f1",
  secondary: "#3a7d44", accent: "#f4a261",
  bg: "#fbf8f1", text: "#0c2621", muted: "#5f7b77",
  orange: "#e65100", orangeLight: "#fff3e0",
  green: "#2e7d32", greenLight: "#e8f5e9",
  red: "#c62828", redLight: "#ffebee",
  border: "#c8dad6", white: "#ffffff",
};

function f(n: number | null | undefined, dec = 2): string {
  if (n == null || !isFinite(n)) return "—";
  return parseFloat(n.toFixed(dec)).toLocaleString("fr-DZ", { maximumFractionDigits: dec });
}
function fDA(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(Math.round(n));
  return (n < 0 ? "−" : "") + abs.toLocaleString("fr-DZ") + " DA";
}
function genId() {
  return `SA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
function sectorLabel(s?: string) {
  const m: Record<string, string> = {
    trade: "تجارة / Commerce", industry: "صناعة / Industrie",
    services: "خدمات / Services", agriculture: "فلاحة / Agriculture",
    custom: "مخصص / Personnalisé",
  };
  return s ? (m[s] ?? s) : "—";
}

// ── Shell ─────────────────────────────────────────────────────────────────────
function pageShell(content: string, pageNum: number, total: number, title: string) {
  return `
  <div style="width:794px;min-height:1123px;background:${C.bg};font-family:'Cairo','Inter',sans-serif;
    color:${C.text};position:relative;box-sizing:border-box;display:flex;flex-direction:column;">
    <div style="background:${C.primary};padding:10px 32px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:28px;height:28px;background:${C.white};border-radius:6px;display:flex;align-items:center;justify-content:center;">
          <div style="width:16px;height:16px;background:${C.primary};border-radius:3px;"></div>
        </div>
        <span style="color:${C.white};font-weight:700;font-size:16px;">OptimDZ</span>
      </div>
      <span style="color:rgba(255,255,255,0.75);font-size:11px;">${title}</span>
      <span style="color:rgba(255,255,255,0.6);font-size:10px;">${pageNum} / ${total}</span>
    </div>
    <div style="flex:1;padding:28px 36px 20px;display:flex;flex-direction:column;gap:0;">${content}</div>
    <div style="border-top:1px solid ${C.border};padding:8px 36px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <span style="font-size:9px;color:${C.muted};">نظام OptimDZ — تحليل الحساسية والسيناريوهات · Analyse de Sensibilité & Scénarios</span>
      <span style="font-size:9px;color:${C.muted};">www.optimdz.replit.app</span>
    </div>
  </div>`;
}

function sectionTitle(fr: string, ar: string) {
  return `<div style="margin-bottom:12px;">
    <h2 style="font-size:17px;font-weight:800;color:${C.primary};margin:0 0 4px;">${ar} · ${fr}</h2>
    <div style="width:40px;height:3px;background:${C.accent};border-radius:2px;"></div>
  </div>`;
}
function kpiCard(label: string, value: string, bg: string, color = C.white) {
  return `<div style="background:${bg};border-radius:10px;padding:10px;color:${color};">
    <div style="font-size:9px;opacity:0.75;margin-bottom:3px;line-height:1.3;">${label}</div>
    <div style="font-size:13px;font-weight:800;">${value}</div>
  </div>`;
}

// ── Page 1 — Cover ─────────────────────────────────────────────────────────────
function buildCover(
  sr: SensitivityAnalysisResult, projectName: string, sector: string | undefined,
  managerName: string, institutionName: string,
  reportId: string, generatedAt: string, totalPages: number
) {
  const { baseResult: r, rangeMin, rangeMax, stepSize } = sr;
  const npvPositive = r.npv >= 0;
  const mostSensitive = sr.variables[0];

  return `
  <div style="width:794px;min-height:1123px;background:${C.primary};font-family:'Cairo','Inter',sans-serif;
    color:${C.white};position:relative;box-sizing:border-box;display:flex;flex-direction:column;">
    <div style="height:6px;background:${C.accent};"></div>
    <div style="padding:28px 40px 0;display:flex;align-items:center;gap:12px;">
      <div style="width:40px;height:40px;background:${C.white};border-radius:10px;display:flex;align-items:center;justify-content:center;">
        <div style="width:22px;height:22px;background:${C.primary};border-radius:5px;display:flex;align-items:center;justify-content:center;">
          <div style="width:10px;height:10px;background:${C.white};border-radius:2px;"></div>
        </div>
      </div>
      <div>
        <div style="font-size:22px;font-weight:800;letter-spacing:1px;">OptimDZ</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.65);margin-top:1px;">نظام دعم القرار · تحليل الحساسية الاستثمارية</div>
      </div>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 40px;text-align:center;gap:14px;">
      <div style="font-size:11px;letter-spacing:3px;color:${C.accent};text-transform:uppercase;font-weight:600;">تقرير رسمي · Rapport Officiel</div>
      <div style="font-size:24px;font-weight:800;line-height:1.3;direction:rtl;">تقرير تحليل الحساسية والسيناريوهات</div>
      <div style="font-size:15px;font-weight:400;color:rgba(255,255,255,0.8);">Rapport d'Analyse de Sensibilité & Scénarios d'Investissement</div>
      <div style="width:60px;height:3px;background:${C.accent};border-radius:2px;margin:6px 0;"></div>
      <div style="font-size:20px;font-weight:700;color:${C.accent};">${projectName || "—"}</div>
      <div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:12px;padding:12px 24px;margin-top:6px;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;text-align:center;">
          <div>
            <div style="font-size:9px;opacity:0.65;margin-bottom:3px;">VAN de base / NPV</div>
            <div style="font-size:15px;font-weight:800;color:${npvPositive ? "#a5d6a7" : "#ef9a9a"};">${fDA(r.npv)}</div>
          </div>
          <div>
            <div style="font-size:9px;opacity:0.65;margin-bottom:3px;">TRI de base / IRR</div>
            <div style="font-size:15px;font-weight:800;">${r.irr !== null ? f(r.irr, 2) + " %" : "—"}</div>
          </div>
          <div>
            <div style="font-size:9px;opacity:0.65;margin-bottom:3px;">Plage d'analyse</div>
            <div style="font-size:15px;font-weight:800;">${rangeMin}% à +${rangeMax}%</div>
          </div>
          <div>
            <div style="font-size:9px;opacity:0.65;margin-bottom:3px;">Pas / Incrément</div>
            <div style="font-size:15px;font-weight:800;">${stepSize}%</div>
          </div>
          <div>
            <div style="font-size:9px;opacity:0.65;margin-bottom:3px;">Variable la + sensible</div>
            <div style="font-size:12px;font-weight:700;">${mostSensitive?.nameFr ?? "—"}</div>
          </div>
          <div>
            <div style="font-size:9px;opacity:0.65;margin-bottom:3px;">Invest. initial / I₀</div>
            <div style="font-size:15px;font-weight:800;">${fDA(r.input.initialInvestment)}</div>
          </div>
        </div>
      </div>
    </div>
    <div style="padding:0 40px 28px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      ${[
        ["المشروع / Projet",          projectName || "—"],
        ["المسؤول / Responsable",     managerName  || "—"],
        ["المؤسسة / Institution",     institutionName || "—"],
        ["القطاع / Secteur",          sectorLabel(sector)],
        ["المدة / Durée",             `${r.input.duration} ans`],
        ["رقم التقرير / N° Rapport",  reportId],
        ["تاريخ الإصدار / Date",      generatedAt],
        ["النوع / Type",              "Analyse de Sensibilité — VAN / TRI"],
      ].map(([label, value]) => `
        <div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:11px 14px;">
          <div style="font-size:9px;color:rgba(255,255,255,0.55);margin-bottom:4px;">${label}</div>
          <div style="font-size:12px;font-weight:700;">${value}</div>
        </div>`).join("")}
    </div>
    <div style="height:6px;background:rgba(255,255,255,0.15);"></div>
  </div>`;
}

// ── Page 2 — Sensitivity Table + Break-Even ───────────────────────────────────
function buildSensitivityTablePage(sr: SensitivityAnalysisResult, totalPages: number) {
  const { variables, allPcts, baseResult } = sr;
  const baseNPV = baseResult.npv;

  const headerCells = variables.map(v =>
    `<th style="padding:6px 8px;text-align:right;font-size:9.5px;">${v.nameFr}</th>`
  ).join("");

  const tableRows = allPcts.map(pct => {
    const isBase = pct === 0;
    const bg = isBase ? C.primaryLight : (allPcts.indexOf(pct) % 2 === 0 ? C.white : "#f5f5f5");
    const cells = variables.map(v => {
      const pt = v.points.find(p => p.pct === pct);
      const npv = pt?.npv ?? 0;
      const color = npv > 0 ? C.green : npv < 0 ? C.red : C.orange;
      return `<td style="padding:5px 8px;border-bottom:1px solid ${C.border};text-align:right;font-family:monospace;font-size:10px;color:${color};font-weight:${isBase ? "700" : "400"};">${fDA(npv)}</td>`;
    }).join("");
    return `<tr style="background:${bg};">
      <td style="padding:5px 8px;border-bottom:1px solid ${C.border};font-size:10px;font-weight:${isBase ? "700" : "400"};color:${isBase ? C.primary : C.text};">
        ${pct > 0 ? "+" : ""}${pct} %${isBase ? " (base)" : ""}
      </td>
      ${cells}
    </tr>`;
  }).join("");

  // Break-even table
  const beRows = variables.map(v => {
    const risk = breakEvenRisk(v.breakEvenPct);
    const riskLabel = risk === "low" ? "Faible 🟢" : risk === "moderate" ? "Modéré 🟡" : risk === "high" ? "Élevé 🔴" : "N/A";
    const riskBg    = risk === "low" ? C.greenLight : risk === "moderate" ? C.orangeLight : risk === "high" ? C.redLight : "#f5f5f5";
    const beStr     = v.breakEvenPct !== null ? `${v.breakEvenPct >= 0 ? "+" : ""}${f(v.breakEvenPct, 1)} %` : "—";
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid ${C.border};font-size:10px;font-weight:600;">${v.nameFr}</td>
      <td style="padding:6px 8px;border-bottom:1px solid ${C.border};font-family:monospace;font-size:10.5px;font-weight:700;">${beStr}</td>
      <td style="padding:6px 8px;border-bottom:1px solid ${C.border};font-size:10px;">
        ${v.breakEvenPct !== null
          ? `VAN = 0 lorsque ${v.nameFr} varie de ${beStr} par rapport à la valeur de base`
          : "Pas de croisement NPV=0 dans la plage testée"}
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid ${C.border};background:${riskBg};font-size:10px;font-weight:600;">${riskLabel}</td>
    </tr>`;
  }).join("");

  const content = `
    ${sectionTitle("Tableau de Sensibilité — NPV par Variation", "جدول الحساسية — NPV عند كل تغيير")}
    <div style="margin-bottom:8px;font-size:9.5px;color:${C.muted};">
      Chaque colonne fait varier une seule variable ; les autres restent à leur valeur de base.
      VAN de base : <strong>${fDA(baseNPV)}</strong>
    </div>
    <div style="overflow:hidden;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;font-size:10px;">
        <thead>
          <tr style="background:${C.primary};color:${C.white};">
            <th style="padding:6px 8px;text-align:left;font-size:9.5px;">Variation %</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    ${sectionTitle("Variations au Seuil (NPV = 0)", "نقاط التعادل — متى تصبح VAN صفراً؟")}
    <table style="width:100%;border-collapse:collapse;font-size:10px;">
      <thead>
        <tr style="background:${C.primary};color:${C.white};">
          <th style="padding:6px 8px;text-align:left;">Variable</th>
          <th style="padding:6px 8px;text-align:left;">Variation seuil</th>
          <th style="padding:6px 8px;text-align:left;">Interprétation</th>
          <th style="padding:6px 8px;text-align:left;">Niveau de risque</th>
        </tr>
      </thead>
      <tbody>${beRows}</tbody>
    </table>`;

  return pageShell(content, 2, totalPages, "تحليل الحساسية · Tableau de Sensibilité");
}

// ── Page 3 — Tornado + Scenarios + Analysis ───────────────────────────────────
function buildTornadoAndScenariosPage(sr: SensitivityAnalysisResult, totalPages: number) {
  const { variables, scenarios, baseResult, rangeMin, rangeMax } = sr;
  const baseNPV = baseResult.npv;

  // Tornado chart as HTML bars
  const allNpvs = variables.flatMap(v => [v.npvAtMinRange, v.npvAtMaxRange, baseNPV]);
  const globalMin = Math.min(...allNpvs);
  const globalMax = Math.max(...allNpvs);
  const range     = globalMax - globalMin || 1;
  const toX = (npv: number) => ((npv - globalMin) / range) * 580; // 580px chart width
  const baseX = toX(baseNPV);

  const tornadoBars = variables.map((v, i) => {
    const lo  = Math.min(v.npvAtMinRange, v.npvAtMaxRange);
    const hi  = Math.max(v.npvAtMinRange, v.npvAtMaxRange);
    const xLo = toX(lo);
    const xHi = toX(hi);
    const barW = xHi - xLo;

    // Split the bar at base NPV
    const redStart  = xLo;
    const redEnd    = Math.min(baseX, xHi);
    const greenStart = Math.max(baseX, xLo);
    const greenEnd  = xHi;

    return `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;height:28px;">
        <div style="width:180px;text-align:right;font-size:10px;font-weight:600;flex-shrink:0;">${v.nameFr}</div>
        <div style="position:relative;width:580px;height:20px;background:#f0f0f0;border-radius:3px;flex-shrink:0;">
          <!-- full bar -->
          <div style="position:absolute;top:2px;height:16px;left:${xLo.toFixed(1)}px;width:${Math.max(2, barW).toFixed(1)}px;">
            ${redEnd > redStart ? `<div style="position:absolute;left:0;width:${(redEnd - redStart).toFixed(1)}px;height:16px;background:#ef9a9a;border-radius:2px 0 0 2px;"></div>` : ""}
            ${greenEnd > greenStart ? `<div style="position:absolute;left:${(greenStart - xLo).toFixed(1)}px;width:${(greenEnd - greenStart).toFixed(1)}px;height:16px;background:#a5d6a7;border-radius:0 2px 2px 0;"></div>` : ""}
          </div>
          <!-- base line -->
          <div style="position:absolute;top:0;left:${baseX.toFixed(1)}px;width:2px;height:20px;background:${C.primary};"></div>
          <!-- labels -->
          <div style="position:absolute;top:-14px;left:${xLo.toFixed(1)}px;font-size:8px;color:${C.muted};transform:translateX(-50%);">${fDA(lo)}</div>
          <div style="position:absolute;top:-14px;left:${xHi.toFixed(1)}px;font-size:8px;color:${C.muted};transform:translateX(-50%);">${fDA(hi)}</div>
        </div>
      </div>`;
  }).join("");

  // Scenarios
  const scenarioCards = scenarios.map(sc => {
    const npvColor = sc.result.npv > 0 ? C.green : sc.result.npv < 0 ? C.red : C.orange;
    const bg = sc.name === "optimistic" ? C.greenLight : sc.name === "pessimistic" ? C.redLight : C.primaryLight;
    const bdr = sc.name === "optimistic" ? C.green : sc.name === "pessimistic" ? C.red : C.primary;
    return `
      <div style="border:2px solid ${bdr};background:${bg};border-radius:10px;padding:12px;flex:1;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
          <span style="font-size:16px;">${sc.emojiIcon}</span>
          <span style="font-size:12px;font-weight:800;color:${C.text};">${sc.nameFr}</span>
          ${sc.adjustmentPct > 0 ? `<span style="font-size:9px;color:${C.muted};">(${sc.name === "pessimistic" ? "−" : "+"}${sc.adjustmentPct}%)</span>` : ""}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div><div style="font-size:8.5px;color:${C.muted};">VAN / NPV</div><div style="font-size:13px;font-weight:800;color:${npvColor};">${fDA(sc.result.npv)}</div></div>
          <div><div style="font-size:8.5px;color:${C.muted};">TRI / IRR</div><div style="font-size:13px;font-weight:800;">${sc.result.irr !== null ? f(sc.result.irr, 1) + " %" : "—"}</div></div>
          <div><div style="font-size:8.5px;color:${C.muted};">Indice de Rentabilité</div><div style="font-size:12px;font-weight:700;">${f(sc.result.profitabilityIndex, 3)}</div></div>
          <div><div style="font-size:8.5px;color:${C.muted};">Récupération actualisée</div><div style="font-size:12px;font-weight:700;">${sc.result.discountedPayback !== null ? fmtYears(sc.result.discountedPayback, "fr") : "—"}</div></div>
        </div>
      </div>`;
  }).join("");

  const mostSensitive = variables[0];
  const leastSensitive = variables[variables.length - 1];
  const testedRange = Math.max(1, rangeMax - rangeMin);
  const cleanName = (name: string) => name.replace(/\s*\([^)]*\)/g, "");
  const perPointImpact = (v: VariableSensitivity) => v.impact / testedRange;
  const adversePoint = mostSensitive
    ? [...mostSensitive.points]
        .filter(point => mostSensitive.variable === "cashFlows" ? point.pct <= 0 : point.pct >= 0)
        .sort((a, b) => {
          const target = mostSensitive.variable === "cashFlows"
            ? -scenarios[0].adjustmentPct
            : scenarios[0].adjustmentPct;
          return Math.abs(a.pct - target) - Math.abs(b.pct - target);
        })[0]
    : undefined;
  const adverseDirection = mostSensitive?.variable === "cashFlows" ? "baisse" : "hausse";
  const thresholdText = mostSensitive?.breakEvenPct !== null && mostSensitive?.breakEvenPct !== undefined
    ? `La viabilité est remise en cause après une ${mostSensitive.variable === "cashFlows" ? "baisse" : "hausse"} de ${f(Math.abs(mostSensitive.breakEvenPct), 1)}% de cette variable.`
    : "Aucun seuil de viabilité n'apparaît dans la plage testée.";
  const impactText = variables
    .map(v => `${cleanName(v.nameFr)} : ${fDA(perPointImpact(v))} par point de pourcentage`)
    .join(" ; ");

  const content = `
    ${sectionTitle("Diagramme Tornade — Impact sur la VAN", "مخطط الإعصار — التأثير على NPV")}
    <div style="margin-bottom:6px;font-size:9px;color:${C.muted};">
      Variation de ${rangeMin}% à +${rangeMax}%. Barre la plus large = variable la plus critique.
      🟥 Zone de perte · 🟩 Zone de gain · ▏ VAN de base
    </div>
    <div style="padding:20px 0 8px;">${tornadoBars}</div>

    <div style="margin-top:16px;">
      ${sectionTitle("Analyse des Scénarios — Pessimiste / Base / Optimiste", "تحليل السيناريوهات — متشائم / أساسي / متفائل")}
      <div style="display:flex;gap:10px;margin-top:8px;">${scenarioCards}</div>
    </div>

    <div style="margin-top:16px;background:${C.primaryLight};border-radius:8px;padding:12px 14px;font-size:10.5px;line-height:1.65;">
      <p style="margin:0 0 7px;">L'analyse compare ${variables.map(v => cleanName(v.nameFr)).join(", ")} autour des hypothèses de base. Sur la plage testée, l'effet moyen d'un point de pourcentage est de ${impactText}.</p>
      <p style="margin:0 0 7px;">${cleanName(mostSensitive?.nameFr ?? "—")} est le paramètre le plus sensible : la valeur actuelle nette évolue de ${fDA(Math.min(mostSensitive?.npvAtMinRange ?? 0, mostSensitive?.npvAtMaxRange ?? 0))} à ${fDA(Math.max(mostSensitive?.npvAtMinRange ?? 0, mostSensitive?.npvAtMaxRange ?? 0))}, soit ${fDA(mostSensitive?.impact ?? 0)} d'écart. Une variation adverse réaliste de ${f(Math.abs(adversePoint?.pct ?? 0), 0)}% — une ${adverseDirection} — donnerait ${fDA(adversePoint?.npv ?? baseNPV)}, contre ${fDA(baseNPV)} au scénario de base. ${thresholdText}</p>
      <p style="margin:0;">${cleanName(leastSensitive?.nameFr ?? "—")} reste le paramètre le moins sensible, avec ${fDA(leastSensitive?.impact ?? 0)} d'écart sur la plage complète. Le risque pratique est donc de concentrer le suivi sur ${cleanName(mostSensitive?.nameFr ?? "—")} : fixez un indicateur d'alerte et vérifiez cette hypothèse avant chaque décaissement important.</p>
    </div>`;

  return pageShell(content, 3, totalPages, "مخطط الإعصار والسيناريوهات · Tornade & Scénarios");
}

// ── Page 4 — Digital Stamp ────────────────────────────────────────────────────
function buildStampPage(reportId: string, generatedAt: string, totalPages: number) {
  const content = `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;text-align:center;">
      <div style="width:80px;height:80px;background:${C.primary};border-radius:50%;display:flex;align-items:center;justify-content:center;">
        <div style="width:50px;height:50px;background:${C.white};border-radius:50%;display:flex;align-items:center;justify-content:center;">
          <div style="width:28px;height:28px;background:${C.primary};border-radius:50%;"></div>
        </div>
      </div>
      <div>
        <div style="font-size:22px;font-weight:800;color:${C.primary};">تقرير حساسية معتمد · Rapport Certifié</div>
        <div style="font-size:13px;color:${C.muted};margin-top:4px;">نظام OptimDZ لتحليل الحساسية الاستثمارية</div>
      </div>
      <div style="border:2px dashed ${C.border};border-radius:12px;padding:20px 40px;display:inline-block;">
        <div style="font-size:11px;color:${C.muted};margin-bottom:6px;">رقم تقرير الحساسية · Numéro du rapport</div>
        <div style="font-size:18px;font-family:monospace;font-weight:700;color:${C.primary};letter-spacing:2px;">${reportId}</div>
        <div style="font-size:10px;color:${C.muted};margin-top:6px;">${generatedAt}</div>
      </div>
      <div style="font-size:11px;color:${C.muted};max-width:440px;line-height:1.7;">
        هذا التقرير صادر تلقائياً من نظام OptimDZ لتحليل الحساسية والسيناريوهات الاستثمارية.
        النتائج مبنية على البيانات المُدخلة وتُعدّ أداة دعم قرار — وليست ضماناً للمردودية الفعلية.
        <br/><br/>
        Ce rapport a été généré automatiquement par le système OptimDZ d'Analyse de Sensibilité.
        Les résultats sont basés sur les données saisies et constituent une aide à la décision.
      </div>
    </div>`;
  return pageShell(content, totalPages, totalPages, "الختم الرقمي · Cachet Numérique");
}

// ── Render helper ─────────────────────────────────────────────────────────────
async function addHtmlPage(pdf: jsPDF, html: string, pageWidth: number) {
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:-9999px;top:-9999px;z-index:-1;";
  container.innerHTML = html;
  document.body.appendChild(container);
  try {
    const canvas = await html2canvas(container.firstElementChild as HTMLElement,
      { scale: 2, useCORS: true, logging: false });
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const pageHeight = (canvas.height / canvas.width) * pageWidth;
    pdf.addPage([pageWidth, pageHeight]);
    pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, pageHeight);
  } finally {
    document.body.removeChild(container);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export interface SensitivityAnalysisPDFOptions {
  result: SensitivityAnalysisResult;
  projectName?: string;
  sector?: string;
  managerName?: string;
  institutionName?: string;
}

export async function generateSensitivityAnalysisPDFReport(opts: SensitivityAnalysisPDFOptions): Promise<void> {
  const { result, projectName = "", sector, managerName = "", institutionName = "" } = opts;
  const reportId    = genId();
  const generatedAt = new Date().toLocaleDateString("fr-DZ", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const PAGE_W     = 210;
  const totalPages = 4;

  const coverHtml    = buildCover(result, projectName, sector, managerName, institutionName, reportId, generatedAt, totalPages);
  const tableHtml    = buildSensitivityTablePage(result, totalPages);
  const tornadoHtml  = buildTornadoAndScenariosPage(result, totalPages);
  const stampHtml    = buildStampPage(reportId, generatedAt, totalPages);

  // Render cover
  const coverContainer = document.createElement("div");
  coverContainer.style.cssText = "position:fixed;left:-9999px;top:-9999px;z-index:-1;";
  coverContainer.innerHTML = coverHtml;
  document.body.appendChild(coverContainer);
  const coverCanvas  = await html2canvas(coverContainer.firstElementChild as HTMLElement,
    { scale: 2, useCORS: true, logging: false });
  const coverImgData = coverCanvas.toDataURL("image/jpeg", 0.92);
  const coverPageH   = (coverCanvas.height / coverCanvas.width) * PAGE_W;
  document.body.removeChild(coverContainer);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [PAGE_W, coverPageH] });
  pdf.addImage(coverImgData, "JPEG", 0, 0, PAGE_W, coverPageH);

  await addHtmlPage(pdf, tableHtml,   PAGE_W);
  await addHtmlPage(pdf, tornadoHtml, PAGE_W);
  await addHtmlPage(pdf, stampHtml,   PAGE_W);

  const safeName = (projectName || "sensibilite").replace(/\s+/g, "_");
  pdf.save(`OptimDZ_SA_${safeName}_${Date.now()}.pdf`);
}
