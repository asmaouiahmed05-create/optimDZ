// —— Strategic Analysis SWOT/PESTEL (Analyse stratégique / التحليل الاستراتيجي) — pure computation ——————
// IFE/EFE matrix scoring + dynamic TOWS cross-strategy matrix.
// Handles any combination of populated/empty categories gracefully.
// No i18n here; all user-facing strings live in the UI layer.

export type SwotCategory = "strength" | "weakness" | "opportunity" | "threat";

// PESTEL dimension is optional metadata for external factors (opportunity/threat),
// giving the analysis a macro-environmental lens without changing the core scoring.
export type PestelDimension =
  | "political"
  | "economic"
  | "social"
  | "technological"
  | "environmental"
  | "legal";

export interface FactorInput {
  id: string;
  category: SwotCategory;
  label: string;
  weight: number; // relative importance (0 to 1) — each internal/external group should sum to 1
  rating: number; // 1 to 4
  pestelDimension?: PestelDimension; // only meaningful for opportunity/threat
}

// —— Output shapes ——————

export type StrategicQuadrant = "offensive" | "conservative" | "competitive" | "defensive";

export interface SwotResult {
  ifeScore: number;
  efeScore: number;
  topStrength: FactorInput | null;
  topWeakness: FactorInput | null;
  topOpportunity: FactorInput | null;
  topThreat: FactorInput | null;
  quadrant: StrategicQuadrant;
  populatedCategories: SwotCategory[]; // which of the 4 categories actually have data
  pestelCoverage: Partial<Record<PestelDimension, number>>; // count of external factors per PESTEL dimension
}

export interface TowsStrategyLine {
  fr: string;
  ar: string;
  basedOn: { a: string; b: string }; // the two factor labels combined
}

export interface TowsMatrix {
  so: TowsStrategyLine[]; // Strengths x Opportunities
  wo: TowsStrategyLine[]; // Weaknesses x Opportunities
  st: TowsStrategyLine[]; // Strengths x Threats
  wt: TowsStrategyLine[]; // Weaknesses x Threats
  skippedNotes: Array<{ fr: string; ar: string }>; // explains any quadrant skipped due to missing data
}

// —— Validation ——————

export interface ValidationError {
  type: "empty" | "missing_fields" | "invalid_rating" | "weight_sum";
  group?: "internal" | "external";
  msgFr: string;
  msgAr: string;
}

export function validateSwotInput(factors: FactorInput[]): ValidationError[] {
  const errors: ValidationError[] = [];

  if (factors.length === 0) {
    errors.push({
      type: "empty",
      msgFr: "Aucun facteur saisi. Ajoutez au moins un facteur dans au moins une catégorie.",
      msgAr: "لم يتم إدخال أي عامل. أضف عاملاً واحدًا على الأقل في فئة واحدة على الأقل.",
    });
    return errors;
  }

  for (const f of factors) {
    if (!f.label.trim()) {
      errors.push({
        type: "missing_fields",
        msgFr: "Un facteur n'a pas de description. Veuillez nommer tous les facteurs.",
        msgAr: "يوجد عامل بدون وصف. يرجى تسمية جميع العوامل.",
      });
    }
    if (f.rating < 1 || f.rating > 4) {
      errors.push({
        type: "invalid_rating",
        msgFr: `Le facteur "${f.label || "?"}" a une note hors de l'intervalle 1-4.`,
        msgAr: `العامل "${f.label || "?"}" له تقييم خارج المجال 1-4.`,
      });
    }
  }

  // Weight-sum checks only apply when a group actually has factors —
  // a group with zero factors is valid (handled gracefully downstream), not an error.
  const internal = factors.filter((f) => f.category === "strength" || f.category === "weakness");
  const external = factors.filter((f) => f.category === "opportunity" || f.category === "threat");

  if (internal.length > 0) {
    const internalWeight = internal.reduce((s, f) => s + f.weight, 0);
    if (Math.abs(internalWeight - 1) > 0.05) {
      errors.push({
        type: "weight_sum",
        group: "internal",
        msgFr: `La somme des poids des forces/faiblesses est ${internalWeight.toFixed(2)} au lieu de 1.00. Ajustez les poids.`,
        msgAr: `مجموع أوزان القوة/الضعف هو ${internalWeight.toFixed(2)} بدل 1.00. اضبط الأوزان.`,
      });
    }
  }
  if (external.length > 0) {
    const externalWeight = external.reduce((s, f) => s + f.weight, 0);
    if (Math.abs(externalWeight - 1) > 0.05) {
      errors.push({
        type: "weight_sum",
        group: "external",
        msgFr: `La somme des poids des opportunités/menaces est ${externalWeight.toFixed(2)} au lieu de 1.00. Ajustez les poids.`,
        msgAr: `مجموع أوزان الفرص/التهديدات هو ${externalWeight.toFixed(2)} بدل 1.00. اضبط الأوزان.`,
      });
    }
  }

  return errors;
}

// —— Computation ——————

function weightedScore(factors: FactorInput[]): number {
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  if (totalWeight === 0) return 0;
  const raw = factors.reduce((sum, f) => sum + f.weight * f.rating, 0);
  return raw / totalWeight;
}

// Returns factors of a category ranked from "most significant" to "least",
// where significant means highest weighted impact for strength/opportunity,
// and lowest rating (= most severe) for weakness/threat.
function getRanked(factors: FactorInput[], category: SwotCategory): FactorInput[] {
  const filtered = factors.filter((f) => f.category === category);
  if (category === "strength" || category === "opportunity") {
    return [...filtered].sort((a, b) => b.weight * b.rating - a.weight * a.rating);
  }
  return [...filtered].sort((a, b) => a.rating - b.rating);
}

function determineQuadrant(ife: number, efe: number): StrategicQuadrant {
  const ifeHigh = ife >= 2.5;
  const efeHigh = efe >= 2.5;
  if (ifeHigh && efeHigh) return "offensive";
  if (!ifeHigh && efeHigh) return "conservative";
  if (ifeHigh && !efeHigh) return "competitive";
  return "defensive";
}

export function computeSwotAnalysis(factors: FactorInput[]): SwotResult {
  const internal = factors.filter((f) => f.category === "strength" || f.category === "weakness");
  const external = factors.filter((f) => f.category === "opportunity" || f.category === "threat");

  // IFE/EFE default to the neutral midpoint (2.5) when a group has no data yet,
  // so the quadrant calculation stays meaningful instead of collapsing to 0.
  const ifeScore = internal.length > 0 ? Math.round(weightedScore(internal) * 100) / 100 : 2.5;
  const efeScore = external.length > 0 ? Math.round(weightedScore(external) * 100) / 100 : 2.5;

  const rankedStrength = getRanked(factors, "strength");
  const rankedWeakness = getRanked(factors, "weakness");
  const rankedOpportunity = getRanked(factors, "opportunity");
  const rankedThreat = getRanked(factors, "threat");

  const populatedCategories: SwotCategory[] = [];
  if (rankedStrength.length > 0) populatedCategories.push("strength");
  if (rankedWeakness.length > 0) populatedCategories.push("weakness");
  if (rankedOpportunity.length > 0) populatedCategories.push("opportunity");
  if (rankedThreat.length > 0) populatedCategories.push("threat");

  const pestelCoverage: Partial<Record<PestelDimension, number>> = {};
  for (const f of external) {
    if (f.pestelDimension) {
      pestelCoverage[f.pestelDimension] = (pestelCoverage[f.pestelDimension] ?? 0) + 1;
    }
  }

  return {
    ifeScore,
    efeScore,
    topStrength: rankedStrength[0] ?? null,
    topWeakness: rankedWeakness[0] ?? null,
    topOpportunity: rankedOpportunity[0] ?? null,
    topThreat: rankedThreat[0] ?? null,
    quadrant: determineQuadrant(ifeScore, efeScore),
    populatedCategories,
    pestelCoverage,
  };
}

// —— Dynamic TOWS cross-strategy matrix ——————
// Combines ranked factors pairwise (rank-1 with rank-1, rank-2 with rank-2, up to `maxPerQuadrant`)
// so the number of strategies scales naturally with how much data the user entered —
// one strategy if there's one factor on each side, more if there's more, none if a side is empty.

export function generateTowsMatrix(factors: FactorInput[], maxPerQuadrant: number = 2): TowsMatrix {
  const strengths = getRanked(factors, "strength");
  const weaknesses = getRanked(factors, "weakness");
  const opportunities = getRanked(factors, "opportunity");
  const threats = getRanked(factors, "threat");

  const skippedNotes: Array<{ fr: string; ar: string }> = [];

  const pairUp = (
    listA: FactorInput[],
    listB: FactorInput[],
    build: (a: FactorInput, b: FactorInput) => { fr: string; ar: string },
  ): TowsStrategyLine[] => {
    const count = Math.min(maxPerQuadrant, listA.length, listB.length);
    const lines: TowsStrategyLine[] = [];
    for (let i = 0; i < count; i++) {
      const { fr, ar } = build(listA[i], listB[i]);
      lines.push({ fr, ar, basedOn: { a: listA[i].label, b: listB[i].label } });
    }
    return lines;
  };

  const so = pairUp(strengths, opportunities, (s, o) => ({
    fr: `Utiliser "${s.label}" pour saisir pleinement l'opportunité "${o.label}".`,
    ar: `استخدام "${s.label}" لاستغلال فرصة "${o.label}" بالكامل.`,
  }));
  if (so.length === 0) {
    skippedNotes.push({
      fr: "Stratégies SO indisponibles : aucune force et/ou opportunité saisie pour l'instant.",
      ar: "استراتيجيات SO غير متاحة: لم تُدخل أي قوة و/أو فرصة بعد.",
    });
  }

  const wo = pairUp(weaknesses, opportunities, (w, o) => ({
    fr: `Corriger "${w.label}" afin de pouvoir exploiter l'opportunité "${o.label}" sans être freiné.`,
    ar: `معالجة "${w.label}" لتتمكن المؤسسة من استغلال فرصة "${o.label}" دون عائق.`,
  }));
  if (wo.length === 0) {
    skippedNotes.push({
      fr: "Stratégies WO indisponibles : aucune faiblesse et/ou opportunité saisie pour l'instant.",
      ar: "استراتيجيات WO غير متاحة: لم يُدخل أي ضعف و/أو فرصة بعد.",
    });
  }

  const st = pairUp(strengths, threats, (s, t) => ({
    fr: `S'appuyer sur "${s.label}" pour limiter l'impact de la menace "${t.label}".`,
    ar: `الاعتماد على "${s.label}" للحد من تأثير تهديد "${t.label}".`,
  }));
  if (st.length === 0) {
    skippedNotes.push({
      fr: "Stratégies ST indisponibles : aucune force et/ou menace saisie pour l'instant.",
      ar: "استراتيجيات ST غير متاحة: لم تُدخل أي قوة و/أو تهديد بعد.",
    });
  }

  const wt = pairUp(weaknesses, threats, (w, t) => ({
    fr: `Réduire en priorité "${w.label}" pour ne pas s'exposer davantage à la menace "${t.label}".`,
    ar: `تقليص "${w.label}" كأولوية لتجنّب زيادة التعرض لتهديد "${t.label}".`,
  }));
  if (wt.length === 0) {
    skippedNotes.push({
      fr: "Stratégies WT indisponibles : aucune faiblesse et/ou menace saisie pour l'instant.",
      ar: "استراتيجيات WT غير متاحة: لم يُدخل أي ضعف و/أو تهديد بعد.",
    });
  }

  return { so, wo, st, wt, skippedNotes };
}

// —— Bilingual analysis generator ——————

const QUADRANT_LABELS: Record<StrategicQuadrant, { fr: string; ar: string }> = {
  offensive: { fr: "Offensif", ar: "هجومي" },
  conservative: { fr: "Conservateur", ar: "تحفظي" },
  competitive: { fr: "Compétitif", ar: "تنافسي" },
  defensive: { fr: "Défensif", ar: "دفاعي" },
};

const QUADRANT_DESCRIPTIONS: Record<StrategicQuadrant, { fr: string; ar: string }> = {
  offensive: {
    fr: "l'entreprise dispose de forces internes solides dans un environnement externe favorable — une stratégie de croissance et d'expansion est justifiée.",
    ar: "تملك المؤسسة نقاط قوة داخلية واضحة في بيئة خارجية مواتية — استراتيجية النمو والتوسع مبررة.",
  },
  conservative: {
    fr: "l'environnement externe est favorable mais les capacités internes restent limitées — la priorité est de renforcer l'interne avant d'exploiter pleinement les opportunités.",
    ar: "البيئة الخارجية مواتية لكن القدرات الداخلية محدودة — الأولوية لتقوية الجانب الداخلي قبل استغلال الفرص بالكامل.",
  },
  competitive: {
    fr: "l'entreprise est forte en interne mais l'environnement externe est difficile — l'accent doit porter sur la défense de la position actuelle.",
    ar: "المؤسسة قوية داخليًا لكن البيئة الخارجية صعبة — التركيز يجب أن ينصب على الدفاع عن الموقع الحالي.",
  },
  defensive: {
    fr: "les capacités internes et l'environnement externe posent tous deux problème — la priorité est la stabilisation avant toute expansion.",
    ar: "القدرات الداخلية والبيئة الخارجية تشكلان تحديًا معًا — الأولوية للاستقرار قبل أي توسع.",
  },
};

const PESTEL_LABELS: Record<PestelDimension, { fr: string; ar: string }> = {
  political: { fr: "politique", ar: "سياسي" },
  economic: { fr: "économique", ar: "اقتصادي" },
  social: { fr: "social", ar: "اجتماعي" },
  technological: { fr: "technologique", ar: "تكنولوجي" },
  environmental: { fr: "environnemental", ar: "بيئي" },
  legal: { fr: "légal", ar: "قانوني" },
};

export function generateSwotAnalysis(result: SwotResult): Array<{ fr: string; ar: string }> {
  const lines: Array<{ fr: string; ar: string }> = [];
  const qLabel = QUADRANT_LABELS[result.quadrant];
  const qDesc = QUADRANT_DESCRIPTIONS[result.quadrant];

  lines.push({
    fr: `📊 Score interne (IFE) : ${result.ifeScore.toFixed(2)}/4. Score externe (EFE) : ${result.efeScore.toFixed(2)}/4 — l'entreprise se situe en position "${qLabel.fr}".`,
    ar: `📊 النتيجة الداخلية (IFE): ${result.ifeScore.toFixed(2)}/4. النتيجة الخارجية (EFE): ${result.efeScore.toFixed(2)}/4 — تقع المؤسسة في موقع "${qLabel.ar}".`,
  });

  lines.push({ fr: `ℹ️ ${qDesc.fr}`, ar: `ℹ️ ${qDesc.ar}` });

  if (result.topStrength) {
    lines.push({
      fr: `🟢 Force principale : "${result.topStrength.label}".`,
      ar: `🟢 أبرز نقطة قوة: "${result.topStrength.label}".`,
    });
  }
  if (result.topWeakness) {
    lines.push({
      fr: `🟠 Faiblesse principale : "${result.topWeakness.label}", à traiter en priorité.`,
      ar: `🟠 أبرز نقطة ضعف: "${result.topWeakness.label}"، تستدعي معالجة أولوية.`,
    });
  }
  if (result.topOpportunity) {
    lines.push({
      fr: `🔵 Opportunité principale : "${result.topOpportunity.label}".`,
      ar: `🔵 أهم فرصة: "${result.topOpportunity.label}".`,
    });
  }
  if (result.topThreat) {
    lines.push({
      fr: `🔴 Menace principale : "${result.topThreat.label}", à surveiller de près.`,
      ar: `🔴 أخطر تهديد: "${result.topThreat.label}"، يستدعي متابعة دقيقة.`,
    });
  }

  // PESTEL macro-environmental coverage summary (only if any external factor tagged one)
  const pestelEntries = Object.entries(result.pestelCoverage) as [PestelDimension, number][];
  if (pestelEntries.length > 0) {
    const parts = pestelEntries
      .sort((a, b) => b[1] - a[1])
      .map(([dim, count]) => `${PESTEL_LABELS[dim].fr} (${count})`);
    const partsAr = pestelEntries
      .sort((a, b) => b[1] - a[1])
      .map(([dim, count]) => `${PESTEL_LABELS[dim].ar} (${count})`);
    lines.push({
      fr: `🌍 Répartition PESTEL des facteurs externes : ${parts.join(", ")}.`,
      ar: `🌍 توزيع العوامل الخارجية حسب PESTEL: ${partsAr.join("، ")}.`,
    });
  }

  // Explicitly note any category left empty, so the report never silently omits context.
  const allCategories: SwotCategory[] = ["strength", "weakness", "opportunity", "threat"];
  const missing = allCategories.filter((c) => !result.populatedCategories.includes(c));
  if (missing.length > 0) {
    const namesFr: Record<SwotCategory, string> = {
      strength: "forces",
      weakness: "faiblesses",
      opportunity: "opportunités",
      threat: "menaces",
    };
    const namesAr: Record<SwotCategory, string> = {
      strength: "القوة",
      weakness: "الضعف",
      opportunity: "الفرص",
      threat: "التهديدات",
    };
    lines.push({
      fr: `⚪ Catégorie(s) non renseignée(s) pour l'instant : ${missing.map((c) => namesFr[c]).join(", ")}. L'analyse ci-dessus reste valable mais partielle.`,
      ar: `⚪ فئة (فئات) لم تُدخل بعد: ${missing.map((c) => namesAr[c]).join("، ")}. التحليل أعلاه صالح لكنه جزئي.`,
    });
  }

  return lines;
}

// —— Bilingual TOWS strategy rendering (recommendations replacement) ——————

export function generateSwotRecommendations(
  factors: FactorInput[],
): Array<{ icon: string; fr: string; ar: string; descFr: string; descAr: string }> {
  const matrix = generateTowsMatrix(factors);
  const recos: Array<{ icon: string; fr: string; ar: string; descFr: string; descAr: string }> = [];

  matrix.so.forEach((line, i) => {
    recos.push({
      icon: "🚀",
      fr: `Stratégie SO ${i + 1} : Offensive`,
      ar: `استراتيجية SO ${i + 1}: هجومية`,
      descFr: line.fr,
      descAr: line.ar,
    });
  });
  matrix.wo.forEach((line, i) => {
    recos.push({
      icon: "🛠️",
      fr: `Stratégie WO ${i + 1} : Réorientation`,
      ar: `استراتيجية WO ${i + 1}: إعادة توجيه`,
      descFr: line.fr,
      descAr: line.ar,
    });
  });
  matrix.st.forEach((line, i) => {
    recos.push({
      icon: "🛡️",
      fr: `Stratégie ST ${i + 1} : Défensive`,
      ar: `استراتيجية ST ${i + 1}: دفاعية`,
      descFr: line.fr,
      descAr: line.ar,
    });
  });
  matrix.wt.forEach((line, i) => {
    recos.push({
      icon: "⚠️",
      fr: `Stratégie WT ${i + 1} : Survie`,
      ar: `استراتيجية WT ${i + 1}: بقاء`,
      descFr: line.fr,
      descAr: line.ar,
    });
  });

  matrix.skippedNotes.forEach((note) => {
    recos.push({
      icon: "⚪",
      fr: "Donnée manquante",
      ar: "بيانات ناقصة",
      descFr: note.fr,
      descAr: note.ar,
    });
  });

  return recos;
}
