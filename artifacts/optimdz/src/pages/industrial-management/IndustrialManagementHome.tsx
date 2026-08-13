import { useState } from "react";
import { Link } from "wouter";
import { useLanguage } from "@/lib/LanguageContext";
import {
  ArrowRight, CheckCircle2, Factory,
  ClipboardList, CalendarRange, Gauge, ShieldCheck, Wrench,
  ShoppingBag, Leaf, Monitor, PencilRuler,
  Network,
} from "lucide-react";

// ── Sector cards ──────────────────────────────────────────────────────────────
interface Sector {
  id: string;
  icon: React.ElementType;
  nameAr: string;
  nameFr: string;
}

const SECTORS: Sector[] = [
  { id: "industrie",   icon: Factory,     nameAr: "الصناعة",   nameFr: "Industrie" },
  { id: "commerce",    icon: ShoppingBag, nameAr: "التجارة",   nameFr: "Commerce" },
  { id: "agriculture", icon: Leaf,        nameAr: "الفلاحة",   nameFr: "Agriculture" },
  { id: "services",    icon: Monitor,     nameAr: "الخدمات",   nameFr: "Services" },
  { id: "custom",      icon: PencilRuler, nameAr: "مخصص",      nameFr: "Personnalisé" },
];

// ── Sub-topic tool cards ──────────────────────────────────────────────────────
interface Tool {
  id: string;
  icon: React.ElementType;
  nameAr: string;
  nameFr: string;
  descAr: string;
  descFr: string;
  href?: string;
  active: boolean;
  badge: { fr: string; ar: string };
}

const TOOLS: Tool[] = [
  {
    id: "production-planning",
    icon: ClipboardList,
    nameAr: "تخطيط الإنتاج",
    nameFr: "Planification de la Production",
    descAr: "احسب الاحتياجات من المواد والمكونات باستخدام منهجية MRP — جداول الاحتياجات الإجمالية والصافية وأوامر الإنتاج لكل فترة.",
    descFr: "Calculez les besoins en matières et composants via la méthode MRP — tableaux de besoins bruts, nets et ordres planifiés par période.",
    href: "/industrial-management/production-planning",
    active: true,
    badge: { fr: "Disponible", ar: "متاح" },
  },
  {
    id: "workshop-scheduling",
    icon: CalendarRange,
    nameAr: "جدولة الورشات",
    nameFr: "Ordonnancement des Ateliers",
    descAr: "جدولة المهام على آلة واحدة باستخدام قواعد SPT، EDD وFIFO — احسب التأخيرات وأوقات الإنهاء واحصل على توصيات إدارية.",
    descFr: "Séquencez vos tâches sur une machine avec les règles SPT, EDD et FIFO — calculez les retards, temps de fin et obtenez des recommandations managériales.",
    href: "/industrial-management/workshop-scheduling",
    active: true,
    badge: { fr: "Disponible", ar: "متاح" },
  },
  {
    id: "capacity-planning",
    icon: Gauge,
    nameAr: "تخطيط الطاقة الإنتاجية",
    nameFr: "Planification des Capacités",
    descAr: "قيّم الطاقة المتاحة مقابل الحمل المخطط لكل مركز عمل — اكتشف الاختناقات واحسب فجوات الطاقة واحصل على توصيات إدارية مستهدفة.",
    descFr: "Évaluez la capacité disponible face à la charge planifiée par centre de travail — détectez les goulots, calculez les écarts et obtenez des recommandations managériales ciblées.",
    href: "/industrial-management/capacity-planning",
    active: true,
    badge: { fr: "Disponible", ar: "متاح" },
  },
  {
    id: "quality-management",
    icon: ShieldCheck,
    nameAr: "إدارة الجودة",
    nameFr: "Gestion de la Qualité",
    descAr: "أنشئ بطاقات المراقبة الإحصائية (X-bar وP) لاكتشاف انجرافات العملية وتحديد النقاط خارج السيطرة والحصول على توصيات إدارية مستهدفة.",
    descFr: "Construisez des cartes de contrôle statistique (X-bar et P) pour détecter les dérives de processus, identifier les points hors contrôle et obtenir des recommandations managériales ciblées.",
    href: "/industrial-management/quality-control",
    active: true,
    badge: { fr: "Disponible", ar: "متاح" },
  },
  {
    id: "maintenance",
    icon: Wrench,
    nameAr: "صيانة المعدات",
    nameFr: "Maintenance des Équipements",
    descAr: "احسب MTBF وMTTR ومعدل التوافرية لكل معدة — حدّد المعدات الحرجة واحصل على توصيات إدارية مستهدفة للحد من التوقفات غير المخططة.",
    descFr: "Calculez le MTBF, le MTTR et la disponibilité de chaque équipement — identifiez les équipements critiques et obtenez des recommandations managériales ciblées.",
    href: "/industrial-management/maintenance",
    active: true,
    badge: { fr: "Disponible", ar: "متاح" },
  },
  {
    id: "mst",
    icon: Network,
    nameAr: "الشجرة الممتدة الصغرى",
    nameFr: "Arbre Couvrant Minimal",
    descAr: "ابنِ شبكة بأقل تكلفة باستخدام خوارزمية كروسكال وحدد الوصلات التي تكوّن دورات زائدة.",
    descFr: "Construisez un réseau de coût minimal avec Kruskal et repérez les connexions redondantes.",
    href: "/industrial-management/mst",
    active: true,
    badge: { fr: "Nouveau", ar: "جديد" },
  },
];

const MODULE_STATS = [
  { valueAr: "٦", valueFr: "6", labelAr: "أدوات مخططة", labelFr: "Outils planifiés" },
  { valueAr: "٦",  valueFr: "6",  labelAr: "أدوات متاحة الآن", labelFr: "Outils disponibles" },
  { valueAr: "MRP · SPT · EDD · FIFO · MST", valueFr: "MRP · SPT · EDD · FIFO · MST", labelAr: "الخوارزميات المدعومة", labelFr: "Algorithmes supportés" },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function IndustrialManagementHome() {
  const { t, language } = useLanguage();
  const isAr = language === "ar";
  const [selectedSector, setSelectedSector] = useState<string>("industrie");

  return (
    <div className={`min-h-[100dvh] bg-muted/20 ${isAr ? "rtl" : "ltr"}`} dir={isAr ? "rtl" : "ltr"}>
      <main className="container mx-auto px-4 py-8 space-y-12 max-w-6xl">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="bg-primary text-primary-foreground rounded-xl p-8 md:p-12 shadow-lg relative overflow-hidden">
          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-primary-foreground/15 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
              <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
              {t("Module — Gestion Industrielle", "وحدة — التسيير الصناعي")}
            </div>

            <h1 className="text-3xl md:text-4xl font-bold mb-4 leading-tight">
              {t(
                "Optimisez vos opérations industrielles de la planification à la maintenance",
                "حسّن عملياتك الصناعية من التخطيط إلى الصيانة"
              )}
            </h1>

            <p className="text-primary-foreground/80 text-lg mb-8 max-w-2xl leading-relaxed">
              {t(
                "Des outils scientifiques pour planifier la production, ordonnancer les ateliers, gérer les capacités, la qualité et la maintenance — adaptés au contexte industriel algérien.",
                "أدوات علمية لتخطيط الإنتاج، جدولة الورشات، إدارة الطاقة الإنتاجية والجودة والصيانة — مُكيَّفة مع البيئة الصناعية الجزائرية."
              )}
            </p>

            <Link href="/industrial-management/production-planning">
              <button className="inline-flex items-center gap-2 bg-white text-primary font-semibold px-6 py-3 rounded-lg shadow hover:bg-white/90 transition-colors">
                {t("Commencer avec la Planification MRP", "ابدأ بتخطيط الإنتاج MRP")}
                <ArrowRight className={`w-4 h-4 ${isAr ? "rotate-180" : ""}`} />
              </button>
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap gap-6">
            {MODULE_STATS.map((s) => (
              <div key={s.labelFr} className="bg-primary-foreground/10 rounded-xl px-5 py-3 text-center">
                <div className="text-2xl font-bold">{isAr ? s.valueAr : s.valueFr}</div>
                <div className="text-xs text-primary-foreground/70 mt-0.5">{isAr ? s.labelAr : s.labelFr}</div>
              </div>
            ))}
          </div>

          <div className="absolute -right-24 -bottom-24 opacity-10 pointer-events-none">
            <Factory className="w-96 h-96" />
          </div>
        </section>

        {/* ── Sector selection ─────────────────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {t("Votre secteur d'activité", "قطاع نشاطك")}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {t(
                "Sélectionnez votre secteur pour des modèles et exemples adaptés.",
                "اختر قطاعك للحصول على نماذج وأمثلة مُكيَّفة."
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {SECTORS.map((sector) => {
              const Icon = sector.icon;
              const isSelected = selectedSector === sector.id;
              return (
                <button
                  key={sector.id}
                  onClick={() => setSelectedSector(sector.id)}
                  className={[
                    "flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-md"
                      : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground",
                  ].join(" ")}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {isAr ? sector.nameAr : sector.nameFr}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Tools grid ───────────────────────────────────────────────────── */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              {t("Outils de Gestion Industrielle", "أدوات التسيير الصناعي")}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {t(
                "Cliquez sur un outil actif pour commencer. Les autres outils sont en cours de développement.",
                "انقر على أداة نشطة للبدء. الأدوات الأخرى قيد التطوير."
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              const cardContent = (
                <div
                  className={[
                    "relative rounded-xl border bg-card p-6 flex flex-col gap-4 transition-all duration-200",
                    tool.active
                      ? "border-primary/40 shadow-sm hover:border-primary hover:shadow-md hover:-translate-y-0.5 cursor-pointer group"
                      : "opacity-60 cursor-not-allowed border-border",
                  ].join(" ")}
                >
                  {tool.badge && (
                    <span
                      className={[
                        "absolute top-4 text-[10px] font-bold px-2.5 py-0.5 rounded-full",
                        isAr ? "left-4" : "right-4",
                        tool.active
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      ].join(" ")}
                    >
                      {isAr ? tool.badge.ar : tool.badge.fr}
                    </span>
                  )}

                  <div
                    className={[
                      "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                      tool.active
                        ? "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    ].join(" ")}
                  >
                    <Icon className="w-6 h-6" />
                  </div>

                  <div className="space-y-1.5">
                    <h3 className={`font-bold text-base ${tool.active ? "text-foreground" : "text-muted-foreground"}`}>
                      {isAr ? tool.nameAr : tool.nameFr}
                    </h3>
                    <p className={`text-sm leading-relaxed ${tool.active ? "text-muted-foreground" : "text-muted-foreground/70"}`}>
                      {isAr ? tool.descAr : tool.descFr}
                    </p>
                  </div>

                  {tool.active && (
                    <div className="mt-auto pt-2 flex items-center gap-1.5 text-primary text-sm font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      {t("Ouvrir l'outil", "فتح الأداة")}
                      <ArrowRight className={`w-3.5 h-3.5 ${isAr ? "rotate-180" : ""}`} />
                    </div>
                  )}
                </div>
              );

              return tool.active && tool.href ? (
                <Link key={tool.id} href={tool.href}>
                  {cardContent}
                </Link>
              ) : (
                <div key={tool.id}>{cardContent}</div>
              );
            })}
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <footer className="border-t pt-8 pb-4 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-1 rounded">
              <Factory className="w-4 h-4" />
            </div>
            <span className="font-bold text-foreground">OptimDZ</span>
            <span>·</span>
            <span>{t("Gestion Industrielle", "التسيير الصناعي")}</span>
          </div>
          <Link href="/" className="hover:text-primary transition-colors">
            {t("← Retour au Portail", "→ العودة إلى البوابة")}
          </Link>
        </footer>

      </main>
    </div>
  );
}
