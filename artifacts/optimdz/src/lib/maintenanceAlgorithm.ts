// ── Types ─────────────────────────────────────────────────────────────────────

export interface EquipmentInput {
  id: string;
  name: string;
  tbf: string;    // Temps de bon fonctionnement cumulé (h)
  pannes: string; // Nombre de pannes
  ttr: string;    // Temps total de réparation cumulé (h)
}

export type EquipmentStatus = "ok" | "warning" | "critical" | "error";
export type ErrorKey = "zero_pannes" | "negative_values" | "empty" | "zero_tbf_mttr";

export interface EquipmentResult {
  id: string;
  name: string;
  tbf: number;
  pannes: number;
  ttr: number;
  mtbf: number | null;
  mttr: number | null;
  disponibilite: number | null; // 0–100
  status: EquipmentStatus;
  errorKey?: ErrorKey;
}

export interface MaintenanceResults {
  equipments: EquipmentResult[];
  fleetDisponibilite: number | null;
  fleetMtbf: number | null;
  fleetMttr: number | null;
  weakCount: number;     // disponibilite < 90
  criticalCount: number; // disponibilite < 80
}

export interface AnalysisLine {
  fr: string;
  ar: string;
}

export interface RecommendationItem {
  icon: string;
  fr: string;
  ar: string;
  descFr: string;
  descAr: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt1(n: number): string { return n.toFixed(1); }
function fmt2(n: number): string { return n.toFixed(2); }

function getStatus(disp: number): EquipmentStatus {
  if (disp >= 90) return "ok";
  if (disp >= 80) return "warning";
  return "critical";
}

function avg(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

// ── Core computation ──────────────────────────────────────────────────────────

export function computeMaintenance(inputs: EquipmentInput[]): MaintenanceResults {
  const equipments: EquipmentResult[] = inputs.map(eq => {
    const name = eq.name.trim() || "—";

    // Empty check
    if (eq.tbf === "" || eq.pannes === "" || eq.ttr === "") {
      return { id: eq.id, name, tbf: NaN, pannes: NaN, ttr: NaN, mtbf: null, mttr: null, disponibilite: null, status: "error" as const, errorKey: "empty" as const };
    }

    const tbf    = parseFloat(eq.tbf);
    const pannes = parseFloat(eq.pannes);
    const ttr    = parseFloat(eq.ttr);

    // NaN
    if (isNaN(tbf) || isNaN(pannes) || isNaN(ttr)) {
      return { id: eq.id, name, tbf: NaN, pannes: NaN, ttr: NaN, mtbf: null, mttr: null, disponibilite: null, status: "error" as const, errorKey: "empty" as const };
    }

    // Negative values
    if (tbf < 0 || pannes < 0 || ttr < 0) {
      return { id: eq.id, name, tbf, pannes, ttr, mtbf: null, mttr: null, disponibilite: null, status: "error" as const, errorKey: "negative_values" as const };
    }

    // Zero pannes — division impossible
    if (pannes === 0) {
      return { id: eq.id, name, tbf, pannes, ttr, mtbf: null, mttr: null, disponibilite: null, status: "error" as const, errorKey: "zero_pannes" as const };
    }

    const mtbf = tbf / pannes;
    const mttr = ttr / pannes;
    const denom = mtbf + mttr;
    const disponibilite = denom === 0 ? 0 : (mtbf / denom) * 100;
    const status = getStatus(disponibilite);

    return { id: eq.id, name, tbf, pannes, ttr, mtbf, mttr, disponibilite, status };
  });

  const valid = equipments.filter(e => e.status !== "error" && e.disponibilite !== null);

  const fleetDisponibilite = valid.length > 0 ? avg(valid.map(e => e.disponibilite!)) : null;
  const fleetMtbf          = valid.length > 0 ? avg(valid.map(e => e.mtbf!))         : null;
  const fleetMttr          = valid.length > 0 ? avg(valid.map(e => e.mttr!))         : null;
  const weakCount          = valid.filter(e => e.disponibilite! < 90).length;
  const criticalCount      = valid.filter(e => e.disponibilite! < 80).length;

  return { equipments, fleetDisponibilite, fleetMtbf, fleetMttr, weakCount, criticalCount };
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationError { fr: string; ar: string; }

export function validateInputs(inputs: EquipmentInput[]): ValidationError[] {
  const errors: ValidationError[] = [];

  if (inputs.length === 0) {
    errors.push({ fr: "Ajoutez au moins un équipement.", ar: "أضف معدة واحدة على الأقل." });
    return errors;
  }

  const unnamedIdx = inputs.findIndex(e => !e.name.trim());
  if (unnamedIdx !== -1) {
    errors.push({ fr: `L'équipement n°${unnamedIdx + 1} n'a pas de nom.`, ar: `المعدة رقم ${unnamedIdx + 1} ليس لها اسم.` });
  }

  // At least one fully valid row
  const hasValid = inputs.some(eq => {
    const tbf    = parseFloat(eq.tbf);
    const pannes = parseFloat(eq.pannes);
    const ttr    = parseFloat(eq.ttr);
    return !isNaN(tbf) && !isNaN(pannes) && !isNaN(ttr) && pannes > 0 && tbf >= 0 && ttr >= 0;
  });

  if (!hasValid) {
    errors.push({
      fr: "Aucun équipement ne contient des données valides. Vérifiez que le nombre de pannes est > 0 et que toutes les valeurs sont renseignées.",
      ar: "لا تحتوي أي معدة على بيانات صالحة. تحقق من أن عدد الأعطال > 0 وأن جميع القيم مُدخلة.",
    });
  }

  return errors;
}

// ── Analysis ──────────────────────────────────────────────────────────────────

export function generateMaintenanceAnalysis(results: MaintenanceResults): AnalysisLine[] {
  const valid = results.equipments.filter(e => e.status !== "error" && e.disponibilite !== null);

  if (valid.length === 0) {
    return [{ fr: "Aucune donnée valide à analyser.", ar: "لا توجد بيانات صالحة للتحليل." }];
  }

  const fleetAvailability = results.fleetDisponibilite ?? 0;
  const fleetMtbf = results.fleetMtbf ?? 0;
  const fleetMttr = results.fleetMttr ?? 0;
  const lines: AnalysisLine[] = [{
    fr: `Sur la flotte analysée, la disponibilité moyenne est de ${fmt2(fleetAvailability)}%. Les équipements fonctionnent en moyenne ${fmt1(fleetMtbf)} heures entre deux pannes et nécessitent ${fmt1(fleetMttr)} heures pour être remis en service. Plus les pannes sont rapprochées et les réparations longues, plus le risque d'arrêt de production augmente.`,
    ar: `بالنسبة إلى المعدات محل التحليل، يبلغ متوسط التوافرية ${fmt2(fleetAvailability)}%. وتعمل المعدات في المتوسط ${fmt1(fleetMtbf)} ساعة بين عطلين وتحتاج إلى ${fmt1(fleetMttr)} ساعة لإعادتها إلى الخدمة. وكلما تقاربت الأعطال وطالت الإصلاحات زاد خطر توقف الإنتاج.`,
  }];

  for (const equipment of valid) {
    const availability = equipment.disponibilite!;
    const statusFr = availability < 80
      ? `Avec une disponibilité de ${fmt2(availability)}%, « ${equipment.name} » est critique : ses arrêts peuvent perturber directement le programme de production et justifient une priorité de maintenance.`
      : availability < 90
        ? `Avec une disponibilité de ${fmt2(availability)}%, « ${equipment.name} » est préoccupant : sa marge avant un niveau critique est limitée et des arrêts répétés peuvent dégrader la régularité de la production.`
        : `Avec une disponibilité de ${fmt2(availability)}%, « ${equipment.name} » présente un niveau opérationnel maîtrisé et reste compatible avec une surveillance préventive régulière.`;
    const statusAr = availability < 80
      ? `وبمعدل توافرية قدره ${fmt2(availability)}%، تُعد « ${equipment.name} » حرجة؛ فقد تؤثر توقفاتها مباشرة في برنامج الإنتاج، ولذلك يجب أن تحظى بأولوية الصيانة.`
      : availability < 90
        ? `وبمعدل توافرية قدره ${fmt2(availability)}%، تُعد « ${equipment.name} » مقلقة؛ فهامشها قبل الوصول إلى المستوى الحرج محدود، وقد تؤثر الأعطال المتكررة في انتظام الإنتاج.`
        : `وبمعدل توافرية قدره ${fmt2(availability)}%، تحافظ « ${equipment.name} » على مستوى تشغيلي مضبوط، وتبقى مناسبة لمتابعة وقائية منتظمة.`;
    lines.push({
      fr: `« ${equipment.name} » tombe en panne en moyenne toutes les ${fmt1(equipment.mtbf!)} heures et sa réparation prend ${fmt1(equipment.mttr!)} heures. ${statusFr} Ces chiffres relient directement sa fiabilité au risque de temps d'arrêt et à la capacité réellement disponible.`,
      ar: `تتعطل « ${equipment.name} » في المتوسط كل ${fmt1(equipment.mtbf!)} ساعة، ويستغرق إصلاحها ${fmt1(equipment.mttr!)} ساعة. ${statusAr} وتربط هذه الأرقام مباشرة بين موثوقيتها وخطر وقت التوقف والطاقة المتاحة فعلياً.`,
    });
  }

  const highMttr = results.fleetMttr !== null && results.fleetMttr > 0
    ? valid.filter(e => e.mttr! > results.fleetMttr! * 1.5 && e.mttr! > 4)
    : [];
  if (highMttr.length > 0) {
    lines.push({
      fr: `Le délai de réparation est particulièrement long pour ${highMttr.map(e => `« ${e.name} » avec ${fmt1(e.mttr!)} heures`).join(" et ")}. Même lorsque la disponibilité reste correcte, chaque intervention immobilise plus longtemps la ressource ; les pièces, les compétences et le diagnostic doivent donc être préparés avant la prochaine panne.`,
      ar: `يستغرق الإصلاح وقتاً طويلاً بشكل خاص لدى ${highMttr.map(e => `« ${e.name} » بزمن قدره ${fmt1(e.mttr!)} ساعة`).join(" و")}. وحتى عندما تبقى التوافرية مقبولة، فإن كل تدخل يعطل المعدة مدة أطول؛ لذلك يجب تجهيز قطع الغيار والخبرات والتشخيص قبل العطل القادم.`,
    });
  }

  const errored = results.equipments.filter(e => e.status === "error");
  if (errored.length > 0) {
    lines.push({
      fr: `${errored.length} équipement(s) n'a pas pu être intégré à l'analyse : ${errored.map(e => `« ${e.name} »`).join(", ")}. Complétez ses données avant de décider afin de ne pas sous-estimer le risque d'arrêt.`,
      ar: `تعذر إدراج ${errored.length} معدة في التحليل: ${errored.map(e => `« ${e.name} »`).join("، ")}. أكمل بياناتها قبل اتخاذ القرار حتى لا يتم التقليل من خطر التوقف.`,
    });
  }

  return lines;
}

// ── Recommendations ───────────────────────────────────────────────────────────

export function generateMaintenanceRecommendations(results: MaintenanceResults): RecommendationItem[] {
  const recs: RecommendationItem[] = [];
  const valid = results.equipments.filter(e => e.status !== "error" && e.disponibilite !== null);

  if (valid.length === 0) return [];

  const avgMttr = results.fleetMttr ?? 0;

  const criticals = valid.filter(e => e.disponibilite! < 80);
  if (criticals.length > 0) {
    const criticalDetailsFr = criticals
      .map(eq => `« ${eq.name} » (${fmt2(eq.disponibilite!)}% disponible, ${fmt1(eq.mtbf!)} heures entre pannes, ${fmt1(eq.mttr!)} heures de réparation)`)
      .join(" ; ");
    const criticalDetailsAr = criticals
      .map(eq => `« ${eq.name} » (توافرية ${fmt2(eq.disponibilite!)}%، ${fmt1(eq.mtbf!)} ساعة بين الأعطال، ${fmt1(eq.mttr!)} ساعة للإصلاح)`)
      .join("؛ ");
    recs.push({
      icon: "🔴",
      fr: `Prioriser ${criticals.map(e => `« ${e.name} »`).join(" et ")} dans le programme de maintenance`,
      ar: `إعطاء الأولوية لـ ${criticals.map(e => `« ${e.name} »`).join(" و")} في برنامج الصيانة`,
      descFr: `${criticalDetailsFr}. Planifiez une inspection préventive hebdomadaire pour ces équipements, remplacez les pièces d'usure et réalisez un diagnostic complet avant le prochain cycle afin de réduire le risque d'arrêt prolongé.`,
      descAr: `${criticalDetailsAr}. برمج فحصاً وقائياً أسبوعياً لهذه المعدات، واستبدل قطع التآكل، وأنجز تشخيصاً شاملاً قبل الدورة القادمة لتقليل خطر التوقف الطويل.`,
    });
  }

  const warnings = valid.filter(e => e.disponibilite! >= 80 && e.disponibilite! < 90);
  if (warnings.length > 0) {
    const warningDetailsFr = warnings
      .map(eq => `« ${eq.name} » (${fmt2(eq.disponibilite!)}% disponible, ${fmt1(eq.mtbf!)} heures entre pannes, ${fmt1(eq.mttr!)} heures de réparation)`)
      .join(" ; ");
    const warningDetailsAr = warnings
      .map(eq => `« ${eq.name} » (توافرية ${fmt2(eq.disponibilite!)}%، ${fmt1(eq.mtbf!)} ساعة بين الأعطال، ${fmt1(eq.mttr!)} ساعة للإصلاح)`)
      .join("؛ ");
    recs.push({
      icon: "🟡",
      fr: `Renforcer la prévention sur ${warnings.map(e => `« ${e.name} »`).join(" et ")}`,
      ar: `تعزيز الصيانة الوقائية لـ ${warnings.map(e => `« ${e.name} »`).join(" و")}`,
      descFr: `${warningDetailsFr}. Ajoutez une inspection planifiée à chaque cycle, contrôlez les composants critiques et suivez l'évolution mensuelle avant que les arrêts ne deviennent plus fréquents.`,
      descAr: `${warningDetailsAr}. أضف فحصاً مبرمجاً في كل دورة، وراقب المكونات الحيوية، وتابع التطور الشهري قبل أن تصبح التوقفات أكثر تكراراً.`,
    });
  }

  if (avgMttr > 0) {
    const highMttr = valid.filter(e =>
      e.mttr! > avgMttr * 1.5 && e.mttr! > 4 && e.disponibilite! >= 90
    ).slice(0, 2);
    if (highMttr.length > 0) {
      const highMttrDetailsFr = highMttr
        .map(eq => `« ${eq.name} » (${fmt1(eq.mttr!)} heures contre ${fmt1(avgMttr)} heures en moyenne)`)
        .join(" ; ");
      const highMttrDetailsAr = highMttr
        .map(eq => `« ${eq.name} » (${fmt1(eq.mttr!)} ساعة مقابل ${fmt1(avgMttr)} ساعة في المتوسط)`)
        .join("؛ ");
      recs.push({
        icon: "🔧",
        fr: `Réduire le délai de remise en service des équipements concernés`,
        ar: `تقليص زمن إعادة المعدات المعنية إلى الخدمة`,
        descFr: `${highMttrDetailsFr}. Constituez un stock de pièces dédié et préparez les techniciens aux interventions rapides pour ramener ces délais sous ${fmt1(avgMttr * 1.2)} heures.`,
        descAr: `${highMttrDetailsAr}. كوّن مخزوناً مخصصاً من قطع الغيار وجهز الفنيين للتدخل السريع لخفض هذه الأزمنة إلى أقل من ${fmt1(avgMttr * 1.2)} ساعة.`,
      });
    }
  }

  const excellent = valid.filter(e => e.disponibilite! >= 95);
  if (excellent.length > 0 && recs.length < 6) {
    const namesFr = excellent.map(e => `« ${e.name} »`).join(", ");
    const namesAr = excellent.map(e => `« ${e.name} »`).join("، ");
    recs.push({
      icon: "✅",
      fr: `Maintenir les bonnes pratiques pour ${namesFr}`,
      ar: `الحفاظ على الممارسات الجيدة لـ ${namesAr}`,
      descFr: `${excellent.length > 1 ? "Ces équipements affichent" : "Cet équipement affiche"} une disponibilité d'au moins 95%. Conservez les révisions planifiées et documentez les pratiques qui limitent les arrêts afin de les reproduire sur les équipements moins performants.`,
      descAr: `${excellent.length > 1 ? "هذه المعدات تسجل" : "هذه المعدة تسجل"} توافرية لا تقل عن 95%. حافظ على المراجعات المقررة ووثق الممارسات التي تحد من التوقفات لتطبيقها على المعدات الأقل أداءً.`,
    });
  }

  if (recs.length === 0) {
    recs.push({
      icon: "✅",
      fr: "Flotte en bonne santé — maintenir la vigilance",
      ar: "الأسطول في حالة جيدة — الحفاظ على اليقظة",
      descFr: "Tous les équipements affichent une disponibilité d'au moins 90%. Maintenez les plannings de maintenance préventive actuels et mettez en place un suivi mensuel pour anticiper toute dérive des indicateurs.",
      descAr: "جميع المعدات تسجل توافرية لا تقل عن 90%. حافظ على برامج الصيانة الوقائية الحالية وأنشئ متابعة شهرية لاستباق أي انحراف في المؤشرات.",
    });
  }

  return recs;
}

// ── Industry templates ────────────────────────────────────────────────────────

let _uid = 0;
export function uid(): string { return `m${++_uid}`; }

export type SectorKey = "industrie" | "services" | "agriculture" | "custom";

export function buildTemplate(sector: SectorKey): EquipmentInput[] {
  if (sector === "industrie") {
    return [
      { id: uid(), name: "Compresseur A200",          tbf: "2100", pannes: "7",  ttr: "63"  },
      { id: uid(), name: "Tour CNC-12",               tbf: "900",  pannes: "9",  ttr: "270" },
      { id: uid(), name: "Convoyeur principal",        tbf: "2800", pannes: "4",  ttr: "12"  },
      { id: uid(), name: "Presse hydraulique HY-300", tbf: "560",  pannes: "14", ttr: "420" },
      { id: uid(), name: "Pompe de circulation P05",  tbf: "1500", pannes: "5",  ttr: "25"  },
    ];
  }
  if (sector === "services") {
    return [
      { id: uid(), name: "Ascenseur principal",       tbf: "3500", pannes: "5", ttr: "10"  },
      { id: uid(), name: "Groupe électrogène",        tbf: "1200", pannes: "6", ttr: "120" },
      { id: uid(), name: "Climatisation centrale",    tbf: "640",  pannes: "8", ttr: "240" },
      { id: uid(), name: "Chaudière CB-100",          tbf: "2400", pannes: "4", ttr: "16"  },
    ];
  }
  if (sector === "agriculture") {
    return [
      { id: uid(), name: "Tracteur T-150",                  tbf: "720",  pannes: "12", ttr: "120" },
      { id: uid(), name: "Moissonneuse-batteuse MB-8",       tbf: "400",  pannes: "8",  ttr: "200" },
      { id: uid(), name: "Système d'irrigation SI-3",        tbf: "2500", pannes: "5",  ttr: "25"  },
      { id: uid(), name: "Pompe hydraulique PH-2",           tbf: "1080", pannes: "6",  ttr: "54"  },
    ];
  }
  // custom — blank rows
  return [
    { id: uid(), name: "", tbf: "", pannes: "", ttr: "" },
    { id: uid(), name: "", tbf: "", pannes: "", ttr: "" },
    { id: uid(), name: "", tbf: "", pannes: "", ttr: "" },
  ];
}
