import { useState, useRef } from "react";
import { useLanguage } from "@/lib/LanguageContext";
import {
  computeInvestmentAppraisal, fmtDA, fmtN, fmtPct, fmtYears,
} from "@/lib/investmentAppraisalAlgorithm";
import type { InvestmentAppraisalInput, InvestmentAppraisalResult } from "@/lib/investmentAppraisalAlgorithm";
import { InvestmentAppraisalReport } from "./InvestmentAppraisalReport";
import { SimilarPastDecisions } from "@/components/SimilarPastDecisions";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  BarChart2, Calculator, ShoppingBag, Factory, Leaf, Monitor, PencilRuler,
  AlertTriangle, RefreshCw, ChevronDown, TrendingUp, TrendingDown, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types & Templates ──────────────────────────────────────────────────────────
type SectorKey = "trade" | "industry" | "agriculture" | "services" | "custom";

interface TemplateInput {
  initialInvestment: number;
  discountRate: number;
  duration: number;
  cashFlows: number[];
  salvageValue?: number;
}
interface SectorTemplate {
  id: SectorKey;
  icon: React.ElementType;
  nameFr: string; nameAr: string;
  descFr: string; descAr: string;
  projectNameFr: string; projectNameAr: string;
  input: TemplateInput | null;
}

// Examples are all framed as upfront equipment / branch / asset investments
const TEMPLATES: SectorTemplate[] = [
  {
    id: "trade", icon: ShoppingBag,
    nameFr: "Commerce",        nameAr: "التجارة",
    descFr: "Aménagement d'une succursale supermarché, Oran",
    descAr: "تجهيز فرع سوبرماركت جديد — وهران",
    projectNameFr: "Succursale Supermarché — Oran",
    projectNameAr: "فرع السوبرماركت — وهران",
    input: { initialInvestment: 2_500_000, discountRate: 12, duration: 5,
             cashFlows: [450_000, 580_000, 720_000, 850_000, 900_000], salvageValue: 300_000 },
  },
  {
    id: "industry", icon: Factory,
    nameFr: "Industrie",       nameAr: "الصناعة",
    descFr: "Acquisition d'une machine CNC pour atelier, Batna",
    descAr: "اقتناء آلة CNC لورشة المعادن — باتنة",
    projectNameFr: "Machine CNC — Atelier Batna",
    projectNameAr: "آلة CNC — ورشة باتنة",
    input: { initialInvestment: 8_000_000, discountRate: 14, duration: 7,
             cashFlows: [1_400_000, 1_700_000, 2_000_000, 2_200_000, 2_300_000, 2_100_000, 1_800_000],
             salvageValue: 1_000_000 },
  },
  {
    id: "agriculture", icon: Leaf,
    nameFr: "Agriculture",     nameAr: "الفلاحة",
    descFr: "Tracteur + système d'irrigation goutte-à-goutte, Biskra",
    descAr: "جرار + نظام ري بالتنقيط — بسكرة",
    projectNameFr: "Tracteur & Irrigation — Biskra",
    projectNameAr: "الجرار ونظام الري — بسكرة",
    input: { initialInvestment: 3_500_000, discountRate: 10, duration: 6,
             cashFlows: [500_000, 650_000, 800_000, 900_000, 950_000, 900_000],
             salvageValue: 700_000 },
  },
  {
    id: "services", icon: Monitor,
    nameFr: "Services",        nameAr: "الخدمات",
    descFr: "Ouverture d'un cabinet dentaire privé, Tlemcen",
    descAr: "افتتاح عيادة أسنان خاصة — تلمسان",
    projectNameFr: "Cabinet Dentaire Privé — Tlemcen",
    projectNameAr: "عيادة الأسنان الخاصة — تلمسان",
    input: { initialInvestment: 5_000_000, discountRate: 15, duration: 6,
             cashFlows: [900_000, 1_150_000, 1_400_000, 1_550_000, 1_600_000, 1_550_000],
             salvageValue: 700_000 },
  },
  {
    id: "custom", icon: PencilRuler,
    nameFr: "Personnalisé",    nameAr: "مخصص",
    descFr: "Saisie libre — entrez les données de votre investissement",
    descAr: "إدخال حر — أدخل بيانات استثمارك الخاص",
    projectNameFr: "Mon investissement", projectNameAr: "استثماري",
    input: null,
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function parseNum(v: string): number | undefined {
  const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
  return isFinite(n) ? n : undefined;
}
function parsePosNum(v: string): number | undefined {
  const n = parseNum(v);
  return n !== undefined && n >= 0 ? n : undefined;
}

// ── Cumulative DCF Chart (SVG) ─────────────────────────────────────────────────
function CDCFChart({ result }: { result: InvestmentAppraisalResult }) {
  const { yearRows, input: { initialInvestment: I0 }, npv, discountedPayback, simplePayback } = result;
  const n = yearRows.length;

  const W = 700, H = 340;
  const PL = 90, PR = 24, PT = 28, PB = 56;
  const CW = W - PL - PR;
  const CH = H - PT - PB;

  const allVals = [-I0, ...yearRows.map((r) => r.cumulativeDCF)];
  const dataMin = Math.min(...allVals);
  const dataMax = Math.max(...allVals, 0);
  const span = dataMax - dataMin || 1;
  const minY = dataMin - span * 0.08;
  const maxY = dataMax + span * 0.08;
  const yRange = maxY - minY || 1;

  const xS = (yr: number) => PL + (yr / n) * CW;
  const yS = (val: number) => PT + CH - ((val - minY) / yRange) * CH;

  // All line points: year 0 → year n
  const pts = [{ x: 0, y: -I0 }, ...yearRows.map((r) => ({ x: r.year, y: r.cumulativeDCF }))];
  const polyline = pts.map((p) => `${xS(p.x).toFixed(1)},${yS(p.y).toFixed(1)}`).join(" ");

  const zeroY = yS(0);

  // Discounted payback crossing on chart
  const dpbCrossX = discountedPayback !== null && discountedPayback <= n ? xS(discountedPayback) : null;

  // Simple payback vertical (orange dashed)
  const spbCrossX = simplePayback !== null && simplePayback <= n ? xS(simplePayback) : null;

  // Y ticks
  const tickCount = 6;
  const yTicks: number[] = [];
  for (let i = 0; i <= tickCount; i++) yTicks.push(minY + (yRange * i) / tickCount);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto"
      aria-label="Graphique flux de trésorerie actualisés cumulés">
      {/* Grid */}
      {yTicks.map((v, i) => (
        <line key={`yg${i}`} x1={PL} y1={yS(v).toFixed(1)} x2={W - PR} y2={yS(v).toFixed(1)}
          stroke="#e5e7eb" strokeWidth="1" />
      ))}
      {yearRows.map((row) => (
        <line key={`xg${row.year}`} x1={xS(row.year).toFixed(1)} y1={PT}
          x2={xS(row.year).toFixed(1)} y2={PT + CH} stroke="#e5e7eb" strokeWidth="1" />
      ))}

      {/* Zero reference line */}
      <line x1={PL} y1={zeroY.toFixed(1)} x2={W - PR} y2={zeroY.toFixed(1)}
        stroke="#dc2626" strokeWidth="1.5" strokeDasharray="6,4" />
      <text x={PL + 4} y={zeroY - 5} fontSize="9" fill="#dc2626" fontWeight="600">0</text>

      {/* Area fills: below zero (red) and above zero (green) */}
      {/* Below-zero fill */}
      {(() => {
        const belowPts = pts
          .map((p) => `${xS(p.x).toFixed(1)},${Math.min(yS(p.y), zeroY).toFixed(1)}`);
        const closePath = [
          `${xS(pts[pts.length - 1].x).toFixed(1)},${zeroY.toFixed(1)}`,
          `${xS(0).toFixed(1)},${zeroY.toFixed(1)}`,
        ];
        return (
          <polygon points={[...belowPts, ...closePath].join(" ")}
            fill="#ef444415" />
        );
      })()}
      {/* Above-zero fill */}
      {npv > 0 && (() => {
        const abovePts = pts
          .map((p) => `${xS(p.x).toFixed(1)},${Math.max(yS(p.y), zeroY).toFixed(1)}`);
        const closePath = [
          `${xS(pts[pts.length - 1].x).toFixed(1)},${zeroY.toFixed(1)}`,
          `${xS(0).toFixed(1)},${zeroY.toFixed(1)}`,
        ];
        return (
          <polygon points={[...abovePts, ...closePath].join(" ")}
            fill="#22c55e15" />
        );
      })()}

      {/* Simple payback vertical */}
      {spbCrossX !== null && (
        <>
          <line x1={spbCrossX.toFixed(1)} y1={PT} x2={spbCrossX.toFixed(1)} y2={PT + CH}
            stroke="#f97316" strokeWidth="1.5" strokeDasharray="6,4" />
          <text x={spbCrossX + 4} y={PT + 14} fontSize="9" fill="#f97316" fontWeight="600">
            Récup. simple: {fmtYears(simplePayback)}
          </text>
        </>
      )}

      {/* Discounted payback crossing dot */}
      {dpbCrossX !== null && (
        <>
          <line x1={dpbCrossX.toFixed(1)} y1={PT} x2={dpbCrossX.toFixed(1)} y2={PT + CH}
            stroke="#dc2626" strokeWidth="1.5" strokeDasharray="5,3" />
          <circle cx={dpbCrossX.toFixed(1)} cy={zeroY.toFixed(1)} r="6"
            fill="#dc2626" stroke="#fff" strokeWidth="2" />
          {dpbCrossX < W - PR - 160 ? (
            <g>
              <rect x={dpbCrossX + 10} y={zeroY - 22} width="150" height="30" rx="4"
                fill="#dc2626" opacity="0.92" />
              <text x={dpbCrossX + 84} y={zeroY - 10} fontSize="9.5" fill="#fff"
                textAnchor="middle" fontWeight="700">
                Récup. act.: {fmtYears(discountedPayback)}
              </text>
              <text x={dpbCrossX + 84} y={zeroY + 2} fontSize="9" fill="rgba(255,255,255,0.85)"
                textAnchor="middle">cumul act. = 0</text>
            </g>
          ) : (
            <g>
              <rect x={dpbCrossX - 162} y={zeroY - 22} width="150" height="30" rx="4"
                fill="#dc2626" opacity="0.92" />
              <text x={dpbCrossX - 88} y={zeroY - 10} fontSize="9.5" fill="#fff"
                textAnchor="middle" fontWeight="700">
                Récup. act.: {fmtYears(discountedPayback)}
              </text>
              <text x={dpbCrossX - 88} y={zeroY + 2} fontSize="9" fill="rgba(255,255,255,0.85)"
                textAnchor="middle">cumul act. = 0</text>
            </g>
          )}
        </>
      )}

      {/* DCF cumulative line */}
      <polyline points={polyline} fill="none" stroke="#004d40" strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />

      {/* Year dots */}
      {pts.map((p) => (
        <circle key={`dot${p.x}`} cx={xS(p.x).toFixed(1)} cy={yS(p.y).toFixed(1)} r="4"
          fill={p.y >= 0 ? "#22c55e" : "#ef4444"} stroke="#fff" strokeWidth="1.5" />
      ))}

      {/* Axes */}
      <line x1={PL} y1={PT} x2={PL} y2={PT + CH} stroke="#374151" strokeWidth="2" />
      <line x1={PL} y1={PT + CH} x2={W - PR} y2={PT + CH} stroke="#374151" strokeWidth="2" />

      {/* Y-axis ticks + labels */}
      {yTicks.map((v, i) => (
        <g key={`yt${i}`}>
          <line x1={PL - 4} y1={yS(v).toFixed(1)} x2={PL} y2={yS(v).toFixed(1)}
            stroke="#374151" strokeWidth="1.5" />
          <text x={PL - 7} y={parseFloat(yS(v).toFixed(1)) + 4} fontSize="9" fill="#6b7280" textAnchor="end">
            {Math.abs(v) >= 1_000_000
              ? `${(v / 1_000_000).toFixed(1)}M`
              : Math.abs(v) >= 1_000
              ? `${(v / 1_000).toFixed(0)}k`
              : v.toFixed(0)}
          </text>
        </g>
      ))}

      {/* X-axis ticks + labels */}
      {pts.map((p) => (
        <g key={`xt${p.x}`}>
          <line x1={xS(p.x).toFixed(1)} y1={PT + CH} x2={xS(p.x).toFixed(1)} y2={PT + CH + 5}
            stroke="#374151" strokeWidth="1.5" />
          <text x={xS(p.x).toFixed(1)} y={PT + CH + 18} fontSize="10" fill="#6b7280" textAnchor="middle">
            {p.x === 0 ? "An 0" : `An ${p.x}`}
          </text>
        </g>
      ))}

      {/* Axis labels */}
      <text x={W / 2} y={H - 4} fontSize="11" fill="#374151" textAnchor="middle" fontWeight="600">
        Années
      </text>
      <text x={12} y={PT + CH / 2} fontSize="11" fill="#374151" textAnchor="middle" fontWeight="600"
        transform={`rotate(-90, 12, ${PT + CH / 2})`}>
        Flux cumulé actualisé (DA)
      </text>

      {/* Legend */}
      <g transform={`translate(${PL + 12}, ${PT + 8})`}>
        <rect width="140" height="58" rx="4" fill="white" fillOpacity="0.88" stroke="#e5e7eb" strokeWidth="1" />
        <line x1="8" y1="14" x2="24" y2="14" stroke="#004d40" strokeWidth="2.5" />
        <circle cx="16" cy="14" r="3.5" fill="#22c55e" stroke="#fff" strokeWidth="1" />
        <text x="28" y="18" fontSize="9.5" fill="#374151">FTA cumulé actualisé</text>
        <line x1="8" y1="30" x2="24" y2="30" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="5,3" />
        <circle cx="16" cy="30" r="5" fill="#dc2626" stroke="#fff" strokeWidth="1.5" />
        <text x="28" y="34" fontSize="9.5" fill="#374151">Récupération actualisée</text>
        <line x1="8" y1="46" x2="24" y2="46" stroke="#f97316" strokeWidth="1.5" strokeDasharray="5,3" />
        <text x="28" y="50" fontSize="9.5" fill="#374151">Récupération simple</text>
      </g>

      {/* Zone labels */}
      {zeroY < PT + CH - 14 && zeroY > PT + 14 && (
        <>
          <text x={PL + CW / 2} y={PT + CH - 10} fontSize="9.5" fill="#ef4444"
            textAnchor="middle" fontWeight="600" opacity="0.7">← Zone de perte (investissement non récupéré)</text>
          {npv > 0 && (
            <text x={PL + CW / 2} y={PT + 18} fontSize="9.5" fill="#22c55e"
              textAnchor="middle" fontWeight="600" opacity="0.7">Zone bénéficiaire →</text>
          )}
        </>
      )}
    </svg>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function InvestmentAppraisal() {
  const { t, language } = useLanguage();
  const isAr = language === "ar";
  const resultsRef = useRef<HTMLDivElement>(null);

  const [selectedSector, setSelectedSector] = useState<SectorKey | null>(null);

  // Form state
  const [projectName,       setProjectName]       = useState("");
  const [initialInvestment, setInitialInvestment] = useState("");
  const [discountRate,      setDiscountRate]       = useState("");
  const [duration,          setDuration]           = useState("");
  const [cashFlowInputs,    setCashFlowInputs]     = useState<string[]>([]);
  const [salvageValue,      setSalvageValue]       = useState("");

  const [result, setResult] = useState<InvestmentAppraisalResult | null>(null);
  const [error,  setError]  = useState<string | null>(null);

  // ── Template application ────────────────────────────────────────────────────
  function applyTemplate(tpl: SectorTemplate) {
    setSelectedSector(tpl.id);
    setError(null);
    setResult(null);
    if (!tpl.input) {
      setProjectName(""); setInitialInvestment(""); setDiscountRate("");
      setDuration(""); setCashFlowInputs([]); setSalvageValue("");
      return;
    }
    const inp = tpl.input;
    setProjectName(isAr ? tpl.projectNameAr : tpl.projectNameFr);
    setInitialInvestment(String(inp.initialInvestment));
    setDiscountRate(String(inp.discountRate));
    setDuration(String(inp.duration));
    setCashFlowInputs(inp.cashFlows.map(String));
    setSalvageValue(inp.salvageValue !== undefined ? String(inp.salvageValue) : "");
  }

  // ── Duration change ─────────────────────────────────────────────────────────
  function handleDurationChange(val: string) {
    setDuration(val);
    const n = parseInt(val, 10);
    if (isFinite(n) && n >= 1 && n <= 30) {
      setCashFlowInputs((prev) => {
        if (prev.length === n) return prev;
        if (prev.length < n) return [...prev, ...Array(n - prev.length).fill("")];
        return prev.slice(0, n);
      });
    }
  }

  // ── Calculation ─────────────────────────────────────────────────────────────
  function handleCalculate() {
    setError(null);
    const I0 = parseNum(initialInvestment);
    const rate = parsePosNum(discountRate);
    const n = parseInt(duration, 10);

    if (I0 === undefined || I0 <= 0) {
      setError(t("L'investissement initial doit être un nombre positif.", "يجب أن يكون الاستثمار الأولي رقماً موجباً."));
      return;
    }
    if (rate === undefined) {
      setError(t("Taux d'actualisation requis (≥ 0).", "معدل الخصم مطلوب (≥ 0)."));
      return;
    }
    if (!isFinite(n) || n < 1 || n > 30) {
      setError(t("Durée du projet : entre 1 et 30 ans.", "مدة المشروع: بين 1 و 30 سنة."));
      return;
    }
    if (cashFlowInputs.length < n) {
      setError(t("Renseignez tous les flux de trésorerie annuels.", "أدخل جميع التدفقات النقدية السنوية."));
      return;
    }
    const cashFlows: number[] = [];
    for (let i = 0; i < n; i++) {
      const cf = parseNum(cashFlowInputs[i]);
      if (cf === undefined) {
        setError(t(`Flux de l'année ${i + 1} invalide.`, `التدفق النقدي للسنة ${i + 1} غير صالح.`));
        return;
      }
      cashFlows.push(cf);
    }

    const input: InvestmentAppraisalInput = {
      projectName: projectName || undefined,
      initialInvestment: I0,
      discountRate: rate,
      duration: n,
      cashFlows,
      salvageValue: parsePosNum(salvageValue),
    };

    try {
      const r = computeInvestmentAppraisal(input);
      setResult(r);
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } catch (e) {
      setError(String(e));
    }
  }

  function handleReset() {
    setSelectedSector(null); setResult(null); setError(null);
    setProjectName(""); setInitialInvestment(""); setDiscountRate("");
    setDuration(""); setCashFlowInputs([]); setSalvageValue("");
  }

  // ── NPV colour helper ───────────────────────────────────────────────────────
  const npvColor = (npv: number) =>
    npv > 0 ? "bg-green-600 text-white" : npv < 0 ? "bg-red-600 text-white" : "bg-amber-500 text-white";
  const irrColor = (irr: number | null, rate: number) =>
    irr === null ? "bg-muted text-foreground border border-border"
    : irr >= rate ? "bg-green-600 text-white"
    : "bg-amber-500 text-white";

  const n = parseInt(duration, 10);

  return (
    <div className={cn("container mx-auto px-4 py-8 max-w-5xl space-y-8", isAr ? "rtl" : "ltr")}
      dir={isAr ? "rtl" : "ltr"}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-primary" />
            {t("Évaluation de la Rentabilité de l'Investissement", "تقييم الجدوى الاستثمارية")}
          </h1>
          <Badge className="bg-primary/10 text-primary border-primary/30 font-semibold text-xs">
            {t("VAN / TRI / Délai de Récupération", "NPV / IRR / فترة الاسترداد")}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm max-w-2xl">
          {t(
            "Calculez la Valeur Actuelle Nette, le TRI, les délais de récupération simple et actualisé, et l'Indice de Rentabilité pour évaluer la viabilité financière d'un investissement nouveau avant de vous engager.",
            "احسب صافي القيمة الحالية (NPV)، معدل العائد الداخلي (IRR)، فترتَي الاسترداد البسيطة والمخصومة، ومؤشر الربحية (PI) لتقييم الجدوى المالية لاستثمار جديد."
          )}
        </p>
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground/70 italic">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{t(
            "Les résultats sont des indicateurs d'aide à la décision basés sur les données saisies — pas une garantie de rendement réel.",
            "النتائج هي مؤشرات دعم قرار مبنية على البيانات المُدخلة — وليست ضماناً للعائد الفعلي."
          )}</span>
        </div>
      </div>

      {/* ── Sector Selection ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("Type d'investissement", "نوع الاستثمار")}</CardTitle>
          <CardDescription>
            {t(
              "Choisissez un exemple d'investissement algérien pour pré-remplir des données réalistes.",
              "اختر نموذج استثمار جزائري لملء بيانات واقعية، أو أدخل بياناتك الخاصة."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {TEMPLATES.map((tpl) => {
              const Icon = tpl.icon;
              const isSelected = selectedSector === tpl.id;
              const isCustom = tpl.id === "custom";
              return (
                <button key={tpl.id} onClick={() => applyTemplate(tpl)}
                  className={cn(
                    "group relative rounded-xl border-2 p-4 text-left transition-all duration-200 hover:shadow-md",
                    isSelected ? "border-primary bg-primary/5 shadow-md"
                               : "border-border hover:border-primary/50",
                    isCustom && !isSelected && "border-dashed"
                  )}>
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center mb-2.5 transition-colors",
                    isSelected ? "bg-primary text-primary-foreground"
                               : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                  )}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <p className={cn("font-semibold text-sm", isSelected ? "text-primary" : "text-foreground")}>
                    {isAr ? tpl.nameAr : tpl.nameFr}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                    {isAr ? tpl.descAr : tpl.descFr}
                  </p>
                  {isSelected && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Input Form ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            {t("Paramètres de l'investissement", "معايير الاستثمار")}
          </CardTitle>
          <CardDescription>
            {t(
              "Renseignez les données financières de votre investissement. Les champs marqués * sont obligatoires.",
              "أدخل البيانات المالية لاستثمارك. الحقول المُعلَّمة بـ * إلزامية."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Project name */}
          <div className="space-y-1.5">
            <Label>{t("Nom du projet / investissement", "اسم المشروع / الاستثمار")}</Label>
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)}
              placeholder={t("Ex: Machine CNC — Atelier Batna", "مثال: آلة CNC — ورشة باتنة")} />
          </div>

          {/* Core investment parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>{t("Investissement initial (DA) *", "الاستثمار الأولي (DA) *")}</Label>
              <Input type="number" min="0" step="any"
                value={initialInvestment} onChange={(e) => setInitialInvestment(e.target.value)}
                placeholder="ex: 8000000" />
              <p className="text-xs text-muted-foreground">
                {t("Coût total à l'année 0 (achat, installation, aménagement…)", "التكلفة الكاملة عند السنة 0 (شراء، تركيب، تهيئة…)")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("Taux d'actualisation requis (%) *", "معدل الخصم المطلوب (%) *")}</Label>
              <Input type="number" min="0" max="200" step="0.1"
                value={discountRate} onChange={(e) => setDiscountRate(e.target.value)}
                placeholder="ex: 14" />
              <p className="text-xs text-muted-foreground">
                {t("Coût du capital ou taux de rendement minimum requis", "تكلفة رأس المال أو الحد الأدنى للعائد المقبول")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("Durée du projet (années) *", "مدة المشروع (سنوات) *")}</Label>
              <Input type="number" min="1" max="30" step="1"
                value={duration} onChange={(e) => handleDurationChange(e.target.value)}
                placeholder="ex: 7" />
              <p className="text-xs text-muted-foreground">
                {t("Nombre d'années de vie économique de l'investissement (1–30)", "عدد سنوات العمر الاقتصادي للاستثمار (1–30)")}
              </p>
            </div>
          </div>

          {/* Dynamic cash flow inputs */}
          {isFinite(n) && n >= 1 && cashFlowInputs.length === n && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t(`Flux de trésorerie annuels (DA) — ${n} année${n > 1 ? "s" : ""} *`,
                     `التدفقات النقدية السنوية (DA) — ${n} ${n === 1 ? "سنة" : "سنوات"} *`)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t(
                    "Recettes nettes attendues chaque année (après charges d'exploitation, avant amortissements). Les valeurs négatives sont permises (année déficitaire).",
                    "صافي الإيرادات المتوقعة كل سنة (بعد مصاريف التشغيل، قبل الاستهلاكات). القيم السالبة مقبولة (سنة عجز)."
                  )}
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {cashFlowInputs.map((val, i) => (
                  <div key={i} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t(`Année ${i + 1}`, `السنة ${i + 1}`)}
                    </Label>
                    <Input
                      type="number" step="any"
                      value={val}
                      onChange={(e) => {
                        const next = [...cashFlowInputs];
                        next[i] = e.target.value;
                        setCashFlowInputs(next);
                      }}
                      placeholder="ex: 1 400 000"
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Optional salvage value */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("Champ optionnel", "حقل اختياري")}
            </p>
            <div className="max-w-xs space-y-1.5">
              <Label className="text-sm">
                {t("Valeur résiduelle / de revente (DA) — optionnel", "القيمة المتبقية / إعادة البيع (DA) — اختياري")}
              </Label>
              <Input type="number" min="0" step="any"
                value={salvageValue} onChange={(e) => setSalvageValue(e.target.value)}
                placeholder={t("Ex: 1 000 000 DA", "مثال: 1 000 000 DA")} />
              <p className="text-xs text-muted-foreground">
                {t(
                  "Valeur de revente ou valeur comptable nette à la fin de la durée du projet.",
                  "قيمة إعادة بيع الأصل أو قيمته الدفترية الصافية في نهاية مدة المشروع."
                )}
              </p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 text-destructive text-sm rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 flex-wrap pt-1">
            <Button onClick={handleCalculate} className="min-w-[200px]">
              <BarChart2 className="w-4 h-4 me-2" />
              {t("Évaluer l'investissement", "تقييم الاستثمار")}
            </Button>
            <Button variant="ghost" onClick={handleReset} className="text-muted-foreground">
              <RefreshCw className="w-4 h-4 me-2" />
              {t("Réinitialiser", "إعادة تعيين")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {result && (
        <div ref={resultsRef} className="space-y-6">

          <div className="flex items-center gap-2 text-primary text-sm font-medium animate-bounce w-fit">
            <ChevronDown className="w-4 h-4" />
            {t("Résultats de l'évaluation ci-dessous", "نتائج التقييم أدناه")}
          </div>

          {/* ── KPI Cards ───────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              {
                label: t("Valeur Actuelle Nette (VAN)", "صافي القيمة الحالية (NPV)"),
                value: fmtDA(result.npv),
                sub: result.npv > 0 ? t("✅ Projet rentable", "✅ المشروع مربح")
                   : result.npv < 0 ? t("🔴 Valeur détruite", "🔴 قيمة مدمَّرة")
                   : t("⚠️ Seuil exact", "⚠️ عند نقطة التعادل"),
                color: npvColor(result.npv),
                icon: result.npv >= 0 ? "📈" : "📉",
              },
              {
                label: t(`TRI (vs ${fmtN(result.input.discountRate, 1)} % requis)`,
                         `IRR (مقابل ${fmtN(result.input.discountRate, 1)}% مطلوب)`),
                value: result.irr !== null ? `${fmtN(result.irr, 2)} %` : "—",
                sub: result.irr !== null
                  ? (result.irr >= result.input.discountRate
                    ? t("✅ Au-dessus du taux requis", "✅ فوق المعدل المطلوب")
                    : t("⚠️ En dessous du taux requis", "⚠️ دون المعدل المطلوب"))
                  : t("Non calculable", "لا يمكن حسابه"),
                color: irrColor(result.irr, result.input.discountRate),
                icon: "📊",
              },
              {
                label: t("Délai de récupération simple", "فترة الاسترداد البسيطة"),
                value: result.simplePayback !== null ? fmtYears(result.simplePayback, isAr ? "ar" : "fr") : t("Non récupéré", "غير مُسترَد"),
                sub: result.simplePayback !== null && result.simplePayback < result.input.duration
                  ? t("✅ Dans la durée du projet", "✅ ضمن مدة المشروع")
                  : t("⚠️ Hors durée du projet", "⚠️ خارج مدة المشروع"),
                color: result.simplePayback !== null && result.simplePayback < result.input.duration
                  ? "bg-green-600 text-white" : "bg-amber-500 text-white",
                icon: "⏱️",
              },
              {
                label: t("Délai de récupération actualisé", "فترة الاسترداد المخصومة"),
                value: result.discountedPayback !== null ? fmtYears(result.discountedPayback, isAr ? "ar" : "fr") : t("Non récupéré", "غير مُسترَد"),
                sub: result.discountedPayback !== null && result.discountedPayback < result.input.duration
                  ? t("✅ Dans la durée du projet", "✅ ضمن مدة المشروع")
                  : t("⚠️ Hors durée du projet", "⚠️ خارج مدة المشروع"),
                color: result.discountedPayback !== null && result.discountedPayback < result.input.duration
                  ? "bg-primary text-primary-foreground" : "bg-amber-500 text-white",
                icon: "📅",
              },
              {
                label: t("Indice de Rentabilité (IP)", "مؤشر الربحية (PI)"),
                value: `${fmtN(result.profitabilityIndex, 3)}`,
                sub: result.profitabilityIndex >= 1
                  ? t("✅ > 1 → Valeur créée", "✅ > 1 → قيمة مضافة")
                  : t("🔴 < 1 → Valeur détruite", "🔴 < 1 → قيمة مدمَّرة"),
                color: result.profitabilityIndex >= 1 ? "bg-secondary text-secondary-foreground" : "bg-red-600 text-white",
                icon: "🏆",
              },
            ].map((kpi) => (
              <div key={kpi.label} className={cn("rounded-xl p-4 space-y-1", kpi.color)}>
                <div className="flex items-center gap-1.5">
                  <span className="text-base">{kpi.icon}</span>
                  <p className="text-xs opacity-80 font-medium leading-tight">{kpi.label}</p>
                </div>
                <p className="text-xl font-extrabold leading-tight">{kpi.value}</p>
                <p className="text-xs opacity-75 leading-tight">{kpi.sub}</p>
              </div>
            ))}
          </div>

          {/* ── Year-by-year table ──────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t("Tableau des flux actualisés par année", "جدول التدفقات المخصومة سنة بسنة")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-[640px]">
                  <thead>
                    <tr className="bg-primary text-primary-foreground text-xs">
                      {[
                        t("Année", "السنة"),
                        t("Flux (DA)", "التدفق (DA)"),
                        t("Facteur d'act.", "معامل الخصم"),
                        t("Valeur actuelle (DA)", "القيمة الحالية (DA)"),
                        t("Cumul CF simple (DA)", "التراكم البسيط (DA)"),
                        t("Cumul actualisé (DA)", "التراكم المخصوم (DA)"),
                      ].map((h) => (
                        <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>
                      ))}
                    </tr>
                    {/* Year 0 */}
                    <tr className="bg-muted/50 font-semibold text-sm border-b border-border">
                      <td className="px-3 py-2">{t("An 0", "السنة 0")}</td>
                      <td className="px-3 py-2 font-mono text-destructive">
                        −{fmtDA(result.input.initialInvestment)}
                      </td>
                      <td className="px-3 py-2 font-mono">1.0000</td>
                      <td className="px-3 py-2 font-mono text-destructive">
                        −{fmtDA(result.input.initialInvestment)}
                      </td>
                      <td className="px-3 py-2 font-mono text-destructive">
                        −{fmtDA(result.input.initialInvestment)}
                      </td>
                      <td className="px-3 py-2 font-mono text-destructive">
                        −{fmtDA(result.input.initialInvestment)}
                      </td>
                    </tr>
                  </thead>
                  <tbody>
                    {result.yearRows.map((row, idx) => {
                      const isRecoveredSimple = row.cumulativeCF >= 0 && (idx === 0 || result.yearRows[idx - 1].cumulativeCF < 0);
                      const isRecoveredDisc   = row.cumulativeDCF >= 0 && (idx === 0 || result.yearRows[idx - 1].cumulativeDCF < 0);
                      return (
                        <tr key={row.year}
                          className={cn(
                            "border-b border-border text-sm",
                            idx % 2 === 0 ? "bg-background" : "bg-muted/20",
                            row.year === result.yearRows.length ? "font-semibold"  : ""
                          )}>
                          <td className="px-3 py-2">
                            {t(`An ${row.year}`, `السنة ${row.year}`)}
                            {row.year === result.yearRows.length && result.input.salvageValue
                              ? <span className="text-xs text-muted-foreground ms-1">
                                  {t("(+ val.résid.)", "(+ قيمة متبقية)")}
                                </span>
                              : null}
                          </td>
                          <td className="px-3 py-2 font-mono">{fmtDA(row.cashFlow)}</td>
                          <td className="px-3 py-2 font-mono">{fmtN(row.discountFactor, 4)}</td>
                          <td className="px-3 py-2 font-mono">{fmtDA(row.presentValue)}</td>
                          <td className={cn("px-3 py-2 font-mono",
                            row.cumulativeCF >= 0 ? "text-green-700 font-semibold" : "text-destructive")}>
                            {fmtDA(row.cumulativeCF)}
                            {isRecoveredSimple && <span className="ms-1 text-xs">✅</span>}
                          </td>
                          <td className={cn("px-3 py-2 font-mono",
                            row.cumulativeDCF >= 0 ? "text-green-700 font-semibold" : "text-destructive")}>
                            {fmtDA(row.cumulativeDCF)}
                            {isRecoveredDisc && <span className="ms-1 text-xs">✅</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Totals row */}
                    <tr className="bg-primary/5 border-t-2 border-primary/30 font-bold text-sm">
                      <td className="px-3 py-2">{t("Total / VAN", "المجموع / NPV")}</td>
                      <td className="px-3 py-2 font-mono">{fmtDA(result.totalCashFlow)}</td>
                      <td className="px-3 py-2 font-mono">—</td>
                      <td className="px-3 py-2 font-mono">{fmtDA(result.totalPV)}</td>
                      <td className="px-3 py-2 font-mono">—</td>
                      <td className={cn("px-3 py-2 font-mono text-base",
                        result.npv >= 0 ? "text-green-700" : "text-destructive")}>
                        {fmtDA(result.npv)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t(
                  `✅ = moment du récupération. Taux d'actualisation : ${fmtPct(result.input.discountRate, 1)}`,
                  `✅ = لحظة الاسترداد. معدل الخصم : ${fmtPct(result.input.discountRate, 1)}`
                )}
              </p>
            </CardContent>
          </Card>

          {/* ── Cumulative DCF Chart ─────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {result.npv >= 0
                  ? <TrendingUp className="w-4 h-4 text-green-600" />
                  : <TrendingDown className="w-4 h-4 text-destructive" />}
                {t("Flux de Trésorerie Actualisés Cumulés", "التدفقات النقدية المخصومة التراكمية")}
              </CardTitle>
              <CardDescription>
                {t(
                  "La courbe part de −I₀ (investissement initial) et évolue vers la VAN. Le croisement de la ligne zéro (rouge) indique le délai de récupération actualisé.",
                  "تبدأ المنحنى من −I₀ (الاستثمار الأولي) وتتجه نحو NPV. تقاطع الخط الصفري (أحمر) يمثل فترة الاسترداد المخصومة."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="rounded-lg overflow-hidden border border-border bg-white p-2">
                <CDCFChart result={result} />
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-6 h-0.5 bg-primary inline-block rounded" />
                  {t("FTA actualisés cumulés", "تدفقات مخصومة تراكمية")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-6 h-0.5 bg-red-500 inline-block rounded" style={{backgroundImage:"repeating-linear-gradient(90deg,#ef4444 0,#ef4444 6px,transparent 6px,transparent 10px)"}} />
                  {t("Délai récup. actualisé (croisement zéro)", "فترة الاسترداد المخصومة (تقاطع الصفر)")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-6 h-0.5 bg-orange-500 inline-block rounded" style={{backgroundImage:"repeating-linear-gradient(90deg,#f97316 0,#f97316 6px,transparent 6px,transparent 10px)"}} />
                  {t("Délai récup. simple", "فترة الاسترداد البسيطة")}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* ── Analysis + Suggestions + Report ─────────────────────────────── */}
          <InvestmentAppraisalReport
            result={result}
            projectName={projectName}
            sector={selectedSector}
          />

          <SimilarPastDecisions
            resultKey={`${result.input.initialInvestment}-${result.input.discountRate}-${result.input.duration}-${result.npv}`}
          />
        </div>
      )}
    </div>
  );
}
