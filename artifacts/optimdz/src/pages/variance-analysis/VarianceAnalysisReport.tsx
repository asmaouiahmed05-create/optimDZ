import { useState } from "react";
import { useLanguage } from "@/lib/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Save, FileText, CheckCircle2, Loader2, AlertTriangle,
  BarChart2, Lightbulb, ClipboardList, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { VariancePDFExportDialog } from "@/components/VariancePDFExportDialog";
import type { VarianceObjective, VarianceRowResult, VarianceTotals } from "@/lib/generateVariancePDF";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Props {
  problemName: string;
  sector: string;
  objective: VarianceObjective;
  rows: VarianceRowResult[];
  totals: VarianceTotals;
}

// ── Formatting ────────────────────────────────────────────────────────────────
function fDA(n: number, lang: string): string {
  const abs = Math.abs(n);
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const locale = lang === "ar" ? "ar-DZ" : "fr-DZ";
  const s = abs >= 1_000_000
    ? (abs / 1_000_000).toFixed(2) + " M DA"
    : abs >= 1_000
    ? (abs / 1_000).toFixed(1) + " k DA"
    : abs.toLocaleString(locale, { maximumFractionDigits: 0 }) + " DA";
  return (sign ? sign + "\u202F" : "") + s;
}

function fNum(n: number): string {
  return n.toLocaleString("fr-DZ", { maximumFractionDigits: 2 });
}

// ── Per-objective config ──────────────────────────────────────────────────────
interface ObjCfg {
  nameFr: string; nameAr: string;
  priceVarFr: string; priceVarAr: string;
  qtyVarFr: string;   qtyVarAr: string;
  var3VarFr?: string; var3VarAr?: string;
  var4VarFr?: string; var4VarAr?: string; // overhead: Écart/Sous-activité
  stdPriceFr: string; stdPriceAr: string;
  actPriceFr: string; actPriceAr: string;
  stdQtyFr: string;   stdQtyAr: string;
  actQtyFr: string;   actQtyAr: string;
  extra1Fr?: string;  extra1Ar?: string;
  extra2Fr?: string;  extra2Ar?: string;  // overhead: CF
  favorableWhen: "positive" | "negative";
}

const OBJ_CFG: Record<VarianceObjective, ObjCfg> = {
  revenue: {
    nameFr: "Revenus / Ventes", nameAr: "الإيرادات / المبيعات",
    priceVarFr: "Écart/Prix",   priceVarAr: "انحراف السعر",
    qtyVarFr: "Écart/Volume",   qtyVarAr: "انحراف الحجم",
    stdPriceFr: "Prix std.",    stdPriceAr: "سعر معياري",
    actPriceFr: "Prix réel",    actPriceAr: "سعر فعلي",
    stdQtyFr: "Qté std.",       stdQtyAr: "كمية معيارية",
    actQtyFr: "Qté réelle",     actQtyAr: "كمية فعلية",
    favorableWhen: "positive",
  },
  materials: {
    nameFr: "Matières premières", nameAr: "المواد الأولية",
    priceVarFr: "Écart/Prix",    priceVarAr: "انحراف السعر",
    qtyVarFr: "Écart/Qté",       qtyVarAr: "انحراف الكمية",
    stdPriceFr: "Coût std.",      stdPriceAr: "تكلفة معيارية",
    actPriceFr: "Coût réel",      actPriceAr: "تكلفة فعلية",
    stdQtyFr: "Qté std.",         stdQtyAr: "كمية معيارية",
    actQtyFr: "Qté réelle",       actQtyAr: "كمية فعلية",
    favorableWhen: "negative",
  },
  labor: {
    nameFr: "Main-d'œuvre",        nameAr: "اليد العاملة",
    priceVarFr: "Écart/Taux",     priceVarAr: "انحراف الأجر",
    qtyVarFr: "Écart/Rend.",      qtyVarAr: "انحراف المردودية",
    stdPriceFr: "Taux std.",       stdPriceAr: "أجر معياري",
    actPriceFr: "Taux réel",       actPriceAr: "أجر فعلي",
    stdQtyFr: "H. std.",           stdQtyAr: "ساعات معيارية",
    actQtyFr: "H. réelles",        actQtyAr: "ساعات فعلية",
    favorableWhen: "negative",
  },
  overhead: {
    nameFr: "Charges Indirectes",      nameAr: "التكاليف غير المباشرة",
    priceVarFr: "Écart/Budget",        priceVarAr: "انحراف الميزانية",
    var3VarFr: "Écart/Activité",       var3VarAr: "انحراف النشاط",
    var4VarFr: "É/Sous-activité",      var4VarAr: "انحراف قصور النشاط",
    qtyVarFr: "Écart/Rendement",       qtyVarAr: "انحراف المردودية",
    stdPriceFr: "Ch. budgétées CB",    stdPriceAr: "تكاليف مدرجة CB",
    actPriceFr: "Ch. réelles CR",      actPriceAr: "تكاليف فعلية CR",
    stdQtyFr: "Nh (activité std)",     stdQtyAr: "النشاط المعياري Nh",
    actQtyFr: "Nr (activité réelle)",  actQtyAr: "النشاط الفعلي Nr",
    extra1Fr: "C. std. unitaire CS",   extra1Ar: "التكلفة الوحدوية المعيارية CS",
    extra2Fr: "Dont fixe CF",          extra2Ar: "منها تكاليف ثابتة CF",
    favorableWhen: "negative",
  },
};

// ── Variance icon + color helper ──────────────────────────────────────────────
function useVarianceStyle(value: number, favorableWhen: "positive" | "negative") {
  if (value === 0) return { color: "text-muted-foreground", bgBorder: "border-border bg-card", badge: { fr: "Neutre", ar: "محايد" }, Icon: Minus };
  const isFav = favorableWhen === "positive" ? value > 0 : value < 0;
  return isFav
    ? { color: "text-green-700", bgBorder: "border-green-200 bg-green-50", badge: { fr: "Favorable ✓", ar: "مُلائم ✓" }, Icon: TrendingUp }
    : { color: "text-red-700",   bgBorder: "border-red-200 bg-red-50",     badge: { fr: "Défavorable ✗", ar: "غير مُلائم ✗" }, Icon: TrendingDown };
}

// ── Main component ────────────────────────────────────────────────────────────
export function VarianceAnalysisReport({ problemName, sector, objective, rows, totals }: Props) {
  const { t, language } = useLanguage();
  const isAr = language === "ar";
  const cfg  = OBJ_CFG[objective];
  const [pdfOpen,   setPdfOpen]   = useState(false);
  const [isSaving,  setIsSaving]  = useState(false);
  const [savedOk,   setSavedOk]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Dominant variance factor ─────────────────────────────────────────────
  const isOverhead     = objective === "overhead";
  const absPriceTotal  = Math.abs(totals.priceVariance);
  const absQtyTotal    = Math.abs(totals.qtyVariance);
  const absVar3Total   = Math.abs(totals.var3 ?? 0);
  const absVar4Total   = Math.abs(totals.var4 ?? 0);

  const dominantFactor: "price" | "qty" | "var3" | "var4" | "equal" = (() => {
    if (!isOverhead) {
      return absPriceTotal > absQtyTotal * 1.1 ? "price" :
             absQtyTotal > absPriceTotal * 1.1 ? "qty" : "equal";
    }
    const mx = Math.max(absPriceTotal, absQtyTotal, absVar3Total, absVar4Total);
    if (mx === 0) return "equal";
    const thresh = 1.1;
    const others = (exclude: number) => [absPriceTotal, absQtyTotal, absVar3Total, absVar4Total]
      .filter(v => v !== exclude || mx > exclude); // unique max check via simple comparison
    if (absPriceTotal === mx && absQtyTotal < mx/thresh && absVar3Total < mx/thresh && absVar4Total < mx/thresh) return "price";
    if (absQtyTotal   === mx && absPriceTotal < mx/thresh && absVar3Total < mx/thresh && absVar4Total < mx/thresh) return "qty";
    if (absVar3Total  === mx && absPriceTotal < mx/thresh && absQtyTotal < mx/thresh && absVar4Total < mx/thresh) return "var3";
    if (absVar4Total  === mx && absPriceTotal < mx/thresh && absQtyTotal < mx/thresh && absVar3Total < mx/thresh) return "var4";
    void others; // suppress unused warning
    return "equal";
  })();

  const favWhen = cfg.favorableWhen;

  // ── Situational analysis lines ───────────────────────────────────────────
  const totalFav = favWhen === "positive" ? totals.totalVariance > 0 : totals.totalVariance < 0;
  const totalNeutral = totals.totalVariance === 0;

  const analysisLines: { icon: string; text: string; color: string }[] = [
    {
      icon: "📊",
      color: "bg-primary/10 border-primary/30",
      text: t(
        `L'analyse porte sur ${rows.length} élément(s) en mode "${cfg.nameFr}". L'écart total consolidé est de ${fDA(totals.totalVariance, "fr")} — ${totalNeutral ? "aucun écart" : totalFav ? "situation favorable" : "situation défavorable à corriger"}.`,
        `يشمل التحليل ${rows.length} عنصر(ات) في نمط "${cfg.nameAr}". الانحراف الإجمالي الموحّد هو ${fDA(totals.totalVariance, "ar")} — ${totalNeutral ? "لا انحراف" : totalFav ? "وضع مُلائم" : "وضع غير مُلائم يستوجب التصحيح"}.`
      ),
    },
    {
      icon: dominantFactor === "price" ? "🏷️" : dominantFactor === "qty" ? "⏱️" : dominantFactor === "var3" ? "📈" : "⚖️",
      color: "bg-secondary/10 border-secondary/30",
      text: dominantFactor === "price"
        ? t(
            `L'écart est principalement piloté par ${isOverhead ? "l'" : "le "}${cfg.priceVarFr} (${fDA(totals.priceVariance, "fr")}) — ${isOverhead ? "les dépenses réelles dépassent le budget flexible : révision des contrats et des coûts fixes s'impose." : "c'est le levier prioritaire à actionner."}`,
            `الانحراف مدفوع بشكل رئيسي بـ ${cfg.priceVarAr} (${fDA(totals.priceVariance, "ar")}) — ${isOverhead ? "النفقات الفعلية تتجاوز الميزانية المرنة: مراجعة العقود والتكاليف الثابتة أمر لا مفر منه." : "وهو الرافعة الأولى للتحكم."}`
          )
        : dominantFactor === "qty"
        ? t(
            `L'écart est principalement piloté par ${isOverhead ? "l'" : "le "}${cfg.qtyVarFr} (${fDA(totals.qtyVariance, "fr")}) — ${isOverhead ? "les heures réelles diffèrent des heures standard : inefficience opérationnelle à traiter en priorité." : "la maîtrise des volumes ou de l'efficience est prioritaire."}`,
            `الانحراف مدفوع بشكل رئيسي بـ ${cfg.qtyVarAr} (${fDA(totals.qtyVariance, "ar")}) — ${isOverhead ? "ساعات العمل الفعلية تختلف عن المعيارية: قصور تشغيلي يستوجب معالجة فورية." : "التحكم في الكميات أو الكفاءة هو الأولوية."}`
          )
        : dominantFactor === "var3"
        ? t(
            `L'écart est principalement piloté par l'${cfg.var3VarFr} (${fDA(totals.var3 ?? 0, "fr")}) — le taux d'imputation ne reflète pas l'activité réelle : revoir CB/Nh vs CS pour aligner le budget avec la réalité opérationnelle.`,
            `الانحراف مدفوع بشكل رئيسي بـ ${cfg.var3VarAr} (${fDA(totals.var3 ?? 0, "ar")}) — معدل التحميل لا يعكس النشاط الفعلي: مراجعة CB/Nh مقابل CS لمواءمة الميزانية مع الواقع التشغيلي.`
          )
        : dominantFactor === "var4"
        ? t(
            `L'écart est principalement piloté par l'${cfg.var4VarFr} (${fDA(totals.var4 ?? 0, "fr")}) — les charges fixes ne sont ${(totals.var4 ?? 0) > 0 ? "pas entièrement absorbées : sous-utilisation de la capacité installée" : "sur-absorbées : activité réelle supérieure à la normale"}. Révisez les hypothèses d'activité budgétée.`,
            `الانحراف مدفوع بشكل رئيسي بـ ${cfg.var4VarAr} (${fDA(totals.var4 ?? 0, "ar")}) — التكاليف الثابتة ${(totals.var4 ?? 0) > 0 ? "لم تُستوعَب كلياً: قصور في استغلال الطاقة المُثبَّتة" : "مُستوعَبة بزيادة: النشاط الفعلي أعلى من المعتاد"}. راجع افتراضيات النشاط الميزاني.`
          )
        : isOverhead
        ? t(
            `Les quatre composantes (${cfg.priceVarFr}: ${fDA(totals.priceVariance, "fr")} / ${cfg.var4VarFr}: ${fDA(totals.var4 ?? 0, "fr")} / ${cfg.var3VarFr}: ${fDA(totals.var3 ?? 0, "fr")} / ${cfg.qtyVarFr}: ${fDA(totals.qtyVariance, "fr")}) contribuent de manière équilibrée — une action simultanée sur les quatre axes est recommandée.`,
            `المكوّنات الأربعة (${cfg.priceVarAr}: ${fDA(totals.priceVariance, "ar")} / ${cfg.var4VarAr}: ${fDA(totals.var4 ?? 0, "ar")} / ${cfg.var3VarAr}: ${fDA(totals.var3 ?? 0, "ar")} / ${cfg.qtyVarAr}: ${fDA(totals.qtyVariance, "ar")}) تساهم بالتساوي — يُنصح بالتحرك على المحاور الأربعة معاً.`
          )
        : t(
            `Les deux composantes contribuent équitablement à l'écart total (${cfg.priceVarFr}: ${fDA(totals.priceVariance, "fr")} / ${cfg.qtyVarFr}: ${fDA(totals.qtyVariance, "fr")}) — une action simultanée sur les deux axes est recommandée.`,
            `كلا المكوّنين يساهمان بالتساوي في الانحراف الإجمالي (${cfg.priceVarAr}: ${fDA(totals.priceVariance, "ar")} / ${cfg.qtyVarAr}: ${fDA(totals.qtyVariance, "ar")}) — يُنصح بالتحرك على المحورين معاً.`
          ),
    },
    ...(() => {
      if (isOverhead && (totals.var3 ?? 0) !== 0) {
        const var3Unfav = (totals.var3 ?? 0) > 0;
        return [{
          icon: var3Unfav ? "📉" : "📈",
          color: var3Unfav ? "bg-orange-50 border-orange-300" : "bg-teal-50 border-teal-300",
          text: t(
            var3Unfav
              ? `L'${cfg.var3VarFr} est défavorable (${fDA(totals.var3 ?? 0, "fr")}) : le budget flexible dépasse le coût absorbé sur la base des heures réelles — le taux d'imputation ne couvre pas les charges engagées.`
              : `L'${cfg.var3VarFr} est favorable (${fDA(totals.var3 ?? 0, "fr")}) : le coût absorbé dépasse le budget flexible — bonne absorption des charges indirectes au niveau d'activité réel.`,
            var3Unfav
              ? `${cfg.var3VarAr} غير مُلائم (${fDA(totals.var3 ?? 0, "ar")}): الميزانية المرنة تتجاوز التكلفة المحمَّلة بناءً على الساعات الفعلية — معدل التحميل لا يستوعب التكاليف المتكبَّدة.`
              : `${cfg.var3VarAr} مُلائم (${fDA(totals.var3 ?? 0, "ar")}): التكلفة المحمَّلة تتجاوز الميزانية المرنة — استيعاب جيد للتكاليف غير المباشرة عند مستوى النشاط الفعلي.`
          ),
        }];
      }
      const unfavorableRows = rows.filter(r => {
        const f = favWhen === "positive" ? r.totalVariance < 0 : r.totalVariance > 0;
        return f && r.totalVariance !== 0;
      });
      if (unfavorableRows.length === 0) return [];
      return [{
        icon: "⚠️",
        color: "bg-amber-50 border-amber-300",
        text: t(
          `${unfavorableRows.length} élément(s) présentent un écart défavorable : ${unfavorableRows.map(r => r.element).join(", ")}. Attention particulière requise.`,
          `${unfavorableRows.length} عنصر(ات) لديها انحراف غير مُلائم: ${unfavorableRows.map(r => r.element).join("، ")}. تستوجب اهتماماً خاصاً.`
        ),
      }];
    })(),
  ];

  // Replace the legacy fragments above with connected, data-driven paragraphs.
  // The calculation layer in VarianceAnalysis.tsx remains untouched.
  const standardBase = rows.reduce(
    (sum, row) => sum + (isOverhead ? row.standardPrice : row.standardPrice * row.standardQty),
    0,
  );
  const baseShare = (value: number) => standardBase > 0 ? Math.abs(value) / standardBase * 100 : 0;
  const statusFr = (value: number) =>
    value === 0 ? "neutre" : (favWhen === "positive" ? value > 0 : value < 0) ? "favorable" : "défavorable";
  const statusAr = (value: number) =>
    value === 0 ? "محايد" : (favWhen === "positive" ? value > 0 : value < 0) ? "مُلائم" : "غير مُلائم";
  const overallFr = totalNeutral ? "neutre" : totalFav ? "globalement favorable" : "globalement défavorable";
  const overallAr = totalNeutral ? "محايد" : totalFav ? "مُلائم إجمالاً" : "غير مُلائم إجمالاً";
  const components = [
    { key: "price", fr: cfg.priceVarFr, ar: cfg.priceVarAr, value: totals.priceVariance },
    { key: "qty", fr: cfg.qtyVarFr, ar: cfg.qtyVarAr, value: totals.qtyVariance },
    ...(isOverhead ? [
      { key: "var3", fr: cfg.var3VarFr ?? "Écart/Activité", ar: cfg.var3VarAr ?? "انحراف النشاط", value: totals.var3 ?? 0 },
      { key: "var4", fr: cfg.var4VarFr ?? "Écart/Sous-activité", ar: cfg.var4VarAr ?? "انحراف قصور النشاط", value: totals.var4 ?? 0 },
    ] : []),
  ];
  const largest = components.reduce((a, b) => Math.abs(b.value) > Math.abs(a.value) ? b : a);
  const significant = components.filter(component => baseShare(component.value) >= 5);
  const significantFr = significant.length
    ? significant.map(component => `${component.fr} (${fDA(component.value, "fr")}, ${baseShare(component.value).toFixed(1)}% de la base)`).join(" et ")
    : "aucun effet individuel ne dépasse 5 % de la base";
  const significantAr = significant.length
    ? significant.map(component => `${component.ar} (${fDA(component.value, "ar")}، ${baseShare(component.value).toFixed(1)}٪ من القاعدة)`).join(" و")
    : "لا يتجاوز أي أثر فردي 5٪ من القاعدة";
  const priceIsLarger = Math.abs(totals.priceVariance) >= Math.abs(totals.qtyVariance);
  const driverFr = priceIsLarger
    ? `L'effet prix est le plus important avec ${fDA(totals.priceVariance, "fr")} (${statusFr(totals.priceVariance)}). Il signale une différence sur ${objective === "revenue" ? "le prix de vente" : objective === "labor" ? "le taux horaire" : objective === "overhead" ? "les charges engagées par rapport au budget" : "le coût d'achat"} : le premier levier à vérifier est donc le prix ou le coût unitaire.`
    : `L'effet quantité est le plus important avec ${fDA(totals.qtyVariance, "fr")} (${statusFr(totals.qtyVariance)}). Il signale une différence sur ${objective === "revenue" ? "le volume vendu" : objective === "labor" ? "les heures consommées et la productivité" : objective === "overhead" ? "le rendement de l'activité" : "la quantité consommée"} : le premier levier à vérifier est donc le volume, les heures ou l'efficience.`;
  const driverAr = priceIsLarger
    ? `أثر السعر هو الأكبر بقيمة ${fDA(totals.priceVariance, "ar")} وهو ${statusAr(totals.priceVariance)}. ويشير إلى فرق في ${objective === "revenue" ? "سعر البيع" : objective === "labor" ? "الأجر الساعي" : objective === "overhead" ? "التكاليف الفعلية مقارنة بالميزانية" : "تكلفة الشراء"}؛ لذلك يجب فحص السعر أو التكلفة الوحدوية أولاً.`
    : `أثر الكمية هو الأكبر بقيمة ${fDA(totals.qtyVariance, "ar")} وهو ${statusAr(totals.qtyVariance)}. ويشير إلى فرق في ${objective === "revenue" ? "حجم المبيعات" : objective === "labor" ? "الساعات المستهلكة والإنتاجية" : objective === "overhead" ? "مردودية النشاط" : "الكمية المستهلكة"}؛ لذلك يجب فحص الحجم أو الساعات أو الكفاءة أولاً.`;

  analysisLines.splice(0, analysisLines.length,
    {
      icon: "📊",
      color: "bg-primary/10 border-primary/30",
      text: t(
        `Sur ${rows.length} élément(s) de ${cfg.nameFr}, l'écart prix est de ${fDA(totals.priceVariance, "fr")} (${statusFr(totals.priceVariance)}) et l'écart quantité est de ${fDA(totals.qtyVariance, "fr")} (${statusFr(totals.qtyVariance)}). Avec les effets complémentaires du mode charges indirectes lorsqu'ils existent, l'écart total atteint ${fDA(totals.totalVariance, "fr")} : la situation est ${overallFr}.`,
        `يشمل التحليل ${rows.length} عنصر(ات) من ${cfg.nameAr}. يبلغ انحراف السعر ${fDA(totals.priceVariance, "ar")} وهو ${statusAr(totals.priceVariance)}، بينما يبلغ انحراف الكمية ${fDA(totals.qtyVariance, "ar")} وهو ${statusAr(totals.qtyVariance)}. ومع إضافة الآثار المكملة في وضع التكاليف غير المباشرة، يبلغ الانحراف الإجمالي ${fDA(totals.totalVariance, "ar")}؛ وبالتالي فإن الوضع ${overallAr}.`,
      ),
    },
    {
      icon: priceIsLarger ? "🏷️" : "⏱️",
      color: "bg-secondary/10 border-secondary/30",
      text: t(
        `${driverFr} Les effets significatifs sont ${significantFr}. Cette lecture distingue ainsi un problème de prix ou de coût d'un problème de volume, d'heures ou de consommation, au lieu de traiter l'écart total comme un seul signal.`,
        `${driverAr} وتتمثل الآثار المهمة في ${significantAr}. وبهذا تميّز القراءة الإدارية بين مشكلة السعر أو التكلفة ومشكلة الحجم أو الساعات أو الاستهلاك، بدلاً من التعامل مع الانحراف الإجمالي كإشارة واحدة.`,
      ),
    },
    {
      icon: totalFav ? "✅" : "⚠️",
      color: totalFav ? "bg-green-50 border-green-300" : "bg-amber-50 border-amber-300",
      text: t(
        `Le plus grand écart en valeur absolue est ${largest.fr}, à ${fDA(largest.value, "fr")} (${statusFr(largest.value)}), soit ${baseShare(largest.value).toFixed(1)}% de la base standard. ${isOverhead ? `Les autres composantes restent à suivre : activité ${fDA(totals.var3 ?? 0, "fr")} et sous-activité ${fDA(totals.var4 ?? 0, "fr")}.` : "Ce poids indique le point où une décision managériale ciblée aura le meilleur effet sur le résultat."}`,
        `أكبر انحراف بالقيمة المطلقة هو ${largest.ar} بقيمة ${fDA(largest.value, "ar")} وهو ${statusAr(largest.value)}، ويمثل ${baseShare(largest.value).toFixed(1)}٪ من القاعدة المعيارية. ${isOverhead ? `ويجب متابعة المكونات الأخرى أيضاً: النشاط ${fDA(totals.var3 ?? 0, "ar")} وقصور النشاط ${fDA(totals.var4 ?? 0, "ar")}.` : "ويحدد هذا التركّز المجال الذي سيحقق فيه القرار الإداري أكبر أثر على النتيجة."}`,
      ),
    },
  );

  // ── Suggestions ────────────────────────────────────────────────────────────
  interface Sug { icon: string; title?: string; desc: string; color: string; borderColor: string; }
  const suggestions: Sug[] = [];

  if (isOverhead) {
    // Overhead-specific suggestions for each of the 3 variance components
    const budgetUnfav = totals.priceVariance > 0;
    if (dominantFactor === "price" || dominantFactor === "equal") {
      suggestions.push({
        icon: budgetUnfav ? "🔴" : "🟢",
        color: budgetUnfav ? "bg-red-50" : "bg-green-50",
        borderColor: budgetUnfav ? "border-l-red-500" : "border-l-green-500",
        title: t("Dépassement budgétaire des charges indirectes", "تجاوز ميزانية التكاليف غير المباشرة"),
        desc: t(
          budgetUnfav
            ? "Les charges réelles dépassent le budget flexible (ajusté à l'activité réelle). Auditez les centres de coût concernés : prestataires externes, maintenance non planifiée, consommations énergétiques hors norme."
            : "Les charges réelles sont inférieures au budget flexible — maîtrise budgétaire effective. Capitalisez sur les leviers d'optimisation identifiés pour les prochaines périodes.",
          budgetUnfav
            ? "التكاليف الفعلية تتجاوز الميزانية المرنة (المعدَّلة للنشاط الفعلي). دقّق مراكز التكلفة المعنية: مقاولو الباطن، الصيانة غير المخططة، الاستهلاكات الطاقوية الخارجة عن القياس."
            : "التكاليف الفعلية أقل من الميزانية المرنة — ضبط ميزاني فعّال. استثمر في الرافعات التحسينية المُحدَّدة للفترات القادمة."
        ),
      });
    }
    const sousActUnfav = (totals.var4 ?? 0) > 0;
    if (dominantFactor === "var4" || dominantFactor === "equal") {
      suggestions.push({
        icon: sousActUnfav ? "🔴" : "🟢",
        color: sousActUnfav ? "bg-red-50" : "bg-green-50",
        borderColor: sousActUnfav ? "border-l-red-500" : "border-l-green-500",
        title: t("Sous/Sur-activité : capacité non absorbée", "قصور/فائض النشاط: طاقة غير مستوعَبة"),
        desc: t(
          sousActUnfav
            ? "Les charges fixes ne sont pas pleinement absorbées (Nr < Nh) — capacité payée mais non utilisée. Augmentez le volume d'activité, renégociez les contrats de maintenance à capacité modulable, ou révisez le budget de la période."
            : "Les charges fixes sont sur-absorbées (Nr > Nh) — l'activité dépasse les prévisions. Surveillance requise : risque de sur-utilisation de l'équipement ; vérifiez que la qualité n'est pas impactée par la cadence.",
          sousActUnfav
            ? "التكاليف الثابتة لم تُستوعَب بالكامل (Nr < Nh) — طاقة مدفوعة وغير مستغَلة. ارفع حجم النشاط أو أعد التفاوض على عقود الصيانة بطاقة مرنة أو راجع ميزانية الفترة."
            : "التكاليف الثابتة مُستوعَبة بزيادة (Nr > Nh) — النشاط يتجاوز التوقعات. مراقبة مطلوبة: تأكد من أن الجودة لا تتأثر بالوتيرة المرتفعة."
        ),
      });
    }
    const actUnfav = (totals.var3 ?? 0) > 0;
    if (dominantFactor === "var3" || dominantFactor === "equal") {
      suggestions.push({
        icon: actUnfav ? "🔴" : "🟢",
        color: actUnfav ? "bg-red-50" : "bg-green-50",
        borderColor: actUnfav ? "border-l-red-500" : "border-l-green-500",
        title: t("Écart d'activité : réviser le taux d'imputation", "انحراف النشاط: مراجعة معدل التحميل"),
        desc: t(
          actUnfav
            ? "Le budget flexible dépasse le coût absorbé : le taux d'imputation standard est sous-estimé ou le niveau d'activité planifié est trop optimiste. Révisez le taux standard et examinez la capacité réelle des centres d'analyse."
            : "Le coût absorbé dépasse le budget flexible : sur-absorption des charges indirectes. L'activité réelle dépasse les prévisions — évaluez si le taux standard doit être révisé à la hausse.",
          actUnfav
            ? "الميزانية المرنة تتجاوز التكلفة المحمَّلة: معدل التحميل المعياري مُقدَّر بأقل من قيمته أو مستوى النشاط المخطط متفائل جداً. راجع المعدل المعياري وافحص الطاقة الفعلية لمراكز التحليل."
            : "التكلفة المحمَّلة تتجاوز الميزانية المرنة: استيعاب زائد للتكاليف غير المباشرة. النشاط الفعلي يتجاوز التوقعات — قيّم ما إذا كان المعدل المعياري يستحق المراجعة التصاعدية."
        ),
      });
    }
    const rendUnfav = totals.qtyVariance > 0;
    if (dominantFactor === "qty" || dominantFactor === "equal") {
      suggestions.push({
        icon: rendUnfav ? "🔴" : "🟢",
        color: rendUnfav ? "bg-red-50" : "bg-green-50",
        borderColor: rendUnfav ? "border-l-red-500" : "border-l-green-500",
        title: t("Inefficience opérationnelle : heures consommées", "قصور تشغيلي: الساعات المستهلكة"),
        desc: t(
          rendUnfav
            ? "Les heures réelles dépassent les heures standard — inefficience mesurable : pannes machines, temps d'attente, reprise de travaux défectueux. Mettez en place un suivi des temps d'arrêt et des indicateurs OEE (Overall Equipment Effectiveness)."
            : "Les heures réelles sont inférieures aux heures standard — gain de productivité réalisé. Documentez les bonnes pratiques opérationnelles et envisagez de réviser les standards à la baisse.",
          rendUnfav
            ? "ساعات العمل الفعلية تتجاوز المعيارية — قصور قابل للقياس: أعطال الآلات، أوقات الانتظار، إعادة الأعمال المعيبة. أنشئ متابعة لأوقات التوقف ومؤشرات الفعالية الإجمالية للمعدات (OEE)."
            : "ساعات العمل الفعلية أقل من المعيارية — تحقيق مكاسب إنتاجية. وثّق الممارسات التشغيلية الجيدة وفكّر في مراجعة المعايير نزولاً."
        ),
      });
    }
  } else {
    if (dominantFactor === "price" || dominantFactor === "equal") {
      const priceUnfav = favWhen === "positive" ? totals.priceVariance < 0 : totals.priceVariance > 0;
      suggestions.push({
        icon: priceUnfav ? "🔴" : "🟢",
        color: priceUnfav ? "bg-red-50" : "bg-green-50",
        borderColor: priceUnfav ? "border-l-red-500" : "border-l-green-500",
        title: objective === "revenue"
          ? t("Politique de prix à réviser", "مراجعة سياسة الأسعار")
          : objective === "labor"
          ? t("Maîtrise des taux salariaux", "التحكم في الأجور")
          : t("Renégocier les prix fournisseurs", "إعادة التفاوض مع الموردين"),
        desc: objective === "revenue"
          ? t(
              priceUnfav
                ? "Le prix réel est inférieur au standard — envisagez de réviser la grille tarifaire, les remises accordées ou la segmentation client."
                : "Le prix réel surpasse le standard — valorisez cette performance dans votre stratégie commerciale.",
              priceUnfav
                ? "السعر الفعلي أقل من المعياري — راجع جدول الأسعار والخصومات الممنوحة وتصنيف العملاء."
                : "السعر الفعلي يتجاوز المعياري — استثمر هذا الأداء في استراتيجيتك التجارية."
            )
          : objective === "labor"
          ? t(
              priceUnfav
                ? "Le taux réel dépasse le standard — analysez les heures supplémentaires, primes et reclassifications qui gonflent la masse salariale."
                : "Le taux réel est inférieur au standard — économie salariale réalisée, consolidez-la par une politique RH adaptée.",
              priceUnfav
                ? "الأجر الفعلي أعلى من المعياري — حلّل الساعات الإضافية والعلاوات التي تُضخّم كتلة الرواتب."
                : "الأجر الفعلي أقل من المعياري — وفر في الرواتب، رسّخه بسياسة موارد بشرية ملائمة."
            )
          : t(
              priceUnfav
                ? "Le coût d'achat réel dépasse le standard — renégociez les contrats fournisseurs, cherchez des alternatives ou achetez en volume."
                : "Le coût d'achat réel est inférieur au standard — bonne gestion des achats, maintenez les partenariats favorables.",
              priceUnfav
                ? "تكلفة الشراء الفعلية تتجاوز المعيارية — أعد التفاوض مع الموردين أو ابحث عن بدائل أو اشتر بالجملة."
                : "تكلفة الشراء الفعلية أقل من المعيارية — إدارة مشتريات جيدة، حافظ على الشراكات الإيجابية."
            ),
      });
    }

    if (dominantFactor === "qty" || dominantFactor === "equal") {
      const qtyUnfav = favWhen === "positive" ? totals.qtyVariance < 0 : totals.qtyVariance > 0;
      suggestions.push({
        icon: qtyUnfav ? "🔴" : "🟢",
        color: qtyUnfav ? "bg-red-50" : "bg-green-50",
        borderColor: qtyUnfav ? "border-l-red-500" : "border-l-green-500",
        title: objective === "revenue"
          ? t("Effort commercial à renforcer", "تعزيز الجهد التجاري")
          : objective === "labor"
          ? t("Productivité de la main-d'œuvre", "إنتاجية اليد العاملة")
          : t("Gestion des consommations matières", "إدارة استهلاك المواد"),
        desc: objective === "revenue"
          ? t(
              qtyUnfav
                ? "Le volume vendu est inférieur aux prévisions — renforcez l'équipe commerciale, révisez les objectifs et analysez les retours clients."
                : "Le volume vendu dépasse les prévisions — excellente performance commerciale, analysez les facteurs de succès pour les répliquer.",
              qtyUnfav
                ? "حجم المبيعات أقل من التوقعات — عزّز فريق المبيعات وراجع الأهداف وحلّل ملاحظات العملاء."
                : "حجم المبيعات يتجاوز التوقعات — أداء تجاري ممتاز، حلّل عوامل النجاح لتكرارها."
            )
          : objective === "labor"
          ? t(
              qtyUnfav
                ? "Les heures réelles dépassent le standard — analysez les arrêts, pannes, absences et inefficiences pour réduire le temps de cycle."
                : "Les heures réelles sont inférieures au standard — productivité supérieure aux attentes, identifiez les meilleures pratiques.",
              qtyUnfav
                ? "ساعات العمل الفعلية تتجاوز المعيارية — حلّل التوقفات والأعطال والغيابات لتقليل زمن الدورة."
                : "ساعات العمل الفعلية أقل من المعيارية — إنتاجية تفوق التوقعات، حدّد الممارسات الجيدة."
            )
          : t(
              qtyUnfav
                ? "La consommation réelle dépasse le standard — contrôlez les rebuts, fuites, erreurs de dosage et inefficiences de production."
                : "La consommation réelle est inférieure au standard — efficience matière positive, capitalisez sur les procédés efficaces.",
              qtyUnfav
                ? "الاستهلاك الفعلي يتجاوز المعيار — تحكّم في الهدر والتسرب وأخطاء الجرعات وقصور الإنتاج."
                : "الاستهلاك الفعلي أقل من المعيار — كفاءة جيدة في المواد، استثمر في العمليات الفعّالة."
            ),
      });
    }
  }

  // Always add action plan suggestion
  if (!totalNeutral) {
    suggestions.push({
      icon: totalFav ? "✅" : "🔄",
      color: totalFav ? "bg-green-50" : "bg-amber-50",
      borderColor: totalFav ? "border-l-green-500" : "border-l-amber-500",
      title: totalFav
        ? t("Consolider et élever les standards", "توطيد المكاسب ورفع المعايير")
        : t("Plan d'action correctif", "خطة عمل تصحيحية"),
      desc: totalFav
        ? t(
            "La performance dépasse globalement les standards. Révisez les budgets prévisionnels à la hausse et documentez les bonnes pratiques pour pérenniser les résultats.",
            "يتجاوز الأداء المعايير بشكل عام. راجع الميزانيات التوقعية تصاعدياً ووثّق الممارسات الجيدة لتحقيق الاستمرارية."
          )
        : t(
            isOverhead
              ? "Établissez un plan d'action SMART par centre d'analyse : désignez un responsable de centre, fixez des objectifs d'absorption et de rendement, et mettez en place un reporting mensuel des charges indirectes."
              : "Établissez un plan d'action SMART : identifiez les responsables, fixez des échéances et des indicateurs de suivi pour chacun des écarts défavorables identifiés.",
            isOverhead
              ? "ضع خطة عمل SMART لكل مركز تحليل: عيّن مسؤولاً لكل مركز، وحدّد أهدافاً للاستيعاب والمردودية، وأنشئ تقريراً شهرياً للتكاليف غير المباشرة."
              : "ضع خطة عمل SMART: حدّد المسؤولين والمواعيد ومؤشرات المتابعة لكل انحراف غير مُلائم تم تحديده."
          ),
    });
  }

  // Keep recommendations concise and tied to the largest computed driver.
  // The legacy branch above is retained for compatibility with older copy,
  // but its cards are replaced before rendering to avoid repeated messages.
  const largestActionFr = largest.key === "price"
    ? objective === "revenue"
      ? "réviser la grille tarifaire, les remises et la segmentation client"
      : objective === "labor"
      ? "analyser les heures supplémentaires, les primes et les reclassifications"
      : objective === "overhead"
      ? "auditer les centres de coût, les contrats externes et les consommations hors norme"
      : "renégocier les contrats fournisseurs et vérifier les alternatives d'achat"
    : largest.key === "qty"
    ? objective === "revenue"
      ? "renforcer l'action commerciale et analyser les causes du volume vendu"
      : objective === "labor"
      ? "suivre les arrêts, les absences et le temps de cycle"
      : objective === "overhead"
      ? "suivre le rendement de l'activité et les temps d'arrêt"
      : "contrôler les rebuts, les erreurs de dosage et les consommations par lot"
    : largest.key === "var4"
    ? "rapprocher le niveau d'activité des capacités engagées et ajuster les charges fixes"
    : "revoir le taux d'imputation et le niveau d'activité retenu dans le budget";
  const largestActionAr = largest.key === "price"
    ? objective === "revenue"
      ? "مراجعة جدول الأسعار والخصومات وتصنيف العملاء"
      : objective === "labor"
      ? "تحليل الساعات الإضافية والعلاوات وإعادة التصنيف"
      : objective === "overhead"
      ? "تدقيق مراكز التكلفة والعقود الخارجية والاستهلاكات غير العادية"
      : "إعادة التفاوض على عقود الموردين والتحقق من بدائل الشراء"
    : largest.key === "qty"
    ? objective === "revenue"
      ? "تعزيز الجهد التجاري وتحليل أسباب حجم المبيعات"
      : objective === "labor"
      ? "متابعة التوقفات والغيابات وزمن الدورة"
      : objective === "overhead"
      ? "متابعة مردودية النشاط وأوقات التوقف"
      : "مراقبة الهدر وأخطاء الجرعات والاستهلاك حسب الدفعة"
    : largest.key === "var4"
    ? "تقريب مستوى النشاط من الطاقة الملتزم بها وضبط التكاليف الثابتة"
    : "مراجعة معدل التحميل ومستوى النشاط المعتمد في الميزانية";

  suggestions.splice(0, suggestions.length);
  suggestions.push({
    icon: totalFav ? "🎯" : "🔴",
    color: totalFav ? "bg-primary/5" : "bg-red-50",
    borderColor: totalFav ? "border-l-primary" : "border-l-red-500",
    desc: t(
      `${largest.fr} représente ${fDA(largest.value, "fr")} (${baseShare(largest.value).toFixed(1)}% de la base). ${totalFav ? "Pour consolider cette performance, commencez par" : "Pour réduire cet écart défavorable, commencez par"} ${largestActionFr}, puis vérifiez l'évolution de cet indicateur à la prochaine clôture.`,
      `${largest.ar} يمثل ${fDA(largest.value, "ar")} (${baseShare(largest.value).toFixed(1)}٪ من القاعدة). ${totalFav ? "لتوطيد هذا الأداء، ابدأ بـ" : "للحد من هذا الانحراف غير الملائم، ابدأ بـ"} ${largestActionAr}، ثم تحقق من تطور هذا المؤشر عند الإقفال القادم.`,
    ),
  });
  if (!totalNeutral) {
    suggestions.push({
      icon: totalFav ? "✅" : "🔄",
      color: totalFav ? "bg-green-50" : "bg-amber-50",
      borderColor: totalFav ? "border-l-green-500" : "border-l-amber-500",
      desc: t(
        totalFav
          ? `L'écart total de ${fDA(totals.totalVariance, "fr")} est favorable. Conservez les pratiques qui expliquent le gain et actualisez les standards uniquement après avoir confirmé qu'il est reproductible.`
          : `L'écart total de ${fDA(totals.totalVariance, "fr")} est défavorable. Attribuez un responsable au plus grand écart, fixez une échéance et comparez le résultat à ce même indicateur chaque mois.`,
        totalFav
          ? `الانحراف الإجمالي البالغ ${fDA(totals.totalVariance, "ar")} مُلائم. حافظ على الممارسات التي تفسر المكسب ولا تحدّث المعايير إلا بعد التأكد من إمكانية تكراره.`
          : `الانحراف الإجمالي البالغ ${fDA(totals.totalVariance, "ar")} غير مُلائم. عيّن مسؤولاً عن أكبر انحراف وحدد أجلاً وقارن النتيجة بالمؤشر نفسه شهرياً.`,
      ),
    });
  }

  // ── Save handler ───────────────────────────────────────────────────────────
  async function handleSave() {
    setIsSaving(true);
    setSaveError(null);
    try {
      const body = {
        name: problemName || t("Analyse des Écarts", "تحليل الانحرافات"),
        sector,
        objectiveType: "minimize",
        status: "optimal",
        optimalValue: parseFloat(totals.totalVariance.toFixed(2)),
        problemData: {
          objective,
          rows: rows.map(r => ({
            id: r.id, element: r.element,
            standardPrice: r.standardPrice, standardQty: r.standardQty,
            actualPrice: r.actualPrice,    actualQty: r.actualQty,
          })),
        },
        result: { rows, totals, dominantFactor },
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

  // ── Render ─────────────────────────────────────────────────────────────────
  const totStyle   = useVarianceStyle(totals.totalVariance, favWhen);
  const priceStyle = useVarianceStyle(totals.priceVariance, favWhen);
  const qtyStyle   = useVarianceStyle(totals.qtyVariance,   favWhen);

  return (
    <div className="space-y-6">

      {/* ── KPI summary cards ─────────────────────────────────────────────────── */}
      <div className={cn("grid gap-4", isOverhead ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-1 sm:grid-cols-3")}>
        {([
          { label: isAr ? cfg.priceVarAr : cfg.priceVarFr, value: totals.priceVariance, style: priceStyle },
          ...(isOverhead ? [
            { label: isAr ? (cfg.var4VarAr ?? "") : (cfg.var4VarFr ?? ""), value: totals.var4 ?? 0, style: useVarianceStyle(totals.var4 ?? 0, favWhen) },
            { label: isAr ? (cfg.var3VarAr ?? "") : (cfg.var3VarFr ?? ""), value: totals.var3 ?? 0, style: useVarianceStyle(totals.var3 ?? 0, favWhen) },
          ] : []),
          { label: isAr ? cfg.qtyVarAr   : cfg.qtyVarFr,   value: totals.qtyVariance,   style: qtyStyle   },
          { label: t("Écart Total", "الانحراف الإجمالي"),   value: totals.totalVariance, style: totStyle   },
        ] as { label: string; value: number; style: ReturnType<typeof useVarianceStyle> }[]).map(({ label, value, style }) => {
          const { Icon } = style;
          return (
            <Card key={label} className={cn("border-2", style.bgBorder)}>
              <CardContent className="pt-4 pb-4 flex flex-col gap-2">
                <div className={cn("flex items-center justify-between", isAr && "flex-row-reverse")}>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
                  <Icon className={cn("w-4 h-4", style.color)} />
                </div>
                <p className={cn("text-2xl font-bold tabular-nums", style.color)}>
                  {fDA(value, language)}
                </p>
                <span className={cn(
                  "self-start text-xs font-bold px-2.5 py-1 rounded-full",
                  value === 0 ? "bg-muted text-muted-foreground"
                    : (favWhen === "positive" ? value > 0 : value < 0)
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                )}>
                  {value === 0
                    ? (isAr ? "محايد" : "Neutre")
                    : (favWhen === "positive" ? value > 0 : value < 0)
                    ? (isAr ? "مُلائم ✓" : "Favorable ✓")
                    : (isAr ? "غير مُلائم ✗" : "Défavorable ✗")}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── قسم النتائج الرقمية ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-primary" />
          {t("Résultats Numériques", "النتائج الرقمية")}
        </h2>
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">
                    {t("Élément", "العنصر")}
                  </TableHead>
                  <TableHead className="text-center font-semibold">
                    {isAr ? cfg.stdPriceAr : cfg.stdPriceFr}
                  </TableHead>
                  <TableHead className="text-center font-semibold">
                    {isAr ? cfg.actPriceAr : cfg.actPriceFr}
                  </TableHead>
                  <TableHead className="text-center font-semibold">
                    {isAr ? cfg.stdQtyAr : cfg.stdQtyFr}
                  </TableHead>
                  <TableHead className="text-center font-semibold">
                    {isAr ? cfg.actQtyAr : cfg.actQtyFr}
                  </TableHead>
                  {isOverhead && (
                    <TableHead className="text-center font-semibold text-violet-700">
                      {isAr ? (cfg.extra1Ar ?? "") : (cfg.extra1Fr ?? "")}
                    </TableHead>
                  )}
                  {isOverhead && (
                    <TableHead className="text-center font-semibold text-indigo-700">
                      {isAr ? (cfg.extra2Ar ?? "") : (cfg.extra2Fr ?? "")}
                    </TableHead>
                  )}
                  <TableHead className="text-center font-semibold">
                    {isAr ? cfg.priceVarAr : cfg.priceVarFr}
                  </TableHead>
                  {isOverhead && (
                    <TableHead className="text-center font-semibold text-indigo-700">
                      {isAr ? (cfg.var4VarAr ?? "") : (cfg.var4VarFr ?? "")}
                    </TableHead>
                  )}
                  {isOverhead && (
                    <TableHead className="text-center font-semibold">
                      {isAr ? (cfg.var3VarAr ?? "") : (cfg.var3VarFr ?? "")}
                    </TableHead>
                  )}
                  <TableHead className="text-center font-semibold">
                    {isAr ? cfg.qtyVarAr : cfg.qtyVarFr}
                  </TableHead>
                  <TableHead className="text-center font-semibold">
                    {t("Écart Total", "الانحراف الإجمالي")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const rowFav  = useVarianceStyle(r.totalVariance, favWhen);
                  const pvFav   = useVarianceStyle(r.priceVariance, favWhen);
                  const v3Fav   = useVarianceStyle(r.var3 ?? 0,      favWhen);
                  const qvFav   = useVarianceStyle(r.qtyVariance,   favWhen);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-semibold">{r.element}</TableCell>
                      <TableCell className="text-center text-muted-foreground font-mono text-sm">{fNum(r.standardPrice)}</TableCell>
                      <TableCell className="text-center text-muted-foreground font-mono text-sm">{fNum(r.actualPrice)}</TableCell>
                      <TableCell className="text-center text-muted-foreground font-mono text-sm">{fNum(r.standardQty)}</TableCell>
                      <TableCell className="text-center text-muted-foreground font-mono text-sm">{fNum(r.actualQty)}</TableCell>
                      {isOverhead && (
                        <TableCell className="text-center text-violet-700 font-mono text-sm font-medium">{fNum(r.extra1 ?? 0)}</TableCell>
                      )}
                      {isOverhead && (
                        <TableCell className="text-center text-indigo-700 font-mono text-sm font-medium">{fNum(r.extra2 ?? 0)}</TableCell>
                      )}
                      <TableCell className={cn("text-center font-mono font-semibold text-sm", pvFav.color)}>
                        {fDA(r.priceVariance, language)}
                      </TableCell>
                      {isOverhead && (
                        <TableCell className={cn("text-center font-mono font-semibold text-sm", useVarianceStyle(r.var4 ?? 0, favWhen).color)}>
                          {fDA(r.var4 ?? 0, language)}
                        </TableCell>
                      )}
                      {isOverhead && (
                        <TableCell className={cn("text-center font-mono font-semibold text-sm", v3Fav.color)}>
                          {fDA(r.var3 ?? 0, language)}
                        </TableCell>
                      )}
                      <TableCell className={cn("text-center font-mono font-semibold text-sm", qvFav.color)}>
                        {fDA(r.qtyVariance, language)}
                      </TableCell>
                      <TableCell className={cn("text-center font-mono font-bold", rowFav.color)}>
                        {fDA(r.totalVariance, language)}
                      </TableCell>
                    </TableRow>
                  );
                })}

                {/* Totals row */}
                <TableRow className="bg-primary/5 font-bold border-t-2 border-primary/20">
                  <TableCell className="font-bold text-primary">
                    {t("TOTAL", "الإجمالي")}
                  </TableCell>
                  <TableCell colSpan={isOverhead ? 6 : 4} />
                  <TableCell className={cn("text-center font-mono font-bold", priceStyle.color)}>
                    {fDA(totals.priceVariance, language)}
                  </TableCell>
                  {isOverhead && (
                    <TableCell className={cn("text-center font-mono font-bold", useVarianceStyle(totals.var4 ?? 0, favWhen).color)}>
                      {fDA(totals.var4 ?? 0, language)}
                    </TableCell>
                  )}
                  {isOverhead && (
                    <TableCell className={cn("text-center font-mono font-bold", useVarianceStyle(totals.var3 ?? 0, favWhen).color)}>
                      {fDA(totals.var3 ?? 0, language)}
                    </TableCell>
                  )}
                  <TableCell className={cn("text-center font-mono font-bold", qtyStyle.color)}>
                    {fDA(totals.qtyVariance, language)}
                  </TableCell>
                  <TableCell className={cn("text-center font-mono font-bold text-base", totStyle.color)}>
                    {fDA(totals.totalVariance, language)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* ── مؤشرات ونسب التسيير ─────────────────────────────────────────────── */}
      {(() => {
        // Compute standard base per objective
        const getBase = (r: VarianceRowResult) =>
          isOverhead ? r.standardPrice : r.standardPrice * r.standardQty;
        const totalBase = rows.reduce((s, r) => s + getBase(r), 0);
        if (totalBase === 0) return null;

        const pct = (v: number) => (v / totalBase) * 100;
        const badge = (absPct: number) => {
          if (absPct < 5)  return { cls: "bg-green-100 text-green-800 border-green-200",   fr: "Acceptable",       ar: "مقبول" };
          if (absPct < 15) return { cls: "bg-orange-100 text-orange-800 border-orange-200", fr: "Vigilance",        ar: "يستدعي انتباه" };
          return               { cls: "bg-red-100 text-red-800 border-red-200",             fr: "Critique",         ar: "حرج" };
        };

        const items: { labelFr: string; labelAr: string; v: number }[] = [
          { labelFr: cfg.priceVarFr,  labelAr: cfg.priceVarAr,  v: totals.priceVariance },
          ...(isOverhead ? [
            { labelFr: cfg.var4VarFr ?? "É/Sous-activité", labelAr: cfg.var4VarAr ?? "انحراف قصور النشاط", v: totals.var4 ?? 0 },
            { labelFr: cfg.var3VarFr ?? "Écart/Activité",  labelAr: cfg.var3VarAr ?? "انحراف النشاط",      v: totals.var3 ?? 0 },
          ] : []),
          { labelFr: cfg.qtyVarFr,   labelAr: cfg.qtyVarAr,   v: totals.qtyVariance },
          { labelFr: "Écart Total",  labelAr: "الانحراف الإجمالي", v: totals.totalVariance },
        ];

        return (
          <div className="space-y-3">
            <h2 className={cn("text-xl font-bold text-foreground flex items-center gap-2", isAr && "flex-row-reverse")}>
              <BarChart2 className="w-5 h-5 text-primary" />
              {t("Indicateurs & Ratios de Gestion", "مؤشرات ونسب التسيير")}
            </h2>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground mb-4">
                  {t(
                    `Base standard : ${fDA(totalBase, language)} — Seuils : vert < 5 % · orange 5–15 % · rouge > 15 %`,
                    `القاعدة المعيارية: ${fDA(totalBase, language)} — الحدود: أخضر < 5% · برتقالي 5–15% · أحمر > 15%`
                  )}
                </p>
                <div className="space-y-2">
                  {items.map(item => {
                    const p = pct(item.v);
                    const absp = Math.abs(p);
                    const b = badge(absp);
                    const varStyle = useVarianceStyle(item.v, favWhen);
                    return (
                      <div key={item.labelFr} className={cn(
                        "flex items-center gap-3 rounded-lg border px-4 py-2.5",
                        isAr ? "flex-row-reverse" : "",
                        "bg-card"
                      )}>
                        <div className={cn("w-40 shrink-0 text-xs font-semibold", isAr ? "text-right" : "text-left")}>
                          {isAr ? item.labelAr : item.labelFr}
                        </div>
                        <div className={cn("flex-1 flex items-center gap-2", isAr && "flex-row-reverse")}>
                          {/* Mini bar */}
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden max-w-[180px]">
                            <div
                              className={cn("h-2 rounded-full", absp < 5 ? "bg-green-500" : absp < 15 ? "bg-orange-400" : "bg-red-500")}
                              style={{ width: `${Math.min(absp * 3, 100)}%` }}
                            />
                          </div>
                          <span className={cn("text-sm font-bold tabular-nums w-16 shrink-0", isAr ? "text-right" : "text-left", varStyle.color)}>
                            {p >= 0 ? "+" : "−"}{Math.abs(p).toFixed(1)}%
                          </span>
                        </div>
                        <span className={cn("text-xs font-bold tabular-nums shrink-0 w-28", isAr ? "text-right" : "text-left", varStyle.color)}>
                          {fDA(item.v, language)}
                        </span>
                        <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border shrink-0", b.cls)}>
                          {isAr ? b.ar : b.fr}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* ── قسم تحليل الوضع ──────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-primary" />
          {t("Analyse de la Situation", "تحليل الوضع")}
        </h2>
        <div className="space-y-2">
          {analysisLines.map((line, i) => (
            <div key={i} className={cn(
              "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
              line.color
            )}>
              <span className="text-base leading-snug shrink-0">{line.icon}</span>
              <span className="leading-relaxed">{line.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── قسم التوصيات ─────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-primary" />
          {t("Recommandations Managériales", "التوصيات الإدارية")}
        </h2>
        <div className="space-y-3">
          {suggestions.map((s, i) => (
            <div key={i} className={cn(
              "flex items-start gap-3 rounded-lg border-l-4 px-4 py-3",
              s.color, s.borderColor
            )}>
              <span className="text-lg shrink-0 mt-0.5">{s.icon}</span>
              <div className="space-y-1">
                {s.title && <p className="font-semibold text-sm">{s.title}</p>}
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Rapport managérial + Save + PDF ──────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          {t("Rapport Managérial", "التقرير الإداري")}
        </h2>
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-lg font-bold">
                  {problemName || t("Analyse des Écarts", "تحليل الانحرافات")}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {isAr ? cfg.nameAr : cfg.nameFr}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge className={cn(
                  "border",
                  totals.totalVariance === 0
                    ? "bg-muted/50 text-muted-foreground border-border"
                    : (favWhen === "positive" ? totals.totalVariance > 0 : totals.totalVariance < 0)
                    ? "bg-green-100 text-green-800 border-green-200"
                    : "bg-red-100 text-red-800 border-red-200"
                )}>
                  {fDA(totals.totalVariance, language)}
                </Badge>
                <Badge variant="outline">{rows.length} {t("éléments", "عناصر")}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* KPI grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                { label: isAr ? cfg.priceVarAr : cfg.priceVarFr,          value: fDA(totals.priceVariance, language) },
                ...(isOverhead ? [
                  { label: isAr ? (cfg.var4VarAr ?? "") : (cfg.var4VarFr ?? ""), value: fDA(totals.var4 ?? 0, language) },
                  { label: isAr ? (cfg.var3VarAr ?? "") : (cfg.var3VarFr ?? ""), value: fDA(totals.var3 ?? 0, language) },
                ] : []),
                { label: isAr ? cfg.qtyVarAr   : cfg.qtyVarFr,            value: fDA(totals.qtyVariance, language) },
                { label: t("Écart Total",    "الانحراف الإجمالي"),          value: fDA(totals.totalVariance, language) },
                { label: t("Facteur dominant", "العامل المسيطر"),
                  value: dominantFactor === "price" ? (isAr ? cfg.priceVarAr : cfg.priceVarFr)
                       : dominantFactor === "qty"   ? (isAr ? cfg.qtyVarAr   : cfg.qtyVarFr)
                       : dominantFactor === "var3"  ? (isAr ? (cfg.var3VarAr ?? "") : (cfg.var3VarFr ?? ""))
                       : dominantFactor === "var4"  ? (isAr ? (cfg.var4VarAr ?? "") : (cfg.var4VarFr ?? ""))
                       : t("Équilibré", "متوازن") },
              ] as { label: string; value: string }[]).map(kpi => (
                <div key={kpi.label} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className="text-sm font-bold mt-0.5 truncate">{kpi.value}</p>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3 flex-wrap pt-1">
              <Button onClick={handleSave} disabled={isSaving || savedOk} variant="outline">
                {isSaving
                  ? <><Loader2 className="w-4 h-4 me-2 animate-spin" />{t("Sauvegarde…", "جارٍ الحفظ…")}</>
                  : savedOk
                  ? <><CheckCircle2 className="w-4 h-4 me-2 text-green-600" />{t("Sauvegardé !", "تم الحفظ!")}</>
                  : <><Save className="w-4 h-4 me-2" />{t("Sauvegarder", "حفظ في السجل")}</>}
              </Button>
              <Button onClick={() => setPdfOpen(true)}>
                <FileText className="w-4 h-4 me-2" />
                {t("Exporter PDF", "تصدير PDF")}
              </Button>
            </div>

            {saveError && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {saveError}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <VariancePDFExportDialog
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        problemName={problemName}
        sector={sector}
        objective={objective}
        rows={rows}
        totals={totals}
        dominantFactor={dominantFactor}
        analysisLines={analysisLines}
        suggestions={suggestions}
      />
    </div>
  );
}
