// ── Quality Control (Gestion de la Qualité / إدارة الجودة) — pure computation ──
// Supports two SPC chart types:
//   • X-bar chart  — monitors sample means for variable data
//   • P chart      — monitors defect rates (proportion nonconforming)
// No i18n here; all user-facing strings live in the UI layer.

// ── Chart type ────────────────────────────────────────────────────────────────
export type ChartType = "xbar" | "p";

// ── Input shapes ──────────────────────────────────────────────────────────────

export interface XbarSampleInput {
  id: string;
  label: string;           // e.g. "Éch. 1"
  measurements: string[];  // raw string values (UI strings → parsed in compute)
}

export interface PSampleInput {
  id: string;
  label: string;
  n: string;  // units inspected
  d: string;  // defects found
}

export interface XbarInputs {
  chartType: "xbar";
  problemName: string;
  samples: XbarSampleInput[];
  targetMean?: string;     // optional reference mean μ₀
}

export interface PInputs {
  chartType: "p";
  problemName: string;
  samples: PSampleInput[];
}

export type QualityInputs = XbarInputs | PInputs;

// ── Output shapes ─────────────────────────────────────────────────────────────

export interface XbarSampleResult {
  id: string;
  label: string;
  measurements: number[];
  sampleMean: number;       // x̄ᵢ
  sampleSize: number;       // nᵢ
  ucl: number;              // control limit for this sample (constant limits here)
  lcl: number;
  isOutOfControl: boolean;
  outDirection: "above" | "below" | null;
}

export interface XbarResults {
  chartType: "xbar";
  samples: XbarSampleResult[];
  grandMean: number;        // X̿ (mean of sample means)
  processStdDev: number;    // σ (pooled across all measurements)
  avgSampleSize: number;    // n̄
  ucl: number;              // X̿ + 3σ/√n̄
  lcl: number;              // X̿ − 3σ/√n̄
  targetMean: number | null;
  outOfControlCount: number;
  processStatus: "in-control" | "out-of-control";
}

export interface PSampleResult {
  id: string;
  label: string;
  n: number;
  d: number;
  rate: number;   // pᵢ = d/n
  ucl: number;    // p̄ + 3√(p̄(1-p̄)/nᵢ)
  lcl: number;    // max(0, p̄ − 3√(p̄(1-p̄)/nᵢ))
  isOutOfControl: boolean;
  outDirection: "above" | "below" | null;
}

export interface PResults {
  chartType: "p";
  samples: PSampleResult[];
  pBar: number;          // overall defect rate
  totalInspected: number;
  totalDefects: number;
  avgN: number;          // average sample size (for constant limit reference)
  uclConstant: number;   // limits at avgN (for chart display)
  lclConstant: number;
  outOfControlCount: number;
  processStatus: "in-control" | "out-of-control";
}

export type QualityResults = XbarResults | PResults;

// ── Validation ────────────────────────────────────────────────────────────────
export interface QualityValidationError {
  type: "no_samples" | "too_few_samples" | "empty_measurements" | "invalid_n" | "d_exceeds_n" | "zero_n";
  sampleLabel?: string;
  msgFr: string;
  msgAr: string;
}

export function validateInputs(inputs: QualityInputs): QualityValidationError[] {
  const errors: QualityValidationError[] = [];

  if (inputs.chartType === "xbar") {
    if (inputs.samples.length === 0) {
      errors.push({
        type: "no_samples",
        msgFr: "Aucun échantillon saisi. Ajoutez au moins 2 échantillons pour lancer l'analyse.",
        msgAr: "لم يتم إدخال أي عينة. أضف عينتين على الأقل لبدء التحليل.",
      });
      return errors;
    }
    if (inputs.samples.length < 2) {
      errors.push({
        type: "too_few_samples",
        msgFr: "Au moins 2 échantillons sont nécessaires pour construire la carte de contrôle.",
        msgAr: "يلزم وجود عينتين على الأقل لبناء بطاقة المراقبة.",
      });
    }
    for (const s of inputs.samples) {
      const validMeasurements = s.measurements.filter(v => v.trim() !== "" && !isNaN(parseFloat(v)));
      if (validMeasurements.length === 0) {
        errors.push({
          type: "empty_measurements",
          sampleLabel: s.label,
          msgFr: `L'échantillon "${s.label}" ne contient aucune mesure valide. Saisissez au moins une valeur numérique.`,
          msgAr: `العينة "${s.label}" لا تحتوي على أي قياس صالح. أدخل قيمة رقمية واحدة على الأقل.`,
        });
      }
    }
  } else {
    if (inputs.samples.length === 0) {
      errors.push({
        type: "no_samples",
        msgFr: "Aucun échantillon saisi. Ajoutez au moins 2 échantillons pour lancer l'analyse.",
        msgAr: "لم يتم إدخال أي عينة. أضف عينتين على الأقل لبدء التحليل.",
      });
      return errors;
    }
    if (inputs.samples.length < 2) {
      errors.push({
        type: "too_few_samples",
        msgFr: "Au moins 2 échantillons sont nécessaires pour construire la carte P.",
        msgAr: "يلزم وجود عينتين على الأقل لبناء بطاقة P.",
      });
    }
    for (const s of inputs.samples) {
      const n = parseFloat(s.n);
      const d = parseFloat(s.d);
      if (!s.n.trim() || isNaN(n) || n <= 0) {
        errors.push({
          type: "zero_n",
          sampleLabel: s.label,
          msgFr: `L'échantillon "${s.label}" : la taille (n) doit être un entier positif.`,
          msgAr: `العينة "${s.label}": يجب أن يكون حجم الفحص (n) عدداً صحيحاً موجباً.`,
        });
      } else if (!s.d.trim() || isNaN(d) || d < 0) {
        errors.push({
          type: "invalid_n",
          sampleLabel: s.label,
          msgFr: `L'échantillon "${s.label}" : le nombre de défauts (d) doit être ≥ 0.`,
          msgAr: `العينة "${s.label}": يجب أن يكون عدد العيوب (d) ≥ 0.`,
        });
      } else if (d > n) {
        errors.push({
          type: "d_exceeds_n",
          sampleLabel: s.label,
          msgFr: `L'échantillon "${s.label}" : le nombre de défauts (${d}) ne peut pas dépasser la taille de l'échantillon (${n}).`,
          msgAr: `العينة "${s.label}": عدد العيوب (${d}) لا يمكن أن يتجاوز حجم الفحص (${n}).`,
        });
      }
    }
  }

  return errors;
}

// ── Math helpers ──────────────────────────────────────────────────────────────
function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[], mu: number): number {
  if (arr.length <= 1) return 0;
  const variance = arr.reduce((s, x) => s + (x - mu) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

// ── X-bar computation ─────────────────────────────────────────────────────────
export function computeXbar(inputs: XbarInputs): XbarResults {
  // Parse all measurements
  const parsedSamples = inputs.samples.map(s => ({
    id: s.id,
    label: s.label,
    measurements: s.measurements
      .filter(v => v.trim() !== "" && !isNaN(parseFloat(v)))
      .map(v => parseFloat(v)),
  }));

  // Grand mean from sample means (not from individual measurements) — standard SPC practice
  const sampleMeans = parsedSamples.map(s => mean(s.measurements));
  const grandMean   = mean(sampleMeans);

  // Pooled process std dev from ALL individual measurements
  const allMeasurements = parsedSamples.flatMap(s => s.measurements);
  const totalMu = mean(allMeasurements);
  const sigma   = stdDev(allMeasurements, totalMu);

  // Average sample size
  const avgN = mean(parsedSamples.map(s => s.measurements.length));

  // Control limits  (X-bar limits use σ/√n̄)
  const sigmaOfMeans = avgN > 0 ? sigma / Math.sqrt(avgN) : sigma;
  const ucl = grandMean + 3 * sigmaOfMeans;
  const lcl = grandMean - 3 * sigmaOfMeans;

  const targetMean = inputs.targetMean && !isNaN(parseFloat(inputs.targetMean))
    ? parseFloat(inputs.targetMean)
    : null;

  const sampleResults: XbarSampleResult[] = parsedSamples.map((s, i) => {
    const sm = sampleMeans[i];
    const isAbove = sm > ucl;
    const isBelow = sm < lcl;
    return {
      id: s.id,
      label: s.label,
      measurements: s.measurements,
      sampleMean: sm,
      sampleSize: s.measurements.length,
      ucl,
      lcl,
      isOutOfControl: isAbove || isBelow,
      outDirection: isAbove ? "above" : isBelow ? "below" : null,
    };
  });

  const outOfControlCount = sampleResults.filter(s => s.isOutOfControl).length;

  return {
    chartType: "xbar",
    samples: sampleResults,
    grandMean,
    processStdDev: sigma,
    avgSampleSize: avgN,
    ucl,
    lcl,
    targetMean,
    outOfControlCount,
    processStatus: outOfControlCount === 0 ? "in-control" : "out-of-control",
  };
}

// ── P chart computation ───────────────────────────────────────────────────────
export function computeP(inputs: PInputs): PResults {
  const parsedSamples = inputs.samples.map(s => ({
    id: s.id,
    label: s.label,
    n: Math.round(Math.max(1, parseFloat(s.n) || 1)),
    d: Math.max(0, parseFloat(s.d) || 0),
  }));

  const totalInspected = parsedSamples.reduce((a, s) => a + s.n, 0);
  const totalDefects   = parsedSamples.reduce((a, s) => a + s.d, 0);
  const pBar = totalInspected > 0 ? totalDefects / totalInspected : 0;
  const avgN = mean(parsedSamples.map(s => s.n));

  // Constant limits at avgN (for reference line on chart)
  const sigma_pBar_avg = avgN > 0 ? Math.sqrt(pBar * (1 - pBar) / avgN) : 0;
  const uclConstant = Math.min(1, pBar + 3 * sigma_pBar_avg);
  const lclConstant = Math.max(0, pBar - 3 * sigma_pBar_avg);

  const sampleResults: PSampleResult[] = parsedSamples.map(s => {
    const rate = s.n > 0 ? s.d / s.n : 0;
    const sigma_i = s.n > 0 ? Math.sqrt(pBar * (1 - pBar) / s.n) : 0;
    const ucl = Math.min(1, pBar + 3 * sigma_i);
    const lcl = Math.max(0, pBar - 3 * sigma_i);
    const isAbove = rate > ucl;
    const isBelow = lcl > 0 && rate < lcl;
    return {
      id: s.id,
      label: s.label,
      n: s.n,
      d: s.d,
      rate,
      ucl,
      lcl,
      isOutOfControl: isAbove || isBelow,
      outDirection: isAbove ? "above" : isBelow ? "below" : null,
    };
  });

  const outOfControlCount = sampleResults.filter(s => s.isOutOfControl).length;

  return {
    chartType: "p",
    samples: sampleResults,
    pBar,
    totalInspected,
    totalDefects,
    avgN,
    uclConstant,
    lclConstant,
    outOfControlCount,
    processStatus: outOfControlCount === 0 ? "in-control" : "out-of-control",
  };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────
export function computeQualityControl(inputs: QualityInputs): QualityResults {
  if (inputs.chartType === "xbar") return computeXbar(inputs);
  return computeP(inputs);
}

// ── Analysis generator ────────────────────────────────────────────────────────
export function generateQualityAnalysis(
  results: QualityResults,
): Array<{ fr: string; ar: string }> {
  const lines: Array<{ fr: string; ar: string }> = [];

  if (results.chartType === "xbar") {
    const r = results as XbarResults;
    const outPoints = r.samples.filter(s => s.isOutOfControl);
    const pointDetailsFr = outPoints.map(s =>
      s.outDirection === "above"
        ? `"${s.label}" affiche une moyenne de ${s.sampleMean.toFixed(3)}, au-dessus de la limite supérieure ${s.ucl.toFixed(3)}`
        : `"${s.label}" affiche une moyenne de ${s.sampleMean.toFixed(3)}, en dessous de la limite inférieure ${s.lcl.toFixed(3)}`
    ).join("; ");
    const pointDetailsAr = outPoints.map(s =>
      s.outDirection === "above"
        ? `العينة "${s.label}" تسجل متوسطاً قدره ${s.sampleMean.toFixed(3)}، أعلى من الحد العلوي ${s.ucl.toFixed(3)}`
        : `العينة "${s.label}" تسجل متوسطاً قدره ${s.sampleMean.toFixed(3)}، أدنى من الحد السفلي ${s.lcl.toFixed(3)}`
    ).join("؛ ");

    lines.push({
      fr: r.processStatus === "in-control"
        ? `Le processus est sous contrôle sur les ${r.samples.length} échantillons : toutes les moyennes restent entre ${r.lcl.toFixed(3)} et ${r.ucl.toFixed(3)}. La moyenne générale de ${r.grandMean.toFixed(3)} et l'écart-type de ${r.processStdDev.toFixed(3)} décrivent un procédé stable pour la période observée.`
        : `Le processus présente une dérive sur ${r.outOfControlCount} échantillon(s) parmi ${r.samples.length}. La moyenne générale est de ${r.grandMean.toFixed(3)} et les limites observées vont de ${r.lcl.toFixed(3)} à ${r.ucl.toFixed(3)} ; ce signal indique qu'une cause particulière a probablement perturbé le procédé.`,
      ar: r.processStatus === "in-control"
        ? `العملية تحت السيطرة في العينات الـ${r.samples.length}؛ فجميع المتوسطات تقع بين ${r.lcl.toFixed(3)} و${r.ucl.toFixed(3)}. ويصف المتوسط العام البالغ ${r.grandMean.toFixed(3)} والانحراف المعياري البالغ ${r.processStdDev.toFixed(3)} عملية مستقرة خلال الفترة الملاحظة.`
        : `تظهر العملية انحرافاً في ${r.outOfControlCount} عينة من أصل ${r.samples.length}. يبلغ المتوسط العام ${r.grandMean.toFixed(3)}، وتمتد الحدود المرصودة من ${r.lcl.toFixed(3)} إلى ${r.ucl.toFixed(3)}؛ وتشير هذه الإشارة إلى سبب خاص أثّر في العملية.`,
    });

    if (outPoints.length > 0) {
      lines.push({
        fr: `Les points concernés sont ${pointDetailsFr}. En pratique, un point au-dessus de la limite traduit une production momentanément trop élevée, tandis qu'un point en dessous traduit une baisse inhabituelle ; ces écarts peuvent signaler un réglage machine, une matière, un outil ou une méthode différente.`,
        ar: `النقاط المعنية هي: ${pointDetailsAr}. عملياً، يشير تجاوز الحد العلوي إلى إنتاج أعلى من المستوى المعتاد مؤقتاً، بينما يشير النزول تحت الحد السفلي إلى انخفاض غير معتاد؛ وقد تكشف هذه الانحرافات ضبطاً مختلفاً للآلة أو مادة أو أداة أو طريقة عمل مختلفة.`,
      });
      lines.push({
        fr: `Pour sécuriser la production, isolez les lots associés aux points hors limites, vérifiez l'étalonnage et le réglage au moment du prélèvement, puis comparez l'opérateur, la machine et la matière utilisés. La correction doit être confirmée par un nouvel échantillon avant de revenir à la cadence normale.`,
        ar: `لتأمين الإنتاج، اعزل الدفعات المرتبطة بالنقاط الخارجة عن الحدود، وتحقق من معايرة وضبط الآلة وقت أخذ العينة، ثم قارن المشغل والآلة والمادة المستخدمة. ويجب تأكيد التصحيح بعينة جديدة قبل العودة إلى وتيرة الإنتاج العادية.`,
      });
    } else {
      lines.push({
        fr: `La dispersion mesurée est de ${r.processStdDev.toFixed(3)} pour une taille moyenne de ${r.avgSampleSize.toFixed(1)} mesure(s) par échantillon ; l'écart entre les deux limites est de ${(r.ucl - r.lcl).toFixed(3)} unité(s). Le procédé est suffisamment régulier pour poursuivre la surveillance, tout en recherchant progressivement une réduction de la variabilité.`,
        ar: `يبلغ تشتت القياسات ${r.processStdDev.toFixed(3)} مع متوسط حجم قدره ${r.avgSampleSize.toFixed(1)} قياس لكل عينة؛ ويبلغ الفرق بين الحدين ${(r.ucl - r.lcl).toFixed(3)} وحدة. لذلك تبدو العملية منتظمة بما يكفي لمواصلة المراقبة، مع السعي تدريجياً إلى تقليل التباين.`,
      });
    }

    if (r.targetMean !== null) {
      const diff = Math.abs(r.grandMean - r.targetMean);
      lines.push({
        fr: diff < 0.001
          ? `La moyenne générale de ${r.grandMean.toFixed(3)} est alignée sur la cible de ${r.targetMean.toFixed(3)}, ce qui confirme que le centrage du procédé correspond à l'objectif défini.`
          : `La moyenne générale de ${r.grandMean.toFixed(3)} s'écarte de la cible ${r.targetMean.toFixed(3)} de ${diff.toFixed(3)} unité(s). Même si les points restent dans les limites, ce décalage mérite un ajustement du réglage pour rapprocher la production du niveau attendu.`,
        ar: diff < 0.001
          ? `المتوسط العام ${r.grandMean.toFixed(3)} منسجم مع القيمة المستهدفة ${r.targetMean.toFixed(3)}، مما يؤكد أن تمركز العملية يطابق الهدف المحدد.`
          : `ينحرف المتوسط العام ${r.grandMean.toFixed(3)} عن الهدف ${r.targetMean.toFixed(3)} بمقدار ${diff.toFixed(3)} وحدة. وحتى إذا بقيت النقاط داخل الحدود، فإن هذا الفرق يستحق تعديل الضبط لتقريب الإنتاج من المستوى المتوقع.`,
      });
    }

  } else {
    const r = results as PResults;
    const pPct = (r.pBar * 100).toFixed(2);
    const outPoints = r.samples.filter(s => s.isOutOfControl);
    const pointDetailsFr = outPoints.map(s =>
      s.outDirection === "above"
        ? `"${s.label}" présente ${s.d} défaut(s) sur ${s.n} unité(s), soit ${(s.rate * 100).toFixed(2)} %, au-dessus de la limite ${(
          s.ucl * 100
        ).toFixed(2)} %`
        : `"${s.label}" présente ${s.d} défaut(s) sur ${s.n} unité(s), soit ${(s.rate * 100).toFixed(2)} %, en dessous de la limite ${(
          s.lcl * 100
        ).toFixed(2)} %`
    ).join("; ");
    const pointDetailsAr = outPoints.map(s =>
      s.outDirection === "above"
        ? `"${s.label}" تسجل ${s.d} عيب من أصل ${s.n} وحدة، أي ${(s.rate * 100).toFixed(2)}%، أعلى من الحد ${(s.ucl * 100).toFixed(2)}%`
        : `"${s.label}" تسجل ${s.d} عيب من أصل ${s.n} وحدة، أي ${(s.rate * 100).toFixed(2)}%، أدنى من الحد ${(s.lcl * 100).toFixed(2)}%`
    ).join("؛ ");

    lines.push({
      fr: r.processStatus === "in-control"
        ? `Le processus de conformité est sous contrôle : les ${r.samples.length} échantillons restent dans leurs limites, avec ${r.totalDefects} défaut(s) sur ${r.totalInspected} unité(s) inspectée(s), soit un taux moyen de ${pPct} %. La situation est stable pour la période et ne montre pas de cause particulière nécessitant une intervention immédiate.`
        : `Le processus de conformité est hors contrôle : ${r.outOfControlCount} échantillon(s) sur ${r.samples.length} dépassent les limites. Sur ${r.totalInspected} unité(s) inspectée(s), ${r.totalDefects} défaut(s) ont été relevés, soit un taux moyen de ${pPct} % ; la qualité n'est donc pas homogène sur toute la période.`,
      ar: r.processStatus === "in-control"
        ? `عملية المطابقة تحت السيطرة؛ فالعينات الـ${r.samples.length} تبقى داخل حدودها، مع تسجيل ${r.totalDefects} عيب من أصل ${r.totalInspected} وحدة مفحوصة، أي معدل متوسط قدره ${pPct}%. الوضع مستقر خلال الفترة ولا يظهر سبباً خاصاً يستدعي تدخلاً فورياً.`
        : `عملية المطابقة خارج السيطرة؛ إذ تتجاوز ${r.outOfControlCount} عينة من أصل ${r.samples.length} الحدود. ومن أصل ${r.totalInspected} وحدة مفحوصة، سُجل ${r.totalDefects} عيب، أي معدل متوسط قدره ${pPct}%؛ وهذا يعني أن الجودة ليست متجانسة طوال الفترة.`,
    });

    if (outPoints.length > 0) {
      lines.push({
        fr: `Les points concernés sont ${pointDetailsFr}. Un taux supérieur à sa limite signale un pic de non-conformités à relier au lot, à l'équipe, à la machine ou à la matière ; un taux inférieur doit être vérifié pour confirmer qu'il provient bien d'une amélioration et non d'un changement de contrôle ou d'une erreur de saisie.`,
        ar: `النقاط المعنية هي: ${pointDetailsAr}. ويشير المعدل الأعلى من حده إلى ذروة في عدم المطابقة يجب ربطها بالدفعة أو الفريق أو الآلة أو المادة؛ أما المعدل الأدنى فيجب التحقق منه للتأكد من أنه تحسن حقيقي وليس نتيجة تغيير في الفحص أو خطأ في الإدخال.`,
      });
      lines.push({
        fr: `La mesure corrective prioritaire consiste à isoler les lots liés aux points signalés, vérifier les enregistrements de production et lancer une recherche de cause avec l'équipe qualité. Après correction, reprenez un échantillon comparable pour confirmer que le taux revient dans les limites avant de libérer les lots concernés.`,
        ar: `يتمثل الإجراء التصحيحي الأول في عزل الدفعات المرتبطة بالنقاط المشار إليها، ومراجعة سجلات الإنتاج، وبدء بحث عن السبب مع فريق الجودة. وبعد التصحيح، أعد فحص عينة مماثلة للتأكد من عودة المعدل إلى الحدود قبل تحرير الدفعات المعنية.`,
      });
    } else {
      lines.push({
        fr: `Le taux moyen de ${pPct} % repose sur des lots de taille moyenne de ${r.avgN.toFixed(1)} unité(s), avec des limites de référence comprises entre ${(r.lclConstant * 100).toFixed(2)} % et ${(r.uclConstant * 100).toFixed(2)} %. Le niveau est maîtrisé sur la période ; conservez la même discipline de contrôle pour détecter rapidement une future dérive.`,
        ar: `يعتمد المعدل المتوسط البالغ ${pPct}% على دفعات بمتوسط حجم ${r.avgN.toFixed(1)} وحدة، مع حدود مرجعية بين ${(r.lclConstant * 100).toFixed(2)}% و${(r.uclConstant * 100).toFixed(2)}%. المستوى مضبوط خلال الفترة؛ فحافظ على نفس انضباط الفحص لاكتشاف أي انحراف مستقبلي بسرعة.`,
      });
    }
  }

  return lines;
}

// ── Recommendations generator ─────────────────────────────────────────────────
export function generateQualityRecommendations(
  results: QualityResults,
): Array<{ icon: string; fr: string; ar: string; descFr: string; descAr: string }> {
  const recos: Array<{ icon: string; fr: string; ar: string; descFr: string; descAr: string }> = [];

  if (results.chartType === "xbar") {
    const r = results as XbarResults;
    const aboveUCL = r.samples.filter(s => s.outDirection === "above");
    const belowLCL = r.samples.filter(s => s.outDirection === "below");

    if (r.processStatus === "in-control") {
      recos.push({
        icon: "✅",
        fr: "Maintenir la surveillance continue du processus",
        ar: "الحفاظ على المراقبة المستمرة للعملية",
        descFr: `Le processus est stable dans ses limites (X̿ = ${r.grandMean.toFixed(3)}, σ = ${r.processStdDev.toFixed(3)}). Continuez à prélever des échantillons à intervalles réguliers pour détecter toute dérive précoce.`,
        descAr: `العملية مستقرة ضمن حدودها (X̿ = ${r.grandMean.toFixed(3)}، σ = ${r.processStdDev.toFixed(3)}). استمر في أخذ العينات بفترات منتظمة للكشف المبكر عن أي انجراف.`,
      });
      recos.push({
        icon: "📉",
        fr: "Réduire la variabilité pour améliorer la capabilité",
        ar: "تقليل التباين لتحسين قدرة العملية",
        descFr: "Même sous contrôle, cherchez à réduire σ en standardisant les procédures opératoires, en formant les opérateurs et en contrôlant les matières premières.",
        descAr: "حتى تحت السيطرة، اسعَ إلى تقليص σ من خلال توحيد إجراءات التشغيل وتدريب المشغلين ومراقبة المواد الأولية.",
      });
    }

    if (aboveUCL.length > 0) {
      const labels = aboveUCL.map(s => `"${s.label}"`).join(", ");
      const labelsAr = aboveUCL.map(s => `"${s.label}"`).join("، ");
      recos.push({
        icon: "🔴",
        fr: `Investiguer les dépassements de l'UCL (${aboveUCL.length} échantillon(s))`,
        ar: `التحقيق في تجاوزات UCL (${aboveUCL.length} عينة)`,
        descFr: `Les échantillons ${labels} dépassent la limite supérieure de contrôle. Causes typiques : matière première non conforme, usure des outillages, réglage machine incorrect. Déclenchez une analyse des causes racines (5M / Ishikawa) immédiatement.`,
        descAr: `العينات ${labelsAr} تتجاوز حد السيطرة العلوي. الأسباب الشائعة: مواد أولية غير مطابقة، تآكل الأدوات، ضبط خاطئ للآلة. أطلق تحليل الأسباب الجذرية (5M / إيشيكاوا) فوراً.`,
      });
    }

    if (belowLCL.length > 0) {
      const labels = belowLCL.map(s => `"${s.label}"`).join(", ");
      const labelsAr = belowLCL.map(s => `"${s.label}"`).join("، ");
      recos.push({
        icon: "🔵",
        fr: `Analyser les valeurs sous la LCL (${belowLCL.length} échantillon(s))`,
        ar: `تحليل القيم دون LCL (${belowLCL.length} عينة)`,
        descFr: `Les échantillons ${labels} sont anormalement bas. Vérifiez si la mesure est correcte (appareil étalonné ?). Si confirmé, identifiez la cause positive (meilleure matière, meilleure pratique) et capitalisez dessus.`,
        descAr: `العينات ${labelsAr} منخفضة بشكل غير طبيعي. تحقق من صحة القياس (الجهاز معايَر؟). إذا تأكد، حدد السبب الإيجابي (مادة أفضل، ممارسة أفضل) واستفد منه.`,
      });
    }

    if (r.targetMean !== null && Math.abs(r.grandMean - r.targetMean) > 0.001) {
      const direction = r.grandMean > r.targetMean ? "haute" : "basse";
      const directionAr = r.grandMean > r.targetMean ? "عالية" : "منخفضة";
      recos.push({
        icon: "🎯",
        fr: `Recentrer le processus sur la valeur cible (${r.targetMean})`,
        ar: `إعادة توسيط العملية حول القيمة المرجعية (${r.targetMean})`,
        descFr: `La moyenne générale (${r.grandMean.toFixed(3)}) est ${direction} par rapport à la cible (${r.targetMean}). Ajustez les paramètres de réglage de la machine ou de la recette pour corriger cette dérive systématique.`,
        descAr: `المتوسط العام (${r.grandMean.toFixed(3)}) ${directionAr} بالنسبة للهدف (${r.targetMean}). اضبط معاملات ضبط الآلة أو الوصفة لتصحيح هذا الانجراف المنتظم.`,
      });
    }

  } else {
    const r = results as PResults;
    const aboveUCL = r.samples.filter(s => s.outDirection === "above");
    const belowLCL = r.samples.filter(s => s.outDirection === "below");
    const pPct = (r.pBar * 100).toFixed(2);

    if (r.processStatus === "in-control") {
      recos.push({
        icon: "✅",
        fr: "Maintenir la cadence de contrôle qualité actuelle",
        ar: "الحفاظ على وتيرة مراقبة الجودة الحالية",
        descFr: `Le taux de défauts est stable à p̄ = ${pPct}%. Continuez à inspecter aux mêmes fréquences et documentez les résultats pour détecter toute tendance émergente.`,
        descAr: `معدل العيوب مستقر عند p̄ = ${pPct}%. استمر في الفحص بنفس التردد ووثّق النتائج للكشف عن أي اتجاه ناشئ.`,
      });
    }

    if (r.pBar > 0.1) {
      recos.push({
        icon: "⚠️",
        fr: `Réduire le taux de défauts global (p̄ = ${pPct}%)`,
        ar: `خفض معدل العيوب الإجمالي (p̄ = ${pPct}%)`,
        descFr: `Un taux de ${pPct}% indique qu'environ ${Math.round(r.pBar * 1000)} produits sur 1000 sont non conformes. Lancez un projet d'amélioration (DMAIC ou Kaizen) pour identifier et éliminer les causes racines de non-conformité.`,
        descAr: `معدل ${pPct}% يعني أن حوالي ${Math.round(r.pBar * 1000)} منتج من كل 1000 غير مطابق. أطلق مشروع تحسين (DMAIC أو Kaizen) لتحديد وإزالة الأسباب الجذرية لعدم المطابقة.`,
      });
    }

    if (aboveUCL.length > 0) {
      const labels = aboveUCL.map(s => `"${s.label}" (${(s.rate * 100).toFixed(1)}%)`).join(", ");
      const labelsAr = aboveUCL.map(s => `"${s.label}" (${(s.rate * 100).toFixed(1)}%)`).join("، ");
      recos.push({
        icon: "🔴",
        fr: `Analyser les pics de défauts (${aboveUCL.length} échantillon(s) hors UCL)`,
        ar: `تحليل ذروات العيوب (${aboveUCL.length} عينة فوق UCL)`,
        descFr: `Les échantillons ${labels} présentent un taux de défauts anormalement élevé. Isolez les lots correspondants, identifiez les conditions de production à ce moment-là (équipe, machine, matière) et déclenchez une analyse 5 Pourquoi.`,
        descAr: `العينات ${labelsAr} لديها معدل عيوب مرتفع بشكل غير طبيعي. اعزل الدفعات المقابلة وحدد ظروف الإنتاج في ذلك الوقت (فريق، آلة، مادة) وأطلق تحليل "5 لماذا".`,
      });
    }

    if (belowLCL.length > 0) {
      const labels = belowLCL.map(s => `"${s.label}"`).join(", ");
      const labelsAr = belowLCL.map(s => `"${s.label}"`).join("، ");
      recos.push({
        icon: "🟢",
        fr: `Capitaliser sur les résultats exceptionnellement bons (${belowLCL.length} échantillon(s) sous LCL)`,
        ar: `الاستفادة من النتائج الاستثنائية الجيدة (${belowLCL.length} عينة دون LCL)`,
        descFr: `Les échantillons ${labels} affichent des taux de défauts anormalement bas. Investiguez les conditions de production à ces moments précis — si elles sont identifiables, standardisez-les comme bonnes pratiques.`,
        descAr: `العينات ${labelsAr} تُظهر معدلات عيوب منخفضة بشكل غير عادي. تحقق من ظروف الإنتاج في تلك اللحظات — إن كانت قابلة للتحديد، قم بتوحيدها كممارسات جيدة.`,
      });
    }

    recos.push({
      icon: "📋",
      fr: "Renforcer la traçabilité et la fréquence d'échantillonnage",
      ar: "تعزيز إمكانية التتبع وتكرار أخذ العينات",
      descFr: "Pour un contrôle par carte P efficace, prélevez au minimum 25 échantillons avec n ≥ 50 unités chacun. Assurez l'enregistrement systématique des non-conformités avec la date, l'équipe et la machine.",
      descAr: "للتحكم الفعّال ببطاقة P، خذ 25 عينة على الأقل مع n ≥ 50 وحدة لكل منها. تأكد من التسجيل المنتظم لحالات عدم المطابقة مع التاريخ والفريق والآلة.",
    });
  }

  // Always: continuous improvement
  recos.push({
    icon: "🔄",
    fr: "Mettre à jour la carte à chaque nouveau cycle de production",
    ar: "تحديث البطاقة مع كل دورة إنتاج جديدة",
    descFr: "Les cartes de contrôle perdent leur utilité si elles ne sont pas actualisées régulièrement. Intégrez la mise à jour des données dans la routine de fin de poste ou de fin de journée.",
    descAr: "تفقد بطاقات المراقبة فائدتها إن لم تُحدَّث بانتظام. ادمج تحديث البيانات في روتين نهاية المناوبة أو نهاية اليوم.",
  });

  return recos;
}
