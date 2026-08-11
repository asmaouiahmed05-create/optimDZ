import { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/lib/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Package, Plus, Trash2, Calculator, Save, FileText,
  CheckCircle2, Loader2, TrendingUp, AlertTriangle, BarChart2,
  ShoppingBag, Factory, Leaf, Monitor, PencilRuler, Lightbulb,
  RefreshCw,
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  computeEOQ, computeReorderPoint, computeABC,
  type InventoryMode, type EOQProduct, type ReorderProduct, type ABCProduct,
  type EOQResult, type ReorderResult, type ABCResult,
} from "@/lib/inventoryAlgorithm";
import { generateInventoryPDF } from "@/lib/generateInventoryPDF";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fDA(n: number, lang: string): string {
  const locale = lang === "ar" ? "ar-DZ" : "fr-DZ";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + " M DA";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + " k DA";
  return n.toLocaleString(locale, { maximumFractionDigits: 1 }) + " DA";
}
function fNum(n: number, d = 1): string {
  return n.toLocaleString("fr-DZ", { maximumFractionDigits: d });
}
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function nextId(existing: string[]): string {
  for (const ch of LETTERS) if (!existing.includes(ch)) return ch;
  return `Z${existing.length}`;
}

// ── Sector config ─────────────────────────────────────────────────────────────
type SectorKey = "commerce" | "industry" | "agriculture" | "services" | "custom";
interface Sector { id: SectorKey; icon: React.ElementType; nameAr: string; nameFr: string; descAr: string; descFr: string; }
const SECTORS: Sector[] = [
  { id: "commerce",    icon: ShoppingBag, nameAr: "التجارة",   nameFr: "Commerce",    descAr: "بضائع استهلاكية", descFr: "Biens de consommation" },
  { id: "industry",   icon: Factory,     nameAr: "الصناعة",   nameFr: "Industrie",   descAr: "مواد أولية وقطع غيار", descFr: "Matières & pièces" },
  { id: "agriculture",icon: Leaf,        nameAr: "الفلاحة",   nameFr: "Agriculture", descAr: "مستلزمات فلاحية", descFr: "Intrants agricoles" },
  { id: "services",   icon: Monitor,     nameAr: "الخدمات",   nameFr: "Services",    descAr: "مستلزمات مكتبية", descFr: "Fournitures bureau" },
  { id: "custom",     icon: PencilRuler, nameAr: "مخصص",     nameFr: "Personnalisé",descAr: "إدخال حر",       descFr: "Saisie libre" },
];

// ── EOQ Templates ─────────────────────────────────────────────────────────────
const EOQ_TEMPLATES: Record<SectorKey, EOQProduct[]> = {
  commerce: [
    { id: "A", name: "هواتف ذكية / Smartphones",      demand: 1200, orderCost: 2500, holdingCost: 150 },
    { id: "B", name: "ملابس / Vêtements",              demand: 3000, orderCost: 800,  holdingCost: 25  },
    { id: "C", name: "إلكترونيات صغيرة / Petits élec",demand: 800,  orderCost: 1200, holdingCost: 80  },
  ],
  industry: [
    { id: "A", name: "صلب / Acier plat",               demand: 5000, orderCost: 4000, holdingCost: 200 },
    { id: "B", name: "بلاستيك / Plastique ABS",        demand: 3000, orderCost: 1800, holdingCost: 40  },
    { id: "C", name: "قطع غيار / Pièces de rechange",  demand: 800,  orderCost: 2000, holdingCost: 120 },
  ],
  agriculture: [
    { id: "A", name: "أسمدة / Engrais azotés",         demand: 2000, orderCost: 1500, holdingCost: 60  },
    { id: "B", name: "بذور / Semences sélectionnées",   demand: 500,  orderCost: 900,  holdingCost: 45  },
    { id: "C", name: "مبيدات / Produits phytosanitaires",demand:300,  orderCost: 600,  holdingCost: 85  },
  ],
  services: [
    { id: "A", name: "ورق طباعة / Papier bureautique", demand: 4000, orderCost: 300,  holdingCost: 8   },
    { id: "B", name: "أحبار / Cartouches d'encre",     demand: 600,  orderCost: 200,  holdingCost: 30  },
    { id: "C", name: "قرطاسية / Fournitures",          demand: 2000, orderCost: 150,  holdingCost: 5   },
  ],
  custom: [
    { id: "A", name: "", demand: 0, orderCost: 0, holdingCost: 0 },
    { id: "B", name: "", demand: 0, orderCost: 0, holdingCost: 0 },
  ],
};

// ── Reorder Templates ─────────────────────────────────────────────────────────
const ROP_TEMPLATES: Record<SectorKey, ReorderProduct[]> = {
  commerce: [
    { id: "A", name: "هواتف / Smartphones",    dailyDemand: 4,  leadTime: 7,  safetyStock: 15 },
    { id: "B", name: "ملابس / Vêtements",      dailyDemand: 10, leadTime: 5,  safetyStock: 30 },
  ],
  industry: [
    { id: "A", name: "صلب / Acier",            dailyDemand: 15, leadTime: 14, safetyStock: 100 },
    { id: "B", name: "بلاستيك / Plastique",    dailyDemand: 8,  leadTime: 10, safetyStock: 60  },
  ],
  agriculture: [
    { id: "A", name: "أسمدة / Engrais",        dailyDemand: 6,  leadTime: 10, safetyStock: 40  },
    { id: "B", name: "بذور / Semences",         dailyDemand: 2,  leadTime: 20, safetyStock: 20  },
  ],
  services: [
    { id: "A", name: "ورق / Papier",           dailyDemand: 12, leadTime: 3,  safetyStock: 25  },
    { id: "B", name: "أحبار / Cartouches",     dailyDemand: 2,  leadTime: 5,  safetyStock: 8   },
  ],
  custom: [
    { id: "A", name: "", dailyDemand: 0, leadTime: 0, safetyStock: 0 },
  ],
};

// ── ABC Templates ─────────────────────────────────────────────────────────────
const ABC_TEMPLATES: Record<SectorKey, ABCProduct[]> = {
  commerce: [
    { id: "A", name: "هواتف / Smartphones",     annualValue: 1200000 },
    { id: "B", name: "لوحات / Tablettes",        annualValue: 480000  },
    { id: "C", name: "سماعات / Écouteurs",       annualValue: 150000  },
    { id: "D", name: "شواحن / Chargeurs",        annualValue: 60000   },
    { id: "E", name: "أغطية / Coques",            annualValue: 35000   },
    { id: "F", name: "كابلات / Câbles",           annualValue: 18000   },
    { id: "G", name: "ذاكرات / Cartes mémoire",  annualValue: 12000   },
    { id: "H", name: "قرطاسية / Fournitures",    annualValue: 8000    },
  ],
  industry: [
    { id: "A", name: "صلب / Acier plat",          annualValue: 900000  },
    { id: "B", name: "ألومنيوم / Aluminium",      annualValue: 450000  },
    { id: "C", name: "بلاستيك / Plastique",       annualValue: 180000  },
    { id: "D", name: "كيماويات / Produits chim.", annualValue: 75000   },
    { id: "E", name: "قطع غيار / Pièces",         annualValue: 40000   },
    { id: "F", name: "زيوت / Lubrifiants",        annualValue: 22000   },
    { id: "G", name: "مواد تعبئة / Emballages",   annualValue: 15000   },
  ],
  agriculture: [
    { id: "A", name: "أسمدة / Engrais",           annualValue: 320000  },
    { id: "B", name: "مبيدات / Pesticides",       annualValue: 180000  },
    { id: "C", name: "بذور / Semences",            annualValue: 90000   },
    { id: "D", name: "ري / Irrigation",            annualValue: 35000   },
    { id: "E", name: "آلات / Petit matériel",      annualValue: 20000   },
  ],
  services: [
    { id: "A", name: "حواسيب / Ordinateurs",      annualValue: 600000  },
    { id: "B", name: "طابعات / Imprimantes",      annualValue: 120000  },
    { id: "C", name: "ورق / Papier",              annualValue: 48000   },
    { id: "D", name: "أحبار / Cartouches",         annualValue: 36000   },
    { id: "E", name: "قرطاسية / Fournitures",     annualValue: 24000   },
    { id: "F", name: "تنظيف / Produits entretien",annualValue: 12000   },
  ],
  custom: [
    { id: "A", name: "", annualValue: 0 },
    { id: "B", name: "", annualValue: 0 },
    { id: "C", name: "", annualValue: 0 },
  ],
};

const ABC_CAT_COLORS: Record<"A" | "B" | "C", string> = {
  A: "#2e7d32",
  B: "#1565c0",
  C: "#e65100",
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function InventoryManagement() {
  const { t, language } = useLanguage();
  const isAr = language === "ar";

  const [sector, setSector] = useState<SectorKey | null>(null);
  const [mode, setMode] = useState<InventoryMode>("eoq");
  const [problemName, setProblemName] = useState("");

  // EOQ state
  const [eoqProducts, setEoqProducts] = useState<EOQProduct[]>(EOQ_TEMPLATES.commerce);
  // ROP state
  const [ropProducts, setRopProducts] = useState<ReorderProduct[]>(ROP_TEMPLATES.commerce);
  // ABC state
  const [abcProducts, setAbcProducts] = useState<ABCProduct[]>(ABC_TEMPLATES.commerce);

  // Results
  const [eoqResults, setEoqResults] = useState<EOQResult[] | null>(null);
  const [ropResults, setRopResults] = useState<ReorderResult[] | null>(null);
  const [abcResults, setAbcResults] = useState<ABCResult[] | null>(null);
  const [resultStale, setResultStale] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pdfProgress, setPdfProgress] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Mark stale when inputs change
  useEffect(() => {
    if (eoqResults || ropResults || abcResults) setResultStale(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eoqProducts, ropProducts, abcProducts, mode]);

  // ── Sector select ──────────────────────────────────────────────────────────
  function handleSector(key: SectorKey) {
    setSector(key);
    setEoqProducts(EOQ_TEMPLATES[key].map(p => ({ ...p })));
    setRopProducts(ROP_TEMPLATES[key].map(p => ({ ...p })));
    setAbcProducts(ABC_TEMPLATES[key].map(p => ({ ...p })));
    setEoqResults(null); setRopResults(null); setAbcResults(null); setResultStale(false);
    if (key !== "custom") {
      const names: Record<string, string> = {
        commerce: isAr ? "تحليل مخزون تجارة" : "Analyse Stocks — Commerce",
        industry: isAr ? "تحليل مخزون صناعي" : "Analyse Stocks — Industrie",
        agriculture: isAr ? "تحليل مخزون فلاحي" : "Analyse Stocks — Agriculture",
        services: isAr ? "تحليل مخزون خدمات" : "Analyse Stocks — Services",
      };
      setProblemName(names[key] ?? "");
    } else {
      setProblemName("");
    }
  }

  // ── Solve ──────────────────────────────────────────────────────────────────
  function handleSolve() {
    setResultStale(false);
    if (mode === "eoq") {
      setEoqResults(computeEOQ(eoqProducts));
      setRopResults(null); setAbcResults(null);
    } else if (mode === "reorder") {
      setRopResults(computeReorderPoint(ropProducts));
      setEoqResults(null); setAbcResults(null);
    } else {
      setAbcResults(computeABC(abcProducts));
      setEoqResults(null); setRopResults(null);
    }
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  const hasResults = !!(eoqResults || ropResults || abcResults);

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!hasResults) return;
    setIsSaving(true); setSavedOk(false); setSaveError(null);
    try {
      const body = {
        type: "inventory",
        mode,
        problemName,
        sector: sector ?? "custom",
        eoqResults,
        ropResults,
        abcResults,
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

  // ── PDF ────────────────────────────────────────────────────────────────────
  async function handlePDF() {
    if (!hasResults) return;
    try {
      setPdfProgress(t("جارٍ الإنشاء…", "Génération en cours…"));
      await generateInventoryPDF({
        mode,
        problemName: problemName || (isAr ? "تحليل مخزون" : "Analyse Stocks"),
        sector: sector ? (SECTORS.find(s => s.id === sector)?.[isAr ? "nameAr" : "nameFr"] ?? sector) : "—",
        eoqResults: eoqResults ?? undefined,
        reorderResults: ropResults ?? undefined,
        abcResults: abcResults ?? undefined,
        analysisLines: buildAnalysisLines(),
        suggestions: buildSuggestions(),
        onProgress: (step) => setPdfProgress(step),
      });
    } finally {
      setPdfProgress(null);
    }
  }

  // ── Analysis text ──────────────────────────────────────────────────────────
  function buildAnalysisLines(): string[] {
    const lines: string[] = [];
    if (mode === "eoq" && eoqResults) {
      const total = eoqResults.reduce((s, r) => s + r.totalCost, 0);
      const highestCost = [...eoqResults].sort((a, b) => b.totalCost - a.totalCost)[0];
      lines.push(
        t(
          `L'analyse porte sur ${eoqResults.length} produit(s) et conduit à un coût annuel total de ${fDA(total, "fr")}. Pour chaque article, la quantité économique indique le volume à commander à chaque réapprovisionnement afin d'équilibrer les frais de commande et de stockage.`,
          `يشمل التحليل ${eoqResults.length} منتج(ات)، وتبلغ التكلفة السنوية الإجمالية ${fDA(total, "ar")}. بالنسبة لكل مادة، تحدد الكمية الاقتصادية حجم الطلب في كل عملية تموين لتحقيق توازن بين تكلفة الطلب وتكلفة التخزين.`
        ),
        ...eoqResults.map(r =>
          t(
            `Pour "${r.name}", commandez environ ${fNum(r.eoq)} unités à chaque cycle, soit ${fNum(r.ordersPerYear)} commande(s) par an espacées d'environ ${fNum(r.cycleTime, 0)} jours. Cette cadence transforme le calcul en règle d'achat concrète ; le coût annuel correspondant est de ${fDA(r.totalCost, "fr")}.`,
            `بالنسبة إلى "${r.name}"، اطلب حوالي ${fNum(r.eoq)} وحدة في كل دورة، أي ${fNum(r.ordersPerYear)} طلب(ات) سنوياً بفاصل يقارب ${fNum(r.cycleTime, 0)} يوماً. يحول هذا الإيقاع الحساب إلى قاعدة شراء عملية، وتبلغ تكلفته السنوية ${fDA(r.totalCost, "ar")}.`
          )
        ),
        t(
          `"${highestCost.name}" représente la charge annuelle la plus élevée avec ${fDA(highestCost.totalCost, "fr")}. C'est le premier article à examiner si l'entreprise veut réduire les coûts de stockage ou négocier les frais de commande.`,
          `"${highestCost.name}" يمثل أعلى عبء سنوي بقيمة ${fDA(highestCost.totalCost, "ar")}. لذلك يجب أن يكون أول مادة تراجعها المؤسسة عند البحث عن خفض تكاليف التخزين أو التفاوض على تكاليف الطلب.`
        )
      );
    } else if (mode === "reorder" && ropResults) {
      lines.push(
        t(
          `L'analyse couvre ${ropResults.length} produit(s). Le point de commande est le niveau de stock qui déclenche l'achat : il couvre la consommation attendue pendant le délai fournisseur et ajoute une réserve pour absorber les variations. Commander à ce niveau réduit le risque de rupture avant la livraison.`,
          `يشمل التحليل ${ropResults.length} منتج(ات). نقطة إعادة الطلب هي مستوى المخزون الذي يطلق عملية الشراء؛ فهي تغطي الاستهلاك المتوقع خلال مهلة المورد وتضيف احتياطياً لمواجهة التغيرات. ويساعد الطلب عند هذا المستوى على تقليل خطر نفاد المخزون قبل وصول التوريد.`
        ),
        ...ropResults.map(r =>
          t(
            `Pour "${r.name}", déclenchez la commande lorsque le stock atteint ${fNum(r.reorderPoint)} unités : ${fNum(r.demandDuringLeadTime)} unités couvriront les ${fNum(r.leadTime, 0)} jours de livraison et ${fNum(r.safetyStock)} unités resteront comme réserve. Cette règle protège la continuité d'approvisionnement tout en rendant le niveau d'alerte mesurable.`,
            `بالنسبة إلى "${r.name}"، أطلق الطلب عندما يصل المخزون إلى ${fNum(r.reorderPoint)} وحدة؛ إذ تغطي ${fNum(r.demandDuringLeadTime)} وحدة استهلاك ${fNum(r.leadTime, 0)} أيام من التوريد، وتبقى ${fNum(r.safetyStock)} وحدة كاحتياط. تحمي هذه القاعدة استمرارية التموين وتجعل مستوى التنبيه قابلاً للقياس.`
          )
        )
      );
    } else if (mode === "abc" && abcResults) {
      const catA = abcResults.filter(r => r.category === "A");
      const catB = abcResults.filter(r => r.category === "B");
      const catC = abcResults.filter(r => r.category === "C");
      const totalVal = abcResults.reduce((s, r) => s + r.annualValue, 0);
      const topA = [...catA].sort((a, b) => b.annualValue - a.annualValue)[0];
      lines.push(
        t(
          `La valeur annuelle des ${abcResults.length} produit(s) atteint ${fDA(totalVal, "fr")}. Le classement montre où concentrer l'attention : les articles de classe A portent la part la plus importante de cette valeur et une erreur de stock sur ces références immobilise davantage de capital ou perturbe plus fortement l'activité.`,
          `تبلغ القيمة السنوية للمنتجات وعددها ${abcResults.length} ما مجموعه ${fDA(totalVal, "ar")}. يوضح التصنيف أين يجب تركيز الاهتمام؛ فمواد الفئة A تحمل الحصة الأكبر من هذه القيمة، وأي خطأ في مخزونها يجمد رأس مال أكبر أو يؤثر بصورة أقوى على النشاط.`
        ),
        t(
          `La classe A regroupe ${catA.map(r => `"${r.name}" (${fDA(r.annualValue, "fr")}, ${r.percentage.toFixed(1)}% de la valeur)`).join(", ")} et représente ${catA.reduce((s, r) => s + r.percentage, 0).toFixed(1)}% de la valeur totale. Ces articles sont critiques pour le pilotage : ils justifient des inventaires fréquents, des seuils suivis de près et des décisions d'achat validées rapidement.`,
          `تضم الفئة A ${catA.map(r => `"${r.name}" (${fDA(r.annualValue, "ar")}، ${r.percentage.toFixed(1)}% من القيمة)`).join("، ")} وتمثل ${catA.reduce((s, r) => s + r.percentage, 0).toFixed(1)}% من القيمة الإجمالية. هذه المواد حرجة في التسيير؛ لذلك تستحق جرداً متكرراً، ومتابعة دقيقة للحدود، وتسريع اعتماد قرارات الشراء.`
        ),
        t(
          `La classe B comprend ${catB.length} produit(s) et ${catB.reduce((s, r) => s + r.percentage, 0).toFixed(1)}% de la valeur ; un contrôle mensuel et une révision périodique des quantités suffisent généralement. La classe C représente ${catC.reduce((s, r) => s + r.percentage, 0).toFixed(1)}% avec ${catC.length} produit(s), ce qui permet une gestion plus simple et des commandes regroupées.`,
          `تضم الفئة B ${catB.length} منتج(ات) وتمثل ${catB.reduce((s, r) => s + r.percentage, 0).toFixed(1)}% من القيمة؛ وتكفيها عادة رقابة شهرية ومراجعة دورية للكميات. أما الفئة C فتمثل ${catC.reduce((s, r) => s + r.percentage, 0).toFixed(1)}% عبر ${catC.length} منتج(ات)، مما يسمح بإدارة أبسط وطلبات مجمعة.`
        ),
        t(
          `"${topA?.name}" est l'article de classe A le plus important, avec ${fDA(topA?.annualValue ?? 0, "fr")} et ${topA?.percentage.toFixed(1)}% de la valeur totale. Commencez par vérifier régulièrement son stock, sa consommation et ses délais fournisseur avant d'étendre le même niveau de contrôle aux autres articles A.`,
          `"${topA?.name}" هي أهم مادة في الفئة A بقيمة ${fDA(topA?.annualValue ?? 0, "ar")} وتمثل ${topA?.percentage.toFixed(1)}% من القيمة الإجمالية. ابدأ بمراجعة مخزونها واستهلاكها ومهلة موردها بانتظام قبل توسيع نفس مستوى الرقابة إلى باقي مواد الفئة A.`
        )
      );
    }
    return lines;
  }

  // ── Suggestions ────────────────────────────────────────────────────────────
  function buildSuggestions(): { icon: string; title: string; desc: string; color: string; borderColor: string }[] {
    if (mode === "eoq" && eoqResults) {
      const highFreq = eoqResults.filter(r => r.ordersPerYear > 12);
      const highCost = [...eoqResults].sort((a, b) => b.totalCost - a.totalCost)[0];
      const suggestions = [
        {
          icon: "📦",
          color: "bg-green-50",
          borderColor: "border-l-green-500",
          title: t("تحسين دورة الطلب", "Optimiser le cycle de commande"),
          desc: t(
            `اعتمد الكمية الاقتصادية المحسوبة لكل مادة: ${eoqResults.map(r => `${r.name} (${fNum(r.eoq)} وحدة)`).join("، ")}. اطلب هذه الكميات في كل دورة حتى توازن بين تكلفة الطلب والتخزين.`,
            `Adoptez la quantité économique calculée pour chaque article : ${eoqResults.map(r => `${r.name} (${fNum(r.eoq)} unités)`).join(", ")}. Utilisez ces volumes à chaque cycle pour équilibrer les coûts de commande et de stockage.`
          ),
        },
        highFreq.length > 0 ? {
          icon: "⚠️",
          color: "bg-amber-50",
          borderColor: "border-l-amber-500",
          title: t("منتجات ذات طلبات متكررة", "Produits à commandes fréquentes"),
          desc: t(
            `${highFreq.map(r => `${r.name} (${fNum(r.ordersPerYear)} طلباً/سنة)`).join("، ")} تتطلب طلبات متكررة. تفاوض على شروط توريد أفضل أو خفّض تكلفة الاحتفاظ لتقليل الضغط اللوجستي.`,
            `${highFreq.map(r => `${r.name} (${fNum(r.ordersPerYear)} commandes/an)`).join(", ")} nécessitent des commandes fréquentes. Négociez de meilleures conditions de livraison ou réduisez les coûts de possession pour alléger la charge logistique.`
          ),
        } : {
          icon: "✅",
          color: "bg-green-50",
          borderColor: "border-l-green-500",
          title: t("تواتر طلبات معقول", "Fréquence de commande raisonnable"),
          desc: t(
            "جميع المنتجات تسجّل أقل من 12 طلباً/سنة — تواتر يُتيح إدارة تشغيلية سلسة دون ضغط على الموارد اللوجستية.",
            "Tous les produits ont moins de 12 commandes/an — une fréquence permettant une gestion opérationnelle fluide."
          ),
        },
        {
          icon: "🔴",
          color: "bg-red-50",
          borderColor: "border-l-red-500",
          title: t(`تكلفة إجمالية مرتفعة: ${highCost?.name}`, `Coût le plus élevé : ${highCost?.name}`),
          desc: t(
            `"${highCost?.name}" يسجّل أعلى تكلفة سنوية (${fDA(highCost?.totalCost ?? 0, "ar")})، لذلك ابدأ بمراجعة كمية طلبه وتكلفة التخزين والتفاوض مع المورد قبل تعديل باقي المواد.`,
            `"${highCost?.name}" représente la charge annuelle la plus lourde (${fDA(highCost?.totalCost ?? 0, "fr")}). Commencez par revoir sa quantité commandée, son coût de stockage et les conditions fournisseur avant de modifier les autres articles.`
          ),
        },
      ];
      return suggestions.filter((suggestion, index) => index !== 1 || highFreq.length > 0);
    } else if (mode === "reorder" && ropResults) {
      const highest = [...ropResults].sort((a, b) => b.reorderPoint - a.reorderPoint)[0];
      return [
        {
          icon: "🔔",
          color: "bg-blue-50",
          borderColor: "border-l-blue-500",
          title: t("تفعيل نقاط إعادة الطلب في نظام المخزون", "Activer les points de commande dans le système"),
          desc: t(
            `برمج تنبيهاً لكل مادة عند بلوغ نقطة إعادة طلبها: ${ropResults.map(r => `${r.name} (${fNum(r.reorderPoint)} وحدة)`).join("، ")}. هكذا يبدأ التوريد قبل نفاد المخزون.`,
            `Programmez une alerte pour chaque article au niveau calculé : ${ropResults.map(r => `${r.name} (${fNum(r.reorderPoint)} unités)`).join(", ")}. Le réapprovisionnement démarre ainsi avant la rupture.`
          ),
        },
        {
          icon: "📊",
          color: "bg-green-50",
          borderColor: "border-l-green-500",
          title: t(`أعلى نقطة إعادة طلب: ${highest?.name}`, `Point de commande le plus élevé : ${highest?.name}`),
          desc: t(
            `"${highest?.name}" هو أعلى أولوية لأن نقطة إعادة طلبه تبلغ ${fNum(highest?.reorderPoint ?? 0)} وحدة. خصص له مساحة تخزين ومتابعة يومية حتى لا يتجاوز الاستهلاك مخزون الأمان قبل وصول المورد.`,
            `"${highest?.name}" est prioritaire car son point de commande atteint ${fNum(highest?.reorderPoint ?? 0)} unités. Réservez-lui l'espace nécessaire et un suivi quotidien pour éviter que la consommation ne dépasse la réserve avant la livraison.`
          ),
        },
        {
          icon: "🛡️",
          color: "bg-amber-50",
          borderColor: "border-l-amber-500",
          title: t("مراجعة مخزون الأمان دورياً", "Réviser régulièrement le stock de sécurité"),
          desc: t(
            `مخزون الأمان المحسوب هو ${ropResults.map(r => `${r.name}: ${fNum(r.safetyStock)} وحدة`).join("، ")}. راجعه كل ربع سنة وفق الطلب الفعلي ومهلة المورد لتفادي النفاد أو تجميد المال.`,
            `Les réserves calculées sont les suivantes : ${ropResults.map(r => `${r.name} : ${fNum(r.safetyStock)} unités`).join(", ")}. Révisez-les chaque trimestre selon la demande réelle et le délai fournisseur pour éviter ruptures et immobilisations.`
          ),
        },
      ];
    } else if (mode === "abc" && abcResults) {
      const catA = abcResults.filter(r => r.category === "A");
      const totalA = catA.reduce((s, r) => s + r.percentage, 0);
      const catB = abcResults.filter(r => r.category === "B");
      const catC = abcResults.filter(r => r.category === "C");
      return [
        {
          icon: "🔴",
          color: "bg-red-50",
          borderColor: "border-l-red-500",
          title: t("إدارة مكثّفة لمنتجات الفئة A", "Gestion intensive des produits A"),
          desc: t(
            `مواد الفئة A (${catA.map(r => `${r.name} (${fDA(r.annualValue, "ar")}، ${r.percentage.toFixed(1)}%)`).join("، ")}) تمثل ${totalA.toFixed(1)}% من القيمة. نفّذ لها جرداً أسبوعياً، وحدد كميات الشراء ونقاط إعادة الطلب بدقة، وراجع شروط الموردين.`,
            `Les articles de classe A (${catA.map(r => `${r.name} (${fDA(r.annualValue, "fr")}, ${r.percentage.toFixed(1)}%)`).join(", ")}) représentent ${totalA.toFixed(1)}% de la valeur. Réalisez un inventaire hebdomadaire, fixez précisément les volumes et seuils de commande, puis révisez les conditions fournisseur.`
          ),
        },
        {
          icon: "🟡",
          color: "bg-amber-50",
          borderColor: "border-l-amber-500",
          title: t("رقابة دورية لمنتجات الفئة B", "Contrôle périodique des produits B"),
          desc: t(
            `مواد الفئة B وعددها ${catB.length} تمثل ${catB.reduce((s, r) => s + r.percentage, 0).toFixed(1)}% من القيمة. اكتفِ برقابة شهرية ومراجعة دورية للكميات والأسعار، مع رفع مستوى المتابعة إذا اقتربت من الفئة A.`,
            `Les ${catB.length} articles de classe B représentent ${catB.reduce((s, r) => s + r.percentage, 0).toFixed(1)}% de la valeur. Un contrôle mensuel des quantités et des prix suffit, avec un suivi renforcé si leur valeur se rapproche de la classe A.`
          ),
        },
        {
          icon: "🟢",
          color: "bg-green-50",
          borderColor: "border-l-green-500",
          title: t("تبسيط إدارة الفئة C", "Simplifier la gestion des produits C"),
          desc: t(
            `مواد الفئة C وعددها ${catC.length} تمثل ${catC.reduce((s, r) => s + r.percentage, 0).toFixed(1)}% من القيمة. استخدم طلبات مجمعة أو دورية ثابتة لتقليل الوقت الإداري دون استنزاف المتابعة المخصصة للمواد الحرجة.`,
            `Les ${catC.length} articles de classe C représentent ${catC.reduce((s, r) => s + r.percentage, 0).toFixed(1)}% de la valeur. Utilisez des commandes groupées ou périodiques fixes afin de réduire le temps administratif consacré aux références moins prioritaires.`
          ),
        },
      ];
    }
    return [];
  }

  const suggestions = buildSuggestions();
  const analysisLines = buildAnalysisLines();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={cn("container mx-auto px-4 py-8 max-w-6xl space-y-8", isAr ? "rtl" : "ltr")} dir={isAr ? "rtl" : "ltr"}>

      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="p-2 bg-primary/10 rounded-xl text-primary">
            <Package className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            {t("Gestion des Stocks", "إدارة المخزون")}
          </h1>
          <Badge variant="secondary">
            {{ eoq: "EOQ", reorder: isAr ? "نقطة الطلب" : "Point de Commande", abc: "ABC" }[mode]}
          </Badge>
        </div>
        <p className="text-muted-foreground ps-14">
          {t(
            "Calculez la quantité économique (EOQ), le point de commande ou classifiez vos stocks en ABC.",
            "احسب الكمية الاقتصادية (EOQ)، نقطة إعادة الطلب، أو صنّف مخزونك بطريقة ABC."
          )}
        </p>
      </div>

      {/* ── 1. Sector selection ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">{t("Secteur d'activité", "قطاع النشاط")}</CardTitle>
          <CardDescription>
            {t("Choisissez un secteur pour pré-remplir un exemple.", "اختر قطاعاً لتعبئة مثال تلقائياً.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {SECTORS.map(sec => {
              const Icon = sec.icon;
              const active = sector === sec.id;
              const dashed = sec.id === "custom";
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => handleSector(sec.id)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all cursor-pointer",
                    dashed ? "border-2 border-dashed" : "",
                    active ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/50"
                  )}
                >
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center transition-colors", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className={cn("text-sm font-semibold", active ? "text-primary" : "text-foreground")}>
                    {isAr ? sec.nameAr : sec.nameFr}
                  </span>
                  <span className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                    {isAr ? sec.descAr : sec.descFr}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── 2. Analysis type + name ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">{t("Configuration de l'analyse", "إعداد التحليل")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("اسم المسألة", "Nom du problème")}</Label>
              <Input
                value={problemName}
                onChange={e => setProblemName(e.target.value)}
                placeholder={t("مثال: تحليل مخزون مستودع وهران", "Ex: Analyse stocks entrepôt Oran")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("نوع التحليل", "Type d'analyse")}</Label>
              <div className="flex rounded-lg border border-border overflow-hidden h-10">
                {(["eoq", "reorder", "abc"] as InventoryMode[]).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setMode(m); setEoqResults(null); setRopResults(null); setAbcResults(null); setResultStale(false); }}
                    className={cn(
                      "flex-1 text-xs font-semibold transition-colors px-2 truncate",
                      mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {{ eoq: "EOQ (Wilson)", reorder: isAr ? "نقطة الطلب" : "Point de Cmd.", abc: "ABC" }[m]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mode description */}
          <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            {mode === "eoq" && t(
              "EOQ = √(2 × D × Cc / Cp) — Calcule la quantité optimale à commander pour minimiser le coût annuel total (commande + possession).",
              "EOQ = √(2 × D × Cc / Cp) — تحسب الكمية المثلى للطلب لتقليل التكلفة السنوية الإجمالية (تكلفة الطلب + الاحتفاظ)."
            )}
            {mode === "reorder" && t(
              "Point de commande = (Demande journalière × Délai) + Stock de sécurité — Déclenchez la commande avant la rupture.",
              "نقطة إعادة الطلب = (الطلب اليومي × مهلة التسليم) + مخزون الأمان — أطلق الطلب قبل النفاد."
            )}
            {mode === "abc" && t(
              "Classification ABC : Catégorie A (80% de la valeur) → contrôle rigoureux. B (15%) → suivi modéré. C (5%) → gestion simplifiée.",
              "تصنيف ABC: الفئة A (80% من القيمة) → رقابة مكثّفة. B (15%) → متابعة معتدلة. C (5%) → إدارة مبسّطة."
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── 3. Data input ────────────────────────────────────────────────────── */}
      {mode === "eoq" && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{t("بيانات المنتجات — EOQ", "Données Produits — EOQ")}</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => {
                const id = nextId(eoqProducts.map(p => p.id));
                setEoqProducts([...eoqProducts, { id, name: "", demand: 0, orderCost: 0, holdingCost: 0 }]);
              }}>
                <Plus className="w-4 h-4 me-1.5" />{t("إضافة", "Ajouter")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start w-10">ID</th>
                    <th className="px-3 py-2 text-start min-w-[180px]">{t("اسم المنتج", "Nom du produit")}</th>
                    <th className="px-3 py-2 text-center min-w-[130px] border-s border-primary/20 text-primary/80">
                      <div className="text-[10px] font-bold uppercase">{t("سنوي", "Annuel")}</div>
                      <div className="text-xs">D ({t("وحدة/سنة", "unités/an")})</div>
                    </th>
                    <th className="px-3 py-2 text-center min-w-[130px] text-amber-700">
                      <div className="text-[10px] font-bold uppercase invisible">{t("سنوي", "Annuel")}</div>
                      <div className="text-xs">Cc ({t("د.ج/طلب", "DA/commande")})</div>
                    </th>
                    <th className="px-3 py-2 text-center min-w-[130px] border-s border-violet-300/60 text-violet-700">
                      <div className="text-[10px] font-bold uppercase">{t("احتفاظ", "Possession")}</div>
                      <div className="text-xs">Cp ({t("د.ج/وحدة/سنة", "DA/u/an")})</div>
                    </th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {eoqProducts.map((p, idx) => (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary font-bold text-sm">{p.id}</span>
                      </td>
                      <td className="px-3 py-2">
                        <Input value={p.name} onChange={e => { const a=[...eoqProducts]; a[idx]={...a[idx], name: e.target.value}; setEoqProducts(a); }} placeholder={t("اسم المنتج", "Nom du produit")} className="h-8 text-sm" />
                      </td>
                      <td className="px-2 py-2 border-s border-primary/10">
                        <Input type="number" min={0} value={p.demand || ""} onChange={e => { const a=[...eoqProducts]; a[idx]={...a[idx], demand: Number(e.target.value)}; setEoqProducts(a); }} className="h-8 text-sm text-center" />
                      </td>
                      <td className="px-2 py-2">
                        <Input type="number" min={0} value={p.orderCost || ""} onChange={e => { const a=[...eoqProducts]; a[idx]={...a[idx], orderCost: Number(e.target.value)}; setEoqProducts(a); }} className="h-8 text-sm text-center" />
                      </td>
                      <td className="px-2 py-2 border-s border-violet-200/50">
                        <Input type="number" min={0} value={p.holdingCost || ""} onChange={e => { const a=[...eoqProducts]; a[idx]={...a[idx], holdingCost: Number(e.target.value)}; setEoqProducts(a); }} className="h-8 text-sm text-center" />
                      </td>
                      <td className="px-2 py-2">
                        <button onClick={() => { if(eoqProducts.length>1) setEoqProducts(eoqProducts.filter((_,i)=>i!==idx)); }} className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors" title={t("حذف", "Supprimer")}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "reorder" && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{t("بيانات نقطة إعادة الطلب", "Données Point de Commande")}</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => {
                const id = nextId(ropProducts.map(p => p.id));
                setRopProducts([...ropProducts, { id, name: "", dailyDemand: 0, leadTime: 0, safetyStock: 0 }]);
              }}>
                <Plus className="w-4 h-4 me-1.5" />{t("إضافة", "Ajouter")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start w-10">ID</th>
                    <th className="px-3 py-2 text-start min-w-[180px]">{t("اسم المنتج", "Nom du produit")}</th>
                    <th className="px-3 py-2 text-center min-w-[140px] border-s border-primary/20 text-primary/80">{t("الطلب اليومي (وحدة/يوم)", "Demande jour. (u/j)")}</th>
                    <th className="px-3 py-2 text-center min-w-[130px] text-amber-700">{t("مهلة التسليم (يوم)", "Délai livraison (j)")}</th>
                    <th className="px-3 py-2 text-center min-w-[130px] border-s border-violet-300/60 text-violet-700">{t("مخزون الأمان (وحدة)", "Stock sécurité (u)")}</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ropProducts.map((p, idx) => (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary font-bold text-sm">{p.id}</span>
                      </td>
                      <td className="px-3 py-2">
                        <Input value={p.name} onChange={e => { const a=[...ropProducts]; a[idx]={...a[idx], name:e.target.value}; setRopProducts(a); }} placeholder={t("اسم المنتج", "Nom du produit")} className="h-8 text-sm" />
                      </td>
                      <td className="px-2 py-2 border-s border-primary/10">
                        <Input type="number" min={0} step={0.1} value={p.dailyDemand || ""} onChange={e => { const a=[...ropProducts]; a[idx]={...a[idx], dailyDemand:Number(e.target.value)}; setRopProducts(a); }} className="h-8 text-sm text-center" />
                      </td>
                      <td className="px-2 py-2">
                        <Input type="number" min={0} value={p.leadTime || ""} onChange={e => { const a=[...ropProducts]; a[idx]={...a[idx], leadTime:Number(e.target.value)}; setRopProducts(a); }} className="h-8 text-sm text-center" />
                      </td>
                      <td className="px-2 py-2 border-s border-violet-200/50">
                        <Input type="number" min={0} value={p.safetyStock || ""} onChange={e => { const a=[...ropProducts]; a[idx]={...a[idx], safetyStock:Number(e.target.value)}; setRopProducts(a); }} className="h-8 text-sm text-center" />
                      </td>
                      <td className="px-2 py-2">
                        <button onClick={() => { if(ropProducts.length>1) setRopProducts(ropProducts.filter((_,i)=>i!==idx)); }} className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "abc" && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{t("بيانات المنتجات — ABC", "Données Produits — ABC")}</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => {
                const id = nextId(abcProducts.map(p => p.id));
                setAbcProducts([...abcProducts, { id, name: "", annualValue: 0 }]);
              }}>
                <Plus className="w-4 h-4 me-1.5" />{t("إضافة", "Ajouter")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start w-10">ID</th>
                    <th className="px-3 py-2 text-start min-w-[200px]">{t("اسم المنتج", "Nom du produit")}</th>
                    <th className="px-3 py-2 text-center min-w-[200px] border-s border-primary/20 text-primary/80">{t("القيمة السنوية المستهلكة (DA)", "Valeur annuelle consommée (DA)")}</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {abcProducts.map((p, idx) => (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary font-bold text-sm">{p.id}</span>
                      </td>
                      <td className="px-3 py-2">
                        <Input value={p.name} onChange={e => { const a=[...abcProducts]; a[idx]={...a[idx], name:e.target.value}; setAbcProducts(a); }} placeholder={t("اسم المنتج", "Nom du produit")} className="h-8 text-sm" />
                      </td>
                      <td className="px-2 py-2 border-s border-primary/10">
                        <Input type="number" min={0} value={p.annualValue || ""} onChange={e => { const a=[...abcProducts]; a[idx]={...a[idx], annualValue:Number(e.target.value)}; setAbcProducts(a); }} className="h-8 text-sm text-center" />
                      </td>
                      <td className="px-2 py-2">
                        <button onClick={() => { if(abcProducts.length>1) setAbcProducts(abcProducts.filter((_,i)=>i!==idx)); }} className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Solve button ─────────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <Button onClick={handleSolve} size="lg" className="gap-2 px-8">
          <Calculator className="w-5 h-5" />
          {t("حساب", "Calculer")}
          {resultStale && <RefreshCw className="w-4 h-4 opacity-60" />}
        </Button>
      </div>

      {/* ── Results ──────────────────────────────────────────────────────────── */}
      {hasResults && (
        <div ref={resultsRef} className="space-y-6">

          {/* EOQ Results */}
          {eoqResults && (
            <Card className="border-primary/30 shadow-md">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <span className="rounded-lg bg-primary/10 p-2 text-primary"><BarChart2 className="w-5 h-5" /></span>
                  {t("النتائج الرقمية — EOQ", "Résultats Numériques — EOQ")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                {eoqResults.map((r) => (
                  <div key={r.id} className="rounded-xl border border-primary/20 bg-primary/3 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary font-bold">{r.id}</span>
                      <span className="font-semibold text-base">{r.name}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                      {[
                        { label: t("EOQ (وحدة)", "EOQ (unités)"), value: fNum(r.eoq, 1), color: "text-primary font-bold text-lg" },
                        { label: t("طلبات/سنة", "Cmd./an"), value: fNum(r.ordersPerYear, 1), color: "" },
                        { label: t("دورة (يوم)", "Cycle (j)"), value: fNum(r.cycleTime, 0), color: "" },
                        { label: t("تكلفة الطلب", "Coût cmd."), value: fDA(r.orderingCost, language), color: "" },
                        { label: t("تكلفة الاحتفاظ", "Coût poss."), value: fDA(r.carryingCost, language), color: "" },
                        { label: t("التكلفة الإجمالية", "Coût total"), value: fDA(r.totalCost, language), color: "text-green-700 font-bold" },
                      ].map((kpi, i) => (
                        <div key={i} className="rounded-lg bg-background border p-3 text-center">
                          <div className="text-[11px] text-muted-foreground mb-1">{kpi.label}</div>
                          <div className={cn("text-base", kpi.color)}>{kpi.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 flex items-center justify-between">
                  <span className="font-semibold text-sm">{t("إجمالي التكاليف السنوية", "Total des coûts annuels")}</span>
                  <span className="text-lg font-bold text-primary">
                    {fDA(eoqResults.reduce((s, r) => s + r.totalCost, 0), language)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ROP Results */}
          {ropResults && (
            <Card className="border-primary/30 shadow-md">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <span className="rounded-lg bg-primary/10 p-2 text-primary"><TrendingUp className="w-5 h-5" /></span>
                  {t("نتائج نقطة إعادة الطلب", "Résultats du Point de Commande")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                {ropResults.map((r) => (
                  <div key={r.id} className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary font-bold">{r.id}</span>
                      <span className="font-semibold text-base">{r.name}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                      {[
                        { label: t("الطلب اليومي", "Demande jour."), value: fNum(r.dailyDemand, 1) + " " + t("وحدة/يوم", "unités/j"), color: "" },
                        { label: t("مهلة التسليم", "Délai livraison"), value: fNum(r.leadTime, 0) + " " + t("يوم", "jour(s)"), color: "" },
                        { label: t("مخزون الأمان", "Stock séc."), value: fNum(r.safetyStock, 0) + " " + t("وحدة", "unités"), color: "" },
                        { label: t("الطلب خلال المهلة", "Demande/délai"), value: fNum(r.demandDuringLeadTime, 1) + " " + t("وحدة", "unités"), color: "" },
                        { label: t("نقطة إعادة الطلب", "Point de commande"), value: fNum(r.reorderPoint, 1) + " " + t("وحدة", "unités"), color: "text-primary font-bold text-lg" },
                      ].map((kpi, i) => (
                        <div key={i} className="rounded-lg bg-background border p-3 text-center">
                          <div className="text-[11px] text-muted-foreground mb-1">{kpi.label}</div>
                          <div className={cn("text-sm", kpi.color)}>{kpi.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ABC Results */}
          {abcResults && (
            <Card className="border-primary/30 shadow-md">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <span className="rounded-lg bg-primary/10 p-2 text-primary"><BarChart2 className="w-5 h-5" /></span>
                  {t("نتائج تصنيف ABC", "Résultats Classification ABC")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5 space-y-6">
                {/* Summary badges */}
                <div className="flex flex-wrap gap-3">
                  {(["A","B","C"] as const).map(cat => {
                    const items = abcResults.filter(r => r.category === cat);
                    const pct = items.reduce((s, r) => s + r.percentage, 0);
                    const colors: Record<string, string> = { A: "bg-green-100 text-green-800 border-green-200", B: "bg-blue-100 text-blue-800 border-blue-200", C: "bg-orange-100 text-orange-800 border-orange-200" };
                    return (
                      <div key={cat} className={cn("rounded-xl border px-5 py-3 text-center min-w-[120px]", colors[cat])}>
                        <div className="text-2xl font-black">{cat}</div>
                        <div className="text-sm font-semibold">{items.length} {t("منتج", "produit(s)")}</div>
                        <div className="text-xs opacity-70">{pct.toFixed(1)}% {t("من القيمة", "de la valeur")}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Pareto chart */}
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-3">{t("مخطط باريتو — القيمة السنوية والتراكمي", "Diagramme de Pareto — Valeur & Cumulatif")}</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={abcResults} margin={{ top: 5, right: 30, left: 10, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                      <XAxis dataKey="name" angle={-40} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
                      <YAxis yAxisId="left" tickFormatter={(v) => v >= 1000 ? (v/1000).toFixed(0)+"k" : v} tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => v + "%"} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(value: number, name: string) => [
                        name === "cumulativePercentage" ? value.toFixed(1) + "%" : fDA(value as number, language),
                        name === "cumulativePercentage" ? t("التراكمي", "Cumulatif") : t("القيمة", "Valeur")
                      ]} />
                      <Legend />
                      <Bar yAxisId="left" dataKey="annualValue" name={t("القيمة السنوية", "Valeur annuelle")} radius={[3, 3, 0, 0]}>
                        {abcResults.map((r, i) => (
                          <Cell key={i} fill={ABC_CAT_COLORS[r.category]} />
                        ))}
                      </Bar>
                      <Line yAxisId="right" type="monotone" dataKey="cumulativePercentage" name={t("التراكمي %", "Cumulatif %")} stroke="#f4a261" strokeWidth={2.5} dot={{ r: 4, fill: "#f4a261" }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-center w-12">{t("ترتيب", "Rang")}</th>
                        <th className="px-3 py-2 text-start">{t("المنتج", "Produit")}</th>
                        <th className="px-3 py-2 text-end">{t("القيمة السنوية", "Valeur annuelle")}</th>
                        <th className="px-3 py-2 text-end">{t("النسبة %", "Part %")}</th>
                        <th className="px-3 py-2 text-end">{t("التراكمي %", "Cumulatif %")}</th>
                        <th className="px-3 py-2 text-center">{t("الفئة", "Catégorie")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {abcResults.map((r, i) => (
                        <tr key={r.id} className="hover:bg-muted/30">
                          <td className="px-3 py-2 text-center font-semibold text-muted-foreground">{r.rank}</td>
                          <td className="px-3 py-2 font-medium">{r.name}</td>
                          <td className="px-3 py-2 text-end font-mono">{fDA(r.annualValue, language)}</td>
                          <td className="px-3 py-2 text-end font-mono">{r.percentage.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-end font-mono">{r.cumulativePercentage.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-center">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg font-black text-lg"
                              style={{ background: ABC_CAT_COLORS[r.category] + "22", color: ABC_CAT_COLORS[r.category] }}>
                              {r.category}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── تحليل الوضع ─────────────────────────────────────────────────── */}
          <Card className="border-primary/20">
            <CardHeader className="pb-2 border-b">
              <CardTitle className="flex items-center gap-3 text-xl">
                <span className="rounded-lg bg-primary/10 p-2 text-primary"><BarChart2 className="w-5 h-5" /></span>
                {t("تحليل الوضع", "Analyse de la Situation")}
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

          {/* ── التوصيات الإدارية ────────────────────────────────────────────── */}
          {suggestions.length > 0 && (
            <Card className="border-2 border-primary/20">
              <CardHeader className="pb-2 border-b">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <span className="rounded-lg bg-primary/10 p-2 text-primary"><Lightbulb className="w-5 h-5" /></span>
                  <span>
                    <span className="block">{t("التوصيات الإدارية", "Recommandations Managériales")}</span>
                    <span className="block text-sm font-normal text-muted-foreground mt-0.5">
                      {t("Recommandations Managériales", "التوصيات الإدارية")}
                    </span>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                {suggestions.map((s, i) => (
                  <div key={i} className={cn("rounded-xl border-s-4 p-5 space-y-2", s.color, s.borderColor, isAr ? "border-s-0 border-e-4" : "")}>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{s.icon}</span>
                      <p className="font-bold text-base">{s.title}</p>
                      <span className="ms-auto text-xs font-semibold bg-primary/10 text-primary rounded-full px-2 py-0.5">#{i + 1}</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── Actions ──────────────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3 justify-end">
            <Button variant="outline" onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : savedOk ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Save className="w-4 h-4" />}
              {savedOk ? t("تم الحفظ ✓", "Enregistré ✓") : t("حفظ في السجل", "Sauvegarder")}
            </Button>
            {saveError && <span className="text-xs text-destructive self-center">{saveError}</span>}
            <Button onClick={handlePDF} disabled={!!pdfProgress} className="gap-2">
              {pdfProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {pdfProgress ?? t("تصدير PDF", "Exporter PDF")}
            </Button>
          </div>

        </div>
      )}

    </div>
  );
}
