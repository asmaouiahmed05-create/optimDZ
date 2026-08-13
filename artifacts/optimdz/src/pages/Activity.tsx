import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { SharedHistoryPanel } from "@/components/SharedHistoryPanel";
import { useLanguage } from "@/lib/LanguageContext";
import { PlatformNav } from "@/pages/PlatformHome";

export default function Activity() {
  const { t, language } = useLanguage();
  const isAr = language === "ar";

  return (
    <div className={`min-h-[100dvh] bg-muted/20 ${isAr ? "rtl" : "ltr"}`} dir={isAr ? "rtl" : "ltr"}>
      <PlatformNav />
      <main className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
        <Link
          href="/"
          data-testid="link-back-to-platform-home"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className={`h-4 w-4 ${isAr ? "rotate-180" : ""}`} />
          {t("Retour à la plateforme", "العودة إلى المنصة")}
        </Link>
        <SharedHistoryPanel
          maxItems={100}
          fetchLimit={100}
          showViewAll={false}
          titleFr="Historique partagé"
          titleAr="السجل المشترك"
          descriptionFr="Tous les résultats enregistrés à travers les modules OptimDZ."
          descriptionAr="جميع النتائج المحفوظة عبر وحدات OptimDZ."
        />
      </main>
    </div>
  );
}