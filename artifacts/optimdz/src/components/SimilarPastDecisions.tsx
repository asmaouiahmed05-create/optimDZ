import { useEffect, useMemo } from "react";
import { useListSharedHistory, type SharedHistory } from "@workspace/api-client-react";
import { BarChart3, CalendarDays } from "lucide-react";
import { useLanguage } from "@/lib/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SimilarPastDecisionsProps {
  resultKey: string;
}

const COMPARABLE_RESULT_KEYS = new Set([
  "npv",
  "irr",
  "profitabilityindex",
]);

function normalizeKey(value: string): string {
  return value.replace(/[^a-zA-Z]/g, "").toLowerCase();
}

function isComparableRecord(record: SharedHistory): boolean {
  const moduleName = normalizeKey(record.moduleName);
  if (moduleName === "investmentappraisal" || moduleName === "simplex") {
    return true;
  }

  return Object.keys(record.keyResultValues).some((key) =>
    COMPARABLE_RESULT_KEYS.has(normalizeKey(key)),
  );
}

function formatModuleName(moduleName: string): string {
  return moduleName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function formatNumber(value: number, language: string, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(language === "ar" ? "ar-DZ" : "fr-FR", {
    maximumFractionDigits,
  }).format(value);
}

function formatValue(value: unknown, language: string): string {
  if (typeof value === "number") return formatNumber(value, language);
  if (value === null || value === undefined) return "—";
  return String(value);
}

function getKeyValue(record: SharedHistory, language: string): { labelFr: string; labelAr: string; value: string } {
  const values = record.keyResultValues;
  const candidates = [
    { key: "npv", labelFr: "VAN", labelAr: "NPV" },
    { key: "optimalValue", labelFr: "Valeur optimale", labelAr: "القيمة المثلى" },
    { key: "irr", labelFr: "TRI", labelAr: "IRR" },
    { key: "profitabilityIndex", labelFr: "IP", labelAr: "PI" },
  ];

  for (const candidate of candidates) {
    const value = values[candidate.key];
    if (typeof value === "number" || typeof value === "string") {
      return {
        labelFr: candidate.labelFr,
        labelAr: candidate.labelAr,
        value: formatValue(value, language),
      };
    }
  }

  const firstEntry = Object.entries(values)[0];
  return firstEntry
    ? {
        labelFr: firstEntry[0],
        labelAr: firstEntry[0],
        value: formatValue(firstEntry[1], language),
      }
    : { labelFr: "Résultat", labelAr: "النتيجة", value: "—" };
}

function formatDate(savedAt: string, language: string): string {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString(language === "ar" ? "ar-DZ" : "fr-FR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SimilarPastDecisions({ resultKey }: SimilarPastDecisionsProps) {
  const { t, language } = useLanguage();
  const { data: records, isLoading, isError, refetch } = useListSharedHistory({ limit: 100 });

  useEffect(() => {
    if (resultKey) void refetch();
  }, [refetch, resultKey]);

  const similarRecords = useMemo(
    () => (records ?? []).filter(isComparableRecord).slice(0, 3),
    [records],
  );

  if (isLoading || isError || similarRecords.length === 0) return null;

  return (
    <Card data-testid="widget-similar-past-decisions" className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-primary" />
          {t("Décisions similaires passées", "قرارات سابقة مشابهة")}
        </CardTitle>
        <CardDescription>
          {t(
            "Quelques résultats récents pour situer cette évaluation.",
            "بعض النتائج الأخيرة لوضع هذا التقييم في سياقه.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 pt-0 md:grid-cols-3">
        {similarRecords.map((record) => {
          const keyValue = getKeyValue(record, language);
          return (
            <div
              key={record.id}
              data-testid={`card-similar-past-decision-${record.id}`}
              className="rounded-lg border border-border bg-muted/20 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <p
                  className="truncate text-xs font-bold uppercase tracking-wide text-primary"
                  title={record.moduleName}
                  data-testid={`text-similar-module-${record.id}`}
                >
                  {formatModuleName(record.moduleName)}
                </p>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {t("Référence", "مرجع")}
                </span>
              </div>
              <p
                className="mt-2 line-clamp-2 min-h-10 text-sm font-semibold text-foreground"
                title={record.problemName}
                data-testid={`text-similar-problem-${record.id}`}
              >
                {record.problemName}
              </p>
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {language === "ar" ? keyValue.labelAr : keyValue.labelFr}
                </span>
                <span
                  className="truncate text-sm font-bold text-foreground"
                  title={keyValue.value}
                  data-testid={`text-similar-key-value-${record.id}`}
                >
                  {keyValue.value}
                </span>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                <time dateTime={record.savedAt} data-testid={`text-similar-date-${record.id}`}>
                  {formatDate(record.savedAt, language)}
                </time>
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}