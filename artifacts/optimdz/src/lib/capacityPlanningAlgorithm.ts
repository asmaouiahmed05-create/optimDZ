// ── Capacity Planning (Planification des Capacités) — pure computation ─────────
// Computes utilization rate, capacity gap and bottleneck detection per centre and period.
// No i18n here; all user-facing strings live in the UI layer.

export type PeriodType = "semaines" | "mois";

// ── Input shapes ──────────────────────────────────────────────────────────────
export interface WorkCenterInput {
  id: string;
  name: string;
  capacities: number[];   // available capacity per period (hours, units, etc.)
  loads: number[];        // requested load per period
}

export interface CapacityInputs {
  problemName: string;
  periodType: PeriodType;
  periodCount: number;
  centers: WorkCenterInput[];
}

// ── Output shapes ─────────────────────────────────────────────────────────────
export interface PeriodResult {
  capacity: number;
  load: number;
  utilizationRate: number;   // (load / capacity) × 100 — capped display; Infinity if capacity=0 and load>0
  capacityGap: number;       // capacity − load (negative means overloaded)
  isBottleneck: boolean;     // utilizationRate > 100
  isUnderutilized: boolean;  // utilizationRate < 50 and capacity > 0
}

export type CenterStatus = "critical" | "warning" | "underused" | "good";

export interface CenterResult {
  id: string;
  name: string;
  periods: PeriodResult[];
  avgUtilizationRate: number;  // average across periods with non-zero capacity
  maxUtilizationRate: number;  // worst period
  bottleneckPeriods: number[]; // 0-based indices where taux > 100%
  isBottleneck: boolean;       // at least one bottleneck period
  status: CenterStatus;
}

export interface CapacityResults {
  periodLabels: string[];
  centers: CenterResult[];
  bottleneckCenterCount: number;
  overallUtilization: number;   // weighted average across all centres + periods
  overallStatus: "critical" | "warning" | "good";
}

// ── Validation ────────────────────────────────────────────────────────────────
export interface CapacityValidationError {
  type: "empty" | "zero_capacity" | "missing_name";
  centerName?: string;
  msgFr: string;
  msgAr: string;
}

export function validateInputs(inputs: CapacityInputs): CapacityValidationError[] {
  const errors: CapacityValidationError[] = [];

  if (inputs.centers.length === 0) {
    errors.push({
      type: "empty",
      msgFr: "Aucun centre de travail saisi. Ajoutez au moins un centre pour lancer l'analyse.",
      msgAr: "لم يتم إدخال أي مركز عمل. أضف مركزاً واحداً على الأقل لبدء التحليل.",
    });
    return errors;
  }

  for (const c of inputs.centers) {
    if (!c.name.trim()) {
      errors.push({
        type: "missing_name",
        msgFr: "Un centre de travail n'a pas de nom. Veuillez nommer tous les centres.",
        msgAr: "أحد مراكز العمل ليس له اسم. يرجى تسمية جميع المراكز.",
      });
    }
    const hasAnyCapacity = c.capacities.some(v => v > 0);
    if (!hasAnyCapacity) {
      errors.push({
        type: "zero_capacity",
        centerName: c.name || "?",
        msgFr: `Le centre "${c.name || "?"}" n'a aucune capacité disponible saisie. Saisissez au moins une valeur supérieure à 0.`,
        msgAr: `مركز "${c.name || "?"}" لا يحتوي على طاقة متاحة. أدخل قيمة أكبر من 0 على الأقل.`,
      });
    }
  }

  return errors;
}

// ── Period label builder ──────────────────────────────────────────────────────
export function buildPeriodLabels(periodType: PeriodType, count: number): string[] {
  const prefix = periodType === "semaines" ? "S" : "M";
  return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
}

// ── Core computation ──────────────────────────────────────────────────────────
export function computeCapacityPlan(inputs: CapacityInputs): CapacityResults {
  const { periodCount, centers } = inputs;
  const periodLabels = buildPeriodLabels(inputs.periodType, periodCount);

  const centerResults: CenterResult[] = [];
  let totalCapacity = 0;
  let totalLoad = 0;
  let bottleneckCenterCount = 0;

  for (const center of centers) {
    const periods: PeriodResult[] = [];
    const bottleneckPeriods: number[] = [];
    let sumUtilization = 0;
    let validPeriods = 0;
    let maxUtilization = 0;

    for (let p = 0; p < periodCount; p++) {
      const capacity = Math.max(0, center.capacities[p] ?? 0);
      const load     = Math.max(0, center.loads[p] ?? 0);

      let utilizationRate: number;
      if (capacity === 0 && load === 0) {
        utilizationRate = 0;
      } else if (capacity === 0) {
        utilizationRate = Infinity; // infinite overload — no capacity at all
      } else {
        utilizationRate = (load / capacity) * 100;
      }

      const capacityGap   = capacity - load;
      const isBottleneck   = utilizationRate > 100;
      const isUnderutilized = capacity > 0 && utilizationRate < 50 && utilizationRate >= 0;

      if (isBottleneck) bottleneckPeriods.push(p);
      if (capacity > 0) {
        sumUtilization += Math.min(utilizationRate, 999); // cap for average
        validPeriods++;
        if (utilizationRate > maxUtilization) maxUtilization = utilizationRate;
      }

      totalCapacity += capacity;
      totalLoad     += load;

      periods.push({ capacity, load, utilizationRate, capacityGap, isBottleneck, isUnderutilized });
    }

    const avgUtilizationRate = validPeriods > 0 ? sumUtilization / validPeriods : 0;
    const isBottleneck = bottleneckPeriods.length > 0;

    let status: CenterStatus;
    if (isBottleneck)             status = "critical";
    else if (avgUtilizationRate > 85) status = "warning";
    else if (avgUtilizationRate < 50 && avgUtilizationRate > 0) status = "underused";
    else                          status = "good";

    if (isBottleneck) bottleneckCenterCount++;

    centerResults.push({
      id: center.id,
      name: center.name,
      periods,
      avgUtilizationRate,
      maxUtilizationRate: maxUtilization,
      bottleneckPeriods,
      isBottleneck,
      status,
    });
  }

  const overallUtilization = totalCapacity > 0 ? (totalLoad / totalCapacity) * 100 : 0;
  const overallStatus: "critical" | "warning" | "good" =
    bottleneckCenterCount > 0
      ? "critical"
      : overallUtilization > 85
      ? "warning"
      : "good";

  return {
    periodLabels,
    centers: centerResults,
    bottleneckCenterCount,
    overallUtilization,
    overallStatus,
  };
}

// ── Bilingual analysis generator ──────────────────────────────────────────────
export function generateCapacityAnalysis(
  results: CapacityResults,
  periodLabels: string[],
): Array<{ fr: string; ar: string }> {
  const { centers, overallUtilization, overallStatus } = results;
  const totalCapacity = centers.reduce(
    (sum, c) => sum + c.periods.reduce((centerSum, p) => centerSum + p.capacity, 0),
    0,
  );
  const totalLoad = centers.reduce(
    (sum, c) => sum + c.periods.reduce((centerSum, p) => centerSum + p.load, 0),
    0,
  );
  const totalGap = totalCapacity - totalLoad;
  const fmt = (value: number) => value.toFixed(1);

  const lines: Array<{ fr: string; ar: string }> = [{
    fr: overallStatus === "critical"
      ? `Sur l'ensemble de la période planifiée, les centres disposent de ${fmt(totalCapacity)} unités de capacité pour ${fmt(totalLoad)} unités de charge demandée, soit une utilisation globale de ${fmt(overallUtilization)}% et un solde cumulé de ${fmt(totalGap)} unités. Ce solde global masque toutefois une insuffisance à certains moments : le calendrier ne peut pas être exécuté tel quel sans arbitrage entre périodes ou centres.`
      : overallStatus === "warning"
        ? `Sur la période planifiée, les centres disposent de ${fmt(totalCapacity)} unités de capacité pour ${fmt(totalLoad)} unités de charge demandée. L'utilisation globale atteint ${fmt(overallUtilization)}% et il reste ${fmt(totalGap)} unités de marge ; le plan est réalisable, mais une variation de la demande peut rapidement tendre les ressources.`
        : `Sur la période planifiée, les centres disposent de ${fmt(totalCapacity)} unités de capacité pour ${fmt(totalLoad)} unités de charge demandée. L'utilisation globale est de ${fmt(overallUtilization)}% et le solde disponible atteint ${fmt(totalGap)} unités ; le plan peut donc être absorbé dans les ressources prévues.`,
    ar: overallStatus === "critical"
      ? `على امتداد فترة التخطيط، تتوفر المراكز على طاقة قدرها ${fmt(totalCapacity)} وحدة مقابل حمل مطلوب قدره ${fmt(totalLoad)} وحدة، أي أن الاستخدام الإجمالي يبلغ ${fmt(overallUtilization)}% والرصيد التراكمي ${fmt(totalGap)} وحدة. لكن هذا الرصيد الإجمالي يخفي نقصاً في بعض اللحظات؛ لذلك لا يمكن تنفيذ الجدول كما هو دون موازنة بين الفترات أو المراكز.`
      : overallStatus === "warning"
        ? `خلال فترة التخطيط، تتوفر المراكز على طاقة قدرها ${fmt(totalCapacity)} وحدة مقابل حمل مطلوب قدره ${fmt(totalLoad)} وحدة. ويبلغ الاستخدام الإجمالي ${fmt(overallUtilization)}%، مع هامش متبق قدره ${fmt(totalGap)} وحدة؛ لذلك يمكن تنفيذ الخطة، لكن أي ارتفاع في الطلب قد يضغط بسرعة على الموارد.`
        : `خلال فترة التخطيط، تتوفر المراكز على طاقة قدرها ${fmt(totalCapacity)} وحدة مقابل حمل مطلوب قدره ${fmt(totalLoad)} وحدة. ويبلغ الاستخدام الإجمالي ${fmt(overallUtilization)}%، مع رصيد متاح قدره ${fmt(totalGap)} وحدة؛ لذلك يمكن استيعاب الخطة ضمن الموارد المبرمجة.`,
  }];

  for (const c of centers) {
    const available = c.periods.reduce((sum, p) => sum + p.capacity, 0);
    const required = c.periods.reduce((sum, p) => sum + p.load, 0);
    const gap = available - required;
    const lowestGapIdx = c.periods.reduce(
      (best, p, i) => (p.capacityGap < c.periods[best].capacityGap ? i : best),
      0,
    );
    const highestGapIdx = c.periods.reduce(
      (best, p, i) => (p.capacityGap > c.periods[best].capacityGap ? i : best),
      0,
    );
    const gapPeriodIdx = c.isBottleneck || gap < 0 ? lowestGapIdx : highestGapIdx;
    const gapPeriod = c.periods[gapPeriodIdx];
    const gapLabel = periodLabels[gapPeriodIdx];

    lines.push({
      fr: c.isBottleneck
        ? `Le centre "${c.name}" dispose de ${fmt(available)} unités pour ${fmt(required)} unités demandées, soit une utilisation moyenne de ${fmt(c.avgUtilizationRate)}%. Même si son bilan cumulé laisse ${fmt(Math.max(0, gap))} unité(s) de marge, il présente un déficit ponctuel en ${gapLabel} : ${fmt(gapPeriod.capacity)} unités disponibles ne couvrent que ${fmt(gapPeriod.load)} unités de charge, laissant ${fmt(Math.abs(gapPeriod.capacityGap))} unités à absorber.`
        : `Le centre "${c.name}" dispose de ${fmt(available)} unités pour ${fmt(required)} unités demandées, soit une utilisation moyenne de ${fmt(c.avgUtilizationRate)}% et un surplus cumulé de ${fmt(gap)} unités. Sur la période la plus favorable, ${fmt(gapPeriod.capacity)} unités disponibles couvrent ${fmt(gapPeriod.load)} unités de charge et laissent ${fmt(gapPeriod.capacityGap)} unités mobilisables pour absorber une demande supplémentaire ou soulager un autre centre.`,
      ar: c.isBottleneck
        ? `يتوفر مركز "${c.name}" على ${fmt(available)} وحدة مقابل حمل مطلوب قدره ${fmt(required)} وحدة، أي بمعدل استخدام متوسط قدره ${fmt(c.avgUtilizationRate)}%. ورغم أن رصيده التراكمي يترك هامشاً قدره ${fmt(Math.max(0, gap))} وحدة، فإنه يسجل عجزاً مؤقتاً في ${gapLabel}: لا تغطي الطاقة المتاحة البالغة ${fmt(gapPeriod.capacity)} وحدة سوى حملاً قدره ${fmt(gapPeriod.load)} وحدة، فتتبقى فجوة قدرها ${fmt(Math.abs(gapPeriod.capacityGap))} وحدة يجب استيعابها.`
        : `يتوفر مركز "${c.name}" على ${fmt(available)} وحدة مقابل حمل مطلوب قدره ${fmt(required)} وحدة، أي بمعدل استخدام متوسط قدره ${fmt(c.avgUtilizationRate)}% وفائض تراكمي قدره ${fmt(gap)} وحدة. وفي أكثر الفترات ملاءمة، تغطي الطاقة المتاحة البالغة ${fmt(gapPeriod.capacity)} وحدة حملاً قدره ${fmt(gapPeriod.load)} وحدة، وتترك ${fmt(gapPeriod.capacityGap)} وحدة يمكن استخدامها لاستيعاب طلب إضافي أو تخفيف الضغط عن مركز آخر.`,
    });
  }

  return lines;
}

// ── Bilingual dynamic recommendations generator ───────────────────────────────
export function generateCapacityRecommendations(
  results: CapacityResults,
  periodLabels: string[],
): Array<{ icon: string; fr: string; ar: string; descFr: string; descAr: string }> {
  const recos: Array<{ icon: string; fr: string; ar: string; descFr: string; descAr: string }> = [];
  const { centers, bottleneckCenterCount, overallStatus } = results;
  const formatRate = (value: number) => (isFinite(value) ? `${value.toFixed(1)}%` : "sans capacité disponible");

  const bottlenecks = centers.filter(c => c.isBottleneck);
  const underused   = centers.filter(c => c.status === "underused");
  const warnings    = centers.filter(c => c.status === "warning");

  if (bottleneckCenterCount === 0 && overallStatus === "good") {
    const totalCapacity = centers.reduce((sum, c) => sum + c.periods.reduce((s, p) => s + p.capacity, 0), 0);
    const totalLoad = centers.reduce((sum, c) => sum + c.periods.reduce((s, p) => s + p.load, 0), 0);
    const totalGap = totalCapacity - totalLoad;
    recos.push({
      icon: "✅",
      fr: "Maintenir l'équilibre actuel de la charge",
      ar: "الحفاظ على توازن الحمل الحالي",
      descFr: `Le plan laisse ${totalGap.toFixed(1)} unités de capacité disponible après couverture de ${totalLoad.toFixed(1)} unités de charge sur ${totalCapacity.toFixed(1)} unités. Conservez la répartition actuelle et vérifiez ces marges à chaque nouvelle période.`,
      descAr: `تترك الخطة ${totalGap.toFixed(1)} وحدة من الطاقة بعد تغطية حمل قدره ${totalLoad.toFixed(1)} وحدة من أصل ${totalCapacity.toFixed(1)} وحدة متاحة. حافظ على التوزيع الحالي وراجع هذه الهوامش مع كل فترة جديدة.`,
    });
    recos.push({
      icon: "📋",
      fr: "Mettre à jour le plan à chaque révision de la demande",
      ar: "تحديث الخطة مع كل مراجعة للطلب",
      descFr: "Réactualisez les charges dès qu'une commande importante est confirmée ou annulée afin de préserver le niveau de service sans laisser la marge disponible se réduire silencieusement.",
      descAr: "حدّث الأحمال فور تأكيد أو إلغاء طلب مهم للحفاظ على مستوى الخدمة ومنع تقلص الطاقة المتاحة دون ملاحظة.",
    });
    return recos;
  }

  // Bottleneck-specific recommendations
  for (const c of bottlenecks) {
    const maxPIdx = c.bottleneckPeriods.reduce(
      (best, p) => c.periods[p].utilizationRate > c.periods[best].utilizationRate ? p : best,
      c.bottleneckPeriods[0],
    );
    const peak = c.periods[maxPIdx];
    const excess = Math.abs(peak.capacityGap).toFixed(1);
    const periodLabel = periodLabels[maxPIdx];

    recos.push({
      icon: "🚨",
      fr: `Sécuriser la capacité du centre "${c.name}"`,
      ar: `تأمين طاقة المركز "${c.name}"`,
      descFr: `En ${periodLabel}, ${peak.capacity.toFixed(1)} unités disponibles doivent absorber ${peak.load.toFixed(1)} unités de charge, soit ${formatRate(peak.utilizationRate)} d'utilisation et ${excess} unités manquantes. Pour tenir le planning, programmez des heures supplémentaires, sous-traitez ce volume ou replanifiez une partie de la charge vers un centre disposant d'une marge.`,
      descAr: `في ${periodLabel}، يجب أن تغطي طاقة متاحة قدرها ${peak.capacity.toFixed(1)} وحدة حملاً قدره ${peak.load.toFixed(1)} وحدة، أي استخداماً بنسبة ${formatRate(peak.utilizationRate)} وفجوة قدرها ${excess} وحدة. للحفاظ على الخطة، برمج ساعات إضافية أو أسند هذا الحجم إلى طرف خارجي أو أعد جدولة جزء من الحمل نحو مركز لديه هامش.`,
    });
  }

  // Transfer load from bottlenecks to underused
  if (bottlenecks.length > 0 && underused.length > 0) {
    const fromNames   = bottlenecks.map(c => `"${c.name}"`).join(", ");
    const toNames     = underused.map(c => `"${c.name}" (${c.avgUtilizationRate.toFixed(1)}%)`).join(", ");
    const fromNamesAr = bottlenecks.map(c => `"${c.name}"`).join("، ");
    const toNamesAr   = underused.map(c => `"${c.name}" (${c.avgUtilizationRate.toFixed(1)}%)`).join("، ");
    recos.push({
      icon: "⚖️",
      fr: "Rééquilibrer la charge entre les centres",
      ar: "نقل الحمل إلى المراكز ذات الطاقة الفائضة",
      descFr: `Les centres surchargés (${fromNames}) peuvent transférer une partie de leur charge vers ${toNames}. Cette réaffectation utilise une marge déjà disponible et réduit le recours aux heures supplémentaires ou à la sous-traitance.`,
      descAr: `يمكن للمراكز المثقلة (${fromNamesAr}) تحويل جزء من حملها إلى ${toNamesAr}. ويستفيد هذا التوزيع من طاقة متاحة مسبقاً ويقلل الحاجة إلى الساعات الإضافية أو المناولة الخارجية.`,
    });
  }

  // Warning centres
  if (warnings.length > 0) {
    const names   = warnings.map(c => `"${c.name}" (${c.maxUtilizationRate.toFixed(1)}%)`).join(", ");
    const namesAr = warnings.map(c => `"${c.name}" (${c.maxUtilizationRate.toFixed(1)}%)`).join("، ");
    recos.push({
      icon: "⚠️",
      fr: "Préparer la prochaine hausse de charge",
      ar: "مراقبة المراكز المتوترة قبل الوصول إلى التشبع",
      descFr: `Les centres ${names} atteignent déjà leur période de charge maximale. Réservez dès maintenant une solution de débordement, comme un créneau supplémentaire ou une ressource de secours, avant que la demande ne dépasse leur capacité.`,
      descAr: `تقترب المراكز ${namesAr} من أعلى حمل لها. احجز من الآن حلاً احتياطياً، مثل فترة إضافية أو مورد بديل، قبل أن يتجاوز الطلب طاقتها.`,
    });
  }

  // Underused without bottleneck context
  if (underused.length > 0 && bottlenecks.length === 0) {
    const names   = underused.map(c => `"${c.name}"`).join(", ");
    const namesAr = underused.map(c => `"${c.name}"`).join("، ");
    recos.push({
      icon: "📉",
      fr: "Valoriser la marge des centres sous-utilisés",
      ar: "إعادة تخصيص طاقة المراكز المحملة بأقل من طاقتها",
      descFr: `Les centres ${names} disposent d'une marge importante. Affectez-leur en priorité les nouvelles commandes compatibles ou redéployez une partie de leurs ressources afin d'éviter de maintenir une capacité inutilisée.`,
      descAr: `تملك المراكز ${namesAr} هامشاً مهماً. وجّه إليها الطلبات الجديدة المتوافقة أولاً أو أعد توزيع جزء من مواردها لتجنب إبقاء طاقة غير مستغلة.`,
    });
  }

  // Always: update plan recommendation
  recos.push({
    icon: "🔄",
    fr: "Réviser le plan de charge à chaque changement de demande",
    ar: "مراجعة خطة التحميل مع كل تغيير في الطلب",
    descFr: "Recalculez le plan après chaque commande confirmée ou modification de délai afin de détecter une future insuffisance avant qu'elle ne se transforme en retard de production.",
    descAr: "أعد حساب الخطة بعد كل طلب مؤكد أو تغيير في الموعد لاكتشاف أي نقص قادم قبل أن يتحول إلى تأخير في الإنتاج.",
  });

  return recos;
}
