import { useState, useRef } from "react";
import { Link } from "wouter";
import { useLanguage } from "@/lib/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList, Plus, Trash2, Calculator, Save, FileText,
  CheckCircle2, Loader2, AlertTriangle, ChevronDown, ChevronUp,
  Factory, ShoppingBag, Leaf, Monitor, PencilRuler, RefreshCw,
  ArrowLeft, Package,
} from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  computeMrp, generateMrpAnalysis, generateMrpRecommendations,
  buildPeriodLabels, mrpOverallStatus,
  type MrpInputs, type MrpResults, type MrpProduct, type MrpComponent,
  type PeriodType,
} from "@/lib/mrpAlgorithm";
import { generateMrpPDF } from "@/lib/generateMrpPDF";

// ── Draft types (strings for form inputs) ────────────────────────────────────
interface CompDraft {
  id: string;
  name: string;
  qtyPerUnit: string;
  stockInitial: string;
  leadTime: string;
  lotSize: string;
}

interface ProdDraft {
  id: string;
  name: string;
  stockInitial: string;
  leadTime: string;
  lotSize: string;
  demands: string[]; // one per period
  components: CompDraft[];
  showComponents: boolean;
}

// ── ID helpers ────────────────────────────────────────────────────────────────
let _uid = 0;
function uid() { return `id${++_uid}`; }

function makeComp(): CompDraft {
  return { id: uid(), name: "", qtyPerUnit: "1", stockInitial: "0", leadTime: "1", lotSize: "0" };
}

function makeProd(periodCount: number): ProdDraft {
  return {
    id: uid(),
    name: "",
    stockInitial: "0",
    leadTime: "1",
    lotSize: "0",
    demands: Array(periodCount).fill(""),
    components: [],
    showComponents: false,
  };
}

// ── Sector definitions ────────────────────────────────────────────────────────
type SectorKey = "industrie" | "agriculture" | "services" | "custom";
interface Sector { id: SectorKey; icon: React.ElementType; nameAr: string; nameFr: string; }

const SECTORS: Sector[] = [
  { id: "industrie",   icon: Factory,     nameAr: "الصناعة",   nameFr: "Industrie" },
  { id: "agriculture", icon: Leaf,        nameAr: "الفلاحة",   nameFr: "Agriculture" },
  { id: "services",    icon: Monitor,     nameAr: "الخدمات",   nameFr: "Services" },
  { id: "custom",      icon: PencilRuler, nameAr: "مخصص",      nameFr: "Personnalisé" },
];

// ── Sector templates ──────────────────────────────────────────────────────────
function buildTemplate(sector: SectorKey, periodCount: number, periodType: PeriodType): ProdDraft[] {
  const fill = (vals: number[]): string[] => {
    const arr = Array(periodCount).fill("0");
    vals.forEach((v, i) => { if (i < periodCount) arr[i] = String(v); });
    return arr;
  };

  if (sector === "industrie") {
    return [{
      id: uid(), name: "Châssis assemblé / هيكل مُجمَّع",
      stockInitial: "30", leadTime: "2", lotSize: "50",
      demands: fill([100, 150, 120, 180, 140, 160]),
      showComponents: true,
      components: [
        { id: uid(), name: "Profilé acier / قضيب فولاذي", qtyPerUnit: "3", stockInitial: "150", leadTime: "1", lotSize: "100" },
        { id: uid(), name: "Vis de fixation / براغي التثبيت", qtyPerUnit: "12", stockInitial: "600", leadTime: "1", lotSize: "500" },
      ],
    }];
  }
  if (sector === "agriculture") {
    return [{
      id: uid(), name: periodType === "mois" ? "Production blé / إنتاج قمح" : "Récolte semaine / حصاد أسبوعي",
      stockInitial: "0", leadTime: "2", lotSize: "100",
      demands: fill([0, 0, 200, 400, 600, 300]),
      showComponents: true,
      components: [
        { id: uid(), name: "Semences / بذور", qtyPerUnit: "2", stockInitial: "0", leadTime: "1", lotSize: "50" },
        { id: uid(), name: "Engrais azotés / أسمدة آزوتية", qtyPerUnit: "1.5", stockInitial: "0", leadTime: "1", lotSize: "100" },
      ],
    }];
  }
  if (sector === "services") {
    return [{
      id: uid(), name: "Kit papeterie / طقم قرطاسية",
      stockInitial: "50", leadTime: "1", lotSize: "20",
      demands: fill([80, 60, 90, 70, 85, 65]),
      showComponents: true,
      components: [
        { id: uid(), name: "Ramettes papier / رزم ورق", qtyPerUnit: "5", stockInitial: "100", leadTime: "1", lotSize: "50" },
        { id: uid(), name: "Stylos / أقلام", qtyPerUnit: "10", stockInitial: "200", leadTime: "1", lotSize: "100" },
      ],
    }];
  }
  // custom
  return [makeProd(periodCount)];
}

// ── Parse draft to algorithm input ───────────────────────────────────────────
function parseDraft(products: ProdDraft[], periodCount: number): MrpProduct[] {
  return products.map(p => ({
    id: p.id,
    name: p.name.trim() || "?",
    stockInitial: Math.max(0, parseFloat(p.stockInitial) || 0),
    leadTime: Math.max(0, parseInt(p.leadTime) || 0),
    lotSize: Math.max(0, parseInt(p.lotSize) || 0),
    demands: Array.from({ length: periodCount }, (_, i) => Math.max(0, parseFloat(p.demands[i]) || 0)),
    components: p.components.map(c => ({
      id: c.id,
      name: c.name.trim() || "?",
      qtyPerUnit: Math.max(0.01, parseFloat(c.qtyPerUnit) || 1),
      stockInitial: Math.max(0, parseFloat(c.stockInitial) || 0),
      leadTime: Math.max(0, parseInt(c.leadTime) || 0),
      lotSize: Math.max(0, parseInt(c.lotSize) || 0),
    })),
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fNum(n: number): string {
  if (n === 0) return "—";
  return n.toLocaleString("fr-DZ", { maximumFractionDigits: 1 });
}

// ── Status colors ─────────────────────────────────────────────────────────────
const statusCfg = {
  good:     { bg: "bg-green-50",  border: "border-green-200", text: "text-green-700",  badge: "bg-green-100 text-green-700" },
  warning:  { bg: "bg-amber-50",  border: "border-amber-200", text: "text-amber-700",  badge: "bg-amber-100 text-amber-700" },
  critical: { bg: "bg-red-50",    border: "border-red-200",   text: "text-red-700",    badge: "bg-red-100 text-red-700" },
};

// ── Cell color for MRP table ──────────────────────────────────────────────────
function cellClass(rowKey: string, val: number): string {
  if (val === 0) return "text-muted-foreground/40";
  if (rowKey === "besoinsNets")    return "bg-amber-50 text-amber-800 font-bold";
  if (rowKey === "ordreReception") return "bg-blue-50 text-blue-800 font-bold";
  if (rowKey === "ordreLancement") return "bg-primary/10 text-primary font-bold";
  if (rowKey === "stockDisponible" && val === 0) return "bg-red-50 text-red-700 font-bold";
  return "font-semibold";
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProductionPlanning() {
  const { t, language } = useLanguage();
  const isAr = language === "ar";

  // ── Form state ──────────────────────────────────────────────────────────────
  const [phase, setPhase]               = useState<"form" | "results">("form");
  const [problemName, setProblemName]   = useState("");
  const [periodType, setPeriodType]     = useState<PeriodType>("mois");
  const [periodCount, setPeriodCount]   = useState(4);
  const [products, setProducts]         = useState<ProdDraft[]>(() => [makeProd(4)]);
  const [sector, setSector]             = useState<SectorKey>("industrie");

  // ── Result state ────────────────────────────────────────────────────────────
  const [results, setResults]   = useState<MrpResults | null>(null);
  const [progress, setProgress] = useState("");
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");

  const resultRef = useRef<HTMLDivElement>(null);

  // ── Period count change: resize demand arrays ─────────────────────────────
  function handlePeriodCountChange(n: number) {
    setPeriodCount(n);
    setProducts(prev => prev.map(p => ({
      ...p,
      demands: Array.from({ length: n }, (_, i) => p.demands[i] ?? ""),
    })));
  }

  // ── Sector template load ──────────────────────────────────────────────────
  function loadTemplate(s: SectorKey) {
    setSector(s);
    setProducts(buildTemplate(s, periodCount, periodType));
  }

  // ── Product mutations ─────────────────────────────────────────────────────
  function addProduct() {
    setProducts(prev => [...prev, makeProd(periodCount)]);
  }
  function removeProduct(id: string) {
    setProducts(prev => prev.filter(p => p.id !== id));
  }
  function updateProduct(id: string, field: keyof Omit<ProdDraft, "id" | "demands" | "components" | "showComponents">, val: string) {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p));
  }
  function updateDemand(id: string, periodIdx: number, val: string) {
    setProducts(prev => prev.map(p => p.id === id
      ? { ...p, demands: p.demands.map((d, i) => i === periodIdx ? val : d) }
      : p));
  }
  function toggleComponents(id: string) {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, showComponents: !p.showComponents } : p));
  }

  // ── Component mutations ───────────────────────────────────────────────────
  function addComponent(prodId: string) {
    setProducts(prev => prev.map(p => p.id === prodId
      ? { ...p, components: [...p.components, makeComp()], showComponents: true }
      : p));
  }
  function removeComponent(prodId: string, compId: string) {
    setProducts(prev => prev.map(p => p.id === prodId
      ? { ...p, components: p.components.filter(c => c.id !== compId) }
      : p));
  }
  function updateComponent(prodId: string, compId: string, field: keyof Omit<CompDraft, "id">, val: string) {
    setProducts(prev => prev.map(p => p.id === prodId
      ? { ...p, components: p.components.map(c => c.id === compId ? { ...c, [field]: val } : c) }
      : p));
  }

  // ── Compute ───────────────────────────────────────────────────────────────
  function handleCompute() {
    if (products.length === 0) return;
    const inputs: MrpInputs = {
      problemName: problemName || t("Planification sans titre", "تخطيط بدون عنوان"),
      periodType,
      periodCount,
      products: parseDraft(products, periodCount),
    };
    const r = computeMrp(inputs);
    setResults(r);
    setPhase("results");
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!results) return;
    setSaving(true);
    try {
      const inputs: MrpInputs = {
        problemName: problemName || t("Planification sans titre", "تخطيط بدون عنوان"),
        periodType, periodCount,
        products: parseDraft(products, periodCount),
      };
      await fetch("/api/problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "industrial-mrp",
          name: inputs.problemName,
          content: { inputs, results },
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  // ── PDF export ────────────────────────────────────────────────────────────
  async function handleExport() {
    if (!results) return;
    setExporting(true);
    try {
      await generateMrpPDF({
        problemName: problemName || t("Planification sans titre", "تخطيط بدون عنوان"),
        periodType,
        results,
        language: language as "fr" | "ar",
        analysisLines: generateMrpAnalysis(results),
        recommendations: generateMrpRecommendations(results),
        onProgress: (step, _pct) => setExportProgress(step),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
      setExportProgress("");
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const periodLabels = buildPeriodLabels(periodType, periodCount);
  const canCompute = products.length > 0 && products.some(p =>
    p.demands.some(d => parseFloat(d) > 0) || parseFloat(p.stockInitial) > 0
  );

  const status = results ? mrpOverallStatus(results) : null;
  const statusLabel = {
    good:     { fr: "Plan Optimal",    ar: "خطة مثالية" },
    warning:  { fr: "Ordres requis",   ar: "أوامر مطلوبة" },
    critical: { fr: "Alertes urgentes",ar: "تنبيهات عاجلة" },
  };

  const mrpRowKeys = [
    { key: "besoinsBruts",    fr: "Besoins Bruts",      ar: "الاحتياجات الإجمالية" },
    { key: "stockDisponible", fr: "Stock Disponible",   ar: "المخزون المتاح" },
    { key: "besoinsNets",     fr: "Besoins Nets",       ar: "الاحتياجات الصافية" },
    { key: "ordreReception",  fr: "Ordres Réception",   ar: "أوامر الاستلام" },
    { key: "ordreLancement",  fr: "Ordres Lancement",   ar: "أوامر الإطلاق" },
  ] as const;

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
          <span className="font-semibold text-foreground">{t("Planification de la Production", "تخطيط الإنتاج")}</span>
        </nav>

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="bg-primary text-primary-foreground rounded-xl p-6 md:p-8 shadow-md relative overflow-hidden">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 bg-primary-foreground/15 rounded-full px-3 py-1 text-xs font-medium mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
              {t("Module — Planification de la Production SC", "وحدة — تخطيط الإنتاج")}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2 leading-tight">
              {t("Planification de la Production — MRP", "تخطيط الإنتاج — MRP")}
            </h1>
            <p className="text-primary-foreground/80 max-w-2xl text-sm leading-relaxed">
              {t(
                "Calculez les besoins bruts, nets, les ordres de lancement et de réception pour vos produits finis et composants — avec explosion de nomenclature (BOM) sur plusieurs niveaux.",
                "احسب الاحتياجات الإجمالية والصافية وأوامر الإطلاق والاستلام لمنتجاتك النهائية ومكوناتها — مع تفجير قائمة المواد (BOM) متعدد المستويات."
              )}
            </p>
          </div>
          <div className="absolute -right-16 -bottom-16 opacity-10 pointer-events-none">
            <ClipboardList className="w-64 h-64" />
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            FORM PHASE
        ════════════════════════════════════════════════════════════════════ */}
        {phase === "form" && (
          <div className="space-y-6">

            {/* ── General info ──────────────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="w-5 h-5 text-primary" />
                  {t("Paramètres généraux", "المعلمات العامة")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-1 space-y-1.5">
                    <Label className="text-xs font-semibold">{t("Nom du problème", "اسم المسألة")}</Label>
                    <Input
                      value={problemName}
                      onChange={e => setProblemName(e.target.value)}
                      placeholder={t("ex. Plan MRP — T1 2026", "مثال: خطة MRP — الربع الأول 2026")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">{t("Unité de période", "وحدة الفترة")}</Label>
                    <div className="flex rounded-md overflow-hidden border border-border h-9">
                      {(["semaines", "mois"] as PeriodType[]).map(pt => (
                        <button
                          key={pt}
                          onClick={() => setPeriodType(pt)}
                          className={cn(
                            "flex-1 text-sm font-semibold transition-colors px-3",
                            periodType === pt
                              ? "bg-primary text-primary-foreground"
                              : "bg-card text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {pt === "semaines" ? t("Semaines", "أسابيع") : t("Mois", "أشهر")}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      {t(`Nombre de périodes (${periodCount})`, `عدد الفترات (${periodCount})`)}
                    </Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range" min={2} max={12} step={1}
                        value={periodCount}
                        onChange={e => handlePeriodCountChange(parseInt(e.target.value))}
                        className="flex-1 accent-primary"
                      />
                      <span className="text-sm font-bold w-6 text-center">{periodCount}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {periodLabels.join(" · ")}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Sector template ───────────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Factory className="w-5 h-5 text-primary" />
                  {t("Secteur d'activité (modèle de départ)", "قطاع النشاط (نموذج أولي)")}
                </CardTitle>
                <CardDescription>
                  {t("Chargez un exemple pré-rempli pour votre secteur. Vous pouvez ensuite modifier toutes les valeurs.", "حمّل مثالاً مُعبَّأ مسبقاً لقطاعك. يمكنك بعد ذلك تعديل جميع القيم.")}
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

            {/* ── Products ──────────────────────────────────────────────────── */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">{t("Produits finis", "المنتجات النهائية")}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("Saisissez la demande prévue par période pour chaque produit.", "أدخل الطلب المتوقع لكل فترة لكل منتج.")}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={addProduct} className="gap-1.5">
                  <Plus className="w-4 h-4" />
                  {t("Ajouter un produit", "إضافة منتج")}
                </Button>
              </div>

              {products.map((prod, pi) => (
                <Card key={prod.id} className="border-primary/30">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                          {pi + 1}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {t("Produit fini", "منتج نهائي")}
                          </p>
                          <p className="text-sm font-bold text-foreground">
                            {prod.name || t("Sans nom", "بدون اسم")}
                          </p>
                        </div>
                      </div>
                      {products.length > 1 && (
                        <Button variant="ghost" size="sm" onClick={() => removeProduct(prod.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Product params */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs font-semibold">{t("Nom du produit", "اسم المنتج")}</Label>
                        <Input
                          value={prod.name}
                          onChange={e => updateProduct(prod.id, "name", e.target.value)}
                          placeholder={t("ex. Produit A", "مثال: منتج أ")}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">{t("Stock initial", "المخزون الأولي")}</Label>
                        <Input type="number" min={0}
                          value={prod.stockInitial}
                          onChange={e => updateProduct(prod.id, "stockInitial", e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">{t("Délai d'obtention (périodes)", "وقت الانتظار (فترات)")}</Label>
                        <Input type="number" min={0} max={periodCount}
                          value={prod.leadTime}
                          onChange={e => updateProduct(prod.id, "leadTime", e.target.value)}
                          placeholder="1"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">
                          {t("Taille de lot (0 = lot-pour-lot)", "حجم الدفعة (0 = دفعة فردية)")}
                        </Label>
                        <Input type="number" min={0}
                          value={prod.lotSize}
                          onChange={e => updateProduct(prod.id, "lotSize", e.target.value)}
                          placeholder="0"
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("0 = commande exactement les besoins nets", "0 = طلب الاحتياج الصافي بالضبط")}
                        </p>
                      </div>
                    </div>

                    {/* Demand grid */}
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">{t("Demande prévue par période", "الطلب المتوقع حسب الفترة")}</Label>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr>
                              {periodLabels.map(pl => (
                                <th key={pl} className="text-center font-semibold text-xs text-muted-foreground px-2 py-1 bg-muted/40 border border-border first:rounded-tl-md last:rounded-tr-md">
                                  {pl}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              {prod.demands.map((d, i) => (
                                <td key={i} className="border border-border p-0">
                                  <input
                                    type="number" min={0}
                                    value={d}
                                    onChange={e => updateDemand(prod.id, i, e.target.value)}
                                    className="w-full text-center text-sm py-1.5 px-1 bg-card focus:outline-none focus:ring-1 focus:ring-primary rounded-none"
                                    placeholder="0"
                                    style={{ minWidth: "48px" }}
                                  />
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Components (BOM) */}
                    <div className="border border-dashed border-border rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleComponents(prod.id)}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-primary" />
                          {t("Nomenclature — Composants (BOM)", "قائمة المواد — المكونات (BOM)")}
                          {prod.components.length > 0 && (
                            <Badge variant="secondary" className="text-xs">{prod.components.length}</Badge>
                          )}
                        </div>
                        {prod.showComponents ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </button>

                      {prod.showComponents && (
                        <div className="px-4 pb-4 pt-2 space-y-3 bg-muted/10">
                          <p className="text-xs text-muted-foreground">
                            {t("Ajoutez les composants nécessaires à la fabrication d'une unité de ce produit.", "أضف المكونات اللازمة لتصنيع وحدة واحدة من هذا المنتج.")}
                          </p>
                          {prod.components.map((comp) => (
                            <div key={comp.id} className="bg-card border border-border rounded-lg p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                                  {t("Composant", "مكوّن")}
                                </span>
                                <Button variant="ghost" size="sm" onClick={() => removeComponent(prod.id, comp.id)}
                                  className="text-red-400 hover:text-red-600 hover:bg-red-50 h-6 w-6 p-0">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                <div className="col-span-2 space-y-1">
                                  <Label className="text-xs">{t("Nom du composant", "اسم المكوّن")}</Label>
                                  <Input value={comp.name} onChange={e => updateComponent(prod.id, comp.id, "name", e.target.value)}
                                    placeholder={t("ex. Acier plat", "مثال: فولاذ مسطح")} className="h-8 text-sm" />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">{t("Qté / unité", "الكمية / وحدة")}</Label>
                                  <Input type="number" min={0.01} step={0.01}
                                    value={comp.qtyPerUnit} onChange={e => updateComponent(prod.id, comp.id, "qtyPerUnit", e.target.value)}
                                    className="h-8 text-sm" />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">{t("Stock initial", "المخزون الأولي")}</Label>
                                  <Input type="number" min={0}
                                    value={comp.stockInitial} onChange={e => updateComponent(prod.id, comp.id, "stockInitial", e.target.value)}
                                    className="h-8 text-sm" placeholder="0" />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">{t("Délai (périodes)", "الانتظار (فترات)")}</Label>
                                  <Input type="number" min={0}
                                    value={comp.leadTime} onChange={e => updateComponent(prod.id, comp.id, "leadTime", e.target.value)}
                                    className="h-8 text-sm" placeholder="1" />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">{t("Taille de lot", "حجم الدفعة")}</Label>
                                  <Input type="number" min={0}
                                    value={comp.lotSize} onChange={e => updateComponent(prod.id, comp.id, "lotSize", e.target.value)}
                                    className="h-8 text-sm" placeholder="0" />
                                </div>
                              </div>
                            </div>
                          ))}
                          <Button variant="outline" size="sm" onClick={() => addComponent(prod.id)} className="gap-1.5 text-xs">
                            <Plus className="w-3.5 h-3.5" />
                            {t("Ajouter un composant", "إضافة مكوّن")}
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* ── Compute button ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-3">
              <Button
                size="lg"
                onClick={handleCompute}
                disabled={!canCompute}
                className="gap-2 min-w-[200px]"
              >
                <Calculator className="w-5 h-5" />
                {t("Calculer le plan MRP", "حساب خطة MRP")}
              </Button>
              {!canCompute && (
                <p className="text-sm text-muted-foreground">
                  {t("Saisissez au moins une demande ou un stock initial.", "أدخل طلباً واحداً على الأقل أو مخزوناً أولياً.")}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            RESULTS PHASE
        ════════════════════════════════════════════════════════════════════ */}
        {phase === "results" && results && (
          <div className="space-y-6" ref={resultRef}>

            {/* Back button */}
            <Button variant="outline" size="sm" onClick={() => setPhase("form")} className="gap-1.5">
              <RefreshCw className="w-4 h-4" />
              {t("Modifier les données", "تعديل البيانات")}
            </Button>

            {/* Status banner */}
            {status && (
              <div className={cn("rounded-xl border p-5", statusCfg[status].bg, statusCfg[status].border)}>
                <div className="flex items-start gap-3">
                  {status === "good" ? <CheckCircle2 className="w-6 h-6 text-green-600 mt-0.5 shrink-0" /> : <AlertTriangle className={cn("w-6 h-6 mt-0.5 shrink-0", statusCfg[status].text)} />}
                  <div>
                    <div className={cn("font-bold text-lg", statusCfg[status].text)}>
                      {t(statusLabel[status].fr, statusLabel[status].ar)}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t(
                        `${results.items.length} article(s) analysé(s) · ${results.totalOrdersPlanned} unités à commander · ${results.urgentItemCount} alerte(s) urgente(s)`,
                        `${results.items.length} صنف(أصناف) محلَّل(ة) · ${results.totalOrdersPlanned} وحدة للطلب · ${results.urgentItemCount} تنبيه(تنبيهات) عاجل(ة)`
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { labelFr: "Articles planifiés", labelAr: "أصناف مخططة", value: results.items.length, color: "text-primary", bg: "bg-primary/5" },
                { labelFr: "Unités à commander", labelAr: "وحدات للطلب", value: results.totalOrdersPlanned, color: "text-blue-700", bg: "bg-blue-50" },
                { labelFr: "Alertes urgentes", labelAr: "تنبيهات عاجلة", value: results.urgentItemCount, color: results.urgentItemCount > 0 ? "text-red-700" : "text-green-700", bg: results.urgentItemCount > 0 ? "bg-red-50" : "bg-green-50" },
                { labelFr: "Périodes analysées", labelAr: "فترات محللة", value: results.periodLabels.length, color: "text-amber-700", bg: "bg-amber-50" },
              ].map(card => (
                <div key={card.labelFr} className={cn("rounded-xl border p-4 text-center", card.bg)}>
                  <div className={cn("text-3xl font-extrabold", card.color)}>{card.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{t(card.labelFr, card.labelAr)}</div>
                </div>
              ))}
            </div>

            {/* ── MRP Tables ──────────────────────────────────────────────────── */}
            <div className="space-y-4">
              <h2 className="text-xl font-bold">
                {t("Tableaux MRP par Article", "جداول MRP لكل صنف")}
              </h2>

              {results.items.map(item => (
                <Card key={item.id} className={item.isComponent ? "border-amber-200" : "border-primary/30"}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        "text-[10px] font-bold px-2.5 py-0.5 rounded-full",
                        item.isComponent ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"
                      )}>
                        {item.isComponent ? t("COMPOSANT", "مكوّن") : t("PRODUIT FINI", "منتج نهائي")}
                      </span>
                      <span className="font-bold text-base">{item.name}</span>
                      {item.parentName && (
                        <span className="text-xs text-muted-foreground">
                          {isAr ? `← ${item.parentName}` : `→ ${item.parentName}`}
                        </span>
                      )}
                      {item.lateOrders > 0 && (
                        <Badge variant="destructive" className="text-[10px]">
                          {t(`${item.lateOrders} ordre(s) urgent(s)`, `${item.lateOrders} أمر(أوامر) عاجل`)}
                        </Badge>
                      )}
                      {item.totalOrders > 0 && (
                        <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full">
                          {t(`Total: ${item.totalOrders} unités`, `الإجمالي: ${item.totalOrders} وحدة`)}
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-muted/50">
                            <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2 border border-border min-w-[140px] sticky left-0 bg-muted/60">
                              {t("Indicateur", "المؤشر")}
                            </th>
                            {results.periodLabels.map(pl => (
                              <th key={pl} className="text-center text-xs font-semibold px-2 py-2 border border-border min-w-[56px]">
                                {pl}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {mrpRowKeys.map(({ key, fr, ar }, ri) => (
                            <tr key={key} className={ri % 2 === 0 ? "bg-card" : "bg-muted/20"}>
                              <td className="px-3 py-1.5 text-xs font-semibold text-muted-foreground border border-border sticky left-0 bg-inherit">
                                {t(fr, ar)}
                              </td>
                              {item.rows.map((row, pi) => {
                                const val = row[key as keyof typeof row] as number;
                                return (
                                  <td key={pi} className={cn("text-center text-sm px-2 py-1.5 border border-border", cellClass(key, val))}>
                                    {fNum(val)}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 inline-block" />{t("Besoins nets", "احتياج صافٍ")}</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 inline-block" />{t("Ordre réception", "أمر استلام")}</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary/10 inline-block" />{t("Ordre lancement", "أمر إطلاق")}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* ── Urgent Alerts ───────────────────────────────────────────────── */}
            {results.alerts.length > 0 && (
              <Card className="border-red-200 bg-red-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-red-700 flex items-center gap-2 text-base">
                    <AlertTriangle className="w-5 h-5" />
                    {t("⚠ Alertes Urgentes", "⚠ التنبيهات العاجلة")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {results.alerts.map((alert, i) => (
                    <div key={i} className="bg-white border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                      {t(alert.msgFr, alert.msgAr)}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* ── تحليل الوضع ─────────────────────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart2Icon />
                  {t("Analyse de la Situation", "تحليل الوضع")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {generateMrpAnalysis(results).map((line, i) => (
                  <p key={i} className="bg-primary/5 border border-primary/15 rounded-lg px-4 py-3 text-sm leading-relaxed">
                    {t(line.fr, line.ar)}
                  </p>
                ))}
              </CardContent>
            </Card>

            {/* ── التوصيات الإدارية ────────────────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  {t("Recommandations Managériales", "التوصيات الإدارية")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {generateMrpRecommendations(results).map((reco, i) => (
                  <div key={i} className={cn(
                    "border rounded-xl p-4",
                    ["border-l-4 border-l-green-500", "border-l-4 border-l-amber-500", "border-l-4 border-l-primary", "border-l-4 border-l-blue-500"][i % 4]
                  )}>
                    <div className="font-bold text-sm mb-1">{reco.icon} {t(reco.fr, reco.ar)}</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">{t(reco.descFr, reco.descAr)}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* ── Actions ─────────────────────────────────────────────────────── */}
            <Card>
              <CardContent className="pt-5">
                <div className="flex flex-wrap gap-3">
                  <Button onClick={handleSave} disabled={saving || saved} variant="outline" className="gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saved ? t("Enregistré ✓", "تم الحفظ ✓") : t("Enregistrer dans le registre", "حفظ في السجل")}
                  </Button>
                  <Button onClick={handleExport} disabled={exporting} className="gap-2">
                    {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    {exporting
                      ? (exportProgress || t("Génération…", "جارٍ التوليد…"))
                      : t("Exporter en PDF", "تصدير PDF")}
                  </Button>
                </div>
              </CardContent>
            </Card>

          </div>
        )}

      </main>
    </div>
  );
}

// ── Inline icon helper (avoids extra import) ──────────────────────────────────
function BarChart2Icon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="text-primary">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}
