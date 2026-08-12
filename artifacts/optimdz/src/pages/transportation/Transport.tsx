import { useState, useMemo, useEffect, useRef } from "react";
import { useLanguage } from "@/lib/LanguageContext";
import { useTransportHistory } from "@/lib/TransportHistoryContext";
import { cn } from "@/lib/utils";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import {
  Truck, Factory, ShoppingBag, Users, Leaf, PenLine,
  Plus, Trash2, ArrowRight, ChevronRight, ChevronLeft,
  RotateCcw, AlertTriangle, CheckCircle2, Info,
  Play, Pause, SkipForward, SkipBack, Zap, GitMerge,
  BarChart3, GitCompare, TrendingDown, TrendingUp,
  BarChart2, Lightbulb, ClipboardList, BookmarkPlus,
  Download, Check, Star, RotateCw,
} from "lucide-react";

import {
  solveNWC, solveLCM, solveVAM, METHOD_META,
  type MethodKey, type SolveResult, type BalancedMatrix,
} from "@/lib/transportAlgorithms";
import { runMODI, type MODIResult, type MODIIteration, type LoopCell } from "@/lib/modiAlgorithm";
import { generateTransportPDF } from "@/lib/generateTransportPDF";
import { TEMPLATES, type Template } from "@/pages/transportation/Solve";
import type { TransportSectorKey } from "@/lib/TransportHistoryContext";

// ── Types ─────────────────────────────────────────────────────────────────────

type SectorKey = "industry" | "trade" | "services" | "agriculture" | "custom";
type Phase = "input" | "results";
type ViewMode = "modi" | "stepping-stone";
type InitMethodView = MethodKey | "compare";

interface Source      { name: string; supply: number; }
interface Destination { name: string; demand: number; }

interface Problem {
  name:          string;
  sector:        SectorKey;
  objectiveType: "minimize" | "maximize";
  sources:       Source[];
  destinations:  Destination[];
  costs:         number[][];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, lang = "fr", d = 0): string {
  if (!isFinite(n)) return "∞";
  return n.toLocaleString(lang === "ar" ? "ar-DZ" : "fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: d,
  });
}

const blankSources   = (): Source[]      => [{ name: "", supply: 0 }, { name: "", supply: 0 }];
const blankDests     = (): Destination[] => [{ name: "", demand: 0 }, { name: "", demand: 0 }];
const blankCosts     = (m: number, n: number) => Array.from({ length: m }, () => Array(n).fill(0));

function tplToState(tpl: Template, lang: "fr" | "ar") {
  return {
    sources:      tpl.sources.map(s => ({ name: lang === "ar" ? s.nameAr : s.nameFr, supply: s.supply })),
    destinations: tpl.destinations.map(d => ({ name: lang === "ar" ? d.nameAr : d.nameFr, demand: d.demand })),
    costs:        tpl.costs.map(row => [...row]),
  };
}

// ── Sector cards ──────────────────────────────────────────────────────────────

const SECTOR_CARDS = [
  {
    key: "trade"       as SectorKey,
    icon: <ShoppingBag className="w-7 h-7" />,
    nameFr: "Commerce",     nameAr: "تجارة",
    descFr: "Distribution de marchandises depuis des entrepôts vers des détaillants régionaux.",
    descAr: "توزيع البضائع من المستودعات إلى تجار التجزئة الإقليميين.",
    routeFr: "2 entrepôts → 4 magasins · Équilibré",
    routeAr: "مستودعان → 4 متاجر · متوازن",
    color: "border-amber-200 hover:border-amber-400 hover:bg-amber-50/60",
    iconBg: "bg-amber-100 text-amber-700",
  },
  {
    key: "industry"    as SectorKey,
    icon: <Factory className="w-7 h-7" />,
    nameFr: "Industrie",    nameAr: "صناعة",
    descFr: "Acheminement de produits depuis des usines vers des centres de distribution.",
    descAr: "شحن المنتجات من المصانع إلى مراكز التوزيع.",
    routeFr: "3 usines → 4 centres · Équilibré",
    routeAr: "3 مصانع → 4 مراكز · متوازن",
    color: "border-blue-200 hover:border-blue-400 hover:bg-blue-50/60",
    iconBg: "bg-blue-100 text-blue-700",
  },
  {
    key: "agriculture" as SectorKey,
    icon: <Leaf className="w-7 h-7" />,
    nameFr: "Agriculture",  nameAr: "فلاحة",
    descFr: "Transport de récoltes depuis des fermes vers des marchés de gros régionaux.",
    descAr: "نقل المحاصيل من المزارع إلى أسواق الجملة الإقليمية.",
    routeFr: "3 fermes → 4 marchés · Équilibré",
    routeAr: "3 مزارع → 4 أسواق جملة · متوازن",
    color: "border-green-200 hover:border-green-400 hover:bg-green-50/60",
    iconBg: "bg-green-100 text-green-700",
  },
  {
    key: "services"    as SectorKey,
    icon: <Users className="w-7 h-7" />,
    nameFr: "Services",     nameAr: "خدمات",
    descFr: "Livraison de colis depuis des hubs logistiques vers des villes clientes.",
    descAr: "توصيل الطرود من مراكز اللوجستيك إلى المدن العميلة.",
    routeFr: "2 hubs → 5 villes · Déséquilibré",
    routeAr: "مركزان → 5 مدن · غير متوازن",
    color: "border-purple-200 hover:border-purple-400 hover:bg-purple-50/60",
    iconBg: "bg-purple-100 text-purple-700",
  },
];

// ── TableauGrid (initial method step-by-step) ─────────────────────────────────

function TableauGrid({
  result, currentStep, objective,
}: { result: SolveResult; currentStep: number; objective: "minimize" | "maximize" }) {
  const { t } = useLanguage();
  const { balanced, steps } = result;
  const m = balanced.sources.length;
  const n = balanced.destinations.length;
  const isMin = objective === "minimize";

  const display = useMemo(() => {
    const supply = balanced.sources.map(s => s.supply);
    const demand = balanced.destinations.map(d => d.demand);
    if (currentStep < 0) return { supply, demand, allocMap: new Map<string, number>(), activeI: -1, activeJ: -1 };
    const allocMap = new Map<string, number>();
    for (let k = 0; k <= currentStep; k++) {
      const s = steps[k];
      allocMap.set(`${s.i},${s.j}`, (allocMap.get(`${s.i},${s.j}`) || 0) + s.amount);
    }
    const cur = steps[currentStep];
    return { supply: cur.supplyAfter, demand: cur.demandAfter, allocMap, activeI: cur.i, activeJ: cur.j };
  }, [currentStep, steps, balanced]);

  const exhaustedRows = useMemo(() => {
    const s = new Set<number>();
    display.supply.forEach((v, i) => { if (v === 0) s.add(i); });
    return s;
  }, [display.supply]);
  const exhaustedCols = useMemo(() => {
    const s = new Set<number>();
    display.demand.forEach((v, j) => { if (v === 0) s.add(j); });
    return s;
  }, [display.demand]);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="border-collapse text-sm" style={{ minWidth: `${Math.max(480, 160 + n * 110 + 90)}px` }}>
        <thead>
          <tr>
            <th className="sticky left-0 z-20 bg-muted px-3 py-2.5 border-b border-r border-border text-left min-w-[150px]">
              <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <Truck className="w-3 h-3" />
                <span>{t("Source \\ Dest.", "المصدر \\ الوجهة")}</span>
              </div>
            </th>
            {balanced.destinations.map((dest, j) => (
              <th key={j} className={cn(
                "px-2 py-2 border-b border-r border-border text-center min-w-[100px]",
                exhaustedCols.has(j) ? "bg-muted/70 opacity-60" : "bg-muted",
                balanced.dummyDestIndex === j && "bg-amber-50",
                display.activeJ === j && currentStep >= 0 && "bg-green-50",
              )}>
                <span className={cn(
                  "text-xs font-medium",
                  balanced.dummyDestIndex === j && "italic text-amber-700",
                  display.activeJ === j && currentStep >= 0 && "text-green-700 font-bold",
                )}>{dest.name}</span>
              </th>
            ))}
            <th className="px-3 py-2.5 border-b border-l border-border bg-primary/8 text-center min-w-[80px]">
              <span className="text-xs font-bold text-primary uppercase tracking-wide">{t("Offre", "العرض")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {balanced.sources.map((src, i) => {
            const rowExhausted = exhaustedRows.has(i);
            const isDummyRow = balanced.dummySourceIndex === i;
            return (
              <tr key={i} className={cn(
                "transition-colors",
                rowExhausted && "opacity-60",
                isDummyRow && "bg-amber-50/60",
                !rowExhausted && !isDummyRow && i % 2 === 0 && "bg-background",
                !rowExhausted && !isDummyRow && i % 2 === 1 && "bg-muted/20",
                display.activeI === i && currentStep >= 0 && "bg-green-50/40",
              )}>
                <td className={cn(
                  "sticky left-0 z-10 px-3 py-2 border-b border-r border-border font-medium text-sm",
                  isDummyRow && "italic text-amber-700 bg-amber-50/60",
                  !isDummyRow && rowExhausted && "bg-muted/60 text-muted-foreground",
                  !isDummyRow && !rowExhausted && "bg-inherit text-foreground",
                )}>
                  <div className="flex items-center gap-2">
                    {rowExhausted && <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />}
                    <span className="truncate max-w-[130px]">{src.name}</span>
                  </div>
                </td>
                {balanced.destinations.map((_, j) => {
                  const key = `${i},${j}`;
                  const alloc = display.allocMap.get(key) || 0;
                  const isActive = display.activeI === i && display.activeJ === j && currentStep >= 0;
                  const isPrev = alloc > 0 && !isActive;
                  const isDummyCol = balanced.dummyDestIndex === j;
                  return (
                    <td key={j} className={cn(
                      "relative px-1 py-1 border-b border-r border-border text-center transition-all",
                      isActive && "bg-green-100 ring-2 ring-inset ring-green-500",
                      isPrev && "bg-primary/8",
                      !isActive && !isPrev && exhaustedCols.has(j) && "bg-muted/40",
                      isDummyCol && !isActive && !isPrev && "bg-amber-50/30",
                    )}>
                      <span className={cn(
                        "absolute top-1 right-1.5 text-[9px] tabular-nums leading-none",
                        isMin ? "text-muted-foreground" : "text-purple-500",
                        isActive && "text-green-600",
                        isDummyCol && "text-amber-500",
                      )}>{balanced.costs[i][j]}</span>
                      <div className="pt-3 pb-0.5 px-1 min-h-[36px] flex items-center justify-center">
                        {alloc > 0 ? (
                          <span className={cn(
                            "font-bold tabular-nums text-sm leading-none",
                            isActive && "text-green-700 text-base",
                            isPrev && "text-primary",
                          )}>{alloc.toLocaleString()}</span>
                        ) : (
                          <span className="text-muted-foreground/30 text-xs">—</span>
                        )}
                      </div>
                      {isActive && <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-green-500" />}
                    </td>
                  );
                })}
                <td className={cn(
                  "px-3 py-2 border-b border-l border-border text-center tabular-nums font-semibold",
                  rowExhausted ? "text-muted-foreground bg-muted/30 line-through" : "text-primary bg-primary/5",
                )}>{display.supply[i].toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-primary/5">
            <td className="sticky left-0 z-10 bg-primary/5 px-3 py-2 border-t border-r border-border">
              <span className="text-xs font-bold text-primary uppercase tracking-wide">{t("Demande", "الطلب")}</span>
            </td>
            {balanced.destinations.map((_, j) => (
              <td key={j} className={cn(
                "px-2 py-2 border-t border-r border-border text-center tabular-nums font-semibold",
                exhaustedCols.has(j) ? "text-muted-foreground bg-muted/30 line-through" : "text-primary",
              )}>{display.demand[j].toLocaleString()}</td>
            ))}
            <td className="px-3 py-2 border-t border-l border-border text-center">
              <span className="text-xs text-muted-foreground">{t("Restant", "المتبقي")}</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── StepNav ───────────────────────────────────────────────────────────────────

function StepNav({
  totalSteps, currentStep, isPlaying, onChange, onTogglePlay,
}: { totalSteps: number; currentStep: number; isPlaying: boolean; onChange: (n: number) => void; onTogglePlay: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-4 py-2">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange(-1)} disabled={currentStep < 0}>
          <SkipBack className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange(currentStep - 1)} disabled={currentStep < 0}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button variant={isPlaying ? "destructive" : "default"} size="sm" className="h-8 px-3 gap-1.5" onClick={onTogglePlay}>
          {isPlaying ? <><Pause className="w-3.5 h-3.5" />{t("Pause", "إيقاف")}</> : <><Play className="w-3.5 h-3.5" />{t("Jouer", "تشغيل")}</>}
        </Button>
        <span className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
          {currentStep < 0
            ? t("État initial", "الحالة الأولية")
            : t(`Étape ${currentStep + 1} / ${totalSteps}`, `الخطوة ${currentStep + 1} / ${totalSteps}`)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange(currentStep + 1)} disabled={currentStep >= totalSteps - 1}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange(totalSteps - 1)} disabled={currentStep >= totalSteps - 1}>
          <SkipForward className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ── InitStepExplanation ────────────────────────────────────────────────────────

function InitStepExplanation({ result, stepIndex, objective }: { result: SolveResult; stepIndex: number; objective: "minimize" | "maximize" }) {
  const { t } = useLanguage();
  if (stepIndex < 0 || stepIndex >= result.steps.length) return null;
  const step    = result.steps[stepIndex];
  const { balanced } = result;
  const srcName = balanced.sources[step.i]?.name      ?? `S${step.i + 1}`;
  const dstName = balanced.destinations[step.j]?.name ?? `D${step.j + 1}`;
  const isMin   = objective === "minimize";
  const costWord = isMin ? t("coût", "تكلفة") : t("profit", "ربح");

  const methodNote = (() => {
    if (result.method === "nwc")
      return t(`Coin nord-ouest disponible : ligne ${step.i + 1}, colonne ${step.j + 1}.`, `الزاوية الشمالية الغربية المتاحة: صف ${step.i + 1}، عمود ${step.j + 1}.`);
    if (result.method === "lcm")
      return t(`${isMin ? "Coût unitaire minimum" : "Profit unitaire maximum"} disponible : ${step.cost}.`, `${isMin ? "أدنى تكلفة وحدوية" : "أعلى ربح وحدوي"} متاحة: ${step.cost}.`);
    if (result.method === "vam" && step.penalty !== undefined) {
      const src = step.penaltySource === "row"
        ? t(`Ligne ${(step.penaltyIndex ?? 0) + 1}`, `الصف ${(step.penaltyIndex ?? 0) + 1}`)
        : t(`Colonne ${(step.penaltyIndex ?? 0) + 1}`, `العمود ${(step.penaltyIndex ?? 0) + 1}`);
      return t(`Pénalité max = ${step.penalty} sur ${src}. ${isMin ? "Coût min" : "Profit max"} : ${step.cost}.`, `أقصى عقوبة = ${step.penalty} على ${src}. ${isMin ? "أدنى تكلفة" : "أعلى ربح"}: ${step.cost}.`);
    }
    return "";
  })();

  const exhaustNote = step.exhaustedRow && step.exhaustedCol
    ? t("Source et destination toutes deux épuisées (cas dégénéré).", "المصدر والوجهة كلاهما مستنفدان (حالة متدهورة).")
    : step.exhaustedRow
      ? t(`Source « ${srcName} » épuisée.`, `المصدر « ${srcName} » مستنفد.`)
      : step.exhaustedCol
        ? t(`Destination « ${dstName} » satisfaite.`, `الوجهة « ${dstName} » مُشبعة.`)
        : "";

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-2">
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{stepIndex + 1}</div>
        <div className="space-y-1.5 text-sm text-green-900">
          {methodNote && <p className="font-medium">{methodNote}</p>}
          <p>
            {t("Allouer ", "تخصيص ")}
            <strong className="text-green-700">{step.amount.toLocaleString()} {t("unités", "وحدة")}</strong>
            {" "}{t("de", "من")}{" "}<strong>«{srcName}»</strong>
            {" "}{t("vers", "إلى")}{" "}<strong>«{dstName}»</strong>.
            {" "}({costWord} unitaire = <strong>{step.cost}</strong>, contribution = <strong className="text-green-700">{step.contribution.toLocaleString()}</strong>)
          </p>
          {exhaustNote && <p className="text-green-700 text-xs">{exhaustNote}</p>}
          <p className="text-xs text-green-700 font-medium border-t border-green-200 pt-1.5 mt-1.5">
            {isMin ? t("Coût cumulé", "التكلفة التراكمية") : t("Profit cumulé", "الربح التراكمي")}
            {" : "}<strong>{step.cumulativeCost.toLocaleString()}</strong>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── MODITableau ───────────────────────────────────────────────────────────────

function MODITableau({
  iteration, balanced, viewMode, isMax,
}: { iteration: MODIIteration; balanced: BalancedMatrix; viewMode: ViewMode; isMax: boolean }) {
  const { language } = useLanguage();
  const { allocation, isBasic, u, v, opportunityCosts, enteringCell, leavingCell, loop, epsilonCells } = iteration;
  const m = balanced.sources.length;
  const n = balanced.destinations.length;
  const epsilonSet = new Set(epsilonCells.map(c => `${c.i},${c.j}`));
  const loopSet = new Map<string, { sign: "+" | "-"; pos: number }>();
  if (loop) loop.forEach((c, idx) => loopSet.set(`${c.i},${c.j}`, { sign: c.sign, pos: idx }));

  function cellClass(i: number, j: number): string {
    const key = `${i},${j}`;
    if (enteringCell?.i === i && enteringCell?.j === j) return "bg-green-100 border-green-400 ring-2 ring-green-400";
    if (leavingCell?.i  === i && leavingCell?.j  === j) return "bg-red-100 border-red-400 ring-2 ring-red-400";
    if (loopSet.has(key) && viewMode === "stepping-stone") return "bg-amber-50 border-amber-300";
    if (epsilonSet.has(key)) return "bg-slate-50 border-slate-300 opacity-70";
    if (isBasic[i][j]) return "bg-primary/5 border-border";
    return "bg-white border-border";
  }

  function oppCostColor(val: number | null): string {
    if (val === null) return "text-foreground";
    if (Math.abs(val) < 1e-4) return "text-blue-600 font-bold";
    if (isMax ? val > 0 : val < 0) return "text-red-600 font-bold";
    return "text-muted-foreground";
  }

  const colWidth = Math.max(72, Math.min(100, Math.floor(620 / (n + 1))));

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse" style={{ minWidth: (n + 2) * colWidth + 100 }}>
        <thead>
          <tr>
            <th className="text-left p-1 text-muted-foreground w-24" />
            {balanced.destinations.map((d, j) => (
              <th key={j} className="p-1 text-center font-semibold text-foreground" style={{ width: colWidth }}>
                <div className="truncate">{d.name}</div>
                {viewMode === "modi" && (
                  <div className="text-primary font-bold text-[10px] mt-0.5">
                    v{j+1} = {v[j] !== undefined ? fmt(v[j], language, 1) : "?"}
                  </div>
                )}
              </th>
            ))}
            <th className="p-1 text-center font-semibold text-foreground" style={{ width: colWidth - 8 }}>
              {language === "ar" ? "عرض" : "Offre"}
            </th>
          </tr>
        </thead>
        <tbody>
          {balanced.sources.map((s, i) => (
            <tr key={i}>
              <td className="p-1 pr-2 text-right font-semibold text-foreground whitespace-nowrap">
                <div className="truncate max-w-[90px]">{s.name}</div>
                {viewMode === "modi" && (
                  <div className="text-primary font-bold text-[10px]">u{i+1} = {u[i] !== undefined ? fmt(u[i], language, 1) : "?"}</div>
                )}
              </td>
              {Array.from({ length: n }, (_, j) => {
                const alloc    = allocation[i]?.[j] ?? 0;
                const opp      = opportunityCosts[i]?.[j];
                const basic    = isBasic[i][j];
                const key      = `${i},${j}`;
                const loopInfo = loopSet.get(key);
                const eps      = epsilonSet.has(key);
                return (
                  <td key={j} className={cn("border p-1 text-center relative transition-colors", cellClass(i, j))} style={{ width: colWidth, height: 52 }}>
                    {viewMode === "stepping-stone" && loopInfo && (
                      <span className={cn("absolute top-0.5 right-0.5 text-[10px] font-extrabold leading-none px-0.5", loopInfo.sign === "+" ? "text-green-600" : "text-red-600")}>
                        {loopInfo.sign}
                      </span>
                    )}
                    {basic ? (
                      <div>
                        <div className={cn("font-bold text-sm", eps ? "text-slate-400 italic" : "text-foreground")}>
                          {eps ? "ε" : fmt(alloc, language)}
                        </div>
                        {viewMode === "modi" && <div className="text-[9px] text-muted-foreground mt-0.5">Δ = 0</div>}
                      </div>
                    ) : (
                      <div>
                        <div className={cn("text-[11px]", oppCostColor(opp))}>
                          {opp !== null ? (Math.abs(opp) < 1e-4 ? "0" : fmt(opp, language, 1)) : "—"}
                        </div>
                        {viewMode === "modi" && <div className="text-[8px] text-muted-foreground">Δ</div>}
                      </div>
                    )}
                    {enteringCell?.i === i && enteringCell?.j === j && (
                      <div className="absolute bottom-0.5 left-0.5 text-[8px] text-green-600 font-bold leading-none">IN</div>
                    )}
                    {leavingCell?.i === i && leavingCell?.j === j && (
                      <div className="absolute bottom-0.5 left-0.5 text-[8px] text-red-600 font-bold leading-none">OUT</div>
                    )}
                  </td>
                );
              })}
              <td className="border border-border p-1 text-center text-xs font-semibold bg-muted/30">
                {fmt(iteration.allocation[i]?.reduce((s, v) => s + v, 0) ?? 0, language)}
              </td>
            </tr>
          ))}
          <tr className="bg-muted/20">
            <td className="p-1 text-right text-xs font-semibold text-muted-foreground">{language === "ar" ? "طلب" : "Demande"}</td>
            {Array.from({ length: n }, (_, j) => (
              <td key={j} className="border border-border p-1 text-center text-xs font-semibold">
                {fmt(balanced.destinations[j]?.demand ?? 0, language)}
              </td>
            ))}
            <td className="border border-border p-1 text-center text-xs text-muted-foreground">—</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── MODIStepExplanation ───────────────────────────────────────────────────────

function MODIStepExplanation({ iteration, isMax, language }: { iteration: MODIIteration; isMax: boolean; language: string }) {
  const t = (fr: string, ar: string) => language === "ar" ? ar : fr;
  if (iteration.isOptimal) {
    return (
      <Alert className="border-green-200 bg-green-50">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <AlertTitle className="text-green-800">{t("Solution optimale atteinte ✓", "تم الوصول إلى الحل الأمثل ✓")}</AlertTitle>
        <AlertDescription className="text-green-700 text-sm">
          {t(
            `Tous les coûts d'opportunité sont ${isMax ? "≤ 0" : "≥ 0"}. Aucune amélioration possible. Coût total : ${fmt(iteration.totalCost, language)} DZD.`,
            `جميع تكاليف الفرصة ${isMax ? "≤ 0" : "≥ 0"}. لا يمكن التحسين أكثر. التكلفة الإجمالية: ${fmt(iteration.totalCost, language)} دج.`
          )}
        </AlertDescription>
      </Alert>
    );
  }

  const { enteringCell, leavingCell, theta, loop, opportunityCosts } = iteration;
  const bestOpp = enteringCell ? (opportunityCosts[enteringCell.i]?.[enteringCell.j] ?? 0) : 0;

  return (
    <div className="space-y-2">
      {iteration.degenerateInfo && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 text-sm">{t("Dégénérescence détectée — ε-perturbation appliquée", "تم اكتشاف تدهور — تطبيق ε-اضطراب")}</AlertTitle>
          <AlertDescription className="text-amber-700 text-xs">{iteration.degenerateInfo}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="bg-green-50 border border-green-200 rounded-lg p-2">
          <div className="font-semibold text-green-800 mb-1">{t("① Cellule entrante", "① الخلية الداخلة")}</div>
          {enteringCell ? (
            <div className="text-green-700">
              ({enteringCell.i + 1},{enteringCell.j + 1}) — Δ = <strong>{fmt(bestOpp, language, 2)}</strong>
              <div className="text-[10px] mt-0.5 text-green-600">
                {t(`Δ ${isMax ? "positif" : "négatif"} le plus`, isMax ? "Δ إيجابي أكثر" : "Δ سالب أكثر")} {isMax ? "" : ""}
              </div>
            </div>
          ) : <div className="text-muted-foreground">—</div>}
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
          <div className="font-semibold text-amber-800 mb-1">{t("② Boucle (Stepping Stone)", "② الحلقة (Stepping Stone)")}</div>
          {loop ? (
            <div className="text-amber-700 text-[10px] leading-relaxed">
              {loop.map((c, idx) => (
                <span key={idx}>
                  <span className={cn("font-bold", c.sign === "+" ? "text-green-600" : "text-red-600")}>{c.sign}</span>
                  ({c.i+1},{c.j+1}){idx < loop.length - 1 ? " → " : ""}
                </span>
              ))}
            </div>
          ) : <div className="text-muted-foreground">—</div>}
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-2">
          <div className="font-semibold text-red-800 mb-1">{t("③ Transfert θ & sortante", "③ النقل θ والخلية الخارجة")}</div>
          {leavingCell ? (
            <div className="text-red-700">
              <div>θ = <strong>{fmt(theta ?? 0, language)}</strong></div>
              <div className="text-[10px] mt-0.5">{t("Sortante", "خارجة")}: ({leavingCell.i+1},{leavingCell.j+1})</div>
            </div>
          ) : <div className="text-muted-foreground">—</div>}
        </div>
      </div>
    </div>
  );
}

// ── TransportAnalysis (situational analysis + recommendations) ────────────────

function TransportAnalysis({
  problem, results, bestMethod, modiResult, initialCost, isSaved, isExporting, onSave, onPDF,
}: {
  problem:     Problem;
  results:     Record<MethodKey, SolveResult>;
  bestMethod:  MethodKey;
  modiResult:  MODIResult;
  initialCost: number;
  isSaved:     boolean;
  isExporting: boolean;
  onSave:      () => void;
  onPDF:       () => void;
}) {
  const { t, language } = useLanguage();
  const isAr  = language === "ar";
  const isMax = problem.objectiveType === "maximize";

  const improvement  = initialCost > 0 ? ((initialCost - modiResult.finalCost) / initialCost) * 100 : 0;
  const totalIters   = modiResult.iterations.length - 1;
  const epsilonSet   = new Set(modiResult.epsilonCells.map(c => `${c.i},${c.j}`));
  const activeRoutes = modiResult.sensitivityRanges.filter(r => r.allocation > 0 && !epsilonSet.has(`${r.i},${r.j}`));
  const topRoutes    = [...activeRoutes].sort((a, b) => (b.allocation * b.unitCost) - (a.allocation * a.unitCost)).slice(0, 3);
  const totalSupply  = problem.sources.reduce((s, x) => s + x.supply, 0);
  const totalDemand  = problem.destinations.reduce((s, x) => s + x.demand, 0);
  const isBalanced   = totalSupply === totalDemand;

  // ── Pre-compute route cost shares ─────────────────────────────────────────
  const routeShares = [...activeRoutes]
    .map(r => ({ ...r, cost: r.allocation * r.unitCost }))
    .sort((a, b) => b.cost - a.cost);
  const routePct = (cost: number) =>
    modiResult.finalCost > 0 ? Math.round((cost / modiResult.finalCost) * 100) : 0;
  const savings = initialCost - modiResult.finalCost;
  const totalRoutes = problem.sources.length * problem.destinations.length;
  const altN = modiResult.alternativeOptimaCells.length;

  const destinationPlans = problem.destinations.map((destination, j) => {
    const routes = activeRoutes.filter(route => route.j === j);
    const detail = routes.length > 0
      ? routes.map(route => `${route.sourceName} → ${destination.name}: ${fmt(route.allocation, language)} ${t("unités", "وحدة")} à ${fmt(route.unitCost, language)} ${t("DZD/unité", "دج/وحدة")} (${fmt(route.allocation * route.unitCost, language)} ${t("DZD", "دج")})`).join(", ")
      : t("aucune liaison active", "لا يوجد مسار نشط");
    return `${destination.name} (${fmt(destination.demand, language)} ${t("unités demandées", "وحدة مطلوبة")}) : ${detail}`;
  });
  const routePlanText = destinationPlans.join("; ");
  const highestCostRoute = routeShares[0];
  const highCostRoutes = highestCostRoute
    ? routeShares.filter(route => route.cost >= highestCostRoute.cost * 0.75)
    : [];
  const highCostRouteText = highCostRoutes
    .map(route => `${route.sourceName} → ${route.destName} (${fmt(route.allocation, language)} ${t("unités", "وحدة")}, ${fmt(route.unitCost, language)} ${t("DZD/unité", "دج/وحدة")}, ${fmt(route.cost, language)} ${t("DZD", "دج")})`)
    .join("; ");

  // ── Situational analysis — short, connected manager-facing paragraphs ──────
  const analysisLines: { icon: string; text: string; color: string }[] = [
    {
      icon: "🚛",
      color: "bg-primary/10 border-primary/30",
      text: t(
        (() => {
          const balance = isBalanced
            ? `L'offre totale de ${fmt(totalSupply, language)} unités couvre exactement la demande de ${fmt(totalDemand, language)} unités`
            : `l'offre de ${fmt(totalSupply, language)} unités est comparée à une demande de ${fmt(totalDemand, language)}, avec l'ajustement nécessaire intégré au réseau`;
          const modiNote = improvement > 0
            ? `Après ${totalIters} étape${totalIters > 1 ? "s" : ""} d'amélioration, la méthode MODI fait passer le ${isMax ? "résultat initial" : "coût initial"} de ${fmt(initialCost, language)} DZD à ${fmt(modiResult.finalCost, language)}, soit ${improvement.toFixed(1)} % d'amélioration${savings > 0 ? ` et ${fmt(savings, language)} DZD économisés` : ""}.`
            : `La méthode MODI confirme directement cette solution comme optimale, sans amélioration supplémentaire.`;
          return `Le plan "${problem.name}" organise ${problem.sources.length} source${problem.sources.length > 1 ? "s" : ""} vers ${problem.destinations.length} destination${problem.destinations.length > 1 ? "s" : ""}; ${balance}. ${modiNote} Le résultat retenu ${isMax ? "maximise la valeur" : "minimise le coût"} à ${fmt(modiResult.finalCost, language)} DZD en utilisant ${activeRoutes.length} liaison${activeRoutes.length > 1 ? "s" : ""} actives sur ${totalRoutes}.`;
        })(),
        (() => {
          const balance = isBalanced
            ? `إجمالي العرض البالغ ${fmt(totalSupply, language)} وحدة يغطي الطلب البالغ ${fmt(totalDemand, language)} وحدة تماماً`
            : `العرض البالغ ${fmt(totalSupply, language)} وحدة يُقارن بطلب قدره ${fmt(totalDemand, language)} وحدة، مع إدراج التعديل اللازم في الشبكة`;
          const modiNote = improvement > 0
            ? `بعد ${totalIters} خطوة تحسين، نقلت طريقة MODI ${isMax ? "النتيجة الأولية" : "التكلفة الأولية"} من ${fmt(initialCost, language)} دج إلى ${fmt(modiResult.finalCost, language)} دج، بتحسن قدره ${improvement.toFixed(1)}%${savings > 0 ? ` وتوفير ${fmt(savings, language)} دج` : ""}.`
            : `أكدت طريقة MODI مباشرة أن الحل مثالي دون تحسين إضافي.`;
          return `تنظم خطة "${problem.name}" التوزيع من ${problem.sources.length} مصادر إلى ${problem.destinations.length} وجهات؛ ${balance}. ${modiNote} والنتيجة المعتمدة ${isMax ? "تعظّم القيمة" : "تقلّل التكلفة"} إلى ${fmt(modiResult.finalCost, language)} دج عبر ${activeRoutes.length} مسارات نشطة من أصل ${totalRoutes}.`;
        })()
      ),
    },
    {
      icon: "📦",
      color: "bg-secondary/10 border-secondary/30",
      text: t(
        `Concrètement, le plan recommande de servir chaque destination comme suit : ${routePlanText}. Cette répartition transforme le résultat mathématique en consignes d'expédition : chaque entrepôt ou usine envoie les quantités indiquées au client correspondant, sans dépasser les capacités ni laisser la demande planifiée sans couverture.`,
        `عملياً، توصي الخطة بخدمة كل وجهة كما يلي: ${routePlanText}. يحول هذا التوزيع النتيجة الحسابية إلى تعليمات شحن واضحة؛ يرسل كل مستودع أو مصنع الكميات المحددة إلى العميل المقابل دون تجاوز الطاقات أو ترك الطلب المخطط دون تغطية.`
      ),
    },
    ...(routeShares.length > 0 ? [{
      icon: "📊",
      color: "bg-amber-50 border-amber-300",
      text: t(
        `Les liaisons qui pèsent le plus dans la facture sont ${highCostRouteText}. La plus coûteuse est ${highestCostRoute!.sourceName} → ${highestCostRoute!.destName}, avec ${fmt(highestCostRoute!.cost, language)} DZD, soit ${routePct(highestCostRoute!.cost)} % du total. Si ce niveau est difficile à tenir, négociez d'abord le tarif unitaire de cette liaison et étudiez une réaffectation vers une source moins chère sans modifier les quantités demandées.`,
        `المسارات الأكثر تأثيراً في فاتورة النقل هي ${highCostRouteText}. وأكثرها تكلفة هو ${highestCostRoute!.sourceName} → ${highestCostRoute!.destName} بقيمة ${fmt(highestCostRoute!.cost, language)} دج، أي ${routePct(highestCostRoute!.cost)}% من الإجمالي. إذا كان هذا المستوى مرتفعاً، فابدأ بإعادة التفاوض على السعر الوحدوي لهذا المسار وادرس التحويل إلى مصدر أقل تكلفة دون تغيير الكميات المطلوبة.`
      ),
    }] : []),
    {
      icon: modiResult.hasAlternativeOptima ? "🔀" : "✅",
      color: modiResult.hasAlternativeOptima ? "bg-blue-50 border-blue-300" : "bg-green-50 border-green-300",
      text: t(
        modiResult.hasAlternativeOptima
          ? `La solution est optimale, mais pas unique : ${altN} liaison${altN > 1 ? "s" : ""} alternative${altN > 1 ? "s" : ""} peut${altN > 1 ? "vent" : ""} être utilisée${altN > 1 ? "s" : ""} au même coût de ${fmt(modiResult.finalCost, language)} DZD. Le choix pratique peut donc privilégier la fiabilité, les délais ou la disponibilité d'un entrepôt sans pénalité budgétaire.`
          : `La solution est pleinement optimale et unique selon les coûts fournis : aucune autre répartition testée n'atteint ${fmt(modiResult.finalCost, language)} DZD. Il est donc pertinent d'appliquer ce plan, puis de le recalculer si un coût, une capacité ou une demande change.`,
        modiResult.hasAlternativeOptima
          ? `الحل مثالي لكنه ليس وحيداً: يمكن استخدام ${altN} مسارات بديلة بنفس التكلفة البالغة ${fmt(modiResult.finalCost, language)} دج. لذلك يمكن أن يعطي القرار العملي الأولوية للموثوقية أو المهل أو توفر المستودع دون تكلفة إضافية.`
          : `الحل مثالي وفريد وفق التكاليف المقدمة: لا يصل أي توزيع آخر إلى ${fmt(modiResult.finalCost, language)} دج. لذلك يُنصح بتطبيق هذه الخطة وإعادة حسابها إذا تغيرت تكلفة أو طاقة أو كمية طلب.`
      ),
    },
  ];

  // ── Recommendations ─────────────────────────────────────────────────────────
  const suggestions: { icon: string; title: string; desc: string; color: string; borderColor: string }[] = [
    {
      icon: "🎯",
      color: "bg-primary/5",
      borderColor: "border-l-primary",
      title: t("Surveiller les routes à forte contribution", "مراقبة المسارات ذات المساهمة العالية"),
      desc: t(
        topRoutes.length >= 2
          ? (topRoutes[0].sourceName === topRoutes[1].sourceName
              ? `Les liaisons au départ de ${topRoutes[0].sourceName} vers ${topRoutes[0].destName} et ${topRoutes[1].destName} concentrent la majeure partie du flux optimal — toute perturbation sur ces liaisons aura un impact direct sur le coût total.`
              : `Les routes ${topRoutes.slice(0, 2).map(r => `${r.sourceName} → ${r.destName}`).join(" et ")} concentrent la majeure partie du flux optimal — toute perturbation sur ces liaisons aura un impact direct sur le coût total.`)
          : topRoutes.length === 1
            ? `La route ${topRoutes[0].sourceName} → ${topRoutes[0].destName} porte la majeure partie du flux optimal — toute perturbation sur cette liaison aura un impact direct sur le coût total.`
            : "Surveillez les routes actives du plan de distribution optimal.",
        topRoutes.length >= 2
          ? (topRoutes[0].sourceName === topRoutes[1].sourceName
              ? `مساري ${topRoutes[0].sourceName} نحو ${topRoutes[0].destName} و${topRoutes[1].destName} يركّزان معظم التدفق المثالي — أي اضطراب فيهما سيؤثر مباشرة على التكلفة الإجمالية.`
              : `المسارات ${topRoutes.slice(0, 2).map(r => `${r.sourceName} → ${r.destName}`).join(" و")} تركّز معظم التدفق المثالي — أي اضطراب فيها سيؤثر مباشرة على التكلفة الإجمالية.`)
          : topRoutes.length === 1
            ? `المسار ${topRoutes[0].sourceName} → ${topRoutes[0].destName} يحمل معظم التدفق المثالي — أي اضطراب فيه سيؤثر مباشرة على التكلفة الإجمالية.`
            : "راقب المسارات النشطة في خطة التوزيع المثلى."
      ),
    },
    ...(improvement > 5 ? [{
      icon: "💡",
      color: "bg-green-50",
      borderColor: "border-l-green-600",
      title: t("Gain significatif de l'optimisation MODI", "مكسب ملحوظ من تحسين MODI"),
      desc: t(
        `MODI a réduit le coût de ${improvement.toFixed(1)}% par rapport à la solution initiale (économie : ${fmt(initialCost - modiResult.finalCost, language)} DZD). Ce gain justifie l'utilisation systématique de MODI avant toute décision de distribution.`,
        `حسّن MODI التكلفة بنسبة ${improvement.toFixed(1)}% مقارنة بالحل الأولي (وفر ${fmt(initialCost - modiResult.finalCost, language)} دج). هذا المكسب يُبرر استخدام MODI بشكل منتظم قبل أي قرار توزيع.`
      ),
    }] : improvement > 0 ? [{
      icon: "✅",
      color: "bg-green-50",
      borderColor: "border-l-green-600",
      title: t("Optimisation confirmée", "التحسين مؤكّد"),
      desc: t(
        `MODI a amélioré la solution de ${improvement.toFixed(1)}%, confirmant que la méthode ${METHOD_META[bestMethod].shortFr} seule ne donnait pas l'optimum global.`,
        `حسّن MODI الحل بنسبة ${improvement.toFixed(1)}%، مما يؤكد أن طريقة ${METHOD_META[bestMethod].shortFr} وحدها لا تعطي الحل الأمثل العام.`
      ),
    }] : [{
      icon: "🏆",
      color: "bg-green-50",
      borderColor: "border-l-green-600",
      title: t("Solution initiale déjà optimale", "الحل الأولي مثالي بالفعل"),
      desc: t(
        `La méthode ${METHOD_META[bestMethod].shortFr} a directement produit la solution optimale. MODI n'a nécessité aucune itération d'amélioration.`,
        `طريقة ${METHOD_META[bestMethod].shortFr} أنتجت الحل الأمثل مباشرة. لم يحتج MODI إلى أي تكرار تحسين.`
      ),
    }]),
    ...(modiResult.hasAlternativeOptima ? [{
      icon: "🔀",
      color: "bg-blue-50",
      borderColor: "border-l-blue-500",
      title: t("Explorer les solutions alternatives disponibles", "استكشاف الحلول البديلة المتاحة"),
      desc: t(
        "Des plans de distribution alternatifs au même coût optimal existent. Ils peuvent être préférables pour des raisons opérationnelles : répartition de la charge, contraintes de délai ou diversification des risques logistiques.",
        "يوجد خطط توزيع بديلة بنفس التكلفة المثلى. قد تكون مفضلة لأسباب تشغيلية: توزيع الحمل، قيود المهل الزمنية، أو تنويع المخاطر اللوجستية."
      ),
    }] : []),
    {
      icon: "📋",
      color: "bg-amber-50",
      borderColor: "border-l-amber-500",
      title: t("Réévaluer si les paramètres changent", "إعادة التقييم عند تغيير المعاملات"),
      desc: t(
        "Si les coûts unitaires, les capacités d'offre ou les demandes évoluent, relancez le solveur. L'analyse de sensibilité indique les plages de stabilité de la solution actuelle pour chaque route active.",
        "إذا تغيرت التكاليف الوحدوية أو طاقات العرض أو الطلبات، أعد تشغيل المحلّل. يُشير تحليل الحساسية إلى نطاقات استقرار الحل الحالي لكل مسار نشط."
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Situational analysis ───────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-primary" />
          {t("Analyse Situationnelle", "التحليل الموقفي")}
        </h2>
        <div className="space-y-2">
          {analysisLines.map((line, i) => (
            <div key={i} className={cn("flex items-start gap-3 rounded-lg border px-4 py-3 text-sm", line.color)}>
              <span className="text-base leading-snug shrink-0">{line.icon}</span>
              <span className="leading-relaxed">{line.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recommendations ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-primary" />
          {t("Recommandations Managériales", "التوصيات الإدارية")}
        </h2>
        <div className="space-y-3">
          {suggestions.map((s, i) => (
            <div key={i} className={cn("flex items-start gap-3 rounded-lg border-l-4 px-4 py-3", s.color, s.borderColor)}>
              <span className="text-lg shrink-0 mt-0.5">{s.icon}</span>
              <div className="space-y-1">
                <p className="font-semibold text-sm">{s.title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Managerial report card ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          {t("Rapport Managérial", "التقرير الإداري")}
        </h2>
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-lg font-bold">{problem.name}</CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {isMax ? t("Maximisation du profit — Transport", "تعظيم الربح — النقل") : t("Minimisation du coût — Transport", "تقليل التكلفة — النقل")}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge className="bg-primary/10 text-primary border-primary/30">
                  {fmt(modiResult.finalCost, language)} DZD
                </Badge>
                <Badge variant="outline">
                  {activeRoutes.length} {t("routes actives", "مسارات نشطة")}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* KPI grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: t("Coût optimal", "التكلفة المثلى"),          value: `${fmt(modiResult.finalCost, language)} DZD`, bg: "bg-green-50 border-green-200" },
                { label: t("Coût initial", "التكلفة الابتدائية"),       value: `${fmt(initialCost, language)} DZD`,          bg: "bg-muted/40 border-border" },
                { label: t("Amélioration", "التحسين"),                  value: `${improvement.toFixed(1)}%`,                 bg: "bg-muted/40 border-border" },
                { label: t("Itérations MODI", "تكرارات MODI"),          value: String(totalIters),                           bg: "bg-muted/40 border-border" },
              ].map((k) => (
                <div key={k.label} className={cn("rounded-lg border p-3", k.bg)}>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-base font-bold mt-0.5">{k.value}</p>
                </div>
              ))}
            </div>

            {/* Optimal distribution plan */}
            <div className="rounded-lg overflow-hidden border border-border">
              <div className="bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                {t("Plan de Distribution Optimal", "خطة التوزيع المثلى")}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="px-3 py-2 text-left text-muted-foreground font-semibold">{t("Source", "المصدر")}</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-semibold">{t("Destination", "الوجهة")}</th>
                      <th className="px-3 py-2 text-center text-muted-foreground font-semibold">{t("Quantité", "الكمية")}</th>
                      <th className="px-3 py-2 text-center text-muted-foreground font-semibold">{t("Coût unit.", "تكلفة الوحدة")}</th>
                      <th className="px-3 py-2 text-right text-muted-foreground font-semibold">{t("Contribution", "المساهمة")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRoutes.map((r, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                        <td className="px-3 py-1.5 font-medium border-b border-border">{r.sourceName}</td>
                        <td className="px-3 py-1.5 border-b border-border">{r.destName}</td>
                        <td className="px-3 py-1.5 text-center border-b border-border font-bold text-primary">{fmt(r.allocation, language)}</td>
                        <td className="px-3 py-1.5 text-center border-b border-border">{fmt(r.unitCost, language)}</td>
                        <td className="px-3 py-1.5 text-right border-b border-border font-semibold text-secondary">
                          {fmt(r.allocation * r.unitCost, language)} DZD
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-green-50 font-bold">
                      <td colSpan={4} className="px-3 py-2 text-green-800 border-t-2 border-green-300">
                        {t("TOTAL OPTIMAL", "المجموع الأمثل")}
                      </td>
                      <td className="px-3 py-2 text-right text-green-700 text-sm border-t-2 border-green-300">
                        {fmt(modiResult.finalCost, language)} DZD
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sensitivity analysis */}
            <div className="rounded-lg overflow-hidden border border-border">
              <div className="bg-secondary/80 text-white px-4 py-2 text-sm font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4" />
                {t("Analyse de Sensibilité — Routes actives", "تحليل الحساسية — المسارات النشطة")}
              </div>
              <p className="text-xs text-muted-foreground px-4 py-2 bg-muted/20">
                {t(
                  "Plage de variation du coût unitaire pour laquelle la solution optimale actuelle reste valide.",
                  "نطاق تغيير التكلفة الوحدوية الذي يبقى فيه الحل الأمثل الحالي صالحاً."
                )}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/40">
                      <th className="px-3 py-2 text-left text-muted-foreground font-semibold">{t("Route", "المسار")}</th>
                      <th className="px-3 py-2 text-center text-muted-foreground font-semibold">{t("Alloc.", "التخصيص")}</th>
                      <th className="px-3 py-2 text-center text-muted-foreground font-semibold">{t("Coût actuel", "التكلفة الحالية")}</th>
                      <th className="px-3 py-2 text-center text-muted-foreground font-semibold">{t("Plage [min, max]", "النطاق [أدنى، أقصى]")}</th>
                      <th className="px-3 py-2 text-center text-muted-foreground font-semibold">{t("Marge ↓", "هامش ↓")}</th>
                      <th className="px-3 py-2 text-center text-muted-foreground font-semibold">{t("Marge ↑", "هامش ↑")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modiResult.sensitivityRanges.filter(r => !epsilonSet.has(`${r.i},${r.j}`)).map((r, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                        <td className="px-3 py-1.5 border-b border-border">
                          <span className="font-medium">{r.sourceName}</span>
                          <span className="text-muted-foreground mx-1">→</span>
                          <span>{r.destName}</span>
                        </td>
                        <td className="px-3 py-1.5 text-center border-b border-border font-bold text-primary">{fmt(r.allocation, language)}</td>
                        <td className="px-3 py-1.5 text-center border-b border-border font-semibold">{fmt(r.unitCost, language)}</td>
                        <td className="px-3 py-1.5 text-center border-b border-border text-[11px]">
                          [{fmt(r.lowerBound, language, 1)}, {r.upperBound === Infinity ? "∞" : fmt(r.upperBound, language, 1)}]
                        </td>
                        <td className="px-3 py-1.5 text-center border-b border-border text-orange-600">
                          {r.allowedDecrease === Infinity ? "∞" : fmt(r.allowedDecrease, language, 1)}
                        </td>
                        <td className="px-3 py-1.5 text-center border-b border-border text-green-600">
                          {r.allowedIncrease === Infinity ? "∞" : fmt(r.allowedIncrease, language, 1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <Button onClick={onSave} disabled={isSaved} variant={isSaved ? "outline" : "default"} className="flex-1 gap-2">
                {isSaved ? <><Check className="w-4 h-4" />{t("Enregistré ✓", "تم الحفظ ✓")}</> : <><BookmarkPlus className="w-4 h-4" />{t("Enregistrer dans l'historique", "حفظ في السجل")}</>}
              </Button>
              <Button onClick={onPDF} disabled={isExporting} variant="outline" className="flex-1 gap-2">
                {isExporting ? <span className="animate-spin text-base">⏳</span> : <Download className="w-4 h-4" />}
                {t("Exporter PDF", "تصدير PDF")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Main Transport Component ───────────────────────────────────────────────────

export default function Transport() {
  const { t, language } = useLanguage();
  const isAr = language === "ar";
  const { addProblem } = useTransportHistory();

  // ── Phase ────────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("input");

  // ── Sector / form state ───────────────────────────────────────────────────────
  const [sector,        setSector]        = useState<SectorKey>("custom");
  const [sectorChosen,  setSectorChosen]  = useState(false);
  const [name,          setName]          = useState("");
  const [objectiveType, setObjectiveType] = useState<"minimize" | "maximize">("minimize");
  const [sources,       setSources]       = useState<Source[]>(blankSources);
  const [destinations,  setDestinations]  = useState<Destination[]>(blankDests);
  const [costs,         setCosts]         = useState<number[][]>(() => blankCosts(2, 2));
  const [errors,        setErrors]        = useState<Record<string, string>>({});

  // ── Results state ─────────────────────────────────────────────────────────────
  const [solvedProblem,   setSolvedProblem]   = useState<Problem | null>(null);
  const [initMethodView,  setInitMethodView]  = useState<InitMethodView>("compare");
  const [initStep,        setInitStep]        = useState(-1);
  const [initPlaying,     setInitPlaying]     = useState(false);
  const [modiViewMode,    setModiViewMode]    = useState<ViewMode>("modi");
  const [modiIter,        setModiIter]        = useState(0);
  const [isSaved,         setIsSaved]         = useState(false);
  const [isExporting,     setIsExporting]     = useState(false);
  const [exportMsg,       setExportMsg]       = useState<string | null>(null);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load template ─────────────────────────────────────────────────────────────
  function loadTemplate(key: SectorKey, lang: "fr" | "ar") {
    const tpl = TEMPLATES[key];
    if (!tpl) {
      setSources(blankSources());
      setDestinations(blankDests());
      setCosts(blankCosts(2, 2));
      setName("");
      setObjectiveType("minimize");
    } else {
      const state = tplToState(tpl, lang);
      setSources(state.sources);
      setDestinations(state.destinations);
      setCosts(state.costs);
      setName(lang === "ar" ? tpl.nameAr : tpl.nameFr);
      setObjectiveType(tpl.objectiveType);
    }
    setErrors({});
  }

  const handleSectorSelect = (key: SectorKey) => {
    setSector(key);
    loadTemplate(key, language);
    setSectorChosen(true);
  };

  // ── Matrix CRUD ───────────────────────────────────────────────────────────────
  const addSource      = () => { setSources(p => [...p, { name: "", supply: 0 }]); setCosts(p => [...p, Array(destinations.length).fill(0)]); };
  const removeSource   = (i: number) => { if (sources.length <= 1) return; setSources(p => p.filter((_, x) => x !== i)); setCosts(p => p.filter((_, x) => x !== i)); };
  const updateSource   = (i: number, f: keyof Source, v: string | number) => setSources(p => p.map((s, x) => x === i ? { ...s, [f]: v } : s));
  const addDest        = () => { setDestinations(p => [...p, { name: "", demand: 0 }]); setCosts(p => p.map(r => [...r, 0])); };
  const removeDest     = (j: number) => { if (destinations.length <= 1) return; setDestinations(p => p.filter((_, x) => x !== j)); setCosts(p => p.map(r => r.filter((_, x) => x !== j))); };
  const updateDest     = (j: number, f: keyof Destination, v: string | number) => setDestinations(p => p.map((d, x) => x === j ? { ...d, [f]: v } : d));
  const updateCost     = (i: number, j: number, v: number) => setCosts(p => p.map((row, ri) => ri === i ? row.map((c, ci) => ci === j ? v : c) : row));

  // ── Balance ───────────────────────────────────────────────────────────────────
  const totalSupply = useMemo(() => sources.reduce((s, x) => s + (x.supply || 0), 0), [sources]);
  const totalDemand = useMemo(() => destinations.reduce((s, x) => s + (x.demand || 0), 0), [destinations]);
  const balanceDiff = totalSupply - totalDemand;
  const isBalanced  = balanceDiff === 0;

  // ── Validation ────────────────────────────────────────────────────────────────
  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    sources.forEach((s, i) => {
      if (!s.name.trim()) errs[`src_name_${i}`] = t("Nom requis", "الاسم مطلوب");
      if (s.supply < 0)   errs[`src_supply_${i}`] = t("Valeur négative non autorisée", "قيمة سالبة غير مسموح بها");
    });
    destinations.forEach((d, j) => {
      if (!d.name.trim()) errs[`dst_name_${j}`] = t("Nom requis", "الاسم مطلوب");
      if (d.demand < 0)   errs[`dst_demand_${j}`] = t("Valeur négative non autorisée", "قيمة سالبة غير مسموح بها");
    });
    costs.forEach((row, i) => row.forEach((c, j) => { if (c < 0) errs[`cost_${i}_${j}`] = t("Coût négatif non autorisé", "تكلفة سالبة غير مسموح بها"); }));
    if (totalSupply <= 0) errs["total_supply"] = t("L'offre totale doit être > 0", "يجب أن يكون إجمالي العرض > 0");
    if (totalDemand <= 0) errs["total_demand"] = t("La demande totale doit être > 0", "يجب أن يكون إجمالي الطلب > 0");
    return errs;
  }

  // ── Solve ─────────────────────────────────────────────────────────────────────
  function handleSolve() {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    const prob: Problem = {
      name: name || t("Problème de transport", "مسألة نقل"),
      sector,
      objectiveType,
      sources: sources.map(s => ({ ...s })),
      destinations: destinations.map(d => ({ ...d })),
      costs: costs.map(r => [...r]),
    };
    setSolvedProblem(prob);
    setInitMethodView("compare");
    setInitStep(-1);
    setInitPlaying(false);
    setModiIter(0);
    setIsSaved(false);
    setPhase("results");
  }

  // ── Algorithm results ─────────────────────────────────────────────────────────
  const { results, bestMethod, modiResult, initialCostForBest } = useMemo(() => {
    if (!solvedProblem) return { results: null, bestMethod: "vam" as MethodKey, modiResult: null, initialCostForBest: 0 };
    const input = { sources: solvedProblem.sources, destinations: solvedProblem.destinations, costs: solvedProblem.costs, objective: solvedProblem.objectiveType };
    const results = { nwc: solveNWC(input), lcm: solveLCM(input), vam: solveVAM(input) };
    const isMin = solvedProblem.objectiveType === "minimize";
    const bestMethod = (["nwc", "lcm", "vam"] as MethodKey[]).reduce((prev, cur) =>
      isMin ? results[cur].totalCost < results[prev].totalCost ? cur : prev
            : results[cur].totalCost > results[prev].totalCost ? cur : prev
    );
    const modiResult = runMODI({
      balanced: results[bestMethod].balanced,
      allocation: results[bestMethod].allocation,
      objective: solvedProblem.objectiveType,
      initialMethod: bestMethod.toUpperCase(),
    });
    return { results, bestMethod, modiResult, initialCostForBest: results[bestMethod].totalCost };
  }, [solvedProblem]);

  // ── Init method view ──────────────────────────────────────────────────────────
  const activeInitMethod: MethodKey = (initMethodView === "compare" ? bestMethod : initMethodView) as MethodKey;
  const activeResult = results?.[activeInitMethod];
  const totalInitSteps = activeResult?.steps.length ?? 0;

  useEffect(() => {
    if (initPlaying && activeResult) {
      playRef.current = setInterval(() => {
        setInitStep(prev => {
          if (prev >= activeResult.steps.length - 1) { setInitPlaying(false); return prev; }
          return prev + 1;
        });
      }, 1200);
    }
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [initPlaying, activeResult]);

  const handleInitMethodSwitch = (mk: MethodKey) => { setInitPlaying(false); setInitStep(-1); setInitMethodView(mk); };
  const handleInitStepChange   = (n: number)   => { setInitPlaying(false); setInitStep(Math.max(-1, Math.min(n, totalInitSteps - 1))); };
  const handleInitTogglePlay   = ()            => { if (initStep >= totalInitSteps - 1) setInitStep(-1); setInitPlaying(p => !p); };

  // ── MODI ──────────────────────────────────────────────────────────────────────
  const iters    = modiResult?.iterations ?? [];
  const iter     = iters[Math.min(modiIter, iters.length - 1)];
  const isModiLast = modiIter >= iters.length - 1;

  // ── Save & PDF ────────────────────────────────────────────────────────────────
  function handleSave() {
    if (isSaved || !modiResult || !solvedProblem || !results) return;
    addProblem(solvedProblem, modiResult, initialCostForBest, (solvedProblem.sector || "custom") as TransportSectorKey, language);
    setIsSaved(true);
  }

  async function handlePDF() {
    if (!modiResult || !solvedProblem || isExporting) return;
    setIsExporting(true);
    setExportMsg(t("Génération du PDF…", "جارٍ إنشاء PDF…"));
    try {
      await generateTransportPDF({
        problem: solvedProblem,
        modiResult,
        initialCost: initialCostForBest,
        managerName: "",
        institutionName: "",
        language,
        onProgress: (step) => setExportMsg(step),
      });
    } catch {
      setExportMsg(t("Erreur lors de l'export.", "حدث خطأ أثناء التصدير."));
    } finally {
      setIsExporting(false);
      setTimeout(() => setExportMsg(null), 3000);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-muted/20" dir={isAr ? "rtl" : "ltr"}>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="bg-primary text-primary-foreground shadow-sm">
        <div className="container mx-auto px-4 py-8 max-w-6xl flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="bg-primary-foreground/15 p-3 rounded-xl shrink-0">
              <Truck className="w-7 h-7" />
            </div>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 bg-primary-foreground/15 rounded-full px-3 py-1 text-xs font-medium mb-1">
                {t("Module Transport", "وحدة النقل")}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold leading-tight">
                {t("Problème de Transport", "مسألة النقل")}
              </h1>
              <p className="text-primary-foreground/75 text-sm mt-1 hidden md:block">
                {t(
                  "NWC · LCM · VAM · Optimisation MODI — analyse complète",
                  "ز.ش.غ · أ.ت · ف.أ.م · تحسين MODI — تحليل شامل"
                )}
              </p>
            </div>
          </div>
          {phase === "results" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setPhase("input"); setSectorChosen(false); }}
              className="shrink-0 gap-2"
            >
              <RotateCw className="w-4 h-4" />
              {t("Nouveau problème", "مسألة جديدة")}
            </Button>
          )}
        </div>
      </section>

      <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">

        {/* ════════════════════ PHASE: INPUT ════════════════════ */}
        {phase === "input" && (
          <>
            {/* ── Sector selector ─────────────────────────────────── */}
            {!sectorChosen ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">{t("Choisissez votre secteur", "اختر قطاعك")}</h2>
                  <p className="text-muted-foreground mt-1">
                    {t(
                      "Sélectionnez un modèle pré-rempli avec des données algériennes réalistes, ou commencez de zéro.",
                      "اختر نموذجاً مُعبَّأً مسبقاً ببيانات جزائرية واقعية، أو ابدأ من الصفر."
                    )}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {SECTOR_CARDS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => handleSectorSelect(s.key)}
                      className={cn(
                        "group relative flex flex-col gap-4 rounded-xl border-2 bg-card p-6 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        isAr ? "text-right" : "text-left",
                        s.color
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className={cn("rounded-xl p-3 shrink-0", s.iconBg)}>{s.icon}</div>
                        <ChevronRight className={cn("w-5 h-5 text-muted-foreground mt-1 shrink-0 transition-transform group-hover:translate-x-1", isAr && "rotate-180")} />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-xl font-bold text-foreground">{isAr ? s.nameAr : s.nameFr}</span>
                          <span className="text-sm text-muted-foreground">{isAr ? s.nameFr : s.nameAr}</span>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{isAr ? s.descAr : s.descFr}</p>
                      </div>
                      <div className="border-t pt-3 mt-1">
                        <span className="text-xs text-muted-foreground">{isAr ? s.routeAr : s.routeFr}</span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="border-t pt-4">
                  <button
                    type="button"
                    onClick={() => handleSectorSelect("custom")}
                    className={cn(
                      "group w-full flex items-center gap-4 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-5 transition-all hover:border-muted-foreground/60 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      isAr ? "flex-row-reverse text-right" : "text-left"
                    )}
                  >
                    <div className="rounded-xl bg-muted p-3 text-muted-foreground shrink-0"><PenLine className="w-6 h-6" /></div>
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">{t("Commencer de zéro", "ابدأ من الصفر")}</p>
                      <p className="text-sm text-muted-foreground">{t("Définissez vos propres sources, destinations et coûts.", "حدد مصادرك ووجهاتك وتكاليفك بنفسك.")}</p>
                    </div>
                    <ArrowRight className={cn("w-5 h-5 text-muted-foreground shrink-0", isAr && "rotate-180")} />
                  </button>
                </div>
              </div>
            ) : (
              /* ── Problem form ─────────────────────────────────── */
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSectorChosen(false)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronLeft className={cn("w-5 h-5", isAr && "rotate-180")} />
                  </button>
                  <div>
                    <h2 className="text-2xl font-bold text-foreground">{t("Définir le problème", "تحديد المسألة")}</h2>
                    <p className="text-muted-foreground text-sm">
                      {sector === "custom"
                        ? t("Entrez vos propres paramètres.", "أدخل معاملاتك الخاصة.")
                        : t("Modèle pré-rempli — vous pouvez modifier les valeurs.", "نموذج مُعبَّأ مسبقاً — يمكنك تعديل القيم.")}
                    </p>
                  </div>
                  <div className="ms-auto flex gap-2">
                    {sector !== "custom" && (
                      <Button type="button" variant="outline" size="sm" onClick={() => loadTemplate(sector, language)}>
                        <RotateCcw className="w-4 h-4 me-1.5" />{t("Réinitialiser", "إعادة التعيين")}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Validation error */}
                {Object.keys(errors).length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertTitle>{t("Erreurs de saisie", "أخطاء في الإدخال")}</AlertTitle>
                    <AlertDescription>
                      {t(
                        `${Object.keys(errors).length} champ(s) nécessitent votre attention.`,
                        `${Object.keys(errors).length} حقل (حقول) تحتاج إلى انتباهك.`
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {/* General info */}
                <Card>
                  <CardHeader><CardTitle>{t("Informations Générales", "معلومات عامة")}</CardTitle></CardHeader>
                  <CardContent className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="prob-name">{t("Nom du problème", "اسم المسألة")}</Label>
                      <Input
                        id="prob-name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder={t("Ex: Distribution Cevital Q1 2026", "مثال: توزيع سيفيتال الربع الأول 2026")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("Objectif", "الهدف")}</Label>
                      <RadioGroup
                        value={objectiveType}
                        onValueChange={(v: "minimize" | "maximize") => setObjectiveType(v)}
                        className="flex gap-6 pt-2"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="minimize" id="obj-min" />
                          <Label htmlFor="obj-min" className="cursor-pointer font-normal">{t("Minimiser le coût", "تقليل التكلفة")}</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="maximize" id="obj-max" />
                          <Label htmlFor="obj-max" className="cursor-pointer font-normal">{t("Maximiser le profit", "تعظيم الربح")}</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </CardContent>
                </Card>

                {/* Matrix */}
                <Card className="overflow-hidden">
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Truck className="w-5 h-5 text-primary" />
                        {t("Matrice des Coûts de Transport", "مصفوفة تكاليف النقل")}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {t(
                          "Coût unitaire de chaque source vers chaque destination, avec offre et demande.",
                          "التكلفة الوحدوية من كل مصدر إلى كل وجهة، مع العرض والطلب."
                        )}
                      </CardDescription>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addDest} className="shrink-0">
                      <Plus className="w-4 h-4 me-1.5" />{t("Ajouter destination", "إضافة وجهة")}
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-sm" style={{ minWidth: `${Math.max(640, 220 + destinations.length * 144 + 120)}px` }}>
                        <thead>
                          <tr>
                            <th className="sticky start-0 z-20 bg-muted px-4 py-3 border-b border-e border-border text-start">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                                <Truck className="w-3.5 h-3.5" />
                                {t("Source \\ Destination", "المصدر \\ الوجهة")}
                              </div>
                            </th>
                            {destinations.map((dest, j) => (
                              <th key={j} className="bg-muted px-3 py-2 border-b border-e border-border min-w-[140px]">
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex items-center justify-end">
                                    <button type="button" onClick={() => removeDest(j)} disabled={destinations.length <= 1} className="text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <Input
                                    value={dest.name}
                                    onChange={e => updateDest(j, "name", e.target.value)}
                                    placeholder={t(`Destination ${j + 1}`, `وجهة ${j + 1}`)}
                                    className={cn("h-7 text-xs font-medium text-center", errors[`dst_name_${j}`] && "border-destructive")}
                                  />
                                  {errors[`dst_name_${j}`] && <p className="text-[10px] text-destructive text-center">{errors[`dst_name_${j}`]}</p>}
                                </div>
                              </th>
                            ))}
                            <th className="bg-primary/8 px-4 py-3 border-b border-s border-border min-w-[110px] text-center">
                              <span className="text-xs font-bold text-primary uppercase tracking-wide">{t("Offre", "العرض")}</span>
                              {errors["total_supply"] && <p className="text-[10px] text-destructive mt-0.5">{errors["total_supply"]}</p>}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sources.map((src, i) => (
                            <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                              <td className="sticky start-0 z-10 px-2 py-2 border-b border-e border-border bg-inherit">
                                <div className="flex items-center gap-1.5 min-w-[190px]">
                                  <div className="flex-1 space-y-0.5">
                                    <Input
                                      value={src.name}
                                      onChange={e => updateSource(i, "name", e.target.value)}
                                      placeholder={t(`Source ${i + 1}`, `مصدر ${i + 1}`)}
                                      className={cn("h-7 text-xs font-medium", errors[`src_name_${i}`] && "border-destructive")}
                                    />
                                    {errors[`src_name_${i}`] && <p className="text-[10px] text-destructive">{errors[`src_name_${i}`]}</p>}
                                  </div>
                                  <button type="button" onClick={() => removeSource(i)} disabled={sources.length <= 1} className="text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors shrink-0">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                              {destinations.map((_, j) => (
                                <td key={j} className="px-2 py-2 border-b border-e border-border">
                                  <div className="space-y-0.5">
                                    <Input
                                      type="number" min="0" step="any"
                                      value={costs[i]?.[j] ?? 0}
                                      onChange={e => { const v = parseFloat(e.target.value); updateCost(i, j, isNaN(v) ? 0 : v); }}
                                      className={cn("h-7 text-center text-sm tabular-nums", errors[`cost_${i}_${j}`] && "border-destructive")}
                                    />
                                    {errors[`cost_${i}_${j}`] && <p className="text-[10px] text-destructive text-center">{errors[`cost_${i}_${j}`]}</p>}
                                  </div>
                                </td>
                              ))}
                              <td className="px-2 py-2 border-b border-s border-border bg-primary/5">
                                <div className="space-y-0.5">
                                  <Input
                                    type="number" min="0" step="any"
                                    value={src.supply}
                                    onChange={e => { const v = parseFloat(e.target.value); updateSource(i, "supply", isNaN(v) ? 0 : v); }}
                                    className={cn("h-7 text-center text-sm font-semibold tabular-nums", errors[`src_supply_${i}`] && "border-destructive")}
                                  />
                                  {errors[`src_supply_${i}`] && <p className="text-[10px] text-destructive text-center">{errors[`src_supply_${i}`]}</p>}
                                </div>
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-background">
                            <td colSpan={destinations.length + 2} className="px-4 py-2 border-b border-border">
                              <Button type="button" variant="ghost" size="sm" onClick={addSource} className="text-xs text-muted-foreground hover:text-foreground gap-1.5">
                                <Plus className="w-3.5 h-3.5" />{t("Ajouter une source", "إضافة مصدر")}
                              </Button>
                            </td>
                          </tr>
                        </tbody>
                        <tfoot>
                          <tr className="bg-primary/5">
                            <td className="sticky start-0 z-10 bg-primary/5 px-4 py-3 border-t border-e border-border">
                              <div className="space-y-0.5">
                                <span className="text-xs font-bold text-primary uppercase tracking-wide">{t("Demande", "الطلب")}</span>
                                {errors["total_demand"] && <p className="text-[10px] text-destructive">{errors["total_demand"]}</p>}
                              </div>
                            </td>
                            {destinations.map((dest, j) => (
                              <td key={j} className="px-2 py-2 border-t border-e border-border">
                                <Input
                                  type="number" min="0" step="any"
                                  value={dest.demand}
                                  onChange={e => { const v = parseFloat(e.target.value); updateDest(j, "demand", isNaN(v) ? 0 : v); }}
                                  className={cn("h-7 text-center text-sm font-semibold tabular-nums", errors[`dst_demand_${j}`] && "border-destructive")}
                                />
                                {errors[`dst_demand_${j}`] && <p className="text-[10px] text-destructive text-center mt-0.5">{errors[`dst_demand_${j}`]}</p>}
                              </td>
                            ))}
                            <td className="px-4 py-3 border-t border-s border-border text-center">
                              <span className="text-xs text-muted-foreground">{t("Total offre", "إجمالي العرض")}</span>
                              <div className="text-sm font-bold text-primary tabular-nums">{totalSupply.toLocaleString()}</div>
                            </td>
                          </tr>
                          <tr className="bg-muted/30">
                            <td className="sticky start-0 z-10 bg-muted/30 px-4 py-2 border-e border-border text-xs text-muted-foreground font-medium">{t("Total demande", "إجمالي الطلب")}</td>
                            {destinations.map((dest, j) => (
                              <td key={j} className="px-2 py-2 border-e border-border text-center">
                                <span className="text-sm font-bold text-primary tabular-nums">{(dest.demand || 0).toLocaleString()}</span>
                              </td>
                            ))}
                            <td className="px-4 py-2 border-s border-border text-center">
                              <span className="text-xs text-muted-foreground">{t("Total demande", "إجمالي الطلب")}</span>
                              <div className="text-sm font-bold text-primary tabular-nums">{totalDemand.toLocaleString()}</div>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Balance alert */}
                {isBalanced ? (
                  <Alert className="border-green-200 bg-green-50 text-green-900 [&>svg]:text-green-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <AlertTitle className="text-green-900">{t("Problème équilibré ✓", "المسألة متوازنة ✓")}</AlertTitle>
                    <AlertDescription className="text-green-800">
                      {t(`Offre totale = Demande totale = ${totalSupply.toLocaleString()} unités.`, `إجمالي العرض = إجمالي الطلب = ${totalSupply.toLocaleString()} وحدة.`)}
                    </AlertDescription>
                  </Alert>
                ) : (totalSupply > 0 || totalDemand > 0) ? (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-900 [&>svg]:text-amber-600">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertTitle className="text-amber-900">{t("Problème déséquilibré — ajustement automatique", "مسألة غير متوازنة — تعديل تلقائي")}</AlertTitle>
                    <AlertDescription className="text-amber-800 space-y-1">
                      <p>{t(`Offre : ${totalSupply.toLocaleString()} · Demande : ${totalDemand.toLocaleString()} · Écart : ${Math.abs(balanceDiff).toLocaleString()} unités`, `العرض: ${totalSupply.toLocaleString()} · الطلب: ${totalDemand.toLocaleString()} · الفرق: ${Math.abs(balanceDiff).toLocaleString()} وحدة`)}</p>
                      <p className="font-medium">
                        {balanceDiff > 0
                          ? t(`→ Une destination fictive sera ajoutée (demande = ${balanceDiff.toLocaleString()}, coûts = 0).`, `← ستُضاف وجهة وهمية (طلب = ${balanceDiff.toLocaleString()}، التكاليف = 0).`)
                          : t(`→ Une source fictive sera ajoutée (offre = ${Math.abs(balanceDiff).toLocaleString()}, coûts = 0).`, `← سيُضاف مصدر وهمي (عرض = ${Math.abs(balanceDiff).toLocaleString()}، التكاليف = 0).`)}
                      </p>
                    </AlertDescription>
                  </Alert>
                ) : null}

                {/* Solve button */}
                <div className="flex items-center justify-end pt-2 border-t">
                  <Button size="lg" className="px-10 gap-2" onClick={handleSolve}>
                    <Zap className="w-5 h-5" />
                    {t("Résoudre & Optimiser", "حل وتحسين")}
                    <ArrowRight className={cn("w-4 h-4", isAr && "rotate-180")} />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════════════════ PHASE: RESULTS ════════════════════ */}
        {phase === "results" && solvedProblem && results && modiResult && (
          <>
            {/* Problem summary strip */}
            <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-primary" />
                <span className="font-semibold text-foreground">{solvedProblem.name}</span>
              </div>
              <Badge variant="secondary" className="text-xs">
                {solvedProblem.sources.length} {t("sources", "مصادر")} × {solvedProblem.destinations.length} {t("destinations", "وجهات")}
              </Badge>
              <Badge className={cn("text-xs", solvedProblem.objectiveType === "maximize" ? "bg-purple-600" : "bg-primary")}>
                {solvedProblem.objectiveType === "maximize"
                  ? <><TrendingUp className="w-3 h-3 me-1" />{t("Maximisation", "تعظيم")}</>
                  : <><TrendingDown className="w-3 h-3 me-1" />{t("Minimisation", "تقليل")}</>}
              </Badge>
              <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">
                <CheckCircle2 className="w-3 h-3 me-1" />
                {t("Optimal : ", "الأمثل: ")}{fmt(modiResult.finalCost, language)} DZD
              </Badge>
            </div>

            {/* ── Section 1: Méthode initiale ──────────────────────── */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <GitCompare className="w-5 h-5 text-primary" />
                {t("Solution Initiale — Comparaison des méthodes", "الحل الأولي — مقارنة الطرق")}
              </h2>

              {/* Method comparison cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(["nwc", "lcm", "vam"] as MethodKey[]).map(mk => {
                  const meta   = METHOD_META[mk];
                  const isBest = mk === bestMethod;
                  const isSel  = initMethodView === mk;
                  const isMin  = solvedProblem.objectiveType === "minimize";
                  return (
                    <button
                      key={mk}
                      type="button"
                      onClick={() => handleInitMethodSwitch(mk)}
                      className={cn(
                        "group relative flex flex-col gap-3 rounded-xl border-2 bg-card p-5 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary text-start",
                        isSel ? "border-primary ring-2 ring-primary/20 bg-primary/5" : meta.color
                      )}
                    >
                      {isBest && (
                        <div className="absolute -top-2.5 end-4">
                          <Badge className="bg-green-600 text-white text-xs shadow">{t("Meilleur ✓", "الأفضل ✓")}</Badge>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <div className={cn("rounded-lg px-2.5 py-1 text-xs font-bold", meta.iconBg)}>{meta.shortFr}</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-foreground truncate">{t(meta.labelFr, meta.labelAr)}</div>
                        </div>
                        <ChevronRight className={cn("w-4 h-4 text-muted-foreground shrink-0", isSel && "text-primary", isAr && "rotate-180")} />
                      </div>
                      <div className="bg-muted/60 rounded-lg p-3 text-center">
                        <div className="text-xs text-muted-foreground mb-0.5">
                          {isMin ? t("Coût initial", "التكلفة الأولية") : t("Profit initial", "الربح الأولي")}
                        </div>
                        <div className={cn("text-xl font-bold tabular-nums", isBest ? "text-green-600" : "text-foreground")}>
                          {results[mk].totalCost.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {results[mk].steps.length} {t("allocations", "تخصيصات")}
                          {results[mk].isDegenerate && <span className="ms-1 text-amber-600">⚠ {t("dégénéré", "متدهور")}</span>}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {t(meta.descFr, meta.descAr)}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Best method alert */}
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <AlertTitle className="text-green-800 text-sm">
                  {t(`Meilleure méthode initiale : ${METHOD_META[bestMethod].shortFr}`, `أفضل طريقة أولية: ${METHOD_META[bestMethod].shortFr}`)}
                </AlertTitle>
                <AlertDescription className="text-green-700 text-xs">
                  {t(
                    `${METHOD_META[bestMethod].shortFr} donne le coût initial le plus bas : ${results[bestMethod].totalCost.toLocaleString()} DZD. C'est la base utilisée pour l'optimisation MODI.`,
                    `${METHOD_META[bestMethod].shortFr} يعطي أدنى تكلفة أولية: ${results[bestMethod].totalCost.toLocaleString()} دج. هذا هو الأساس المستخدم لتحسين MODI.`
                  )}
                </AlertDescription>
              </Alert>

              {/* Step-by-step for selected method */}
              {initMethodView !== "compare" && activeResult && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <CardTitle className="text-sm">
                        {t(`Détail pas-à-pas — ${t(METHOD_META[activeInitMethod].labelFr, METHOD_META[activeInitMethod].labelAr)}`,
                           `التفاصيل خطوة بخطوة — ${t(METHOD_META[activeInitMethod].labelFr, METHOD_META[activeInitMethod].labelAr)}`)}
                      </CardTitle>
                      <div className="flex gap-1.5">
                        {(["nwc", "lcm", "vam"] as MethodKey[]).map(mk => (
                          <Button key={mk} variant={mk === activeInitMethod ? "default" : "outline"} size="sm" onClick={() => handleInitMethodSwitch(mk)} className="text-xs">
                            {METHOD_META[mk].shortFr}{mk === bestMethod && <span className="ms-1 text-green-400">★</span>}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <StepNav totalSteps={totalInitSteps} currentStep={initStep} isPlaying={initPlaying} onChange={handleInitStepChange} onTogglePlay={handleInitTogglePlay} />
                    <TableauGrid result={activeResult} currentStep={initStep} objective={solvedProblem.objectiveType} />
                    {initStep >= 0 && <InitStepExplanation result={activeResult} stepIndex={initStep} objective={solvedProblem.objectiveType} />}
                    {initStep < 0 && (
                      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground text-center">
                        {t("Appuyez sur « Jouer » ou « Suivant » pour construire la solution étape par étape.", "اضغط على « تشغيل » أو « التالي » لبناء الحل خطوة بخطوة.")}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>{t(METHOD_META[activeInitMethod].complexityFr, METHOD_META[activeInitMethod].complexityAr)}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </section>

            {/* ── Section 2: Optimisation MODI ─────────────────────── */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-primary" />
                {t("Optimisation MODI", "تحسين MODI")}
                {modiResult.isOptimal && (
                  <Badge className="bg-green-600 text-white text-xs ms-2">
                    <Star className="w-3 h-3 me-1" />{t("Optimal", "مثالي")}
                  </Badge>
                )}
              </h2>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 text-sm text-muted-foreground">
                <Info className="w-4 h-4 shrink-0 text-primary" />
                <span>
                  {t(
                    `${iters.length - 1} itération${iters.length > 2 ? "s" : ""} MODI — coût initial : ${fmt(initialCostForBest, language)} DZD → coût optimal : ${fmt(modiResult.finalCost, language)} DZD`,
                    `${iters.length - 1} تكرار MODI — التكلفة الأولية: ${fmt(initialCostForBest, language)} دج → التكلفة المثلى: ${fmt(modiResult.finalCost, language)} دج`
                  )}
                </span>
              </div>

              {/* Alerts */}
              {modiResult.degeneracyHandled && (
                <Alert className="border-amber-200 bg-amber-50">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-800 text-sm">{t("Dégénérescence traitée", "تم معالجة التدهور")}</AlertTitle>
                  <AlertDescription className="text-amber-700 text-xs">
                    {t(
                      "La solution initiale était dégénérée. Une ε-perturbation a été appliquée automatiquement pour assurer la convergence MODI.",
                      "كان الحل الأولي متدهوراً. تم تطبيق اضطراب-ε تلقائياً لضمان تقارب MODI."
                    )}
                  </AlertDescription>
                </Alert>
              )}
              {modiResult.hasAlternativeOptima && (
                <Alert className="border-blue-200 bg-blue-50">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertTitle className="text-blue-800 text-sm">{t("Solutions optimales alternatives détectées", "تم اكتشاف حلول مثلى بديلة")}</AlertTitle>
                  <AlertDescription className="text-blue-700 text-xs">
                    {t(
                      `Les cellules ${modiResult.alternativeOptimaCells.map(c => `(${c.i+1},${c.j+1})`).join(", ")} ont un coût d'opportunité = 0.`,
                      `الخلايا ${modiResult.alternativeOptimaCells.map(c => `(${c.i+1},${c.j+1})`).join(", ")} لها تكلفة فرصة = 0.`
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* MODI tableau */}
              {iter && (
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm">
                          {iter.isOptimal && isModiLast
                            ? t("✓ Solution Optimale", "✓ الحل الأمثل")
                            : t(`Itération ${iter.iterationNumber}`, `التكرار ${iter.iterationNumber}`)}
                        </CardTitle>
                        {iter.isOptimal && (
                          <Badge className="bg-green-600 text-white text-xs">
                            <Star className="w-3 h-3 me-1" />{t("Optimal", "مثالي")}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {/* View mode toggle */}
                        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                          {(["modi", "stepping-stone"] as ViewMode[]).map(v => (
                            <button key={v} onClick={() => setModiViewMode(v)} className={cn(
                              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                              modiViewMode === v ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}>
                              {v === "modi" ? "MODI (u-v)" : t("Boucle", "الحلقة")}
                            </button>
                          ))}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t("Coût", "التكلفة")} : <span className="font-bold text-foreground">{fmt(iter.totalCost, language)} DZD</span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    <MODITableau iteration={iter} balanced={modiResult.balanced} viewMode={modiViewMode} isMax={solvedProblem.objectiveType === "maximize"} />
                    {modiViewMode === "modi" && (
                      <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                        {t(
                          "Cellules de base : allocation. Cellules hors-base : coût d'opportunité Δ = c − u − v.",
                          "الخلايا الأساسية: التخصيص. الخلايا غير الأساسية: تكلفة الفرصة Δ = c − u − v."
                        )}
                      </div>
                    )}
                    <MODIStepExplanation iteration={iter} isMax={solvedProblem.objectiveType === "maximize"} language={language} />
                  </CardContent>
                </Card>
              )}

              {/* MODI navigation */}
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={() => setModiIter(Math.max(0, modiIter - 1))} disabled={modiIter === 0} className="gap-1">
                  <ChevronLeft className={cn("w-4 h-4", isAr && "rotate-180")} />{t("Précédent", "السابق")}
                </Button>
                <div className="flex items-center gap-1">
                  {iters.map((_, idx) => (
                    <button key={idx} onClick={() => setModiIter(idx)} className={cn(
                      "h-2 rounded-full transition-all",
                      idx === modiIter ? "bg-primary w-4" : idx < iters.length - 1 ? "bg-primary/30 w-2" : "bg-green-500 w-2"
                    )} />
                  ))}
                </div>
                {!isModiLast ? (
                  <Button size="sm" onClick={() => setModiIter(Math.min(iters.length - 1, modiIter + 1))} className="gap-1">
                    {t("Suivant", "التالي")}<ChevronRight className={cn("w-4 h-4", isAr && "rotate-180")} />
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" disabled className="gap-1 text-green-700">
                    <CheckCircle2 className="w-4 h-4" />{t("Optimal ✓", "مثالي ✓")}
                  </Button>
                )}
              </div>
              {!isModiLast && (
                <div className="flex justify-center">
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={() => setModiIter(iters.length - 1)}>
                    <CheckCircle2 className="w-3 h-3" />{t("Aller directement à la solution optimale", "الانتقال مباشرة إلى الحل الأمثل")}
                  </Button>
                </div>
              )}
            </section>

            {/* ── Section 3: Analyse & Recommandations ─────────────── */}
            <section>
              <TransportAnalysis
                problem={solvedProblem}
                results={results}
                bestMethod={bestMethod}
                modiResult={modiResult}
                initialCost={initialCostForBest}
                isSaved={isSaved}
                isExporting={isExporting}
                onSave={handleSave}
                onPDF={handlePDF}
              />
            </section>
          </>
        )}
      </div>

      {/* Export toast */}
      {exportMsg && (
        <div className="fixed bottom-4 end-4 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg text-sm z-50 flex items-center gap-2">
          {isExporting && <span className="animate-spin">⏳</span>}
          {exportMsg}
        </div>
      )}
    </div>
  );
}
