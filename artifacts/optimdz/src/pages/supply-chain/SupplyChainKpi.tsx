import { useState, useRef } from "react";
import { Link } from "wouter";
import { useLanguage } from "@/lib/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, ChevronLeft, Calculator, Save, FileText, CheckCircle2,
  Loader2, TrendingUp, AlertTriangle, RefreshCw, RotateCcw, Package,
  Truck, ShoppingCart, XCircle,
} from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  computeScKpis,
  fPct, fRot, fDA,
  type ScKpiInputs, type ScKpiResults, type KpiStatus, type KpiPeriod,
} from "@/lib/supplyChainKpiAlgorithm";
import { generateScKpiPDF } from "@/lib/generateSupplyChainKpiPDF";

// ── Status colours ─────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<KpiStatus, string> = {
  good:   "text-green-700",
  medium: "text-amber-600",
  bad:    "text-red-700",
};
const STATUS_BG: Record<KpiStatus, string> = {
  good:   "bg-green-50 border-green-200",
  medium: "bg-amber-50 border-amber-200",
  bad:    "bg-red-50 border-red-200",
};
const STATUS_DOT: Record<KpiStatus, string> = {
  good:   "bg-green-500",
  medium: "bg-amber-400",
  bad:    "bg-red-500",
};
const CHART_COLOR: Record<KpiStatus, string> = {
  good: "#16a34a", medium: "#d97706", bad: "#dc2626",
};

// ── Period options ─────────────────────────────────────────────────────────────
const PERIODS: { value: KpiPeriod; fr: string; ar: string }[] = [
  { value: "mois",      fr: "Mensuel",      ar: "شهري" },
  { value: "trimestre", fr: "Trimestriel",  ar: "ربع سنوي" },
  { value: "annee",     fr: "Annuel",       ar: "سنوي" },
];

// ── Numeric input helper ───────────────────────────────────────────────────────
function NumInput({
  id, label, value, onChange, placeholder = "0",
}: {
  id: string; label: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-foreground">{label}</Label>
      <Input
        id={id}
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="font-mono"
      />
    </div>
  );
}

// ── Section toggle header ──────────────────────────────────────────────────────
function SectionToggle({
  icon: Icon, title, active, onToggle,
}: {
  icon: React.ElementType; title: string; active: boolean; onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        "w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all duration-150",
        active
          ? "border-primary bg-primary/5 text-primary"
          : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40",
      ].join(" ")}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${active ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
        <Icon className="w-4 h-4" />
      </div>
      <span className="font-semibold text-sm flex-1">{title}</span>
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${active ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
        {active && <CheckCircle2 className="w-3 h-3 text-white" />}
      </div>
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SupplyChainKpi() {
  const { t, language } = useLanguage();
  const isAr = language === "ar";

  // ── General info ──────────────────────────────────────────────────────────
  const [problemName, setProblemName] = useState("");
  const [period, setPeriod] = useState<KpiPeriod>("annee");

  // ── Section enable flags ──────────────────────────────────────────────────
  const [secStorage, setSecStorage]     = useState(true);
  const [secService, setSecService]     = useState(true);
  const [secCost,    setSecCost]        = useState(false);
  const [secStockout, setSecStockout]   = useState(false);

  // ── Storage KPI inputs ────────────────────────────────────────────────────
  const [coutVentes, setCoutVentes]             = useState("");
  const [valeurMoyenneStock, setValeurMoyStock] = useState("");

  // ── Service rate inputs ───────────────────────────────────────────────────
  const [commandesLivrees, setCommandesLivrees]   = useState("");
  const [commandesTotales,  setCommandesTotales]  = useState("");

  // ── Supply cost inputs ────────────────────────────────────────────────────
  const [coutTransport, setCoutTransport] = useState("");
  const [coutStockage,  setCoutStockage]  = useState("");
  const [coutCommande,  setCoutCommande]  = useState("");
  const [coutRupture,   setCoutRupture]   = useState("");

  // ── Stockout inputs ───────────────────────────────────────────────────────
  const [nombreRuptures,      setNombreRuptures]      = useState("");
  const [nombreTotalCmdsRup,  setNombreTotalCmdsRup]  = useState("");

  // ── Results & UI state ────────────────────────────────────────────────────
  const [results,   setResults]   = useState<ScKpiResults | null>(null);
  const [stale,     setStale]     = useState(false);
  const [isSaving,  setIsSaving]  = useState(false);
  const [savedOk,   setSavedOk]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pdfStep,   setPdfStep]   = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // ── Compute ───────────────────────────────────────────────────────────────
  function handleCompute() {
    const inputs: ScKpiInputs = {
      problemName: problemName || t("Analyse SC KPI", "تحليل مؤشرات سلسلة الإمداد"),
      period,
    };

    if (secStorage && coutVentes && valeurMoyenneStock) {
      inputs.storage = {
        coutVentes:          parseFloat(coutVentes),
        valeurMoyenneStock:  parseFloat(valeurMoyenneStock),
      };
    }
    if (secService && commandesLivrees && commandesTotales) {
      inputs.serviceRate = {
        commandesLivrees: parseFloat(commandesLivrees),
        commandesTotales:  parseFloat(commandesTotales),
      };
    }
    if (secCost) {
      const ct = parseFloat(coutTransport) || 0;
      const cs = parseFloat(coutStockage)  || 0;
      const cc = parseFloat(coutCommande)  || 0;
      const cr = parseFloat(coutRupture)   || 0;
      if (ct + cs + cc + cr > 0) {
        inputs.supplyCost = { coutTransport: ct, coutStockage: cs, coutCommande: cc, coutRupture: cr };
      }
    }
    if (secStockout && nombreRuptures && nombreTotalCmdsRup) {
      inputs.stockout = {
        nombreRuptures:      parseFloat(nombreRuptures),
        nombreTotalCommandes: parseFloat(nombreTotalCmdsRup),
      };
    }

    const res = computeScKpis(inputs);
    if (res.activeCount === 0) return;
    setResults(res);
    setStale(false);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  function handleReset() {
    setResults(null); setStale(false);
    setSavedOk(false); setSaveError(null);
  }

  const canCompute = (() => {
    if (secStorage && coutVentes && valeurMoyenneStock) return true;
    if (secService && commandesLivrees && commandesTotales) return true;
    if (secCost && (coutTransport || coutStockage || coutCommande || coutRupture)) return true;
    if (secStockout && nombreRuptures && nombreTotalCmdsRup) return true;
    return false;
  })();

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!results) return;
    setIsSaving(true); setSavedOk(false); setSaveError(null);
    try {
      const res = await fetch("/api/problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemData: { type: "sc-kpi", period, results },
          result: results,
        }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : t("Erreur réseau", "خطأ في الشبكة"));
    } finally {
      setIsSaving(false);
    }
  }

  // ── PDF ───────────────────────────────────────────────────────────────────
  async function handlePDF() {
    if (!results) return;
    try {
      setPdfStep(t("Génération en cours…", "جارٍ الإنشاء…"));
      await generateScKpiPDF({
        results,
        language,
        analysisLines: buildAnalysisLines(results),
        recommendations: buildRecommendations(results),
        onProgress: (step) => setPdfStep(step),
      });
    } finally {
      setPdfStep(null);
    }
  }

  // ── Analysis text (all via t()) ───────────────────────────────────────────
  function buildAnalysisLines(res: ScKpiResults): string[] {
    const lines: string[] = [];

    const rotationValue = res.tauxRotation
      ? `${res.tauxRotation.value.toFixed(2)} ${t("fois", "مرة")}`
      : null;
    const overview: string[] = [];
    if (res.tauxRotation) {
      overview.push(t(`un taux de rotation de ${rotationValue}`, `معدل دوران قدره ${rotationValue}`));
    }
    if (res.tauxService) {
      overview.push(t(
        `un niveau de service de ${fPct(res.tauxService.value)}`,
        `نسبة خدمة قدرها ${fPct(res.tauxService.value)}`,
      ));
    }
    if (res.coutTotal) {
      overview.push(t(
        `un coût d'approvisionnement de ${fDA(res.coutTotal.value)}`,
        `تكلفة إمداد قدرها ${fDA(res.coutTotal.value)}`,
      ));
    }
    if (res.tauxRupture) {
      overview.push(t(
        `un taux de rupture de ${fPct(res.tauxRupture.value)}`,
        `نسبة نقص قدرها ${fPct(res.tauxRupture.value)}`,
      ));
    }
    if (overview.length > 0) {
      lines.push(t(
        `Sur la période analysée, la chaîne présente ${overview.join(", ")}. Cette lecture donne une vue d'ensemble de l'équilibre entre la vitesse d'écoulement des stocks, la qualité de service, le coût engagé et la disponibilité des produits.`,
        `خلال الفترة المحللة، تُظهر السلسلة ${overview.join("، ")}. وتقدم هذه القراءة صورة عامة عن التوازن بين سرعة تصريف المخزون وجودة الخدمة والتكلفة المتكبدة وتوافر المنتجات.`,
      ));
    }

    const belowTarget: string[] = [];
    if (res.tauxRotation && res.tauxRotation.status !== "good") {
      belowTarget.push(t(
        `la rotation à ${rotationValue}, ce qui signifie qu'une part du stock reste immobilisée trop longtemps et pèse sur les liquidités`,
        `الدوران عند ${rotationValue}، مما يعني أن جزءاً من المخزون يبقى راكداً فترة أطول ويضغط على السيولة`,
      ));
    }
    if (res.tauxService && res.tauxService.status !== "good") {
      belowTarget.push(t(
        `le service à ${fPct(res.tauxService.value)}, ce qui expose les clients à des retards ou à des livraisons incomplètes`,
        `الخدمة عند ${fPct(res.tauxService.value)}، مما يعرّض العملاء للتأخير أو التسليم غير الكامل`,
      ));
    }
    if (res.tauxRupture && res.tauxRupture.status !== "good") {
      belowTarget.push(t(
        `les ruptures à ${fPct(res.tauxRupture.value)}, ce qui signale des indisponibilités susceptibles de provoquer des ventes perdues et des expéditions urgentes`,
        `النقص عند ${fPct(res.tauxRupture.value)}، مما يشير إلى عدم توفر قد يؤدي إلى خسارة مبيعات وشحنات عاجلة`,
      ));
    }
    if (belowTarget.length > 0) {
      const availabilityRisk = res.tauxRupture?.status !== "good" || res.tauxService?.status !== "good";
      lines.push(t(
        `Les indicateurs qui demandent une action sont ${belowTarget.join(" ; ")}. Pour la performance de la chaîne, cela traduit ${availabilityRisk ? "un risque sur la disponibilité client" : "une immobilisation excessive du stock"} et justifie une intervention ciblée plutôt qu'une action générale.`,
        `المؤشرات التي تتطلب تدخلاً هي ${belowTarget.join("؛ ")}. وبالنسبة لأداء السلسلة، يعكس ذلك ${availabilityRisk ? "خطراً على توافر المنتجات للعملاء" : "تجميداً مفرطاً للمخزون"}، ولذلك يلزم تدخل مركز بدلاً من إجراء عام.`,
      ));
    }

    const performingWell: string[] = [];
    if (res.tauxRotation?.status === "good") {
      performingWell.push(t(
        `la rotation à ${rotationValue}, qui indique un écoulement rapide du stock`,
        `الدوران عند ${rotationValue}، وهو ما يدل على تصريف سريع للمخزون`,
      ));
    }
    if (res.tauxService?.status === "good") {
      performingWell.push(t(
        `le service à ${fPct(res.tauxService.value)}, qui protège la ponctualité des livraisons`,
        `الخدمة عند ${fPct(res.tauxService.value)}، وهو ما يدعم انتظام التسليمات`,
      ));
    }
    if (res.tauxRupture?.status === "good") {
      performingWell.push(t(
        `les ruptures à ${fPct(res.tauxRupture.value)}, qui montrent que la disponibilité est bien maîtrisée`,
        `النقص عند ${fPct(res.tauxRupture.value)}، وهو ما يثبت التحكم الجيد في توافر المنتجات`,
      ));
    }
    if (performingWell.length > 0) {
      lines.push(t(
        `Les points forts sont ${performingWell.join(" ; ")}. Ils donnent à la chaîne une base opérationnelle solide et permettent de concentrer les moyens d'amélioration sur les indicateurs en retrait.`,
        `وتتمثل نقاط القوة في ${performingWell.join("؛ ")}. وهذا يمنح السلسلة أساساً تشغيلياً متيناً ويسمح بتوجيه جهود التحسين إلى المؤشرات المتراجعة.`,
      ));
    } else if (overview.length > 0) {
      lines.push(t(
        "Aucun des indicateurs de performance analysés n'atteint actuellement sa cible. La priorité doit donc aller à l'indicateur le plus faible, tout en protégeant les niveaux de service déjà obtenus.",
        "لا يحقق أي من مؤشرات الأداء المحللة هدفه حالياً. لذلك يجب توجيه الأولوية إلى المؤشر الأضعف مع الحفاظ على مستويات الخدمة المحققة.",
      ));
    }

    const storageCost = res.coutTotal?.breakdown.coutStockage ?? 0;
    if (res.coutTotal && storageCost > 0) {
      lines.push(t(
        `Le coût de possession du stock représente ${fDA(storageCost)} dans le coût d'approvisionnement total de ${fDA(res.coutTotal.value)}. Ce montant mérite d'être rapproché de la rotation : si les stocks restent longtemps en magasin, une réduction des quantités ou une meilleure synchronisation des achats peut libérer du cash sans dégrader le service.`,
        `تمثل تكلفة الاحتفاظ بالمخزون ${fDA(storageCost)} من إجمالي تكلفة الإمداد البالغة ${fDA(res.coutTotal.value)}. ويجب ربط هذا المبلغ بمعدل الدوران: فإذا بقي المخزون طويلاً في المستودع، فإن خفض الكميات أو تحسين توقيت الشراء قد يحرر السيولة دون الإضرار بالخدمة.`,
      ));
    }

    if (lines.length === 0) {
      lines.push(t(
        "Aucune donnée exploitable n'est disponible pour formuler une lecture managériale.",
        "لا تتوفر بيانات قابلة للاستغلال لصياغة قراءة إدارية.",
      ));
    }

    return lines;
  }

  // ── Recommendations (all via t()) ─────────────────────────────────────────
  function buildRecommendations(res: ScKpiResults) {
    const recos: { icon: string; title: string; desc: string }[] = [];

    const availabilityNeedsAction =
      res.tauxService?.status !== "good" || res.tauxRupture?.status !== "good";
    if (availabilityNeedsAction) {
      const serviceValue = res.tauxService ? fPct(res.tauxService.value) : null;
      const ruptureValue = res.tauxRupture ? fPct(res.tauxRupture.value) : null;
      const weakestAvailability = [
        res.tauxService ? { key: "service", score: res.tauxService.score } : null,
        res.tauxRupture ? { key: "rupture", score: res.tauxRupture.score } : null,
      ]
        .filter((metric): metric is { key: string; score: number } => metric !== null)
        .sort((a, b) => a.score - b.score)[0]?.key;
      const availabilityTitle = weakestAvailability === "rupture"
        ? t("Priorité — réduire les ruptures", "الأولوية — تقليل حالات النقص")
        : t("Priorité — relever le niveau de service", "الأولوية — رفع مستوى الخدمة");
      recos.push({
        icon: "🎯",
        title: availabilityTitle,
        desc: t(
          `Priorisez le suivi des commandes en retard et des articles indisponibles${serviceValue ? ` : le service est à ${serviceValue}` : ""}${ruptureValue ? ` et les ruptures à ${ruptureValue}` : ""}. Ajustez les stocks de sécurité des références critiques, confirmez les délais fournisseurs chaque semaine et déclenchez le réapprovisionnement avant la rupture. Cette action traite ensemble la fiabilité de livraison et la disponibilité, sans répéter la même consigne sur deux indicateurs.`,
          `أعط الأولوية لمتابعة الطلبيات المتأخرة والمواد غير المتاحة${serviceValue ? `: نسبة الخدمة عند ${serviceValue}` : ""}${ruptureValue ? ` ونسبة النقص عند ${ruptureValue}` : ""}. عدّل مخزون الأمان للمواد الحيوية، وأكد آجال الموردين أسبوعياً، وابدأ التزويد قبل حدوث النقص. يعالج هذا الإجراء موثوقية التسليم وتوافر المنتجات معاً دون تكرار نفس التوجيه على مؤشرين.`,
        ),
      });
    }
    if (res.tauxRotation && res.tauxRotation.status !== "good") {
      recos.push({
        icon: "🔄",
        title: t("Accélérer la rotation des stocks", "تسريع دوران المخزون"),
        desc: t(
          `Le taux de rotation est de ${res.tauxRotation.value.toFixed(2)} fois. Réduisez les quantités des références lentes, rapprochez les achats de la demande réelle et écoulez en priorité les stocks anciens afin de limiter l'argent immobilisé sans affaiblir le service.`,
          `معدل دوران المخزون هو ${res.tauxRotation.value.toFixed(2)} مرة. خفّض كميات المواد بطيئة الحركة، وقرّب المشتريات من الطلب الفعلي، وصرف المخزون الأقدم أولاً للحد من الأموال المجمدة دون إضعاف الخدمة.`,
        ),
      });
    }
    if (res.coutTotal) {
      const b = res.coutTotal.breakdown;
      const maxKey = Object.entries(b).sort((a, b2) => b2[1] - a[1])[0][0];
      const costFocus = maxKey === "coutTransport"
        ? t("les coûts de transport", "تكاليف النقل")
        : maxKey === "coutStockage"
        ? t("les coûts de stockage", "تكاليف التخزين")
        : maxKey === "coutRupture"
        ? t("les coûts de rupture", "تكاليف النقص")
        : t("les coûts de commande", "تكاليف الطلب");
      recos.push({
        icon: "💰",
        title: t("Réduire les coûts d'approvisionnement", "خفض تكاليف الإمداد"),
        desc: t(
          `Le coût d'approvisionnement atteint ${fDA(res.coutTotal.value)} ; le poste dominant est ${costFocus}. Concentrez la négociation, la planification des livraisons ou le regroupement des commandes sur ce poste précis, puis mesurez l'économie obtenue sur la prochaine période.`,
          `تبلغ تكلفة الإمداد ${fDA(res.coutTotal.value)}، وأعلى بند فيها هو ${costFocus}. ركّز التفاوض أو تخطيط التسليم أو تجميع الطلبيات على هذا البند تحديداً، ثم قِس الوفر المحقق في الفترة المقبلة.`,
        ),
      });
    }
    if (recos.length === 0) {
      recos.push({
        icon: "🏆",
        title: t("Maintenir l'excellence opérationnelle", "الحفاظ على التميز التشغيلي"),
        desc: t(
          "Tous les indicateurs analysés sont dans les zones cibles. Continuez le suivi régulier, documentez les bonnes pratiques et envisagez de partager vos méthodes avec d'autres unités.",
          "جميع المؤشرات المحللة في مناطقها المستهدفة. واصل المتابعة المنتظمة، وثّق الممارسات الجيدة وفكّر في مشاركة أساليبك مع وحدات أخرى.",
        ),
      });
    }
    return recos;
  }

  // ── Radar data ────────────────────────────────────────────────────────────
  function buildRadarData(res: ScKpiResults) {
    const data = [];
    if (res.tauxRotation) {
      data.push({ kpi: t("Rotation", "الدوران"), score: res.tauxRotation.score, fullMark: 100 });
    }
    if (res.tauxService) {
      data.push({ kpi: t("Service", "الخدمة"), score: res.tauxService.score, fullMark: 100 });
    }
    if (res.tauxRupture) {
      data.push({ kpi: t("Rupture", "النقص"), score: res.tauxRupture.score, fullMark: 100 });
    }
    return data;
  }

  // ── Bar chart data ─────────────────────────────────────────────────────────
  function buildBarData(res: ScKpiResults) {
    const data: { name: string; value: number; color: string }[] = [];
    if (res.tauxRotation) {
      data.push({ name: t("Rotation (×)", "الدوران (×)"), value: parseFloat(res.tauxRotation.value.toFixed(2)), color: CHART_COLOR[res.tauxRotation.status] });
    }
    if (res.tauxService) {
      data.push({ name: t("Service (%)", "الخدمة (%)"), value: parseFloat(res.tauxService.value.toFixed(1)), color: CHART_COLOR[res.tauxService.status] });
    }
    if (res.tauxRupture) {
      data.push({ name: t("Rupture (%)", "النقص (%)"), value: parseFloat(res.tauxRupture.value.toFixed(1)), color: CHART_COLOR[res.tauxRupture.status] });
    }
    return data;
  }

  // ── Status label via t() ──────────────────────────────────────────────────
  function statusLabel(s: KpiStatus) {
    return s === "good"
      ? t("Bon", "جيد")
      : s === "medium"
      ? t("Moyen", "متوسط")
      : t("Mauvais", "ضعيف");
  }

  const periodLabel = PERIODS.find(p => p.value === period);

  // ═════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════════
  return (
    <div className={`min-h-[100dvh] bg-muted/20 ${isAr ? "rtl" : "ltr"}`} dir={isAr ? "rtl" : "ltr"}>
      <main className="container mx-auto px-4 py-8 space-y-8 max-w-5xl">

        {/* ── Back + breadcrumb ──────────────────────────────────────────── */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/supply-chain" className="hover:text-primary transition-colors flex items-center gap-1">
            <ChevronLeft className={`w-4 h-4 ${isAr ? "rotate-180" : ""}`} />
            {t("Gestion de la Chaîne d'Approvisionnement", "إدارة سلاسل الإمداد")}
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{t("Indicateurs de Performance", "مؤشرات الأداء")}</span>
        </div>

        {/* ── Hero banner ───────────────────────────────────────────────── */}
        <section className="bg-primary text-primary-foreground rounded-xl p-6 md:p-8 shadow relative overflow-hidden">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 bg-primary-foreground/15 rounded-full px-3 py-1 text-xs font-medium mb-4">
              <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
              {t("Module — Indicateurs de Performance SC", "وحدة — مؤشرات أداء سلسلة الإمداد")}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">
              {t("Indicateurs de Performance de la Chaîne d'Approvisionnement", "مؤشرات الأداء الرئيسية — سلسلة الإمداد")}
            </h1>
            <p className="text-primary-foreground/80 max-w-2xl text-sm leading-relaxed">
              {t(
                "Calculez et analysez vos KPI logistiques clés : taux de rotation, taux de service, coût d'approvisionnement et taux de rupture — avec benchmarks et recommandations.",
                "احسب وحلّل مؤشراتك اللوجستية الرئيسية: معدل الدوران، نسبة الخدمة، تكلفة الإمداد ونسبة النقص — مع معايير مرجعية وتوصيات.",
              )}
            </p>
          </div>
          <div className="absolute -right-16 -bottom-16 opacity-10 pointer-events-none">
            <BarChart3 className="w-64 h-64" />
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            FORM
        ════════════════════════════════════════════════════════════════ */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="w-8 h-8 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-4 h-4" />
                </div>
                {t("Paramètres de l'Analyse", "معاملات التحليل")}
              </CardTitle>
              {results && (
                <Button variant="outline" size="sm" onClick={handleReset} className="gap-1">
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t("Réinitialiser", "إعادة تهيئة")}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* ── General info ──────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b">
              <div className="space-y-1.5">
                <Label htmlFor="problem-name" className="text-sm font-medium">
                  {t("Nom du problème", "اسم المسألة")}
                </Label>
                <Input
                  id="problem-name"
                  value={problemName}
                  onChange={e => { setProblemName(e.target.value); if (results) setStale(true); }}
                  placeholder={t("ex. Bilan SC — T1 2026", "مثال: تحليل سلسلة الإمداد — 2026")}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t("Période d'analyse", "فترة التحليل")}</Label>
                <div className="flex gap-2">
                  {PERIODS.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => { setPeriod(p.value); if (results) setStale(true); }}
                      className={[
                        "flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all",
                        period === p.value
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground",
                      ].join(" ")}
                    >
                      {isAr ? p.ar : p.fr}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── KPI section toggles ────────────────────────────────────── */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">{t("Indicateurs à analyser", "المؤشرات المراد تحليلها")}</p>
              <p className="text-xs text-muted-foreground">{t("Activez les sections dont vous disposez des données. Chaque indicateur est optionnel.", "فعّل الأقسام التي لديك بياناتها. كل مؤشر اختياري.")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <SectionToggle icon={RotateCcw}     title={t("Taux de Rotation des Stocks",  "معدل دوران المخزون")} active={secStorage}  onToggle={() => { setSecStorage(v => !v);  if (results) setStale(true); }} />
                <SectionToggle icon={TrendingUp}    title={t("Taux de Service",               "نسبة الخدمة")}        active={secService}  onToggle={() => { setSecService(v => !v);  if (results) setStale(true); }} />
                <SectionToggle icon={Truck}         title={t("Coût d'Approvisionnement Total","تكلفة الإمداد الإجمالية")} active={secCost} onToggle={() => { setSecCost(v => !v);     if (results) setStale(true); }} />
                <SectionToggle icon={AlertTriangle} title={t("Taux de Rupture de Stock",     "نسبة النقص من المخزون")} active={secStockout} onToggle={() => { setSecStockout(v => !v); if (results) setStale(true); }} />
              </div>
            </div>

            {/* ── Section 1: Storage rotation ───────────────────────────── */}
            {secStorage && (
              <div className="bg-muted/30 rounded-xl p-4 space-y-3 border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <RotateCcw className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm text-primary">{t("Taux de Rotation des Stocks", "معدل دوران المخزون")}</span>
                </div>
                <p className="text-xs text-muted-foreground italic mb-2">
                  {t("Formule : Taux de rotation = Coût des ventes ÷ Valeur moyenne du stock", "الصيغة: معدل الدوران = تكلفة المبيعات ÷ متوسط قيمة المخزون")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <NumInput
                    id="cout-ventes"
                    label={t("Coût des ventes (DA)", "تكلفة المبيعات (دج)")}
                    value={coutVentes}
                    onChange={v => { setCoutVentes(v); if (results) setStale(true); }}
                    placeholder="ex. 5000000"
                  />
                  <NumInput
                    id="valeur-moy-stock"
                    label={t("Valeur moyenne du stock (DA)", "متوسط قيمة المخزون (دج)")}
                    value={valeurMoyenneStock}
                    onChange={v => { setValeurMoyStock(v); if (results) setStale(true); }}
                    placeholder="ex. 1200000"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("Benchmarks : < 2× mauvais · 2–6× moyen · ≥ 6× bon", "المعايير: < ٢× ضعيف · ٢–٦× متوسط · ≥ ٦× جيد")}
                </p>
              </div>
            )}

            {/* ── Section 2: Service rate ───────────────────────────────── */}
            {secService && (
              <div className="bg-muted/30 rounded-xl p-4 space-y-3 border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm text-primary">{t("Taux de Service", "نسبة الخدمة")}</span>
                </div>
                <p className="text-xs text-muted-foreground italic mb-2">
                  {t("Formule : Taux de service = (Commandes livrées à temps / Total) × 100", "الصيغة: نسبة الخدمة = (الطلبيات المسلّمة في الوقت ÷ الإجمالي) × ١٠٠")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <NumInput
                    id="cmds-livrees"
                    label={t("Commandes livrées à temps et complètes", "الطلبيات المسلّمة في الوقت وبالكامل")}
                    value={commandesLivrees}
                    onChange={v => { setCommandesLivrees(v); if (results) setStale(true); }}
                    placeholder="ex. 472"
                  />
                  <NumInput
                    id="cmds-totales"
                    label={t("Total des commandes", "إجمالي الطلبيات")}
                    value={commandesTotales}
                    onChange={v => { setCommandesTotales(v); if (results) setStale(true); }}
                    placeholder="ex. 500"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("Benchmarks : < 90% mauvais · 90–95% moyen · ≥ 95% bon", "المعايير: < ٩٠% ضعيف · ٩٠–٩٥% متوسط · ≥ ٩٥% جيد")}
                </p>
              </div>
            )}

            {/* ── Section 3: Supply cost ────────────────────────────────── */}
            {secCost && (
              <div className="bg-muted/30 rounded-xl p-4 space-y-3 border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <Truck className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm text-primary">{t("Coût d'Approvisionnement Total", "تكلفة الإمداد الإجمالية")}</span>
                </div>
                <p className="text-xs text-muted-foreground italic mb-2">
                  {t("Coût total = Transport + Stockage + Commande + Rupture", "التكلفة الإجمالية = نقل + تخزين + طلب + نقص")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <NumInput id="cout-transport" label={t("Coût de transport (DA)", "تكلفة النقل (دج)")}      value={coutTransport} onChange={v => { setCoutTransport(v); if (results) setStale(true); }} placeholder="ex. 800000" />
                  <NumInput id="cout-stockage"  label={t("Coût de stockage (DA)", "تكلفة التخزين (دج)")}     value={coutStockage}  onChange={v => { setCoutStockage(v);  if (results) setStale(true); }} placeholder="ex. 350000" />
                  <NumInput id="cout-commande"  label={t("Coût de commande (DA)", "تكلفة الطلب (دج)")}       value={coutCommande}  onChange={v => { setCoutCommande(v);  if (results) setStale(true); }} placeholder="ex. 120000" />
                  <NumInput id="cout-rupture"   label={t("Coût de rupture (DA)", "تكلفة النقص (دج)")}        value={coutRupture}   onChange={v => { setCoutRupture(v);   if (results) setStale(true); }} placeholder="ex. 60000"  />
                </div>
              </div>
            )}

            {/* ── Section 4: Stockout ───────────────────────────────────── */}
            {secStockout && (
              <div className="bg-muted/30 rounded-xl p-4 space-y-3 border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm text-primary">{t("Taux de Rupture de Stock", "نسبة النقص من المخزون")}</span>
                </div>
                <p className="text-xs text-muted-foreground italic mb-2">
                  {t("Formule : Taux de rupture = (Ruptures / Total commandes) × 100", "الصيغة: نسبة النقص = (حالات النقص ÷ إجمالي الطلبيات) × ١٠٠")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <NumInput
                    id="nb-ruptures"
                    label={t("Nombre de ruptures", "عدد حالات النقص")}
                    value={nombreRuptures}
                    onChange={v => { setNombreRuptures(v); if (results) setStale(true); }}
                    placeholder="ex. 18"
                  />
                  <NumInput
                    id="nb-total-cmds-rup"
                    label={t("Nombre total de commandes", "إجمالي الطلبيات")}
                    value={nombreTotalCmdsRup}
                    onChange={v => { setNombreTotalCmdsRup(v); if (results) setStale(true); }}
                    placeholder="ex. 500"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("Benchmarks : > 5% mauvais · 1–5% moyen · ≤ 1% bon", "المعايير: > ٥% ضعيف · ١–٥% متوسط · ≤ ١% جيد")}
                </p>
              </div>
            )}

            {/* ── Compute button ─────────────────────────────────────────── */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={handleCompute}
                disabled={!canCompute}
                className="gap-2 font-semibold"
                size="lg"
              >
                {stale ? <RefreshCw className="w-4 h-4" /> : <Calculator className="w-4 h-4" />}
                {stale ? t("Recalculer", "إعادة الحساب") : t("Calculer les KPI", "احسب المؤشرات")}
              </Button>
              {!canCompute && (
                <p className="text-xs text-muted-foreground">
                  {t("Activez au moins un indicateur et renseignez ses données.", "فعّل مؤشراً واحداً على الأقل وأدخل بياناته.")}
                </p>
              )}
            </div>

          </CardContent>
        </Card>

        {/* ════════════════════════════════════════════════════════════════
            RESULTS
        ════════════════════════════════════════════════════════════════ */}
        {results && (
          <div ref={resultsRef} className="space-y-6">

            {/* ── Stale notice ──────────────────────────────────────────── */}
            {stale && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-amber-800">
                <RefreshCw className="w-4 h-4 flex-shrink-0" />
                {t("Les données ont changé. Recalculez pour mettre les résultats à jour.", "تغيّرت البيانات. أعد الحساب لتحديث النتائج.")}
              </div>
            )}

            {/* ── KPI summary cards ──────────────────────────────────────── */}
            <div>
              <h2 className="text-xl font-bold mb-1">{t("Tableau de Bord — KPI", "لوحة المؤشرات — KPI")}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {results.problemName} · {isAr ? periodLabel?.ar : periodLabel?.fr} · {results.activeCount} {t("indicateur(s) analysé(s)", "مؤشر محلَّل")}
              </p>
              <div className={`grid gap-4 ${results.activeCount === 1 ? "grid-cols-1 max-w-sm" : results.activeCount === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2"}`}>

                {results.tauxRotation && (
                  <div className={`rounded-xl border p-5 ${STATUS_BG[results.tauxRotation.status]}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${STATUS_DOT[results.tauxRotation.status]}`} />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t("Rotation des Stocks", "دوران المخزون")}
                        </span>
                      </div>
                      <Badge variant="outline" className={`${STATUS_COLOR[results.tauxRotation.status]} border-current text-xs font-bold`}>
                        {statusLabel(results.tauxRotation.status)}
                      </Badge>
                    </div>
                    <div className={`text-4xl font-black mb-1 ${STATUS_COLOR[results.tauxRotation.status]}`}>
                      {fRot(results.tauxRotation.value)}
                    </div>
                    <p className="text-xs text-muted-foreground">{t("Seuil excellent : ≥ 6×", "المعيار الجيد: ≥ ٦×")}</p>
                    <div className="mt-3 h-1.5 rounded-full bg-black/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-current transition-all"
                        style={{ width: `${results.tauxRotation.score}%`, color: CHART_COLOR[results.tauxRotation.status] }}
                      />
                    </div>
                    <p className="text-xs mt-1 text-muted-foreground">{t("Score de performance", "نقاط الأداء")} : {results.tauxRotation.score}/100</p>
                  </div>
                )}

                {results.tauxService && (
                  <div className={`rounded-xl border p-5 ${STATUS_BG[results.tauxService.status]}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${STATUS_DOT[results.tauxService.status]}`} />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t("Taux de Service", "نسبة الخدمة")}
                        </span>
                      </div>
                      <Badge variant="outline" className={`${STATUS_COLOR[results.tauxService.status]} border-current text-xs font-bold`}>
                        {statusLabel(results.tauxService.status)}
                      </Badge>
                    </div>
                    <div className={`text-4xl font-black mb-1 ${STATUS_COLOR[results.tauxService.status]}`}>
                      {fPct(results.tauxService.value)}
                    </div>
                    <p className="text-xs text-muted-foreground">{t("Seuil excellent : ≥ 95%", "المعيار الجيد: ≥ ٩٥%")}</p>
                    <div className="mt-3 h-1.5 rounded-full bg-black/10 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${results.tauxService.score}%`, backgroundColor: CHART_COLOR[results.tauxService.status] }}
                      />
                    </div>
                    <p className="text-xs mt-1 text-muted-foreground">{t("Score de performance", "نقاط الأداء")} : {results.tauxService.score}/100</p>
                  </div>
                )}

                {results.coutTotal && (
                  <div className="rounded-xl border p-5 bg-blue-50 border-blue-200">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t("Coût d'Approvisionnement", "تكلفة الإمداد")}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-blue-700 border-blue-300 text-xs font-bold">
                        {t("Calculé", "محسوب")}
                      </Badge>
                    </div>
                    <div className="text-3xl font-black mb-1 text-blue-700">
                      {fDA(results.coutTotal.value)}
                    </div>
                    <div className="mt-2 space-y-1">
                      {[
                        [t("Transport", "النقل"),   results.coutTotal.breakdown.coutTransport],
                        [t("Stockage", "التخزين"),  results.coutTotal.breakdown.coutStockage],
                        [t("Commande", "الطلب"),    results.coutTotal.breakdown.coutCommande],
                        [t("Rupture", "النقص"),     results.coutTotal.breakdown.coutRupture],
                      ].filter(([, v]) => (v as number) > 0).map(([label, val]) => (
                        <div key={label as string} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{label as string}</span>
                          <span className="font-mono font-semibold text-blue-800">{fDA(val as number)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {results.tauxRupture && (
                  <div className={`rounded-xl border p-5 ${STATUS_BG[results.tauxRupture.status]}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${STATUS_DOT[results.tauxRupture.status]}`} />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t("Taux de Rupture", "نسبة النقص")}
                        </span>
                      </div>
                      <Badge variant="outline" className={`${STATUS_COLOR[results.tauxRupture.status]} border-current text-xs font-bold`}>
                        {statusLabel(results.tauxRupture.status)}
                      </Badge>
                    </div>
                    <div className={`text-4xl font-black mb-1 ${STATUS_COLOR[results.tauxRupture.status]}`}>
                      {fPct(results.tauxRupture.value)}
                    </div>
                    <p className="text-xs text-muted-foreground">{t("Seuil excellent : ≤ 1%", "المعيار الجيد: ≤ ١%")}</p>
                    <div className="mt-3 h-1.5 rounded-full bg-black/10 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${results.tauxRupture.score}%`, backgroundColor: CHART_COLOR[results.tauxRupture.status] }}
                      />
                    </div>
                    <p className="text-xs mt-1 text-muted-foreground">{t("Score de performance", "نقاط الأداء")} : {results.tauxRupture.score}/100</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Charts ─────────────────────────────────────────────────── */}
            {(() => {
              const radarData = buildRadarData(results);
              const barData   = buildBarData(results);
              const showRadar = radarData.length >= 2;
              return (
                <div className={`grid gap-6 ${showRadar ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>

                  {/* Radar */}
                  {showRadar && (
                    <Card className="border shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{t("Radar de Performance", "رادار الأداء")}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={240}>
                          <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                            <PolarGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <PolarAngleAxis dataKey="kpi" tick={{ fontSize: 11, fill: "#6b7280" }} />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: "#9ca3af" }} />
                            <Radar
                              name={t("Score", "النقاط")}
                              dataKey="score"
                              stroke="#004d40"
                              fill="#004d40"
                              fillOpacity={0.25}
                              strokeWidth={2}
                            />
                            <Tooltip
                              formatter={(v: number) => [`${v}/100`, t("Score", "النقاط")]}
                              contentStyle={{ fontSize: 11, borderRadius: 6 }}
                            />
                          </RadarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}

                  {/* Bar chart */}
                  {barData.length > 0 && (
                    <Card className="border shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{t("Valeurs des Indicateurs", "قيم المؤشرات")}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={240}>
                          <BarChart data={barData} margin={{ top: 10, right: 16, left: 0, bottom: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b7280" }} angle={-20} textAnchor="end" interval={0} />
                            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
                            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                              {barData.map((entry, i) => (
                                <Cell key={i} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}
                </div>
              );
            })()}

            {/* ── Analysis ───────────────────────────────────────────────── */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  {t("Analyse de la Situation", "تحليل الوضع")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {buildAnalysisLines(results).map((line, i) => (
                  <p
                    key={i}
                    className="bg-muted/40 border border-border rounded-lg px-4 py-3 text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: line }}
                  />
                ))}
              </CardContent>
            </Card>

            {/* ── Recommendations ───────────────────────────────────────── */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  {t("Recommandations Managériales", "التوصيات الإدارية")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {buildRecommendations(results).map((r, i) => (
                  <div
                    key={i}
                    className="border border-border rounded-lg px-4 py-3 flex gap-3"
                    style={{ borderLeftWidth: isAr ? 1 : 3, borderRightWidth: isAr ? 3 : 1, borderLeftColor: isAr ? undefined : "#004d40", borderRightColor: isAr ? "#004d40" : undefined }}
                  >
                    <span className="text-lg flex-shrink-0">{r.icon}</span>
                    <div>
                      <p className="font-semibold text-sm mb-0.5">{r.title}</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{r.desc}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* ── Action bar ─────────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-3 pb-8">
              {/* Save */}
              <Button onClick={handleSave} disabled={isSaving || savedOk} variant="outline" className="gap-2">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : savedOk ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Save className="w-4 h-4" />}
                {savedOk ? t("Enregistré !", "تم الحفظ!") : t("Enregistrer dans le registre", "حفظ في السجل")}
              </Button>

              {saveError && (
                <div className="flex items-center gap-1.5 text-red-600 text-sm">
                  <XCircle className="w-4 h-4" />
                  {saveError}
                </div>
              )}

              {/* PDF */}
              <Button onClick={handlePDF} disabled={!!pdfStep} className="gap-2">
                {pdfStep ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {pdfStep ? `${t("Export PDF", "تصدير PDF")} ${pdfStep}` : t("Exporter en PDF", "تصدير PDF")}
              </Button>

              {/* Reset */}
              <Button variant="ghost" onClick={handleReset} className="gap-2 text-muted-foreground">
                <RotateCcw className="w-4 h-4" />
                {t("Nouvelle analyse", "تحليل جديد")}
              </Button>
            </div>

          </div>
        )}

      </main>
    </div>
  );
}
