import type { SharedHistory } from "@workspace/api-client-react";

export interface ModuleHistorySummary {
  key: string;
  label: string;
  count: number;
  href: string | null;
}

export interface WeeklyHistorySummary {
  key: string;
  labelFr: string;
  labelAr: string;
  count: number;
  start: string;
}

export interface SharedHistoryAnalytics {
  total: number;
  modules: ModuleHistorySummary[];
  mostUsed: ModuleHistorySummary | null;
  weeks: WeeklyHistorySummary[];
}

const MODULE_ROUTES: Array<{ match: string[]; href: string }> = [
  { match: ["simplex", "linear-programming"], href: "/simplex" },
  { match: ["transport", "transportation"], href: "/transport" },
  { match: ["assignment", "hungarian"], href: "/assignment" },
  { match: ["pert", "cpm"], href: "/pert-cpm" },
  { match: ["project-feasibility", "project feasibility", "breakeven", "investment-appraisal"], href: "/project-feasibility" },
  { match: ["kpi", "manual-kpi"], href: "/kpi-dashboard" },
  { match: ["decision-assistant", "smart-router", "business-advisor"], href: "/decision-assistant" },
  { match: ["variance-analysis", "variance"], href: "/variance-analysis" },
  { match: ["supply-chain", "inventory", "demand-forecast", "supplier"], href: "/supply-chain" },
  { match: ["industrial-mst", "mst"], href: "/industrial-management/mst" },
  { match: ["strategic-swot-pestel", "swot", "pestel"], href: "/industrial-management/swot-analysis" },
  { match: ["industrial-management", "mrp", "maintenance", "quality-control", "workshop-scheduling"], href: "/industrial-management" },
];

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\s]+/g, "-");
}

export function getModuleRoute(moduleName: string): string | null {
  const normalized = normalize(moduleName);
  const route = MODULE_ROUTES.find(({ match }) =>
    match.some((candidate) => normalized === candidate || normalized.includes(candidate)),
  );
  return route?.href ?? null;
}

export function formatModuleLabel(moduleName: string): string {
  return moduleName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function getModuleKey(moduleName: string): string {
  const route = getModuleRoute(moduleName);
  return route ?? normalize(moduleName);
}

function startOfWeek(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  return start;
}

function weekKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getWeekLabels(start: Date): { labelFr: string; labelAr: string } {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return {
    labelFr: `${start.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} — ${end.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}`,
    labelAr: `${start.toLocaleDateString("ar-DZ", { day: "2-digit", month: "short" })} — ${end.toLocaleDateString("ar-DZ", { day: "2-digit", month: "short" })}`,
  };
}

export function buildSharedHistoryAnalytics(
  records: SharedHistory[],
  now: Date = new Date(),
): SharedHistoryAnalytics {
  const moduleMap = new Map<string, ModuleHistorySummary>();

  for (const record of records) {
    const key = getModuleKey(record.moduleName);
    const existing = moduleMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      moduleMap.set(key, {
        key,
        label: formatModuleLabel(record.moduleName),
        count: 1,
        href: getModuleRoute(record.moduleName),
      });
    }
  }

  const modules = [...moduleMap.values()].sort((a, b) =>
    b.count - a.count || a.label.localeCompare(b.label),
  );

  const currentWeek = startOfWeek(now);
  const weeks: WeeklyHistorySummary[] = [];

  for (let offset = 3; offset >= 0; offset -= 1) {
    const start = new Date(currentWeek);
    start.setDate(start.getDate() - offset * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const count = records.reduce((total, record) => {
      const savedAt = new Date(record.savedAt);
      return !Number.isNaN(savedAt.getTime()) && savedAt >= start && savedAt < end ? total + 1 : total;
    }, 0);
    const labels = getWeekLabels(start);
    weeks.push({
      key: weekKey(start),
      ...labels,
      count,
      start: start.toISOString(),
    });
  }

  return {
    total: records.length,
    modules,
    mostUsed: modules[0] ?? null,
    weeks,
  };
}