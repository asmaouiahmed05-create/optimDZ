import { useState, useRef } from "react";
import { useLanguage } from "@/lib/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Users2, Plus, Trash2, Calculator, Save, FileText,
  CheckCircle2, Loader2, BarChart2, Lightbulb, AlertTriangle,
  Trophy, RefreshCw,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  computeSupplierSelection, weightsSum,
  type Criterion, type Supplier, type SupplierResult, type SupplierAnalysis,
} from "@/lib/supplierAlgorithm";
import { generateSupplierPDF } from "@/lib/generateSupplierPDF";

// ── ID helpers ────────────────────────────────────────────────────────────────
let _cid = 0;
let _sid = 0;
function cId(): string { return `c${++_cid}`; }
function sId(): string { return `s${++_sid}`; }

function fNum(n: number, d = 1): string {
  return n.toLocaleString("fr-DZ", { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

// ── Defaults ──────────────────────────────────────────────────────────────────
const DEFAULT_CRITERIA: Criterion[] = [
  { id: cId(), name: "Prix",              weight: 30 },
  { id: cId(), name: "Qualité",           weight: 30 },
  { id: cId(), name: "Délai livraison",   weight: 20 },
  { id: cId(), name: "Fiabilité",         weight: 20 },
];

function defaultScore(cName: string, sIdx: number, scale: 10 | 100): number {
  // Pre-populate a plausible example table so the user sees a live demo
  const patterns: Record<string, number[]> = {
    "Prix":            [7, 9, 6],
    "Qualité":         [9, 7, 8],
    "Délai livraison": [8, 6, 9],
    "Fiabilité":       [8, 8, 7],
  };
  const base = patterns[cName]?.[sIdx] ?? 7;
  return scale === 10 ? base : base * 10;
}

function mkDefaultSuppliers(criteria: Criterion[], scale: 10 | 100): Supplier[] {
  const names = ["Fournisseur A", "Fournisseur B", "Fournisseur C"];
  return names.map((name, i) => {
    const scores: Record<string, number> = {};
    criteria.forEach(c => { scores[c.id] = defaultScore(c.name, i, scale); });
    return { id: sId(), name, scores };
  });
}

// ── Rank medal ────────────────────────────────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg">🥇</span>;
  if (rank === 2) return <span className="text-lg">🥈</span>;
  if (rank === 3) return <span className="text-lg">🥉</span>;
  return <span className="text-sm font-bold text-muted-foreground">#{rank}</span>;
}

// ── Weight indicator ──────────────────────────────────────────────────────────
function WeightIndicator({ sum, t }: { sum: number; t: (fr: string, ar: string) => string }) {
  const ok  = Math.abs(sum - 100) < 0.01;
  const low = sum < 100;
  return (
    <div className={cn(
      "flex items-center gap-2 text-sm font-semibold rounded-lg px-3 py-1.5 transition-colors",
      ok  ? "bg-green-50 text-green-700 border border-green-200" :
      low ? "bg-amber-50 text-amber-700 border border-amber-200" :
            "bg-red-50 text-red-700 border border-red-200"
    )}>
      {ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
      {t("Total poids :", "مجموع الأوزان:")} {fNum(sum, 1)}%
      {ok
        ? <span className="text-xs font-normal">{t("✓ Valide", "✓ صحيح")}</span>
        : <span className="text-xs font-normal">
            {low
              ? t(`(manque ${fNum(100 - sum, 1)}%)`, `(ناقص ${fNum(100 - sum, 1)}%)`)
              : t(`(excès ${fNum(sum - 100, 1)}%)`, `(زائد ${fNum(sum - 100, 1)}%)`)
            }
          </span>
      }
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SupplierSelection() {
  const { t, language } = useLanguage();
  const isAr = language === "ar";

  const [scale, setScale]             = useState<10 | 100>(10);
  const [problemName, setProblemName] = useState("");
  const [criteria, setCriteria]       = useState<Criterion[]>(DEFAULT_CRITERIA);
  const [suppliers, setSuppliers]     = useState<Supplier[]>(() => mkDefaultSuppliers(DEFAULT_CRITERIA, 10));

  const [results, setResults]     = useState<SupplierResult[] | null>(null);
  const [analysis, setAnalysis]   = useState<SupplierAnalysis | null>(null);
  const [resultStale, setResultStale] = useState(false);

  const [isSaving, setIsSaving]   = useState(false);
  const [savedOk, setSavedOk]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pdfProgress, setPdfProgress] = useState<string | null>(null);

  const resultsRef = useRef<HTMLDivElement>(null);

  const wSum = weightsSum(criteria);
  const weightsOk = Math.abs(wSum - 100) < 0.01;

  // ── Criteria helpers ──────────────────────────────────────────────────────────
  function addCriterion() {
    const newC: Criterion = { id: cId(), name: "", weight: 0 };
    setCriteria(prev => [...prev, newC]);
    setSuppliers(prev => prev.map(s => ({ ...s, scores: { ...s.scores, [newC.id]: 0 } })));
    setResultStale(true);
  }
  function removeCriterion(cid: string) {
    if (criteria.length <= 1) return;
    setCriteria(prev => prev.filter(c => c.id !== cid));
    setSuppliers(prev => prev.map(s => {
      const sc = { ...s.scores }; delete sc[cid]; return { ...s, scores: sc };
    }));
    setResultStale(true);
  }
  function updateCriterion(cid: string, patch: Partial<Criterion>) {
    setCriteria(prev => prev.map(c => c.id === cid ? { ...c, ...patch } : c));
    setResultStale(true);
  }

  // ── Supplier helpers ──────────────────────────────────────────────────────────
  function addSupplier() {
    const scores: Record<string, number> = {};
    criteria.forEach(c => { scores[c.id] = 0; });
    setSuppliers(prev => [...prev, { id: sId(), name: "", scores }]);
    setResultStale(true);
  }
  function removeSupplier(sid: string) {
    if (suppliers.length <= 1) return;
    setSuppliers(prev => prev.filter(s => s.id !== sid));
    setResultStale(true);
  }
  function updateSupplierName(sid: string, name: string) {
    setSuppliers(prev => prev.map(s => s.id === sid ? { ...s, name } : s));
    setResultStale(true);
  }
  function updateScore(sid: string, cid: string, val: number) {
    const clamped = Math.max(0, Math.min(scale, val));
    setSuppliers(prev => prev.map(s =>
      s.id === sid ? { ...s, scores: { ...s.scores, [cid]: clamped } } : s
    ));
    setResultStale(true);
  }

  // ── Scale change ──────────────────────────────────────────────────────────────
  function handleScaleChange(newScale: 10 | 100) {
    if (newScale === scale) return;
    const factor = newScale === 100 ? 10 : 0.1;
    setSuppliers(prev => prev.map(s => {
      const scores: Record<string, number> = {};
      Object.entries(s.scores).forEach(([k, v]) => { scores[k] = Math.round(v * factor); });
      return { ...s, scores };
    }));
    setScale(newScale);
    setResults(null); setAnalysis(null); setResultStale(false);
  }

  // ── Solve ─────────────────────────────────────────────────────────────────────
  function handleSolve() {
    setResultStale(false);
    const { results: res, analysis: ana } = computeSupplierSelection(suppliers, criteria, scale);
    setResults(res);
    setAnalysis(ana);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  // ── Analysis text ─────────────────────────────────────────────────────────────
  function buildAnalysisLines(): string[] {
    if (!analysis || !results) return [];
    const top = analysis.topSupplier;
    const runner = analysis.runnerUp;
    const driving = analysis.drivingCriterion;
    const supplierName = (result: SupplierResult) =>
      result.name || t(`fournisseur ${result.rank}`, `المورد ${result.rank}`);
    const ranking = results
      .map(result => `${supplierName(result)} (${fNum(result.totalScore, 1)} points)`)
      .join(", ");
    const criterionWeights = criteria
      .map(c => `${c.name || t("critère", "المعيار")} (${fNum(c.weight, 1)} %)`)
      .join(", ");
    const contributionSummary = (result: SupplierResult) => criteria
      .map(c => `${c.name || t("critère", "المعيار")} : ${fNum(result.weightedScores[c.id] ?? 0, 1)} ${t("points pondérés", "نقطة مرجّحة")}`)
      .join(", ");
    const topStrengths = [...criteria]
      .sort((a, b) => (top.weightedScores[b.id] ?? 0) - (top.weightedScores[a.id] ?? 0))
      .slice(0, 2)
      .map(c => `${c.name || t("critère", "المعيار")} (${fNum(top.scores[c.id] ?? 0, 1)} ${t("sur", "من")} ${scale}, ${fNum(top.weightedScores[c.id] ?? 0, 1)} ${t("points apportés", "نقطة مساهمة")})`)
      .join(t(" et ", " و"));

    const lines: string[] = [
      t(
        `L'évaluation compare ${results.length} fournisseurs selon ${criteria.length} critères. Les poids retenus sont ${criterionWeights}. Le classement final est : ${ranking}. "${supplierName(top)}" arrive donc en tête avec ${fNum(top.totalScore, 1)} points sur 100. Sa position s'explique surtout par ses meilleures contributions sur ${topStrengths}, tandis que le critère le plus déterminant pour la décision est "${driving.name}" avec un poids de ${fNum(driving.weight, 1)} %.`,
        `يقارن التقييم بين ${results.length} موردين وفق ${criteria.length} معايير. الأوزان المعتمدة هي ${criterionWeights}. الترتيب النهائي هو: ${ranking}. لذلك يتصدر "${supplierName(top)}" بنتيجة ${fNum(top.totalScore, 1)} نقطة من 100. ويعود تقدمه أساساً إلى مساهماته الأقوى في ${topStrengths}، بينما يبقى "${driving.name}" المعيار الأكثر تأثيراً بوزن ${fNum(driving.weight, 1)}%.`
      ),
      ...results.map(result => t(
        `Pour "${supplierName(result)}", le score final de ${fNum(result.totalScore, 1)} points se compose de ${contributionSummary(result)}. Cette lecture montre précisément quelles performances soutiennent ou limitent sa position dans le classement.`,
        `بالنسبة إلى "${supplierName(result)}"، تتكون النتيجة النهائية البالغة ${fNum(result.totalScore, 1)} نقطة من ${contributionSummary(result)}. يوضح هذا التفصيل الأداء الذي يدعم مركزه أو يحد منه في الترتيب.`
      )),
    ];

    if (runner) {
      lines.push(t(
        analysis.tooClose
          ? `"${supplierName(top)}" ne devance "${supplierName(runner)}" que de ${fNum(analysis.gapAbsolute, 1)} points, soit ${fNum(analysis.gapPct, 1)} % de sa note. L'écart est suffisamment faible pour que le deuxième fournisseur reste une alternative crédible.`
          : `"${supplierName(top)}" devance "${supplierName(runner)}" de ${fNum(analysis.gapAbsolute, 1)} points, soit ${fNum(analysis.gapPct, 1)} % de sa note. Cet avantage sépare clairement le premier choix de l'alternative immédiate.`,
        analysis.tooClose
          ? `"${supplierName(top)}" لا يتقدم على "${supplierName(runner)}" إلا بفارق ${fNum(analysis.gapAbsolute, 1)} نقطة، أي ${fNum(analysis.gapPct, 1)}% من نتيجته. الفارق محدود بما يكفي ليبقى المورد الثاني بديلاً موثوقاً.`
          : `يتقدم "${supplierName(top)}" على "${supplierName(runner)}" بفارق ${fNum(analysis.gapAbsolute, 1)} نقطة، أي ${fNum(analysis.gapPct, 1)}% من نتيجته. ويفصل هذا التفوق بوضوح بين الخيار الأول والبديل المباشر.`
      ));
    }

    if (analysis.weakPoints.length > 0) {
      const weakPoints = analysis.weakPoints
        .map(w => `"${w.criterionName}" (${fNum(w.rawScore, 1)} ${t("sur", "من")} ${fNum(w.maxScore, 1)}, poids ${fNum(w.weight, 1)} %)`)
        .join(", ");
      lines.push(t(
        `"${supplierName(top)}" reste le meilleur choix, mais ses points de vigilance sont ${weakPoints}. Ils doivent être couverts dans le contrat pour éviter qu'une faiblesse sur un critère important ne réduise l'avantage observé.`,
        `يبقى "${supplierName(top)}" الخيار الأفضل، لكن نقاط الانتباه لديه هي ${weakPoints}. ينبغي تغطية هذه الجوانب في العقد حتى لا يؤدي ضعف معيار مهم إلى تقليص التفوق المسجل.`
      ));
    }

    lines.push(t(
      analysis.tooClose && runner
        ? `La décision pratique est de contractualiser en priorité avec "${supplierName(top)}", tout en partageant une partie des volumes avec "${supplierName(runner)}" afin de limiter la dépendance et le risque de rupture.`
        : `La décision pratique est de contractualiser avec "${supplierName(top)}" et de conserver "${runner ? supplierName(runner) : t("le meilleur fournisseur suivant", "المورد التالي الأفضل")}" comme solution de secours. Le choix doit être confirmé par une négociation sur les conditions de livraison, la qualité et les engagements de service.`,
      analysis.tooClose && runner
        ? `القرار العملي هو إبرام العقد أولاً مع "${supplierName(top)}" مع توزيع جزء من الكميات على "${supplierName(runner)}" للحد من التبعية ومخاطر انقطاع التوريد.`
        : `القرار العملي هو إبرام العقد مع "${supplierName(top)}" والاحتفاظ بـ"${runner ? supplierName(runner) : "المورد التالي الأفضل"}" كخيار احتياطي. ويُؤكّد الاختيار بالتفاوض حول شروط التسليم والجودة والتزامات الخدمة.`
    ));

    return lines;
  }

  function buildSuggestions(): { icon: string; title: string; desc: string; color: string; borderColor: string }[] {
    if (!analysis || !results) return [];
    const top    = analysis.topSupplier;
    const runner = analysis.runnerUp;
    const sugs: { icon: string; title: string; desc: string; color: string; borderColor: string }[] = [];

    const topName = top.name || t(`fournisseur ${top.rank}`, `المورد ${top.rank}`);
    const runnerName = runner?.name || (runner ? t(`fournisseur ${runner.rank}`, `المورد ${runner.rank}`) : "");

    // Primary recommendation: negotiate with the ranked winner
    sugs.push({
      icon: "🤝", color: "bg-green-50", borderColor: "border-l-green-500",
      title: t(
        `Négociez et contractualisez avec "${topName}"`,
        `تفاوض وأبرم عقداً مع "${topName}"`
      ),
      desc: t(
        `Avec ${fNum(top.totalScore, 1)} points sur 100, "${topName}" est le choix recommandé. Négociez les volumes, les délais de paiement et les conditions de livraison en vous appuyant sur ses critères les plus solides.`,
        `بنتيجة ${fNum(top.totalScore, 1)} نقطة من 100، يُعدّ "${topName}" الخيار الموصى به. تفاوض على الكميات وآجال الدفع وشروط التسليم مع الاستناد إلى معاييره الأقوى.`
      ),
    });

    // Double sourcing if close
    if (runner && analysis.tooClose) {
      sugs.push({
        icon: "⚖️", color: "bg-blue-50", borderColor: "border-l-blue-500",
        title: t(
          `Double sourcing : "${topName}" + "${runnerName}"`,
          `توريد مزدوج: "${topName}" + "${runnerName}"`
        ),
        desc: t(
          `L'écart de ${fNum(analysis.gapAbsolute, 1)} points justifie une stratégie de double sourcing : allouez la majorité des volumes à "${topName}" et le solde à "${runnerName}" pour réduire la dépendance et le risque de rupture.`,
          `الفارق البالغ ${fNum(analysis.gapAbsolute, 1)} نقطة يبرر استراتيجية التوريد المزدوج: خصّص غالبية الكميات لـ"${topName}" والباقي لـ"${runnerName}" للحد من التبعية ومخاطر الانقطاع.`
        ),
      });
    }

    // Weak points risk
    if (analysis.weakPoints.length > 0) {
      const criteriaNames = analysis.weakPoints.map(w => w.criterionName).join(", ");
      sugs.push({
        icon: "⚠️", color: "bg-amber-50", borderColor: "border-l-amber-500",
        title: t(
          `Sécurisez "${topName}" sur : ${criteriaNames}`,
          `أمّن أداء "${topName}" في: ${criteriaNames}`
        ),
        desc: t(
          `Regroupez dans le contrat les engagements de "${topName}" sur ces critères : pénalités de retard, audits qualité et solution de secours. Une seule clause de suivi couvre ainsi toutes les faiblesses identifiées.`,
          `اجمع في العقد التزامات "${topName}" بشأن هذه المعايير: عقوبات التأخير وتدقيقات الجودة وخيار التوريد الاحتياطي. يغطي بند متابعة واحد جميع نقاط الضعف المحددة.`
        ),
      });
    }

    // General: review periodically
    if (sugs.length < 2) {
      sugs.push({
        icon: "🔄", color: "bg-green-50", borderColor: "border-l-green-500",
        title: t("Réévaluez annuellement le panel fournisseurs", "راجع قائمة الموردين سنوياً"),
        desc: t(
          "L'évaluation multicritère n'est pas définitive : révisez les scores au moins une fois par an, ajoutez de nouveaux fournisseurs potentiels, et adaptez les poids des critères à l'évolution de la stratégie de l'entreprise.",
          "التقييم متعدد المعايير ليس نهائياً: راجع النقاط مرة على الأقل كل سنة، أضف موردين محتملين جدداً، وكيّف أوزان المعايير وفق تطور استراتيجية المؤسسة."
        ),
      });
    }

    return sugs;
  }

  const analysisLines = results ? buildAnalysisLines() : [];
  const suggestions   = results ? buildSuggestions()   : [];

  // ── Save ──────────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!results) return;
    setIsSaving(true); setSavedOk(false); setSaveError(null);
    try {
      const body = {
        type: "supplier-selection",
        problemName, scale, criteria, suppliers, results,
      };
      const res = await fetch("/api/problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemData: body, result: body }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : t("Erreur", "خطأ"));
    } finally {
      setIsSaving(false);
    }
  }

  // ── PDF ───────────────────────────────────────────────────────────────────────
  async function handlePDF() {
    if (!results) return;
    try {
      setPdfProgress(t("Génération en cours…", "جارٍ الإنشاء…"));
      await generateSupplierPDF({
        problemName: problemName || t("Sélection des Fournisseurs", "اختيار الموردين"),
        criteria, results, analysis,
        analysisLines, suggestions, scale,
        onProgress: step => setPdfProgress(step),
      });
    } finally {
      setPdfProgress(null);
    }
  }

  // ── Bar chart data ────────────────────────────────────────────────────────────
  const chartData = results?.map(r => ({
    name: r.name.length > 14 ? r.name.slice(0, 12) + "…" : r.name,
    score: r.totalScore,
    rank: r.rank,
  }));

  const CHART_COLORS = [
    "#004d40", "#2e7d32", "#1565c0", "#6a1b9a", "#e65100",
    "#37474f", "#00838f", "#ad1457",
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className={cn("container mx-auto px-4 py-8 max-w-6xl space-y-8", isAr ? "rtl" : "ltr")} dir={isAr ? "rtl" : "ltr"}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="p-2 bg-primary/10 rounded-xl text-primary">
            <Users2 className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            {t("Sélection des Fournisseurs", "اختيار الموردين")}
          </h1>
          <Badge variant="secondary">
            {t("Évaluation Multicritère Pondérée", "التقييم المرجّح متعدد المعايير")}
          </Badge>
        </div>
        <p className="text-muted-foreground ps-14">
          {t(
            "Classez vos fournisseurs objectivement en combinant plusieurs critères avec des poids personnalisés.",
            "صنّف موردِيك بموضوعية بدمج عدة معايير مع أوزان مخصصة."
          )}
        </p>
      </div>

      {/* ── 1. General config ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">{t("Configuration générale", "الإعداد العام")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("Nom du problème", "اسم المسألة")}</Label>
              <Input
                value={problemName}
                onChange={e => setProblemName(e.target.value)}
                placeholder={t("Ex : Sélection fournisseur matières premières", "مثال: اختيار مورد المواد الأولية")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("Échelle de notation des scores", "سلم تنقيط الدرجات")}</Label>
              <div className="flex rounded-lg border border-border overflow-hidden h-10">
                {([10, 100] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleScaleChange(s)}
                    className={cn(
                      "flex-1 text-sm font-semibold transition-colors",
                      scale === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {t(`0 – ${s}`, `0 – ${s}`)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {scale === 10
                  ? t("Score de 0 à 10 par critère.", "نقطة من 0 إلى 10 لكل معيار.")
                  : t("Score de 0 à 100 par critère.", "نقطة من 0 إلى 100 لكل معيار.")
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 2. Criteria ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-lg">{t("Critères d'évaluation", "معايير التقييم")}</CardTitle>
              <CardDescription className="mt-1">
                {t(
                  "Définissez les critères et leurs poids (%). La somme doit être égale à 100%.",
                  "حدّد المعايير وأوزانها (%). يجب أن يكون المجموع 100%."
                )}
              </CardDescription>
            </div>
            <WeightIndicator sum={wSum} t={t} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Criteria list */}
          <div className="space-y-2">
            {criteria.map((c, idx) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="w-6 text-xs text-muted-foreground text-center font-mono shrink-0">{idx + 1}</span>
                <Input
                  value={c.name}
                  onChange={e => updateCriterion(c.id, { name: e.target.value })}
                  placeholder={t("Nom du critère", "اسم المعيار")}
                  className="flex-1 h-9 text-sm"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    type="number"
                    min={0} max={100} step={5}
                    value={c.weight || ""}
                    onChange={e => updateCriterion(c.id, { weight: Math.max(0, Math.min(100, Number(e.target.value))) })}
                    className="w-20 h-9 text-sm text-center"
                  />
                  <span className="text-sm text-muted-foreground w-4">%</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeCriterion(c.id)}
                  disabled={criteria.length <= 1}
                  className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  title={t("Supprimer ce critère", "حذف هذا المعيار")}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Progress bar showing weight distribution */}
          <div className="rounded-lg bg-muted/50 overflow-hidden h-3 flex mt-2">
            {criteria.map((c, i) => (
              <div
                key={c.id}
                style={{ width: `${Math.min(100, c.weight)}%`, background: CHART_COLORS[i % CHART_COLORS.length] }}
                className="h-full transition-all"
                title={`${c.name}: ${c.weight}%`}
              />
            ))}
            {wSum < 100 && (
              <div style={{ width: `${100 - wSum}%` }} className="h-full bg-muted" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {criteria.map((c, i) => (
              <span key={c.id} className="text-[10px] flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                {c.name || t("?", "؟")} ({c.weight}%)
              </span>
            ))}
          </div>

          <Button
            type="button" variant="outline" size="sm"
            onClick={addCriterion}
            className="gap-1.5 h-8 text-xs mt-1"
          >
            <Plus className="w-3.5 h-3.5" />
            {t("Ajouter un critère", "إضافة معيار")}
          </Button>
        </CardContent>
      </Card>

      {/* ── 3. Scores table ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-lg">{t("Grille d'évaluation des fournisseurs", "جدول تقييم الموردين")}</CardTitle>
              <CardDescription className="mt-1">
                {t(
                  `Saisissez le score de chaque fournisseur sur chaque critère (0 – ${scale}).`,
                  `أدخل نقطة كل مورد على كل معيار (0 – ${scale}).`
                )}
              </CardDescription>
            </div>
            <Button
              type="button" variant="outline" size="sm"
              onClick={addSupplier}
              className="gap-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" />
              {t("Ajouter un fournisseur", "إضافة مورد")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/70">
                  <th className="px-3 py-2.5 text-start font-semibold text-muted-foreground min-w-[160px] sticky start-0 bg-muted/70 z-10 border-e">
                    {t("Fournisseur", "المورد")}
                  </th>
                  {criteria.map((c, i) => (
                    <th
                      key={c.id}
                      className="px-3 py-2.5 text-center font-semibold min-w-[110px]"
                      style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}
                    >
                      <div className="truncate max-w-[120px] mx-auto">{c.name || "?"}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">{c.weight}%</div>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground w-10" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {suppliers.map((s, sidx) => (
                  <tr key={s.id} className="hover:bg-muted/20 group">
                    <td className="px-2 py-2 sticky start-0 bg-card border-e z-10 group-hover:bg-muted/20">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono w-4">{sidx + 1}</span>
                        <Input
                          value={s.name}
                          onChange={e => updateSupplierName(s.id, e.target.value)}
                          placeholder={t(`Fournisseur ${sidx + 1}`, `مورد ${sidx + 1}`)}
                          className="h-8 text-sm flex-1 min-w-[120px]"
                        />
                      </div>
                    </td>
                    {criteria.map(c => (
                      <td key={c.id} className="px-2 py-2 text-center">
                        <Input
                          type="number"
                          min={0} max={scale} step={scale === 10 ? 0.5 : 5}
                          value={s.scores[c.id] ?? ""}
                          onChange={e => updateScore(s.id, c.id, Number(e.target.value))}
                          className="h-8 text-sm text-center w-[90px] mx-auto"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeSupplier(s.id)}
                        disabled={suppliers.length <= 1}
                        className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={t("Supprimer ce fournisseur", "حذف هذا المورد")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Per-criterion score hint */}
          <p className="text-xs text-muted-foreground mt-2 ps-1">
            {t(
              `Scores de 0 (très mauvais) à ${scale} (excellent) — plus le score est élevé, meilleure est la performance.`,
              `الدرجات من 0 (ضعيف جداً) إلى ${scale} (ممتاز) — كلما ارتفعت النقطة، كان الأداء أحسن.`
            )}
          </p>
        </CardContent>
      </Card>

      {/* ── Solve button ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3">
        {!weightsOk && (
          <p className="text-sm text-amber-700 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {t(`Les poids totalisent ${fNum(wSum, 1)}% — ajustez-les à 100% avant de calculer.`,
               `مجموع الأوزان ${fNum(wSum, 1)}% — عدّلها إلى 100% قبل الحساب.`)}
          </p>
        )}
        <Button
          onClick={handleSolve}
          size="lg"
          disabled={!weightsOk || suppliers.length === 0}
          className="gap-2 px-8"
        >
          <Calculator className="w-5 h-5" />
          {t("Calculer le classement", "حساب الترتيب")}
          {resultStale && results && <RefreshCw className="w-4 h-4 opacity-60" />}
        </Button>
      </div>

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {results && results.length > 0 && (
        <div ref={resultsRef} className="space-y-6">

          {/* ── Top supplier highlight ────────────────────────────────────── */}
          {analysis && (
            <div className="rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-6 shadow-lg">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0">
                  <Trophy className="w-8 h-8 text-yellow-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-primary-foreground/70 font-medium">
                    {t("Fournisseur recommandé", "المورد الموصى به")}
                  </p>
                  <p className="text-2xl font-black truncate">{analysis.topSupplier.name || `${t("Fournisseur", "مورد")} 1`}</p>
                  {analysis.runnerUp && (
                    <p className="text-sm text-primary-foreground/70 mt-0.5">
                      {t("2ème :", "المرتبة الثانية:")} {analysis.runnerUp.name} ({fNum(analysis.runnerUp.totalScore, 1)}/100)
                    </p>
                  )}
                </div>
                <div className="text-end">
                  <p className="text-4xl font-black text-yellow-300">{fNum(analysis.topSupplier.totalScore, 1)}</p>
                  <p className="text-sm text-primary-foreground/70">{t("/ 100", "/ 100")}</p>
                </div>
              </div>
              {analysis.tooClose && analysis.runnerUp && (
                <div className="mt-4 rounded-lg bg-white/10 border border-white/20 px-4 py-2 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-300 shrink-0" />
                  {t(
                    `Scores très proches (écart ${fNum(analysis.gapAbsolute, 1)} pts) — double sourcing recommandé.`,
                    `نقاط متقاربة جداً (فارق ${fNum(analysis.gapAbsolute, 1)} نقطة) — يُنصح بالتوريد المزدوج.`
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Ranked table ──────────────────────────────────────────────── */}
          <Card className="border-primary/20 shadow-md">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg">{t("Classement des Fournisseurs", "ترتيب الموردين")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="px-3 py-2 text-start text-muted-foreground font-semibold w-12">{t("Rang", "الرتبة")}</th>
                    <th className="px-3 py-2 text-start text-muted-foreground font-semibold">{t("Fournisseur", "المورد")}</th>
                    {criteria.map((c, i) => (
                      <th key={c.id} className="px-2 py-2 text-center text-xs font-semibold min-w-[80px]" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>
                        <div className="truncate max-w-[90px] mx-auto">{c.name}</div>
                        <div className="text-muted-foreground font-normal text-[10px]">{c.weight}%</div>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center text-primary font-bold">{t("Score Total", "النقطة الإجمالية")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {results.map(r => {
                    const isTop = r.rank === 1;
                    return (
                      <tr key={r.id} className={cn(
                        "hover:bg-muted/30 transition-colors",
                        isTop ? "bg-green-50/80" : ""
                      )}>
                        <td className="px-3 py-2.5 text-center">
                          <RankBadge rank={r.rank} />
                        </td>
                        <td className="px-3 py-2.5 font-semibold">
                          {r.name || `${t("Fournisseur", "مورد")} ${r.rank}`}
                        </td>
                        {criteria.map(c => {
                          const raw      = r.scores[c.id] ?? 0;
                          const contrib  = r.weightedScores[c.id] ?? 0;
                          const pct      = (raw / scale) * 100;
                          return (
                            <td key={c.id} className="px-2 py-2.5 text-center">
                              <div className="font-mono font-semibold">{fNum(raw, 0)}</div>
                              <div className="text-[10px] text-muted-foreground">+{fNum(contrib, 1)}</div>
                              {/* Mini bar */}
                              <div className="mx-auto mt-1 h-1 rounded-full bg-muted overflow-hidden w-12">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${pct}%`, background: pct < 50 ? "#c62828" : "#004d40" }}
                                />
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-3 py-2.5 text-center">
                          <span className={cn(
                            "text-lg font-black",
                            isTop ? "text-green-700" : "text-primary"
                          )}>
                            {fNum(r.totalScore, 1)}
                          </span>
                          <span className="text-xs text-muted-foreground">/100</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-muted-foreground mt-2 ps-1">
                {t(
                  "Les petits chiffres sous chaque score = contribution pondérée au score total (score × poids ÷ échelle).",
                  "الأرقام الصغيرة تحت كل نقطة = المساهمة المرجّحة في النقطة الإجمالية (النقطة × الوزن ÷ السلم)."
                )}
              </p>
            </CardContent>
          </Card>

          {/* ── Bar chart ─────────────────────────────────────────────────── */}
          {chartData && chartData.length > 0 && (
            <Card className="border-primary/20">
              <CardHeader className="pb-2 border-b">
                <CardTitle className="text-base">
                  {t("Comparaison Graphique des Scores", "مقارنة بيانية للنقاط")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 16, right: 20, left: 0, bottom: 5 }} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e0e0e0" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(val: number) => [`${fNum(val, 1)} / 100`, t("Score pondéré", "النقطة المرجّحة")]}
                    />
                    <Bar dataKey="score" radius={[0, 4, 4, 0]} maxBarSize={28}>
                      <LabelList
                        dataKey="score"
                        position="right"
                        formatter={(v: number) => fNum(v, 1)}
                        style={{ fontSize: 10, fontWeight: 700 }}
                      />
                      {chartData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.rank === 1 ? "#2e7d32" : CHART_COLORS[(entry.rank) % CHART_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* ── تحليل الوضع ──────────────────────────────────────────────── */}
          <Card className="border-primary/20">
            <CardHeader className="pb-2 border-b">
              <CardTitle className="flex items-center gap-3 text-xl">
                <span className="rounded-lg bg-primary/10 p-2 text-primary"><BarChart2 className="w-5 h-5" /></span>
                {t("Analyse de la Situation", "تحليل الوضع")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-3">
              {analysisLines.map((line, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg border bg-primary/5 border-primary/20 p-4">
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm leading-relaxed">{line}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ── التوصيات الإدارية ────────────────────────────────────────── */}
          {suggestions.length > 0 && (
            <Card className="border-2 border-primary/20">
              <CardHeader className="pb-2 border-b">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <span className="rounded-lg bg-primary/10 p-2 text-primary"><Lightbulb className="w-5 h-5" /></span>
                  <span>
                    <span className="block">{t("Recommandations Managériales", "التوصيات الإدارية")}</span>
                    <span className="block text-sm font-normal text-muted-foreground mt-0.5">
                      {t("التوصيات الإدارية", "Recommandations Managériales")}
                    </span>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    className={cn(
                      "rounded-xl border-s-4 p-5 space-y-2",
                      s.color, s.borderColor,
                      isAr ? "border-s-0 border-e-4" : ""
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{s.icon}</span>
                      <p className="font-bold text-base">{s.title}</p>
                      <span className="ms-auto text-xs font-semibold bg-primary/10 text-primary rounded-full px-2 py-0.5">
                        #{i + 1}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── Actions ─────────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3 justify-end">
            <Button variant="outline" onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : savedOk
                ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                : <Save className="w-4 h-4" />}
              {savedOk ? t("Enregistré ✓", "تم الحفظ ✓") : t("Sauvegarder", "حفظ في السجل")}
            </Button>
            {saveError && <span className="text-xs text-destructive self-center">{saveError}</span>}
            <Button onClick={handlePDF} disabled={!!pdfProgress} className="gap-2">
              {pdfProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {pdfProgress ?? t("Exporter PDF", "تصدير PDF")}
            </Button>
          </div>

        </div>
      )}

    </div>
  );
}
