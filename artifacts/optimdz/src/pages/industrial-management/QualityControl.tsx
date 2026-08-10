import { useState, useRef, useCallback } from "react";
import { Link } from "wouter";
import { useLanguage } from "@/lib/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ShieldCheck, Plus, Trash2, Calculator, Save, FileText,
  CheckCircle2, Loader2, AlertTriangle, ArrowLeft,
  Factory, Monitor, PencilRuler,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeQualityControl, validateInputs, generateQualityAnalysis, generateQualityRecommendations,
  type ChartType, type QualityInputs, type QualityResults,
  type XbarSampleInput, type PSampleInput,
  type XbarResults, type PResults,
} from "@/lib/qualityControlAlgorithm";
import { generateQualityControlPDF } from "@/lib/generateQualityControlPDF";

// ── ID helper ─────────────────────────────────────────────────────────────────
let _uid = 0;
function uid() { return `q${++_uid}`; }

// ── Draft types ───────────────────────────────────────────────────────────────
interface XbarDraft extends XbarSampleInput { measurements: string[]; }
interface PDraft    extends PSampleInput    { n: string; d: string; }

function makeXbarSample(index: number): XbarDraft {
  return { id: uid(), label: `Éch. ${index + 1}`, measurements: ["", "", "", ""] };
}
function makePSample(index: number): PDraft {
  return { id: uid(), label: `Éch. ${index + 1}`, n: "", d: "" };
}

// ── Sector templates ──────────────────────────────────────────────────────────
type SectorKey = "industrie" | "services" | "custom";
interface Sector { id: SectorKey; icon: React.ElementType; nameAr: string; nameFr: string; }
const SECTORS: Sector[] = [
  { id: "industrie", icon: Factory,     nameAr: "الصناعة",  nameFr: "Industrie" },
  { id: "services",  icon: Monitor,     nameAr: "الخدمات",  nameFr: "Services" },
  { id: "custom",    icon: PencilRuler, nameAr: "مخصص",     nameFr: "Personnalisé" },
];

function buildXbarTemplate(sector: SectorKey): XbarDraft[] {
  if (sector === "industrie") {
    // Diameter measurements (mm) for machined parts — some out-of-control points
    const data = [
      [49.8, 50.1, 50.0, 49.9],
      [50.2, 50.0, 49.8, 50.1],
      [50.0, 50.3, 50.1, 50.2],
      [49.7, 49.8, 50.0, 49.9],
      [50.5, 50.6, 50.4, 50.7], // above UCL
      [50.0, 50.1, 49.9, 50.0],
      [49.6, 49.8, 49.7, 49.5],
      [50.1, 50.0, 50.2, 50.1],
      [49.3, 49.2, 49.1, 49.4], // below LCL
      [50.0, 50.1, 50.0, 50.2],
    ];
    return data.map((m, i) => ({ id: uid(), label: `Éch. ${i + 1}`, measurements: m.map(String) }));
  }
  if (sector === "services") {
    // Service duration (minutes) — some outliers
    const data = [
      [12.1, 11.8, 12.3, 11.9],
      [12.0, 12.2, 11.7, 12.1],
      [11.5, 11.8, 12.0, 11.9],
      [15.2, 15.5, 14.8, 15.1], // above UCL
      [12.1, 12.0, 12.3, 11.8],
      [11.9, 12.2, 12.0, 12.1],
      [12.3, 11.7, 12.1, 12.0],
      [9.1, 9.3, 9.0, 9.2],     // below LCL
      [12.0, 12.1, 11.9, 12.2],
      [12.1, 12.0, 12.3, 11.8],
    ];
    return data.map((m, i) => ({ id: uid(), label: `Éch. ${i + 1}`, measurements: m.map(String) }));
  }
  return Array.from({ length: 5 }, (_, i) => makeXbarSample(i));
}

function buildPTemplate(sector: SectorKey): PDraft[] {
  if (sector === "industrie") {
    const data = [
      [200, 4], [200, 3], [200, 7], [200, 2], [200, 12], // 12 is out of control
      [200, 3], [200, 5], [200, 4], [200, 18], [200, 2],  // 18 is out of control
      [200, 3], [200, 4],
    ];
    return data.map(([n, d], i) => ({ id: uid(), label: `Lot ${i + 1}`, n: String(n), d: String(d) }));
  }
  if (sector === "services") {
    const data = [
      [100, 3], [100, 5], [100, 2], [100, 4], [100, 14], // out of control
      [100, 3], [100, 6], [100, 2], [100, 3], [100, 4],
    ];
    return data.map(([n, d], i) => ({ id: uid(), label: `Éch. ${i + 1}`, n: String(n), d: String(d) }));
  }
  return Array.from({ length: 5 }, (_, i) => makePSample(i));
}

// ── SVG Control Chart ─────────────────────────────────────────────────────────
function ControlChart({ results }: { results: QualityResults }) {
  const isXbar   = results.chartType === "xbar";
  const xr       = results as XbarResults;
  const pr       = results as PResults;

  const samples  = isXbar ? xr.samples : pr.samples;
  const yValues  = isXbar
    ? xr.samples.map(s => s.sampleMean)
    : pr.samples.map(s => s.rate);
  const ucl      = isXbar ? xr.ucl  : pr.uclConstant;
  const lcl      = isXbar ? xr.lcl  : pr.lclConstant;
  const centerY  = isXbar ? xr.grandMean : pr.pBar;

  const W = 760; const H = 240;
  const padL = 58; const padR = 16; const padT = 24; const padB = 48;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const n = yValues.length;

  const allVals = [...yValues, ucl, lcl, centerY].filter(isFinite);
  const minVal  = Math.min(...allVals);
  const maxVal  = Math.max(...allVals);
  const span    = maxVal - minVal || 1;
  const pad     = span * 0.18;
  const yMin    = minVal - pad;
  const yMax    = maxVal + pad;

  function toX(i: number) { return padL + (i / Math.max(n - 1, 1)) * chartW; }
  function toY(v: number)  { return padT + (1 - (v - yMin) / (yMax - yMin)) * chartH; }
  function fmtY(v: number) {
    if (isXbar) return v.toFixed(3);
    return `${(v * 100).toFixed(1)}%`;
  }

  // Y-axis gridlines + labels (5 ticks)
  const ticks = 5;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => yMin + (i / ticks) * (yMax - yMin));

  const linePath = yValues
    .map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
    .join(" ");

  // Max 12 x-axis labels to avoid crowding
  const labelStep = n > 12 ? Math.ceil(n / 12) : 1;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {/* Background */}
      <rect width={W} height={H} fill="#f0faf8" rx={8} />

      {/* Y-axis gridlines */}
      {yTicks.map((v, i) => {
        const yy = toY(v);
        return (
          <g key={i}>
            <line x1={padL} y1={yy} x2={padL + chartW} y2={yy}
              stroke="#c8dad6" strokeWidth={0.8} />
            <text x={padL - 4} y={yy} textAnchor="end" fontSize={9}
              fill="#5f7b77" dominantBaseline="middle">{fmtY(v)}</text>
          </g>
        );
      })}

      {/* UCL line */}
      <line x1={padL} y1={toY(ucl)} x2={padL + chartW} y2={toY(ucl)}
        stroke="#c62828" strokeWidth={2} strokeDasharray="8,4" />
      <text x={padL + chartW + 4} y={toY(ucl)} fontSize={9} fill="#c62828"
        dominantBaseline="middle" fontWeight="700">UCL</text>

      {/* Center line */}
      <line x1={padL} y1={toY(centerY)} x2={padL + chartW} y2={toY(centerY)}
        stroke="#004d40" strokeWidth={2} strokeDasharray="5,3" />
      <text x={padL + chartW + 4} y={toY(centerY)} fontSize={9} fill="#004d40"
        dominantBaseline="middle" fontWeight="700">{isXbar ? "X̿" : "p̄"}</text>

      {/* LCL line */}
      <line x1={padL} y1={toY(lcl)} x2={padL + chartW} y2={toY(lcl)}
        stroke="#1565c0" strokeWidth={2} strokeDasharray="8,4" />
      <text x={padL + chartW + 4} y={toY(lcl)} fontSize={9} fill="#1565c0"
        dominantBaseline="middle" fontWeight="700">LCL</text>

      {/* Data line */}
      <path d={linePath} fill="none" stroke="#0c2621" strokeWidth={2} />

      {/* Data points */}
      {samples.map((s, i) => {
        const cx = toX(i);
        const cy = toY(yValues[i]);
        const oc = s.isOutOfControl;
        return (
          <g key={s.id}>
            {oc && <circle cx={cx} cy={cy} r={10} fill="none" stroke="#c62828" strokeWidth={1.5} opacity={0.4} />}
            <circle cx={cx} cy={cy} r={5}
              fill={oc ? "#c62828" : "#2e7d32"}
              stroke="white" strokeWidth={1.5} />
          </g>
        );
      })}

      {/* X-axis labels */}
      {samples.map((s, i) => {
        if (i % labelStep !== 0 && i !== n - 1) return null;
        return (
          <text key={s.id} x={toX(i)} y={padT + chartH + 16}
            textAnchor="middle" fontSize={9} fill="#5f7b77">
            {s.label.slice(0, 9)}
          </text>
        );
      })}

      {/* Legend */}
      <circle cx={padL} cy={padT + chartH + 34} r={5} fill="#2e7d32" />
      <text x={padL + 10} y={padT + chartH + 35} fontSize={9} fill="#5f7b77" dominantBaseline="middle">
        Sous contrôle
      </text>
      <circle cx={padL + 100} cy={padT + chartH + 34} r={5} fill="#c62828" />
      <text x={padL + 110} y={padT + chartH + 35} fontSize={9} fill="#5f7b77" dominantBaseline="middle">
        Hors contrôle
      </text>
      <line x1={padL + 200} y1={padT + chartH + 34} x2={padL + 220} y2={padT + chartH + 34}
        stroke="#c62828" strokeWidth={2} strokeDasharray="6,3" />
      <text x={padL + 225} y={padT + chartH + 35} fontSize={9} fill="#5f7b77" dominantBaseline="middle">UCL / LCL</text>
      <line x1={padL + 290} y1={padT + chartH + 34} x2={padL + 310} y2={padT + chartH + 34}
        stroke="#004d40" strokeWidth={2} strokeDasharray="4,2" />
      <text x={padL + 315} y={padT + chartH + 35} fontSize={9} fill="#5f7b77" dominantBaseline="middle">
        {isXbar ? "X̿" : "p̄"}
      </text>
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtN3(n: number) { return n.toFixed(3); }
function fmtPct(v: number) { return `${(v * 100).toFixed(2)}%`; }

// ── Main component ────────────────────────────────────────────────────────────
export default function QualityControl() {
  const { t, language } = useLanguage();
  const isAr = language === "ar";

  // ── Form state ────────────────────────────────────────────────────────────
  const [phase, setPhase]           = useState<"form" | "results">("form");
  const [problemName, setProblemName] = useState("");
  const [chartType, setChartType]   = useState<ChartType>("xbar");
  const [sector, setSector]         = useState<SectorKey>("industrie");

  // X-bar state
  const [xbarSamples, setXbarSamples] = useState<XbarDraft[]>(() =>
    Array.from({ length: 5 }, (_, i) => makeXbarSample(i))
  );
  const [targetMean, setTargetMean] = useState("");

  // P chart state
  const [pSamples, setPSamples] = useState<PDraft[]>(() =>
    Array.from({ length: 5 }, (_, i) => makePSample(i))
  );

  // Result state
  const [results, setResults]           = useState<QualityResults | null>(null);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [exporting, setExporting]       = useState(false);
  const [exportProgress, setExportProgress] = useState("");

  const resultRef = useRef<HTMLDivElement>(null);

  // ── Template loader ───────────────────────────────────────────────────────
  function loadTemplate(s: SectorKey) {
    setSector(s);
    setXbarSamples(buildXbarTemplate(s));
    setPSamples(buildPTemplate(s));
  }

  // ── Chart type switch ─────────────────────────────────────────────────────
  function switchChartType(ct: ChartType) {
    setChartType(ct);
    setResults(null);
    setPhase("form");
  }

  // ── X-bar mutations ───────────────────────────────────────────────────────
  const addXbarSample = useCallback(() => {
    setXbarSamples(prev => [...prev, makeXbarSample(prev.length)]);
  }, []);

  const removeXbarSample = useCallback((id: string) => {
    setXbarSamples(prev => prev.filter(s => s.id !== id));
  }, []);

  const updateXbarLabel = useCallback((id: string, val: string) => {
    setXbarSamples(prev => prev.map(s => s.id === id ? { ...s, label: val } : s));
  }, []);

  const updateMeasurement = useCallback((id: string, mi: number, val: string) => {
    setXbarSamples(prev => prev.map(s => s.id === id
      ? { ...s, measurements: s.measurements.map((m, i) => i === mi ? val : m) }
      : s));
  }, []);

  const addMeasurement = useCallback((id: string) => {
    setXbarSamples(prev => prev.map(s => s.id === id
      ? { ...s, measurements: [...s.measurements, ""] }
      : s));
  }, []);

  const removeMeasurement = useCallback((id: string, mi: number) => {
    setXbarSamples(prev => prev.map(s => s.id === id && s.measurements.length > 1
      ? { ...s, measurements: s.measurements.filter((_, i) => i !== mi) }
      : s));
  }, []);

  // ── P chart mutations ─────────────────────────────────────────────────────
  const addPSample = useCallback(() => {
    setPSamples(prev => [...prev, makePSample(prev.length)]);
  }, []);

  const removePSample = useCallback((id: string) => {
    setPSamples(prev => prev.filter(s => s.id !== id));
  }, []);

  const updatePField = useCallback((id: string, field: "label" | "n" | "d", val: string) => {
    setPSamples(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s));
  }, []);

  // ── Build inputs ──────────────────────────────────────────────────────────
  function buildInputs(): QualityInputs {
    if (chartType === "xbar") {
      return {
        chartType: "xbar",
        problemName: problemName || t("Analyse sans titre", "تحليل بدون عنوان"),
        samples: xbarSamples,
        targetMean: targetMean || undefined,
      };
    }
    return {
      chartType: "p",
      problemName: problemName || t("Analyse sans titre", "تحليل بدون عنوان"),
      samples: pSamples,
    };
  }

  // ── Validation ────────────────────────────────────────────────────────────
  const validationErrors = validateInputs(buildInputs());
  const canCompute = validationErrors.length === 0;

  // ── Compute ───────────────────────────────────────────────────────────────
  function handleCompute() {
    if (!canCompute) return;
    const r = computeQualityControl(buildInputs());
    setResults(r);
    setPhase("results");
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!results) return;
    setSaving(true);
    try {
      await fetch("/api/problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "industrial-quality-control",
          name: problemName || t("Analyse sans titre", "تحليل بدون عنوان"),
          content: { inputs: buildInputs(), results },
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  // ── PDF export ────────────────────────────────────────────────────────────
  async function handleExport() {
    if (!results) return;
    setExporting(true);
    try {
      await generateQualityControlPDF({
        problemName: problemName || t("Analyse sans titre", "تحليل بدون عنوان"),
        results,
        language: language as "fr" | "ar",
        analysisLines: generateQualityAnalysis(results),
        recommendations: generateQualityRecommendations(results),
        onProgress: (step) => setExportProgress(step),
      });
    } catch (e) { console.error(e); }
    finally { setExporting(false); setExportProgress(""); }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const analysisLines    = results ? generateQualityAnalysis(results) : [];
  const recommendations  = results ? generateQualityRecommendations(results) : [];

  const xr = results?.chartType === "xbar" ? results as XbarResults : null;
  const pr = results?.chartType === "p"    ? results as PResults    : null;

  const processStatusCfg = results?.processStatus === "in-control"
    ? { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", badge: "bg-green-100 text-green-700" }
    : { bg: "bg-red-50",   border: "border-red-200",   text: "text-red-700",   badge: "bg-red-100 text-red-700" };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-[100dvh] bg-muted/20 ${isAr ? "rtl" : "ltr"}`} dir={isAr ? "rtl" : "ltr"}>
      <main className="container mx-auto px-4 py-8 space-y-8 max-w-5xl">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/industrial-management" className="hover:text-primary transition-colors flex items-center gap-1">
            <ArrowLeft className={`w-3.5 h-3.5 ${isAr ? "rotate-180" : ""}`} />
            {t("Gestion Industrielle", "التسيير الصناعي")}
          </Link>
          <span>/</span>
          <span className="font-semibold text-foreground">{t("Gestion de la Qualité", "إدارة الجودة")}</span>
        </nav>

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <section className="bg-primary text-primary-foreground rounded-xl p-6 md:p-8 shadow-md relative overflow-hidden">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 bg-primary-foreground/15 rounded-full px-3 py-1 text-xs font-medium mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
              {t("Module — Gestion de la Qualité", "وحدة — إدارة الجودة")}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2 leading-tight">
              {t("Gestion de la Qualité", "إدارة الجودة")}
            </h1>
            <p className="text-primary-foreground/80 max-w-2xl text-sm leading-relaxed">
              {t(
                "Construisez des cartes de contrôle statistique (X-bar ou P) pour détecter les dérives de votre processus, identifier les points hors contrôle et obtenir des recommandations managériales ciblées.",
                "أنشئ بطاقات المراقبة الإحصائية (X-bar أو P) للكشف عن انجرافات عمليتك، وتحديد النقاط خارج السيطرة، والحصول على توصيات إدارية مستهدفة."
              )}
            </p>
          </div>
          <div className="absolute -right-16 -bottom-16 opacity-10 pointer-events-none">
            <ShieldCheck className="w-64 h-64" />
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            FORM PHASE
        ════════════════════════════════════════════════════════════════════ */}
        {phase === "form" && (
          <div className="space-y-6">

            {/* ── General parameters ───────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  {t("Paramètres généraux", "المعلمات العامة")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Problem name */}
                <div className="max-w-sm space-y-1.5">
                  <Label className="text-xs font-semibold">{t("Nom du problème", "اسم المسألة")}</Label>
                  <Input
                    value={problemName}
                    onChange={e => setProblemName(e.target.value)}
                    placeholder={t("ex. Contrôle qualité — Ligne A, Juillet 2026", "مثال: مراقبة الجودة — خط A، يوليو 2026")}
                  />
                </div>

                {/* Chart type */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">{t("Type de carte de contrôle", "نوع بطاقة المراقبة")}</Label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    {([
                      {
                        id: "xbar" as ChartType,
                        nameFr: "Carte des Moyennes (X-bar)",
                        nameAr: "بطاقة المتوسط (X-bar)",
                        descFr: "Pour des données variables (mesures : dimensions, poids, durées…). Surveille la moyenne des échantillons.",
                        descAr: "للبيانات المتغيرة (قياسات: أبعاد، أوزان، أوقات…). يراقب متوسط العينات.",
                      },
                      {
                        id: "p" as ChartType,
                        nameFr: "Carte des Défauts (P)",
                        nameAr: "بطاقة نسبة العيوب (P)",
                        descFr: "Pour des données attributs (conforme / non conforme). Surveille la proportion de défauts.",
                        descAr: "للبيانات النوعية (مطابق / غير مطابق). يراقب نسبة العيوب.",
                      },
                    ] as const).map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => switchChartType(opt.id)}
                        className={cn(
                          "flex-1 text-left p-4 rounded-xl border-2 transition-all duration-200 space-y-1",
                          chartType === opt.id
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border bg-card hover:border-primary/40"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                            chartType === opt.id ? "border-primary" : "border-muted-foreground"
                          )}>
                            {chartType === opt.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                          </div>
                          <span className={cn("font-semibold text-sm", chartType === opt.id ? "text-primary" : "text-foreground")}>
                            {isAr ? opt.nameAr : opt.nameFr}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed ps-6">
                          {isAr ? opt.descAr : opt.descFr}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional target mean (X-bar only) */}
                {chartType === "xbar" && (
                  <div className="max-w-xs space-y-1.5">
                    <Label className="text-xs font-semibold">
                      {t("Valeur cible / moyenne de référence (optionnel)", "القيمة المرجعية / المتوسط المستهدف (اختياري)")}
                    </Label>
                    <Input
                      type="number"
                      value={targetMean}
                      onChange={e => setTargetMean(e.target.value)}
                      placeholder={t("ex. 50.0", "مثال: 50.0")}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "Si renseignée, l'analyse comparera la moyenne générale à cette cible.",
                        "إذا أُدخلت، سيقارن التحليل المتوسط العام بهذه القيمة."
                      )}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Sector templates ──────────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Factory className="w-5 h-5 text-primary" />
                  {t("Secteur d'activité (modèle de départ)", "قطاع النشاط (نموذج أولي)")}
                </CardTitle>
                <CardDescription>
                  {t("Chargez un exemple pré-rempli pour votre secteur.", "حمّل مثالاً مُعبَّأ مسبقاً لقطاعك.")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {SECTORS.map(s => {
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.id}
                        onClick={() => loadTemplate(s.id)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all",
                          sector === s.id
                            ? "bg-primary text-primary-foreground border-primary shadow"
                            : "bg-card border-border text-muted-foreground hover:border-primary/50"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        {isAr ? s.nameAr : s.nameFr}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* ══════════════════════════════════════════════════════════════
                X-BAR SAMPLES
            ══════════════════════════════════════════════════════════════ */}
            {chartType === "xbar" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold">{t("Échantillons de mesures", "عينات القياسات")}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t(
                        "Pour chaque échantillon, saisissez les mesures individuelles. La carte X-bar surveille la moyenne de chaque échantillon.",
                        "لكل عينة، أدخل القياسات الفردية. تراقب بطاقة X-bar متوسط كل عينة."
                      )}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={addXbarSample} className="gap-1.5 shrink-0">
                    <Plus className="w-4 h-4" />
                    {t("Ajouter un échantillon", "إضافة عينة")}
                  </Button>
                </div>

                {xbarSamples.map((sample, si) => {
                  const hasValidMeasurement = sample.measurements.some(
                    m => m.trim() !== "" && !isNaN(parseFloat(m))
                  );
                  return (
                    <Card key={sample.id} className="border-primary/30">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                              {si + 1}
                            </div>
                            <Input
                              value={sample.label}
                              onChange={e => updateXbarLabel(sample.id, e.target.value)}
                              className="h-8 text-sm font-semibold max-w-[160px] border-dashed"
                              placeholder={t("Nom de l'échantillon", "اسم العينة")}
                            />
                          </div>
                          {xbarSamples.length > 2 && (
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => removeXbarSample(sample.id)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {!hasValidMeasurement && sample.label && (
                          <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                            <span>
                              {isAr
                                ? `"${sample.label}" لا تحتوي على قياسات صالحة.`
                                : `"${sample.label}" ne contient aucune mesure valide.`}
                            </span>
                          </div>
                        )}
                        <div>
                          <Label className="text-xs font-semibold mb-2 block">
                            {t(`Mesures (${sample.measurements.length})`, `القياسات (${sample.measurements.length})`)}
                          </Label>
                          <div className="flex flex-wrap gap-2 items-center">
                            {sample.measurements.map((m, mi) => (
                              <div key={mi} className="relative">
                                <Input
                                  type="number"
                                  value={m}
                                  onChange={e => updateMeasurement(sample.id, mi, e.target.value)}
                                  placeholder="—"
                                  className="w-20 h-8 text-center text-xs pr-5"
                                />
                                {sample.measurements.length > 1 && (
                                  <button
                                    onClick={() => removeMeasurement(sample.id, mi)}
                                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full text-muted-foreground hover:text-red-500 flex items-center justify-center text-[10px] leading-none"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}
                            <Button
                              variant="outline" size="sm"
                              onClick={() => addMeasurement(sample.id)}
                              className="h-8 px-2 text-xs gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              {t("Mesure", "قياس")}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                P CHART SAMPLES
            ══════════════════════════════════════════════════════════════ */}
            {chartType === "p" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold">{t("Échantillons inspectés", "العينات المفحوصة")}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t(
                        "Pour chaque échantillon, saisissez le nombre d'unités inspectées (n) et le nombre de défauts constatés (d).",
                        "لكل عينة، أدخل عدد الوحدات المفحوصة (n) وعدد العيوب المكتشفة (d)."
                      )}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={addPSample} className="gap-1.5 shrink-0">
                    <Plus className="w-4 h-4" />
                    {t("Ajouter un échantillon", "إضافة عينة")}
                  </Button>
                </div>

                <Card className="border-primary/20">
                  <CardContent className="pt-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-primary text-primary-foreground">
                            <th className="px-3 py-2 text-start text-xs font-semibold rounded-tl-lg w-8">#</th>
                            <th className="px-3 py-2 text-start text-xs font-semibold min-w-[140px]">
                              {t("Nom de l'échantillon", "اسم العينة")}
                            </th>
                            <th className="px-3 py-2 text-center text-xs font-semibold min-w-[100px]">
                              {t("Unités inspectées (n)", "وحدات مفحوصة (n)")}
                            </th>
                            <th className="px-3 py-2 text-center text-xs font-semibold min-w-[100px]">
                              {t("Défauts (d)", "عيوب (d)")}
                            </th>
                            <th className="px-3 py-2 text-center text-xs font-semibold rounded-tr-lg w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {pSamples.map((sample, si) => {
                            const n = parseFloat(sample.n);
                            const d = parseFloat(sample.d);
                            const hasError = sample.n && sample.d && !isNaN(n) && !isNaN(d) && d > n;
                            const nEmpty = sample.n.trim() !== "" && (isNaN(n) || n <= 0);
                            return (
                              <tr key={sample.id} className={cn(
                                "border-b border-border",
                                si % 2 === 0 ? "bg-card" : "bg-muted/20",
                                hasError && "bg-red-50"
                              )}>
                                <td className="px-3 py-1.5 text-xs text-muted-foreground font-bold">{si + 1}</td>
                                <td className="px-2 py-1.5">
                                  <Input
                                    value={sample.label}
                                    onChange={e => updatePField(sample.id, "label", e.target.value)}
                                    className="h-7 text-xs border-dashed"
                                    placeholder={`Éch. ${si + 1}`}
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <Input
                                    type="number" min={1} step={1}
                                    value={sample.n}
                                    onChange={e => updatePField(sample.id, "n", e.target.value)}
                                    placeholder="ex. 100"
                                    className={cn("h-7 text-xs text-center", nEmpty && "border-amber-400")}
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <Input
                                    type="number" min={0} step={1}
                                    value={sample.d}
                                    onChange={e => updatePField(sample.id, "d", e.target.value)}
                                    placeholder="ex. 4"
                                    className={cn("h-7 text-xs text-center", hasError && "border-red-400")}
                                  />
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  {pSamples.length > 2 && (
                                    <button
                                      onClick={() => removePSample(sample.id)}
                                      className="text-red-400 hover:text-red-600 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Global validation errors */}
            {validationErrors.map((err, i) => (
              <div key={i} className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <span>{isAr ? err.msgAr : err.msgFr}</span>
              </div>
            ))}

            {/* Compute button */}
            <div className="flex justify-end">
              <Button onClick={handleCompute} disabled={!canCompute} size="lg" className="gap-2 px-8">
                <Calculator className="w-5 h-5" />
                {t("Analyser le processus", "تحليل العملية")}
              </Button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            RESULTS PHASE
        ════════════════════════════════════════════════════════════════════ */}
        {phase === "results" && results && (
          <div ref={resultRef} className="space-y-6">

            {/* Back + action bar */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <Button variant="outline" size="sm" onClick={() => setPhase("form")} className="gap-1.5">
                <ArrowLeft className={`w-4 h-4 ${isAr ? "rotate-180" : ""}`} />
                {t("Modifier les données", "تعديل البيانات")}
              </Button>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={handleSave} disabled={saving || saved} className="gap-1.5">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" />
                    : saved ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                    : <Save className="w-4 h-4" />}
                  {saved ? t("Enregistré !", "تم الحفظ!") : t("Enregistrer dans le registre", "حفظ في السجل")}
                </Button>
                <Button size="sm" onClick={handleExport} disabled={exporting} className="gap-1.5">
                  {exporting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs">{exportProgress}</span></>
                    : <><FileText className="w-4 h-4" />{t("Exporter PDF", "تصدير PDF")}</>}
                </Button>
              </div>
            </div>

            {/* ── KPI cards ─────────────────────────────────────────────────── */}
            <section>
              <h2 className="text-lg font-bold mb-3">
                {t(
                  `Résultats — ${xr ? "Carte X-bar" : "Carte P"}`,
                  `النتائج — ${xr ? "بطاقة X-bar" : "بطاقة P"}`
                )}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(xr ? [
                  { label: t("Échantillons", "عينات"), value: String(xr.samples.length), cfg: "text-primary bg-primary/5 border-primary/20" },
                  {
                    label: t("Hors contrôle", "خارج السيطرة"),
                    value: String(xr.outOfControlCount),
                    cfg: xr.outOfControlCount > 0 ? "text-red-700 bg-red-50 border-red-200" : "text-green-700 bg-green-50 border-green-200",
                  },
                  { label: t("Moyenne X̿", "المتوسط العام X̿"), value: fmtN3(xr.grandMean), cfg: "text-primary bg-primary/5 border-primary/20" },
                  { label: t("Écart-type σ", "σ"), value: fmtN3(xr.processStdDev), cfg: "text-blue-700 bg-blue-50 border-blue-200" },
                ] : [
                  { label: t("Échantillons", "عينات"), value: String(pr!.samples.length), cfg: "text-primary bg-primary/5 border-primary/20" },
                  {
                    label: t("Hors contrôle", "خارج السيطرة"),
                    value: String(pr!.outOfControlCount),
                    cfg: pr!.outOfControlCount > 0 ? "text-red-700 bg-red-50 border-red-200" : "text-green-700 bg-green-50 border-green-200",
                  },
                  {
                    label: t("Taux moyen p̄", "معدل العيوب p̄"),
                    value: fmtPct(pr!.pBar),
                    cfg: pr!.pBar > 0.1 ? "text-red-700 bg-red-50 border-red-200" : pr!.pBar > 0.05 ? "text-amber-700 bg-amber-50 border-amber-200" : "text-green-700 bg-green-50 border-green-200",
                  },
                  { label: t("Total inspecté", "إجمالي مفحوص"), value: String(pr!.totalInspected), cfg: "text-blue-700 bg-blue-50 border-blue-200" },
                ]).map(s => (
                  <div key={s.label} className={cn("rounded-xl border p-4 text-center", s.cfg)}>
                    <div className="text-2xl font-black">{s.value}</div>
                    <div className="text-xs mt-1 opacity-75 leading-snug">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Process status banner */}
              <div className={cn("mt-4 flex items-center gap-3 p-3 rounded-xl border", processStatusCfg.bg, processStatusCfg.border)}>
                {results.processStatus === "in-control"
                  ? <CheckCircle2 className={cn("w-5 h-5 shrink-0", processStatusCfg.text)} />
                  : <AlertTriangle className={cn("w-5 h-5 shrink-0", processStatusCfg.text)} />}
                <span className={cn("font-semibold text-sm", processStatusCfg.text)}>
                  {results.processStatus === "in-control"
                    ? t("Processus SOUS CONTRÔLE — tous les points respectent les limites.", "العملية تحت السيطرة — جميع النقاط ضمن الحدود.")
                    : t(
                        `Processus HORS CONTRÔLE — ${results.outOfControlCount} point(s) dépassent les limites de contrôle.`,
                        `العملية خارج السيطرة — ${results.outOfControlCount} نقطة(نقاط) تتجاوز حدود المراقبة.`
                      )}
                </span>
              </div>
            </section>

            {/* ── Control chart ─────────────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  {t(
                    xr ? "Carte de Contrôle X-bar" : "Carte de Contrôle P",
                    xr ? "بطاقة المراقبة X-bar" : "بطاقة المراقبة P"
                  )}
                </CardTitle>
                <CardDescription>
                  {t(
                    "Les points en rouge sont hors des limites de contrôle (UCL/LCL) et indiquent une cause assignable.",
                    "النقاط باللون الأحمر خارج حدود السيطرة (UCL/LCL) وتشير إلى سبب محدد يستلزم التحقيق."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl overflow-hidden border border-border bg-[#f0faf8]">
                  <ControlChart results={results} />
                </div>
                {/* UCL / Center / LCL summary */}
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-0.5 bg-red-600" style={{ borderTop: "2px dashed #c62828" }} />
                    <span className="text-red-700 font-semibold">
                      UCL = {xr ? fmtN3(xr.ucl) : fmtPct(pr!.uclConstant)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-0.5" style={{ borderTop: "2px dashed #004d40" }} />
                    <span className="text-primary font-semibold">
                      {xr ? `X̿ = ${fmtN3(xr.grandMean)}` : `p̄ = ${fmtPct(pr!.pBar)}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-0.5" style={{ borderTop: "2px dashed #1565c0" }} />
                    <span className="text-blue-700 font-semibold">
                      LCL = {xr ? fmtN3(xr.lcl) : fmtPct(pr!.lclConstant)}
                    </span>
                  </div>
                  {xr && xr.targetMean !== null && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-700 font-semibold">
                        {t(`Cible : ${xr.targetMean}`, `القيمة المرجعية: ${xr.targetMean}`)}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── Results table ─────────────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("Tableau des résultats", "جدول النتائج")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  {xr ? (
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-primary text-primary-foreground">
                          <th className="px-3 py-2 text-start text-xs font-semibold rounded-tl-lg">
                            {t("Échantillon", "العينة")}
                          </th>
                          <th className="px-3 py-2 text-center text-xs font-semibold">n</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold">x̄ᵢ</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold">UCL</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold">LCL</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold rounded-tr-lg">
                            {t("Statut", "الحالة")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {xr.samples.map((s, i) => (
                          <tr key={s.id} className={cn(
                            "border-b border-border",
                            s.isOutOfControl ? "bg-red-50" : i % 2 === 0 ? "bg-card" : "bg-muted/20"
                          )}>
                            <td className="px-3 py-2 font-semibold text-xs">{s.label}</td>
                            <td className="px-3 py-2 text-center text-xs text-muted-foreground">{s.sampleSize}</td>
                            <td className={cn("px-3 py-2 text-center text-sm font-bold",
                              s.isOutOfControl ? "text-red-700" : "text-primary")}>
                              {fmtN3(s.sampleMean)}
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-red-600">{fmtN3(s.ucl)}</td>
                            <td className="px-3 py-2 text-center text-xs text-blue-600">{fmtN3(s.lcl)}</td>
                            <td className="px-3 py-2 text-center">
                              {s.isOutOfControl ? (
                                <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                  <AlertTriangle className="w-3 h-3" />
                                  {s.outDirection === "above"
                                    ? t("Au-dessus UCL", "فوق UCL")
                                    : t("En-dessous LCL", "دون LCL")}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                                  <CheckCircle2 className="w-3 h-3" />
                                  {t("Sous contrôle", "تحت السيطرة")}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {/* Summary row */}
                        <tr className="bg-primary/10 font-bold">
                          <td colSpan={2} className="px-3 py-2 text-xs">
                            {t("Paramètres de contrôle", "معاملات المراقبة")}
                          </td>
                          <td className="px-3 py-2 text-center text-xs text-primary">{fmtN3(xr.grandMean)} (X̿)</td>
                          <td className="px-3 py-2 text-center text-xs text-red-600">{fmtN3(xr.ucl)}</td>
                          <td className="px-3 py-2 text-center text-xs text-blue-600">{fmtN3(xr.lcl)}</td>
                          <td className="px-3 py-2 text-center text-xs text-muted-foreground">σ = {fmtN3(xr.processStdDev)}</td>
                        </tr>
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-primary text-primary-foreground">
                          <th className="px-3 py-2 text-start text-xs font-semibold rounded-tl-lg">
                            {t("Échantillon", "العينة")}
                          </th>
                          <th className="px-3 py-2 text-center text-xs font-semibold">n</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold">
                            {t("Défauts d", "عيوب d")}
                          </th>
                          <th className="px-3 py-2 text-center text-xs font-semibold">pᵢ (%)</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold">UCL (%)</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold">LCL (%)</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold rounded-tr-lg">
                            {t("Statut", "الحالة")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pr!.samples.map((s, i) => (
                          <tr key={s.id} className={cn(
                            "border-b border-border",
                            s.isOutOfControl ? "bg-red-50" : i % 2 === 0 ? "bg-card" : "bg-muted/20"
                          )}>
                            <td className="px-3 py-2 font-semibold text-xs">{s.label}</td>
                            <td className="px-3 py-2 text-center text-xs text-muted-foreground">{s.n}</td>
                            <td className="px-3 py-2 text-center text-xs">{s.d}</td>
                            <td className={cn("px-3 py-2 text-center text-sm font-bold",
                              s.isOutOfControl ? "text-red-700" : "text-primary")}>
                              {fmtPct(s.rate)}
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-red-600">{fmtPct(s.ucl)}</td>
                            <td className="px-3 py-2 text-center text-xs text-blue-600">{fmtPct(s.lcl)}</td>
                            <td className="px-3 py-2 text-center">
                              {s.isOutOfControl ? (
                                <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                  <AlertTriangle className="w-3 h-3" />
                                  {s.outDirection === "above"
                                    ? t("Au-dessus UCL", "فوق UCL")
                                    : t("En-dessous LCL", "دون LCL")}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                                  <CheckCircle2 className="w-3 h-3" />
                                  {t("Sous contrôle", "تحت السيطرة")}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {/* Summary row */}
                        <tr className="bg-primary/10 font-bold">
                          <td className="px-3 py-2 text-xs">{t("Total / Moyenne", "الإجمالي / المتوسط")}</td>
                          <td className="px-3 py-2 text-center text-xs">{pr!.totalInspected}</td>
                          <td className="px-3 py-2 text-center text-xs">{pr!.totalDefects}</td>
                          <td className="px-3 py-2 text-center text-xs text-primary">{fmtPct(pr!.pBar)} (p̄)</td>
                          <td className="px-3 py-2 text-center text-xs text-red-600">{fmtPct(pr!.uclConstant)}</td>
                          <td className="px-3 py-2 text-center text-xs text-blue-600">{fmtPct(pr!.lclConstant)}</td>
                          <td className="px-3 py-2 text-center text-xs text-muted-foreground">
                            ñ = {pr!.avgN.toFixed(1)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── تحليل الوضع ────────────────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="w-5 h-5 text-primary" />
                  {t("Analyse de la Situation", "تحليل الوضع")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysisLines.map((line, i) => (
                  <p key={i} className="p-3 rounded-lg bg-primary/5 border border-primary/15 text-sm text-foreground leading-relaxed">
                    {isAr ? line.ar : line.fr}
                  </p>
                ))}
              </CardContent>
            </Card>

            {/* ── التوصيات الإدارية ─────────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  {t("Recommandations Managériales", "التوصيات الإدارية")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {recommendations.map((reco, i) => (
                  <div key={i} className={cn(
                    "rounded-xl border p-4",
                    i % 6 === 0 && "border-l-4 border-l-green-500 bg-green-50/50",
                    i % 6 === 1 && "border-l-4 border-l-amber-500 bg-amber-50/50",
                    i % 6 === 2 && "border-l-4 border-l-primary bg-primary/5",
                    i % 6 === 3 && "border-l-4 border-l-blue-500 bg-blue-50/50",
                    i % 6 === 4 && "border-l-4 border-l-red-500 bg-red-50/50",
                    i % 6 === 5 && "border-l-4 border-l-purple-500 bg-purple-50/50",
                  )}>
                    <div className="font-bold text-sm mb-1">{reco.icon} {isAr ? reco.ar : reco.fr}</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{isAr ? reco.descAr : reco.descFr}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* ── Bottom action bar ─────────────────────────────────────────── */}
            <div className="flex justify-end gap-3 pb-4 flex-wrap">
              <Button variant="outline" onClick={handleSave} disabled={saving || saved} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" />
                  : saved ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                  : <Save className="w-4 h-4" />}
                {saved ? t("Enregistré !", "تم الحفظ!") : t("Enregistrer dans le registre", "حفظ في السجل")}
              </Button>
              <Button onClick={handleExport} disabled={exporting} className="gap-2">
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {exporting
                  ? (exportProgress || t("Génération…", "جارٍ الإنشاء…"))
                  : t("Exporter PDF", "تصدير PDF")}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
