import { useState } from "react";
import { useLanguage } from "@/lib/LanguageContext";
import type { SensitivityAnalysisResult } from "@/lib/sensitivityAnalysisAlgorithm";
import { fmtDA, fmtN, fmtPct, fmtYears, breakEvenRisk } from "@/lib/sensitivityAnalysisAlgorithm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  FileText, Save, CheckCircle2, Loader2, AlertTriangle,
  BarChart2, Lightbulb, ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { generateSensitivityAnalysisPDFReport } from "@/lib/generateSensitivityAnalysisPDF";

type SectorKey = "trade" | "industry" | "agriculture" | "services" | "custom";

interface Props {
  result: SensitivityAnalysisResult;
  projectName: string;
  sector: SectorKey | null;
}

export function SensitivityAnalysisReport({ result, projectName, sector }: Props) {
  const { t, language } = useLanguage();
  const isAr = language === "ar";

  const [pdfOpen,         setPdfOpen]         = useState(false);
  const [isSaving,        setIsSaving]        = useState(false);
  const [savedOk,         setSavedOk]         = useState(false);
  const [saveError,       setSaveError]       = useState<string | null>(null);
  const [pdfLoading,      setPdfLoading]      = useState(false);
  const [managerName,     setManagerName]     = useState("");
  const [institutionName, setInstitutionName] = useState("");

  const { baseResult, variables, scenarios } = result;
  const { npv, irr, input: inp } = baseResult;
  const r = inp.discountRate;
  const n = inp.duration;

  const mostSensitive  = variables[0];
  const leastSensitive = variables[variables.length - 1];
  const testedRange = Math.max(1, result.rangeMax - result.rangeMin);
  const cleanVariableName = (name: string) => name.replace(/\s*\([^)]*\)/g, "");
  const variableName = (v: typeof mostSensitive, arabic = false) =>
    v ? cleanVariableName(arabic ? v.nameAr : v.nameFr) : "—";
  const perPointImpact = (v: NonNullable<typeof mostSensitive>) => v.impact / testedRange;
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
  const adverseDirectionAr = mostSensitive?.variable === "cashFlows" ? "انخفاض" : "ارتفاع";

  // ── Overall risk verdict ──────────────────────────────────────────────────
  const topRisk = breakEvenRisk(mostSensitive?.breakEvenPct ?? null);
  const overallRisk: "low" | "moderate" | "high" =
    topRisk === "low" ? "low" : topRisk === "moderate" ? "moderate" : "high";

  const riskInfo = {
    low: {
      icon: "🛡️",
      color: "bg-green-50 border-green-400",
      badge: "bg-green-100 text-green-800 border-green-300",
      fr: "Risque FAIBLE — Projet robuste",
      ar: "مخاطر منخفضة — المشروع متين",
      descFr: "Les hypothèses testées disposent d'une marge confortable. Le projet peut absorber les écarts étudiés, mais les résultats restent à confirmer avec des données commerciales et financières actualisées.",
      descAr: "للافتراضات المختبرة هامش مريح. يستطيع المشروع استيعاب الفروقات المدروسة، لكن يجب تأكيد النتائج ببيانات تجارية ومالية محدثة.",
    },
    moderate: {
      icon: "⚠️",
      color: "bg-amber-50 border-amber-400",
      badge: "bg-amber-100 text-amber-800 border-amber-300",
      fr: "Risque MODÉRÉ — Surveiller les hypothèses",
      ar: "مخاطر معتدلة — مراقبة الافتراضات",
      descFr: "Certains paramètres sont relativement proches du seuil de rentabilité. Les écarts entre prévisions et réalisations doivent être suivis régulièrement avant chaque décision d'engagement.",
      descAr: "بعض المتغيرات قريبة نسبياً من عتبة الربحية. يجب متابعة الفروقات بين التوقعات والنتائج الفعلية بانتظام قبل كل قرار التزام.",
    },
    high: {
      icon: "🔴",
      color: "bg-red-50 border-red-400",
      badge: "bg-red-100 text-red-800 border-red-300",
      fr: "Risque ÉLEVÉ — Hypothèses fragiles",
      ar: "مخاطر مرتفعة — افتراضات هشة",
      descFr: "La viabilité du projet est très sensible aux hypothèses. Avant de vous engager, sécurisez les revenus, confirmez les coûts et prévoyez un scénario de repli financé.",
      descAr: "جدوى المشروع حساسة جداً للافتراضات. قبل الالتزام، أمّن الإيرادات وأكد التكاليف وجهّز سيناريو تراجع ممولاً.",
    },
  }[overallRisk];

  // ── Connected, manager-facing analysis paragraphs ─────────────────────────
  const variableImpactSentence = variables
    .map(v => `${cleanVariableName(v.nameFr)} : ${fmtDA(perPointImpact(v))} par point de pourcentage`)
    .join(" ; ");
  const variableImpactSentenceAr = variables
    .map(v => `${cleanVariableName(v.nameAr)}: ${fmtDA(perPointImpact(v))} لكل نقطة مئوية`)
    .join("؛ ");
  const thresholdSentence = mostSensitive?.breakEvenPct !== null && mostSensitive?.breakEvenPct !== undefined
    ? `Le seuil de viabilité apparaît après une ${mostSensitive.variable === "cashFlows" ? "baisse" : "hausse"} de ${fmtN(Math.abs(mostSensitive.breakEvenPct), 1)}% de cette variable.`
    : "Aucun seuil de viabilité n'apparaît dans la plage testée.";
  const thresholdSentenceAr = mostSensitive?.breakEvenPct !== null && mostSensitive?.breakEvenPct !== undefined
    ? `تظهر عتبة الجدوى بعد ${mostSensitive.variable === "cashFlows" ? "انخفاض" : "ارتفاع"} هذا المتغير بنسبة ${fmtN(Math.abs(mostSensitive.breakEvenPct), 1)}٪.`
    : "لا تظهر عتبة للجدوى ضمن النطاق المختبر.";
  const analysisParagraphs: { icon: string; text: string; color: string }[] = [
    {
      icon: "📊",
      color: "bg-primary/10 border-primary/30",
      text: t(
        `L'analyse examine trois variables de décision — ${variables.map(v => cleanVariableName(v.nameFr)).join(", ")} — sur une plage de ${result.rangeMin}% à +${result.rangeMax}% autour des hypothèses de base. La valeur actuelle nette de référence est de ${fmtDA(npv)}, avec un taux d'actualisation de ${fmtPct(r, 1)} sur ${n} ans. Sur l'ensemble de la plage, l'effet moyen d'un point de pourcentage est de ${variableImpactSentence}.`,
        `يفحص التحليل ثلاثة متغيرات قرار — ${variables.map(v => cleanVariableName(v.nameAr)).join("، ")} — ضمن نطاق من ${result.rangeMin}٪ إلى +${result.rangeMax}٪ حول الفرضيات الأساسية. تبلغ القيمة الحالية الصافية المرجعية ${fmtDA(npv)}، بمعدل خصم ${fmtPct(r, 1)} ولمدة ${n} سنوات. وعلى كامل النطاق، يبلغ الأثر المتوسط لكل نقطة مئوية ${variableImpactSentenceAr}.`
      ),
    },
    {
      icon: mostSensitive?.impact! > 0 ? "🎯" : "ℹ️",
      color: topRisk === "high" ? "bg-red-50 border-red-300" : topRisk === "moderate" ? "bg-amber-50 border-amber-300" : "bg-green-50 border-green-300",
      text: t(
        mostSensitive
          ? `${variableName(mostSensitive)} est la variable la plus sensible : dans la plage testée, la VAN passe de ${fmtDA(Math.min(mostSensitive.npvAtMinRange, mostSensitive.npvAtMaxRange))} à ${fmtDA(Math.max(mostSensitive.npvAtMinRange, mostSensitive.npvAtMaxRange))}, soit ${fmtDA(mostSensitive.impact)} d'écart. Une variation adverse réaliste de ${Math.abs(adversePoint?.pct ?? 0)}% — ${adverseDirection} pour cette variable — donnerait une VAN de ${fmtDA(adversePoint?.npv ?? npv)}, contre ${fmtDA(npv)} au scénario de base. ${thresholdSentence}`
          : "Aucune variable analysée.",
        mostSensitive
          ? `${variableName(mostSensitive, true)} هو المتغير الأكثر حساسية: ضمن النطاق المختبر، تتحرك القيمة الحالية الصافية من ${fmtDA(Math.min(mostSensitive.npvAtMinRange, mostSensitive.npvAtMaxRange))} إلى ${fmtDA(Math.max(mostSensitive.npvAtMinRange, mostSensitive.npvAtMaxRange))}، بفارق ${fmtDA(mostSensitive.impact)}. ويؤدي تغير سلبي واقعي بنسبة ${Math.abs(adversePoint?.pct ?? 0)}٪ — ${adverseDirectionAr} لهذا المتغير — إلى قيمة حالية صافية قدرها ${fmtDA(adversePoint?.npv ?? npv)} بدلاً من ${fmtDA(npv)} في السيناريو الأساسي. ${thresholdSentenceAr}`
          : "لا توجد متغيرات مُحللة."
      ),
    },
    {
      icon: "🛡️",
      color: "bg-secondary/10 border-secondary/30",
      text: t(
        leastSensitive && leastSensitive !== mostSensitive
          ? `À l'inverse, ${variableName(leastSensitive)} est la moins sensible : son impact total est de ${fmtDA(leastSensitive.impact)}, soit environ ${fmtDA(perPointImpact(leastSensitive))} par point de pourcentage. Le risque prioritaire n'est donc pas de répartir les contrôles également, mais de sécuriser d'abord ${variableName(mostSensitive)}. Dans la pratique, cela signifie fixer un indicateur de suivi et un seuil d'alerte sur cette hypothèse avant de mobiliser le capital.`
          : "Toutes les variables ont un impact similaire sur la VAN.",
        leastSensitive && leastSensitive !== mostSensitive
          ? `في المقابل، ${variableName(leastSensitive, true)} هو الأقل حساسية: يبلغ أثره الإجمالي ${fmtDA(leastSensitive.impact)}، أي نحو ${fmtDA(perPointImpact(leastSensitive))} لكل نقطة مئوية. لذلك لا ينبغي توزيع الرقابة بالتساوي، بل يجب أولاً تأمين ${variableName(mostSensitive, true)}. عملياً، يعني ذلك تحديد مؤشر متابعة وحد إنذار لهذا الافتراض قبل تعبئة رأس المال.`
          : "جميع المتغيرات لها تأثير مماثل على NPV."
      ),
    },
    {
      icon: scenarios[0].result.npv > 0 ? "✅" : "🔴",
      color: scenarios[0].result.npv > 0 ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300",
      text: t(
        `Le test combiné confirme la portée de ce risque : avec ${scenarios[0].adjustmentPct}% de flux en moins et ${scenarios[0].adjustmentPct}% de coûts et de taux en plus, la VAN ressort à ${fmtDA(scenarios[0].result.npv)}, contre ${fmtDA(npv)} au départ. Le scénario optimiste atteint ${fmtDA(scenarios[2].result.npv)}. ${scenarios[0].result.npv >= 0 ? "Le projet reste positif sous pression, mais la marge doit être protégée par un suivi des hypothèses." : "Le projet devient négatif sous pression : la décision devrait être conditionnée à des garanties de revenus, à une enveloppe de coûts maîtrisée et à un financement de la phase précédant la rentabilité."}`,
        `يؤكد الاختبار المجمع حجم المخاطر: مع انخفاض التدفقات بنسبة ${scenarios[0].adjustmentPct}٪ وارتفاع التكاليف ومعدل الخصم بالنسبة نفسها، تبلغ القيمة الحالية الصافية ${fmtDA(scenarios[0].result.npv)} مقابل ${fmtDA(npv)} في البداية. ويصل السيناريو المتفائل إلى ${fmtDA(scenarios[2].result.npv)}. ${scenarios[0].result.npv >= 0 ? "يبقى المشروع موجباً تحت الضغط، لكن يجب حماية الهامش بمتابعة الفرضيات." : "يصبح المشروع سالباً تحت الضغط، لذلك يجب ربط القرار بضمانات للإيرادات وسقف للتكاليف وتمويل للمرحلة السابقة للربحية."}`
      ),
    },
  ];

  // ── Suggestions ────────────────────────────────────────────────────────────
  interface Suggestion { icon: string; desc: string; color: string; borderColor: string; }
  const suggestions: Suggestion[] = [];

  // Keep recommendations action-oriented and distinct from the analysis paragraphs.
  if (mostSensitive) {
    if (mostSensitive.variable === "cashFlows") {
      suggestions.push({
        icon: "📋",
        color: "bg-primary/5", borderColor: "border-l-primary",
        desc: t(
          `Avant de mobiliser le capital, sécurisez les encaissements par des contrats, des lettres d'intention ou un plan commercial vérifiable, puis suivez les flux réalisés mois par mois.`,
          `قبل تعبئة رأس المال، أمّن التحصيلات بعقود أو خطابات نية أو خطة تجارية قابلة للتحقق، ثم تابع التدفقات الفعلية شهرياً.`
        ),
      });
    } else if (mostSensitive.variable === "initialInvestment") {
      suggestions.push({
        icon: "💰",
        color: "bg-amber-50", borderColor: "border-l-amber-500",
        desc: t(
          `Avant validation, obtenez des devis fermes, découpez les décaissements par jalon et conservez une réserve dédiée aux dépassements afin que le coût final ne dérive pas sans décision.`,
          `قبل المصادقة، احصل على عروض أسعار نهائية وقسّم المدفوعات حسب المراحل واحتفظ باحتياطي للتجاوزات حتى لا ترتفع التكلفة النهائية دون قرار.`
        ),
      });
    } else if (mostSensitive.variable === "discountRate") {
      suggestions.push({
        icon: "📊",
        color: "bg-primary/5", borderColor: "border-l-primary",
        desc: t(
          `Validez le taux de financement avec le prêteur et réexaminez-le si les conditions de crédit changent ; un taux de référence trop optimiste peut faire paraître le projet rentable avant de fragiliser sa trésorerie.`,
          `تحقق من معدل التمويل مع المقرض وأعد مراجعته إذا تغيرت شروط الائتمان؛ فالمعدل المتفائل أكثر من اللازم قد يجعل المشروع يبدو مربحاً ثم يضغط على خزينته.`
        ),
      });
    }
  }

  // Pessimistic scenario signal
  if (scenarios[0].result.npv < 0) {
    suggestions.push({
      icon: "🔴",
      color: "bg-red-50", borderColor: "border-l-red-500",
      desc: t(
        `Le scénario défavorable devient déficitaire avec une VAN de ${fmtDA(scenarios[0].result.npv)}. Préparez avant l'engagement un plan de réduction des coûts et une solution de financement de la période précédant la rentabilité.`,
        `يصبح السيناريو المعاكس عجزاً بقيمة حالية صافية قدرها ${fmtDA(scenarios[0].result.npv)}. جهّز قبل الالتزام خطة لتخفيض التكاليف وحلاً لتمويل الفترة السابقة للربحية.`
      ),
    });
  } else {
    suggestions.push({
      icon: "✅",
      color: "bg-green-50", borderColor: "border-l-green-600",
      desc: t(
        `Le scénario défavorable reste positif avec une VAN de ${fmtDA(scenarios[0].result.npv)}. Vous pouvez avancer avec davantage de confiance, à condition de conserver un suivi des hypothèses et une réserve de sécurité.`,
        `يبقى السيناريو المعاكس موجباً بقيمة حالية صافية قدرها ${fmtDA(scenarios[0].result.npv)}. يمكنك التقدم بثقة أكبر، مع الإبقاء على متابعة الفرضيات واحتياطي أمان.`
      ),
    });
  }

  suggestions.push({
    icon: "🔄",
    color: "bg-secondary/5", borderColor: "border-l-secondary",
    desc: t(
      `Actualisez l'analyse à la fin des travaux, après la première année d'exploitation et à chaque révision du financement. C'est à ces jalons que les hypothèses testées peuvent être remplacées par des observations réelles.`,
      `حدّث التحليل عند نهاية الأشغال وبعد السنة الأولى من التشغيل وعند كل مراجعة للتمويل. في هذه المراحل يمكن استبدال الفرضيات المختبرة بملاحظات فعلية.`
    ),
  });

  // ── Save ────────────────────────────────────────────────────────────────────
  async function handleSave() {
    setIsSaving(true); setSaveError(null);
    try {
      const body = {
        name: projectName || t("Analyse de Sensibilité", "تحليل الحساسية"),
        sector: sector ?? "custom",
        objectiveType: "maximize",
        status: "optimal",
        optimalValue: parseFloat(npv.toFixed(2)),
        problemData: {
          type: "sensitivity-analysis",
          input: {
            projectName:       inp.projectName,
            initialInvestment: inp.initialInvestment,
            discountRate:      inp.discountRate,
            duration:          inp.duration,
            cashFlows:         inp.cashFlows,
            salvageValue:      inp.salvageValue,
            rangeMin:          result.rangeMin,
            rangeMax:          result.rangeMax,
            stepSize:          result.stepSize,
          },
        },
        result: {
          npv:                baseResult.npv,
          irr:                baseResult.irr,
          profitabilityIndex: baseResult.profitabilityIndex,
          simplePayback:      baseResult.simplePayback,
          discountedPayback:  baseResult.discountedPayback,
          mostSensitiveVar:   mostSensitive?.variable ?? null,
          breakEvenPcts:      variables.reduce<Record<string, number | null>>((acc, v) => {
            acc[v.variable] = v.breakEvenPct;
            return acc;
          }, {}),
        },
      };
      const res = await fetch("/api/problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 4000);
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setIsSaving(false);
    }
  }

  // ── PDF ─────────────────────────────────────────────────────────────────────
  async function handlePdfExport() {
    setPdfLoading(true);
    try {
      await generateSensitivityAnalysisPDFReport({
        result, projectName, sector: sector ?? undefined, managerName, institutionName,
      });
      setPdfOpen(false);
    } catch (err) {
      console.error("PDF error:", err);
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="space-y-6">

      {/* ── Risk verdict banner ──────────────────────────────────────────────── */}
      <div className={cn("rounded-xl border-2 p-5 flex items-start gap-4", riskInfo.color)}>
        <span className="text-3xl shrink-0">{riskInfo.icon}</span>
        <div className="space-y-1">
          <p className="font-bold text-base">
            {isAr ? riskInfo.ar : riskInfo.fr}
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isAr ? riskInfo.descAr : riskInfo.descFr}
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            {variables.map(v => {
              const risk = breakEvenRisk(v.breakEvenPct);
              return (
                <Badge key={v.variable}
                  className={cn("text-xs font-semibold",
                    risk === "low"      ? "bg-green-100 text-green-800 border-green-300"
                    : risk === "moderate" ? "bg-amber-100 text-amber-800 border-amber-300"
                    : risk === "high"    ? "bg-red-100 text-red-800 border-red-300"
                    : "bg-muted text-muted-foreground"
                  )}>
                  {risk === "low" ? "🟢" : risk === "moderate" ? "🟡" : risk === "high" ? "🔴" : "—"}{" "}
                  {isAr ? v.nameAr : v.nameFr}
                </Badge>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Situational Analysis ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-primary" />
          {t("Analyse de la Situation", "تحليل الوضع")}
        </h2>
        <div className="space-y-2">
          {analysisParagraphs.map((line, i) => (
            <div key={i}
              className={cn("flex items-start gap-3 rounded-lg border px-4 py-3 text-sm", line.color)}>
              <span className="text-base leading-snug shrink-0">{line.icon}</span>
              <span className="leading-relaxed">{line.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Suggestions ──────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-primary" />
          {t("Recommandations Stratégiques", "التوصيات الاستراتيجية")}
        </h2>
        <div className="space-y-3">
          {suggestions.map((s, i) => (
            <div key={i}
              className={cn("flex items-start gap-3 rounded-lg border-l-4 px-4 py-3", s.color, s.borderColor)}>
              <span className="text-lg shrink-0 mt-0.5">{s.icon}</span>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Managerial Report Card ────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          {t("Rapport de Sensibilité", "تقرير الحساسية")}
        </h2>
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-lg font-bold">
                  {projectName || t("Analyse de Sensibilité", "تحليل الحساسية")}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t(
                    `Plage : ${result.rangeMin}% à +${result.rangeMax}% · Pas : ${result.stepSize}% · ${variables.length} variables`,
                    `النطاق: ${result.rangeMin}% إلى +${result.rangeMax}% · الخطوة: ${result.stepSize}% · ${variables.length} متغيرات`
                  )}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge className={cn("font-semibold", riskInfo.badge)}>
                  {riskInfo.icon} {isAr ? riskInfo.ar.split("—")[0].trim() : riskInfo.fr.split("—")[0].trim()}
                </Badge>
                {irr !== null && (
                  <Badge className={cn("font-semibold",
                    irr >= r ? "bg-green-100 text-green-800 border-green-300"
                             : "bg-amber-100 text-amber-800 border-amber-300"
                  )}>
                    IRR {fmtPct(irr, 1)}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* KPI + break-even grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: t("VAN de base",            "NPV الأساسية"),         value: fmtDA(npv) },
                { label: t("TRI de base",             "IRR الأساسي"),          value: irr !== null ? fmtPct(irr, 2) : "—" },
                { label: t("Taux d'actualisation",    "معدل الخصم"),           value: fmtPct(r, 1) },
                ...variables.map(v => ({
                  label: t(`Seuil — ${v.nameFr}`, `عتبة — ${v.nameAr}`),
                  value: v.breakEvenPct !== null ? `${v.breakEvenPct >= 0 ? "+" : ""}${fmtN(v.breakEvenPct, 1)} %` : "—",
                })),
                { label: t("Scénario pessimiste VAN", "NPV السيناريو المتشائم"), value: fmtDA(scenarios[0].result.npv) },
                { label: t("Scénario optimiste VAN",  "NPV السيناريو المتفائل"), value: fmtDA(scenarios[2].result.npv) },
                { label: t("Investissement initial",  "الاستثمار الأولي"),     value: fmtDA(inp.initialInvestment) },
                { label: t("Durée du projet",         "مدة المشروع"),          value: `${n} ${n > 1 ? t("ans","سنوات") : t("an","سنة")}` },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className="text-base font-bold mt-0.5">{kpi.value}</p>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3 flex-wrap pt-1">
              <Button onClick={handleSave} disabled={isSaving || savedOk} variant="outline">
                {isSaving ? <><Loader2 className="w-4 h-4 me-2 animate-spin" />{t("Sauvegarde…","جارٍ الحفظ…")}</>
                : savedOk  ? <><CheckCircle2 className="w-4 h-4 me-2 text-green-600" />{t("Sauvegardé !","تم الحفظ!")}</>
                : <><Save className="w-4 h-4 me-2" />{t("Sauvegarder","حفظ")}</>}
              </Button>
              <Button onClick={() => setPdfOpen(true)}>
                <FileText className="w-4 h-4 me-2" />
                {t("Exporter rapport PDF", "تصدير تقرير PDF")}
              </Button>
            </div>
            {saveError && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />{saveError}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── PDF Dialog ────────────────────────────────────────────────────────── */}
      <Dialog open={pdfOpen} onOpenChange={setPdfOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {t("Exporter le rapport de sensibilité", "تصدير تقرير الحساسية")}
            </DialogTitle>
            <DialogDescription>
              {t("Ajoutez des informations optionnelles avant la génération.", "أضف معلومات اختيارية قبل توليد التقرير.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t("Nom du responsable (optionnel)", "اسم المسؤول (اختياري)")}</Label>
              <Input placeholder={t("Ex: M. Yacine Belkadi", "مثال: السيد ياسين بلقادي")}
                value={managerName} onChange={(e) => setManagerName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("Organisation / Promoteur (optionnel)", "المؤسسة / صاحب المشروع (اختياري)")}</Label>
              <Input placeholder={t("Ex: SARL TechBat Batna", "مثال: ش.ذ.م.م تيك باتنة")}
                value={institutionName} onChange={(e) => setInstitutionName(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setPdfOpen(false)}>{t("Annuler","إلغاء")}</Button>
            <Button onClick={handlePdfExport} disabled={pdfLoading}>
              {pdfLoading
                ? <><Loader2 className="w-4 h-4 me-2 animate-spin" />{t("Génération…","جارٍ التوليد…")}</>
                : <><FileText className="w-4 h-4 me-2" />{t("Générer PDF","توليد PDF")}</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
