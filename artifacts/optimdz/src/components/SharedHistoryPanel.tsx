import { useMemo } from "react";
import { Link } from "wouter";
import { useListSharedHistory, type SharedHistory } from "@workspace/api-client-react";
import { ArrowRight, Clock3, History, RefreshCw } from "lucide-react";
import { useLanguage } from "@/lib/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface SharedHistoryPanelProps {
  maxItems?: number;
  fetchLimit?: number;
  showViewAll?: boolean;
  titleFr?: string;
  titleAr?: string;
  descriptionFr?: string;
  descriptionAr?: string;
}

function formatLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function formatValue(value: unknown, language: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    return new Intl.NumberFormat(language === "ar" ? "ar-DZ" : "fr-FR", {
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (typeof value === "boolean") {
    return language === "ar" ? (value ? "نعم" : "لا") : (value ? "Oui" : "Non");
  }
  return String(value);
}

function formatKeyResults(record: SharedHistory, language: string): string {
  const entries = Object.entries(record.keyResultValues);
  if (entries.length === 0) return "—";

  return entries
    .map(([key, value]) => `${formatLabel(key)} : ${formatValue(value, language)}`)
    .join(" · ");
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

function formatModuleName(moduleName: string): string {
  return formatLabel(moduleName);
}

export function SharedHistoryPanel({
  maxItems = 10,
  fetchLimit = maxItems + 1,
  showViewAll = true,
  titleFr = "Activité récente",
  titleAr = "النشاط الأخير",
  descriptionFr = "Les derniers résultats enregistrés à travers tous les modules.",
  descriptionAr = "آخر النتائج المحفوظة عبر جميع الوحدات.",
}: SharedHistoryPanelProps) {
  const { t, language } = useLanguage();
  const { data: records, isLoading, isError, refetch } = useListSharedHistory({
    limit: Math.min(fetchLimit, 100),
  });
  const visibleRecords = useMemo(
    () => (records ?? []).slice(0, maxItems),
    [maxItems, records],
  );
  const hasMore = showViewAll && (records?.length ?? 0) > maxItems;

  return (
    <section data-testid="section-recent-activity" className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b bg-primary/[0.03] px-5 py-5 md:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <History className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-xl">{t(titleFr, titleAr)}</CardTitle>
              <CardDescription className="mt-1">
                {t(descriptionFr, descriptionAr)}
              </CardDescription>
            </div>
          </div>
          {hasMore && (
            <Button asChild variant="ghost" size="sm" className="shrink-0">
              <Link
                href="/activity"
                data-testid="link-view-all-activity"
                className="inline-flex items-center gap-1.5"
              >
                {t("Voir tout", "عرض الكل")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-4 p-5 md:p-6" data-testid="status-recent-activity-loading">
              {Array.from({ length: Math.min(maxItems, 4) }).map((_, index) => (
                <div key={index} className="grid gap-2 md:grid-cols-[1fr_1.4fr_2fr_1.2fr] md:items-center">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center" data-testid="status-recent-activity-error">
              <p className="text-sm text-muted-foreground">
                {t("Impossible de charger l'activité récente.", "تعذر تحميل النشاط الأخير.")}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                data-testid="button-retry-recent-activity"
              >
                <RefreshCw className="h-4 w-4" />
                {t("Réessayer", "إعادة المحاولة")}
              </Button>
            </div>
          ) : visibleRecords.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center" data-testid="status-recent-activity-empty">
              <Clock3 className="h-8 w-8 text-primary/40" />
              <p className="font-medium text-foreground">
                {t("Aucun résultat enregistré pour le moment.", "لا توجد نتائج محفوظة حتى الآن.")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("Vos prochains calculs apparaîtront ici.", "ستظهر حساباتك القادمة هنا.")}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              <div className="hidden grid-cols-[1fr_1.35fr_2fr_1.2fr] gap-4 bg-muted/30 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid md:px-6">
                <span>{t("Module", "الوحدة")}</span>
                <span>{t("Problème", "المسألة")}</span>
                <span>{t("Résultat clé", "النتيجة الرئيسية")}</span>
                <span>{t("Date", "التاريخ")}</span>
              </div>
              {visibleRecords.map((record) => (
                <div
                  key={record.id}
                  data-testid={`row-shared-history-${record.id}`}
                  className="grid gap-3 px-5 py-4 transition-colors hover:bg-muted/20 md:grid-cols-[1fr_1.35fr_2fr_1.2fr] md:items-center md:gap-4 md:px-6"
                >
                  <div className="min-w-0">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground md:hidden">
                      {t("Module", "الوحدة")}
                    </span>
                    <p
                      className="truncate font-semibold text-primary"
                      title={record.moduleName}
                      data-testid={`text-shared-history-module-${record.id}`}
                    >
                      {formatModuleName(record.moduleName)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground md:hidden">
                      {t("Problème", "المسألة")}
                    </span>
                    <p
                      className="truncate font-medium text-foreground"
                      title={record.problemName}
                      data-testid={`text-shared-history-problem-${record.id}`}
                    >
                      {record.problemName}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground md:hidden">
                      {t("Résultat clé", "النتيجة الرئيسية")}
                    </span>
                    <p
                      className="break-words text-sm text-foreground"
                      data-testid={`text-shared-history-result-${record.id}`}
                    >
                      {formatKeyResults(record, language)}
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide md:hidden">
                      {t("Date", "التاريخ")}
                    </span>
                    <time dateTime={record.savedAt} data-testid={`text-shared-history-date-${record.id}`}>
                      {formatDate(record.savedAt, language)}
                    </time>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}