import { useMemo } from "react";
import { Link } from "wouter";
import { useListSharedHistory } from "@workspace/api-client-react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Trophy,
} from "lucide-react";
import { useLanguage } from "@/lib/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildSharedHistoryAnalytics,
  formatModuleLabel,
} from "@/lib/sharedHistoryAnalytics";

const numberFormatters = {
  fr: new Intl.NumberFormat("fr-FR"),
  ar: new Intl.NumberFormat("ar-DZ"),
};

export default function KpiDashboardHome() {
  const { t, language } = useLanguage();
  const isAr = language === "ar";
  const { data: records, isLoading, isError, refetch } = useListSharedHistory({ limit: 100 });
  const analytics = useMemo(
    () => buildSharedHistoryAnalytics(records ?? []),
    [records],
  );
  const formatNumber = (value: number) => numberFormatters[isAr ? "ar" : "fr"].format(value);

  return (
    <div className={`min-h-[100dvh] bg-muted/20 ${isAr ? "rtl" : "ltr"}`} dir={isAr ? "rtl" : "ltr"}>
      <main className="container mx-auto px-4 py-8 space-y-8 max-w-6xl">
        <section className="bg-primary text-primary-foreground rounded-xl p-8 md:p-12 shadow-lg relative overflow-hidden">
          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-primary-foreground/15 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
              <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
              {t("Module — Tableau de Bord KPI", "وحدة — لوحة مؤشرات الأداء")}
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-4 leading-tight">
              {t("La vue d'ensemble de vos décisions", "نظرة شاملة على قراراتك")}
            </h1>
            <p className="text-primary-foreground/80 text-lg mb-8 max-w-2xl leading-relaxed">
              {t(
                "Unifiez l'activité enregistrée dans OptimDZ pour comprendre quels outils sont utilisés, suivre le rythme des décisions et rouvrir rapidement chaque module.",
                "اجمع النشاط المحفوظ في OptimDZ لمعرفة الأدوات المستخدمة، وتتبع وتيرة القرارات، وإعادة فتح كل وحدة بسرعة.",
              )}
            </p>
            <Link href="/kpi-dashboard/tracking">
              <button className="inline-flex items-center gap-2 bg-white text-primary font-semibold px-6 py-3 rounded-lg shadow hover:bg-white/90 transition-colors">
                {t("Saisir un KPI manuel", "إدخال مؤشر أداء يدوي")}
                <ArrowRight className={`w-4 h-4 ${isAr ? "rotate-180" : ""}`} />
              </button>
            </Link>
          </div>
          <div className="absolute -right-24 -bottom-24 opacity-10 pointer-events-none">
            <BarChart3 className="w-96 h-96" />
          </div>
        </section>

        {isLoading ? (
          <DashboardLoadingState />
        ) : isError ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
              <Activity className="w-10 h-10 text-primary/40" />
              <div>
                <h2 className="font-bold text-foreground">{t("Données indisponibles", "البيانات غير متاحة")}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("Le tableau de bord ne peut pas charger l'historique partagé pour le moment.", "تعذر تحميل السجل المشترك للوحة التحكم حاليًا.")}
                </p>
              </div>
              <Button variant="outline" onClick={() => refetch()} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                {t("Réessayer", "إعادة المحاولة")}
              </Button>
            </CardContent>
          </Card>
        ) : analytics.total === 0 ? (
          <EmptyDashboardState />
        ) : (
          <>
            <section className="grid grid-cols-1 md:grid-cols-3 gap-5" data-testid="kpi-dashboard-summary">
              <SummaryCard
                icon={<CheckCircle2 className="w-5 h-5" />}
                label={t("Problèmes résolus", "المسائل المحلولة")}
                value={formatNumber(analytics.total)}
                description={t("Résultats enregistrés tous modules confondus", "النتائج المحفوظة عبر كل الوحدات")}
                className="border-primary/30 bg-primary/5 text-primary"
                testId="dashboard-total-problems"
              />
              <SummaryCard
                icon={<Trophy className="w-5 h-5" />}
                label={t("Module le plus utilisé", "الوحدة الأكثر استخدامًا")}
                value={analytics.mostUsed ? formatModuleLabel(analytics.mostUsed.label) : "—"}
                description={analytics.mostUsed ? `${formatNumber(analytics.mostUsed.count)} ${t("enregistrement(s)", "تسجيل")}` : ""}
                className="border-amber-200 bg-amber-50 text-amber-800"
                testId="dashboard-most-used-module"
              />
              <SummaryCard
                icon={<BarChart3 className="w-5 h-5" />}
                label={t("Modules actifs", "الوحدات النشطة")}
                value={formatNumber(analytics.modules.length)}
                description={t("Avec au moins un résultat partagé", "مع نتيجة مشتركة واحدة على الأقل")}
                className="border-sky-200 bg-sky-50 text-sky-800"
                testId="dashboard-active-modules"
              />
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-6">
              <Card data-testid="dashboard-module-breakdown">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    {t("Problèmes par module", "المسائل حسب الوحدة")}
                  </CardTitle>
                  <CardDescription>
                    {t("Chaque résultat enregistré est compté une seule fois.", "يتم احتساب كل نتيجة محفوظة مرة واحدة.")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {analytics.modules.map((module) => {
                    const percentage = Math.round((module.count / analytics.total) * 100);
                    return (
                      <div key={module.key} className="space-y-2" data-testid={`dashboard-module-${module.key.replace(/[^a-z0-9]+/gi, "-")}`}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold truncate" title={module.label}>{module.label}</span>
                            {module.href && (
                              <Link href={module.href} className="text-primary hover:text-primary/70 shrink-0" title={t("Rouvrir le module", "إعادة فتح الوحدة")}>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Link>
                            )}
                          </div>
                          <span className="font-bold text-foreground shrink-0">
                            {formatNumber(module.count)} <span className="text-xs text-muted-foreground font-normal">({percentage}%)</span>
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percentage}%` }} />
                        </div>
                        <div className="flex justify-end">
                          {module.href ? (
                            <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary">
                              <Link href={module.href} className="inline-flex items-center gap-1">
                                {t("Rouvrir", "إعادة فتح")}
                                <ArrowRight className={`w-3 h-3 ${isAr ? "rotate-180" : ""}`} />
                              </Link>
                            </Button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">{t("Lien indisponible", "الرابط غير متاح")}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card data-testid="dashboard-weekly-trend">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Activity className="w-5 h-5 text-primary" />
                    {t("Rythme des décisions", "وتيرة القرارات")}
                  </CardTitle>
                  <CardDescription>{t("Nombre d'enregistrements par semaine — 4 dernières semaines.", "عدد التسجيلات في كل أسبوع — آخر 4 أسابيع.")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="h-48 flex items-end gap-3 border-b border-border pb-0">
                    {analytics.weeks.map((week) => {
                      const max = Math.max(1, ...analytics.weeks.map((item) => item.count));
                      const height = week.count === 0 ? 5 : Math.max(12, Math.round((week.count / max) * 100));
                      return (
                        <div key={week.key} className="flex-1 h-full flex flex-col items-center justify-end gap-2 group" title={isAr ? week.labelAr : week.labelFr}>
                          <span className="text-xs font-bold text-foreground">{formatNumber(week.count)}</span>
                          <div className="w-full rounded-t-lg bg-primary/80 group-hover:bg-primary transition-colors" style={{ height: `${height}%` }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-[10px] text-muted-foreground">
                    {analytics.weeks.map((week) => <span key={week.key}>{isAr ? week.labelAr : week.labelFr}</span>)}
                  </div>
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <ExternalLink className="w-5 h-5 text-primary" />
                  {t("Accès rapide aux modules", "وصول سريع إلى الوحدات")}
                </CardTitle>
                <CardDescription>{t("Rouvrez directement le module associé à chaque famille de résultats.", "أعد فتح الوحدة المرتبطة بكل عائلة من النتائج مباشرةً.")}</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {analytics.modules.map((module) => (
                  module.href ? (
                    <Link key={module.key} href={module.href} className="group rounded-xl border bg-card px-4 py-3 flex items-center justify-between gap-3 hover:border-primary hover:bg-primary/5 transition-colors">
                      <span className="font-semibold text-sm truncate">{module.label}</span>
                      <ArrowRight className={`w-4 h-4 text-primary shrink-0 group-hover:translate-x-0.5 transition-transform ${isAr ? "rotate-180 group-hover:-translate-x-0.5" : ""}`} />
                    </Link>
                  ) : (
                    <div key={module.key} className="rounded-xl border bg-muted/30 px-4 py-3 flex items-center justify-between gap-3 text-muted-foreground">
                      <span className="font-semibold text-sm truncate">{module.label}</span>
                      <span className="text-xs">{t("Non routé", "غير مرتبط")}</span>
                    </div>
                  )
                ))}
              </CardContent>
            </Card>
          </>
        )}

        <footer className="border-t pt-8 pb-4 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-1 rounded"><BarChart3 className="w-4 h-4" /></div>
            <span className="font-bold text-foreground">OptimDZ</span>
            <span>·</span>
            <span>{t("Tableau de Bord KPI", "لوحة مؤشرات الأداء")}</span>
          </div>
          <Link href="/" className="hover:text-primary transition-colors">{t("← Retour au Portail", "→ العودة إلى البوابة")}</Link>
        </footer>
      </main>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  description,
  className,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  description: string;
  className: string;
  testId: string;
}) {
  return (
    <div className={`rounded-xl border p-5 space-y-3 ${className}`} data-testid={testId}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">{icon}{label}</div>
      <div className="text-2xl font-black text-foreground truncate" title={value}>{value}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </div>
  );
}

function DashboardLoadingState() {
  return (
    <div className="space-y-6" data-testid="dashboard-loading">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-36 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}

function EmptyDashboardState() {
  const { t } = useLanguage();
  return (
    <Card data-testid="dashboard-empty">
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><BarChart3 className="w-7 h-7" /></div>
        <div>
          <h2 className="text-xl font-bold">{t("Aucune activité partagée", "لا يوجد نشاط مشترك")}</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">{t("Enregistrez votre premier résultat dans un module OptimDZ pour alimenter ce tableau de bord.", "احفظ أول نتيجة في إحدى وحدات OptimDZ لتغذية لوحة التحكم هذه.")}</p>
        </div>
        <Button asChild className="gap-2"><Link href="/"><ArrowRight className="w-4 h-4" />{t("Explorer les modules", "استكشاف الوحدات")}</Link></Button>
      </CardContent>
    </Card>
  );
}