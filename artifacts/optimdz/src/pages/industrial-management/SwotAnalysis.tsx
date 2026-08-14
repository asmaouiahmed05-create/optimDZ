import { useRef, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Factory,
  FileText,
  Globe2,
  Info,
  Loader2,
  Plus,
  Save,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useLanguage } from "@/lib/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  computeSwotAnalysis,
  generateSwotAnalysis,
  generateSwotRecommendations,
  validateSwotInput,
  type FactorInput,
  type PestelDimension,
  type StrategicQuadrant,
  type SwotCategory,
  type SwotResult,
  type ValidationError,
} from "@/lib/swotAlgorithm";
import { generateSwotPDF } from "@/lib/generateSwotPDF";

type SectorKey = "industrie" | "commerce" | "agriculture" | "services" | "custom";
type FactorRow = Omit<FactorInput, "weight" | "rating" | "pestelDimension"> & {
  weight: string;
  rating: string;
  pestelDimension: PestelDimension | "";
};

interface Sector {
  id: SectorKey;
  icon: React.ElementType;
  fr: string;
  ar: string;
}

const SECTORS: Sector[] = [
  { id: "industrie", icon: Factory, fr: "Industrie", ar: "الصناعة" },
  { id: "commerce", icon: TrendingUp, fr: "Commerce", ar: "التجارة" },
  { id: "agriculture", icon: Globe2, fr: "Agriculture", ar: "الفلاحة" },
  { id: "services", icon: Target, fr: "Services", ar: "الخدمات" },
  { id: "custom", icon: Sparkles, fr: "Personnalisé", ar: "مخصص" },
];

const PESTEL: Array<{ value: PestelDimension; fr: string; ar: string }> = [
  { value: "political", fr: "Politique", ar: "سياسي" },
  { value: "economic", fr: "Économique", ar: "اقتصادي" },
  { value: "social", fr: "Social", ar: "اجتماعي" },
  { value: "technological", fr: "Technologique", ar: "تكنولوجي" },
  { value: "environmental", fr: "Environnemental", ar: "بيئي" },
  { value: "legal", fr: "Légal", ar: "قانوني" },
];

const CATEGORIES: Array<{ value: SwotCategory; fr: string; ar: string }> = [
  { value: "strength", fr: "Force", ar: "قوة" },
  { value: "weakness", fr: "Faiblesse", ar: "ضعف" },
  { value: "opportunity", fr: "Opportunité", ar: "فرصة" },
  { value: "threat", fr: "Menace", ar: "تهديد" },
];

const CATEGORY_COLORS: Record<SwotCategory, string> = {
  strength: "border-emerald-200 bg-emerald-50 text-emerald-800",
  weakness: "border-amber-200 bg-amber-50 text-amber-800",
  opportunity: "border-sky-200 bg-sky-50 text-sky-800",
  threat: "border-rose-200 bg-rose-50 text-rose-800",
};

const DEFAULT_FACTORS: Record<SectorKey, FactorRow[]> = {
  industrie: [
    { id: "f1", category: "strength", label: "Équipe technique expérimentée", weight: "0.60", rating: "4", pestelDimension: "" },
    { id: "f2", category: "strength", label: "Capacité de production flexible", weight: "0.40", rating: "3.5", pestelDimension: "" },
    { id: "f3", category: "opportunity", label: "Demande croissante pour les produits locaux", weight: "0.70", rating: "4", pestelDimension: "economic" },
    { id: "f4", category: "opportunity", label: "Nouveaux canaux de distribution numériques", weight: "0.30", rating: "3", pestelDimension: "technological" },
  ],
  commerce: [
    { id: "f1", category: "strength", label: "Réseau de clients fidélisés", weight: "0.60", rating: "4", pestelDimension: "" },
    { id: "f2", category: "strength", label: "Emplacement commercial visible", weight: "0.40", rating: "3.5", pestelDimension: "" },
    { id: "f3", category: "opportunity", label: "Développement du commerce en ligne", weight: "0.70", rating: "4", pestelDimension: "technological" },
    { id: "f4", category: "opportunity", label: "Nouveaux segments de consommateurs", weight: "0.30", rating: "3", pestelDimension: "social" },
  ],
  agriculture: [
    { id: "f1", category: "strength", label: "Accès à des terres fertiles", weight: "0.60", rating: "4", pestelDimension: "" },
    { id: "f2", category: "strength", label: "Savoir-faire agricole local", weight: "0.40", rating: "3.5", pestelDimension: "" },
    { id: "f3", category: "opportunity", label: "Marché des produits agricoles durables", weight: "0.70", rating: "4", pestelDimension: "environmental" },
    { id: "f4", category: "opportunity", label: "Aides à la modernisation agricole", weight: "0.30", rating: "3", pestelDimension: "political" },
  ],
  services: [
    { id: "f1", category: "strength", label: "Expertise reconnue par les clients", weight: "0.60", rating: "4", pestelDimension: "" },
    { id: "f2", category: "strength", label: "Service personnalisé et réactif", weight: "0.40", rating: "3.5", pestelDimension: "" },
    { id: "f3", category: "opportunity", label: "Besoins croissants en services spécialisés", weight: "0.70", rating: "4", pestelDimension: "social" },
    { id: "f4", category: "opportunity", label: "Outils numériques pour servir à distance", weight: "0.30", rating: "3", pestelDimension: "technological" },
  ],
  custom: [
    { id: "f1", category: "strength", label: "", weight: "1", rating: "", pestelDimension: "" },
  ],
};

function cloneFactors(sector: SectorKey): FactorRow[] {
  return DEFAULT_FACTORS[sector].map((factor) => ({ ...factor }));
}

function categoryLabel(category: SwotCategory, isAr: boolean) {
  const item = CATEGORIES.find((entry) => entry.value === category);
  return isAr ? item?.ar : item?.fr;
}

function isExternal(category: SwotCategory) {
  return category === "opportunity" || category === "threat";
}

function quadrantLabel(quadrant: StrategicQuadrant, isAr: boolean) {
  const labels: Record<StrategicQuadrant, { fr: string; ar: string }> = {
    offensive: { fr: "Offensif", ar: "هجومي" },
    conservative: { fr: "Conservateur", ar: "تحفظي" },
    competitive: { fr: "Compétitif", ar: "تنافسي" },
    defensive: { fr: "Défensif", ar: "دفاعي" },
  };
  return isAr ? labels[quadrant].ar : labels[quadrant].fr;
}

export default function SwotAnalysis() {
  const { t, language } = useLanguage();
  const isAr = language === "ar";
  const [phase, setPhase] = useState<"form" | "results">("form");
  const [problemName, setProblemName] = useState("");
  const [sector, setSector] = useState<SectorKey>("industrie");
  const [factors, setFactors] = useState<FactorRow[]>(() => cloneFactors("industrie"));
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [result, setResult] = useState<SwotResult | null>(null);
  const [parsedFactors, setParsedFactors] = useState<FactorInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const internalWeight = factors
    .filter((factor) => factor.category === "strength" || factor.category === "weakness")
    .reduce((sum, factor) => sum + (Number(factor.weight) || 0), 0);
  const externalWeight = factors
    .filter((factor) => factor.category === "opportunity" || factor.category === "threat")
    .reduce((sum, factor) => sum + (Number(factor.weight) || 0), 0);

  const loadTemplate = (nextSector: SectorKey) => {
    setSector(nextSector);
    setFactors(cloneFactors(nextSector));
    setErrors([]);
    setResult(null);
    setParsedFactors([]);
    setPhase("form");
  };

  const updateFactor = (id: string, field: keyof FactorRow, value: string) => {
    setFactors((current) => current.map((factor) => {
      if (factor.id !== id) return factor;
      if (field === "category") {
        const nextCategory = value as SwotCategory;
        return { ...factor, category: nextCategory, pestelDimension: isExternal(nextCategory) ? factor.pestelDimension : "" };
      }
      return { ...factor, [field]: value };
    }));
    setErrors([]);
  };

  const addFactor = () => {
    setFactors((current) => [
      ...current,
      { id: `f${Date.now()}`, category: "strength", label: "", weight: "0.25", rating: "3", pestelDimension: "" },
    ]);
  };

  const handleSolve = () => {
    const nextFactors: FactorInput[] = factors.map((factor) => {
      const rating = Number(factor.rating);
      const weight = Number(factor.weight);
      return {
        ...factor,
        weight: Number.isFinite(weight) ? weight : 0,
        rating: Number.isFinite(rating) ? rating : 0,
        pestelDimension: isExternal(factor.category) && factor.pestelDimension ? factor.pestelDimension : undefined,
      };
    });
    const nextErrors = validateSwotInput(nextFactors);
    setErrors(nextErrors);
    if (nextErrors.length > 0) return;

    setParsedFactors(nextFactors);
    setResult(computeSwotAnalysis(nextFactors));
    setPhase("results");
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    setSaveError(false);
    try {
      const response = await fetch("/api/problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "strategic-swot-pestel",
          sector,
          result,
          name: problemName || t("Analyse stratégique sans titre", "تحليل استراتيجي بدون عنوان"),
          content: { sector, factors: parsedFactors, result, analysis, recommendations },
        }),
      });
      if (!response.ok) throw new Error("Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error(error);
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    if (!result) return;
    setExporting(true);
    try {
      generateSwotPDF({
        problemName: problemName || t("Analyse stratégique sans titre", "تحليل استراتيجي بدون عنوان"),
        factors: parsedFactors,
        result,
        language: language as "fr" | "ar",
        analysis: generateSwotAnalysis(result),
        recommendations: generateSwotRecommendations(parsedFactors),
      });
    } finally {
      setExporting(false);
    }
  };

  const analysis = result ? generateSwotAnalysis(result) : [];
  const recommendations = result ? generateSwotRecommendations(parsedFactors) : [];
  const recommendationGroups = ["SO", "WO", "ST", "WT", "INFO"].map((group) => ({
    group,
    items: recommendations.filter((recommendation) => {
      if (group === "INFO") return !/Stratégie (SO|WO|ST|WT)/.test(recommendation.fr);
      return recommendation.fr.includes(`Stratégie ${group}`);
    }),
  })).filter((section) => section.items.length > 0);

  return (
    <div className={`min-h-[100dvh] bg-muted/20 ${isAr ? "rtl" : "ltr"}`} dir={isAr ? "rtl" : "ltr"}>
      <main className="container mx-auto px-4 py-8 space-y-8 max-w-6xl">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/industrial-management" className="hover:text-primary transition-colors flex items-center gap-1">
            <ArrowLeft className={`w-3.5 h-3.5 ${isAr ? "rotate-180" : ""}`} />
            {t("Gestion Industrielle", "التسيير الصناعي")}
          </Link>
          <span>/</span>
          <span className="font-semibold text-foreground">{t("Analyse stratégique", "التحليل الاستراتيجي")}</span>
        </nav>

        <section className="bg-primary text-primary-foreground rounded-xl p-6 md:p-8 shadow-md relative overflow-hidden">
          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-primary-foreground/15 rounded-full px-3 py-1 text-xs font-medium mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
              {t("Module — Stratégie & Décision", "وحدة — الاستراتيجية والقرار")}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2 leading-tight">
              {t("Analyse SWOT / PESTEL", "تحليل SWOT / PESTEL")}
            </h1>
            <p className="text-primary-foreground/80 max-w-2xl text-sm leading-relaxed">
              {t(
                "Évaluez les facteurs internes et externes avec les matrices IFE/EFE, puis transformez vos constats en stratégies TOWS concrètes.",
                "قيّم العوامل الداخلية والخارجية باستخدام مصفوفتَي IFE/EFE، ثم حوّل نتائجك إلى استراتيجيات TOWS عملية.",
              )}
            </p>
          </div>
          <div className="absolute -right-16 -bottom-16 opacity-10 pointer-events-none"><BarChart3 className="w-64 h-64" /></div>
        </section>

        {phase === "form" ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Target className="w-5 h-5 text-primary" />{t("Secteur et nom de l'analyse", "القطاع واسم التحليل")}</CardTitle>
                <CardDescription>{t("Le modèle initial contient volontairement des forces et opportunités pour tester une analyse partielle.", "النموذج الأولي يحتوي عمدًا على نقاط قوة وفرص لاختبار التحليل الجزئي.")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="max-w-sm space-y-1.5">
                  <Label className="text-xs font-semibold">{t("Nom de la session", "اسم المسألة")}</Label>
                  <Input value={problemName} onChange={(event) => setProblemName(event.target.value)} placeholder={t("ex. Diagnostic stratégique — Batna", "مثال: التشخيص الاستراتيجي — باتنة")} />
                </div>
                <div className="flex flex-wrap gap-3">
                  {SECTORS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button key={item.id} onClick={() => loadTemplate(item.id)} className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all",
                        sector === item.id ? "bg-primary text-primary-foreground border-primary shadow" : "bg-card border-border text-muted-foreground hover:border-primary/50",
                      )}>
                        <Icon className="w-4 h-4" />{isAr ? item.ar : item.fr}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{t("Facteurs SWOT et PESTEL", "عوامل SWOT وPESTEL")}</CardTitle>
                    <CardDescription>{t("Classez chaque facteur, attribuez son poids relatif et notez son impact de 1 à 4.", "صنّف كل عامل، حدّد وزنه النسبي، وقيّم أثره من 1 إلى 4.")}</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={addFactor} className="gap-1.5 shrink-0"><Plus className="w-4 h-4" />{t("Ajouter", "إضافة")}</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-600" />
                  {t("Les poids internes (forces + faiblesses) et externes (opportunités + menaces) se totalisent séparément à 1.00.", "تُجمع الأوزان الداخلية (القوة + الضعف) والخارجية (الفرص + التهديدات) بشكل منفصل إلى 1.00.")}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[920px]">
                    <thead><tr className="bg-primary text-primary-foreground">
                      <th className="px-3 py-2.5 text-start text-xs font-semibold">#</th>
                      <th className="px-3 py-2.5 text-start text-xs font-semibold">{t("Catégorie", "الفئة")}</th>
                      <th className="px-3 py-2.5 text-start text-xs font-semibold">{t("Facteur", "العامل")}</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold">{t("Poids", "الوزن")}</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold">{t("Note /4", "التقييم /4")}</th>
                      <th className="px-3 py-2.5 text-start text-xs font-semibold">{t("Dimension PESTEL (externe)", "بُعد PESTEL (خارجي)")}</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold">{t("Action", "إجراء")}</th>
                    </tr></thead>
                    <tbody>{factors.map((factor, index) => (
                      <tr key={factor.id} className={cn("border-b border-border", index % 2 === 0 ? "bg-card" : "bg-muted/10")}>
                        <td className="px-3 py-2 text-xs text-muted-foreground font-bold">{index + 1}</td>
                        <td className="px-2 py-2">
                          <select value={factor.category} onChange={(event) => updateFactor(factor.id, "category", event.target.value)} className={cn("h-8 rounded-md border px-2 text-xs font-semibold w-32", CATEGORY_COLORS[factor.category])}>
                            {CATEGORIES.map((category) => <option key={category.value} value={category.value}>{isAr ? category.ar : category.fr}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-2"><Input value={factor.label} onChange={(event) => updateFactor(factor.id, "label", event.target.value)} placeholder={t("Décrire le facteur", "وصف العامل")} className="h-8 text-xs min-w-[220px]" /></td>
                        <td className="px-2 py-2"><Input type="number" min={0} max={1} step="0.05" value={factor.weight} onChange={(event) => updateFactor(factor.id, "weight", event.target.value)} className="h-8 text-xs text-center w-20" /></td>
                        <td className="px-2 py-2"><Input type="number" min={1} max={4} step="0.5" value={factor.rating} onChange={(event) => updateFactor(factor.id, "rating", event.target.value)} className="h-8 text-xs text-center w-20" /></td>
                        <td className="px-2 py-2">
                          <select value={factor.pestelDimension} disabled={!isExternal(factor.category)} onChange={(event) => updateFactor(factor.id, "pestelDimension", event.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs w-44 disabled:opacity-40">
                            <option value="">{t("Non précisée", "غير محدد")}</option>
                            {PESTEL.map((dimension) => <option key={dimension.value} value={dimension.value}>{isAr ? dimension.ar : dimension.fr}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-2 text-center"><button onClick={() => setFactors((current) => current.filter((item) => item.id !== factor.id))} disabled={factors.length === 1} className="text-red-400 hover:text-red-600 disabled:opacity-30" title={t("Supprimer", "حذف")}><Trash2 className="w-4 h-4 mx-auto" /></button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <WeightSummary label={t("Total interne — Forces + Faiblesses", "المجموع الداخلي — القوة + الضعف")} value={internalWeight} />
              <WeightSummary label={t("Total externe — Opportunités + Menaces", "المجموع الخارجي — الفرص + التهديدات")} value={externalWeight} />
            </div>

            {errors.map((error, index) => (
              <div key={`${error.type}-${index}`} className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" /><span>{isAr ? error.msgAr : error.msgFr}</span>
              </div>
            ))}

            <div className="flex justify-end"><Button onClick={handleSolve} size="lg" className="gap-2 px-8"><BarChart3 className="w-5 h-5" />{t("Analyser la situation", "تحليل الوضع")}</Button></div>
          </div>
        ) : result ? (
          <div className="space-y-8" ref={resultRef}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <ScoreCard label={t("Score IFE", "نتيجة IFE")} value={`${result.ifeScore.toFixed(2)}/4`} cls="bg-primary/10 text-primary border-primary/20" />
              <ScoreCard label={t("Score EFE", "نتيجة EFE")} value={`${result.efeScore.toFixed(2)}/4`} cls="bg-sky-50 text-sky-700 border-sky-200" />
              <ScoreCard label={t("Quadrant stratégique", "المربع الاستراتيجي")} value={quadrantLabel(result.quadrant, isAr)} cls="bg-emerald-50 text-emerald-700 border-emerald-200" />
              <ScoreCard label={t("Catégories renseignées", "الفئات المدخلة")} value={`${result.populatedCategories.length}/4`} cls="bg-amber-50 text-amber-700 border-amber-200" />
            </div>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="w-5 h-5 text-primary" />{t("Synthèse des facteurs prioritaires", "ملخص العوامل ذات الأولوية")}</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {([
                  ["strength", result.topStrength, "🟢"],
                  ["weakness", result.topWeakness, "🟠"],
                  ["opportunity", result.topOpportunity, "🔵"],
                  ["threat", result.topThreat, "🔴"],
                ] as const).map(([category, factor, icon]) => (
                  <div key={category} className={cn("rounded-lg border px-4 py-3", factor ? CATEGORY_COLORS[category] : "bg-muted/30 border-border text-muted-foreground")}>
                    <div className="text-xs font-bold uppercase tracking-wide">{icon} {categoryLabel(category, isAr)}</div>
                    <div className="mt-1 text-sm font-semibold">{factor?.label ?? t("Non renseignée", "غير مدخلة")}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Info className="w-5 h-5 text-primary" />{t("Analyse de la situation", "تحليل الوضع")}</CardTitle></CardHeader><CardContent className="space-y-3">{analysis.map((line, index) => <div key={index} className="bg-primary/5 border border-primary/15 rounded-lg px-4 py-3 text-sm leading-relaxed">{isAr ? line.ar : line.fr}</div>)}</CardContent></Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="w-5 h-5 text-primary" />{t("Recommandations TOWS", "توصيات TOWS")}</CardTitle><CardDescription>{t("Les stratégies sont regroupées par combinaison de facteurs et les catégories manquantes sont signalées.", "تم تجميع الاستراتيجيات حسب تركيبة العوامل مع الإشارة إلى الفئات الناقصة.")}</CardDescription></CardHeader>
              <CardContent className="space-y-5">
                {recommendationGroups.map((section) => (
                  <div key={section.group} className="space-y-2">
                    <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">{section.group === "INFO" ? t("Couverture des données", "اكتمال البيانات") : `${t("Stratégies", "استراتيجيات")} ${section.group}`}</h3>
                    {section.items.map((rec, index) => <div key={`${section.group}-${index}`} className={cn("border rounded-xl p-4 space-y-1.5", isAr ? "border-r-4" : "border-l-4", section.group === "INFO" ? "border-muted-foreground/40" : "border-primary/60")}><div className="font-bold text-sm flex items-start gap-2"><span>{rec.icon}</span><span>{isAr ? rec.ar : rec.fr}</span></div><p className="text-xs text-muted-foreground leading-relaxed">{isAr ? rec.descAr : rec.descFr}</p></div>)}
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <Button variant="outline" onClick={() => setPhase("form")} className="gap-2 w-full sm:w-auto"><ArrowLeft className={`w-4 h-4 ${isAr ? "rotate-180" : ""}`} />{t("Modifier les données", "تعديل البيانات")}</Button>
              <div className="flex-1" />
              {saveError && <span className="text-xs text-red-600">{t("Échec de l'enregistrement", "فشل الحفظ")}</span>}
              <Button variant="outline" onClick={handleSave} disabled={saving || saved} className="gap-2 w-full sm:w-auto">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Save className="w-4 h-4" />}{saving ? t("Enregistrement…", "جارٍ الحفظ…") : saved ? t("Enregistré !", "تم الحفظ!") : t("Enregistrer", "حفظ في السجل")}</Button>
              <Button onClick={handleExport} disabled={exporting} className="gap-2 w-full sm:w-auto">{exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}{exporting ? t("Export en cours…", "جارٍ التصدير…") : t("Exporter PDF", "تصدير PDF")}</Button>
            </div>
          </div>
        ) : null}

        <footer className="border-t pt-8 pb-4 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2"><div className="bg-primary text-primary-foreground p-1 rounded"><BarChart3 className="w-4 h-4" /></div><span className="font-bold text-foreground">OptimDZ</span><span>·</span><span>{t("Analyse stratégique", "التحليل الاستراتيجي")}</span></div>
          <Link href="/industrial-management" className="hover:text-primary transition-colors">{t("← Gestion Industrielle", "→ التسيير الصناعي")}</Link>
        </footer>
      </main>
    </div>
  );
}

function WeightSummary({ label, value }: { label: string; value: number }) {
  const valid = Math.abs(value - 1) <= 0.05;
  return (
    <div className={cn("rounded-xl border p-4 bg-card", valid ? "border-emerald-200" : "border-amber-200")}>
      <div className="flex items-center justify-between gap-3 text-xs font-semibold"><span>{label}</span><span className={valid ? "text-emerald-700" : "text-amber-700"}>{value.toFixed(2)} / 1.00</span></div>
      <div className="h-2 rounded-full bg-muted mt-3 overflow-hidden"><div className={cn("h-full rounded-full transition-all", valid ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${Math.min(value * 100, 100)}%` }} /></div>
      <div className="mt-2 text-[11px] text-muted-foreground">{valid ? "✓" : "!"} {valid ? "Total valide" : "Ajustement requis"}</div>
    </div>
  );
}

function ScoreCard({ label, value, cls }: { label: string; value: string; cls: string }) {
  return <div className={cn("rounded-xl border p-4 space-y-1", cls)}><div className="text-xs font-medium opacity-75">{label}</div><div className="text-2xl font-black">{value}</div></div>;
}