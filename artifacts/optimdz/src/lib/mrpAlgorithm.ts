// ── MRP (Material Requirements Planning) — pure computation ──────────────────
// No i18n here; all user-facing strings live in the UI layer.

export type PeriodType = "semaines" | "mois";

// ── Input shapes ──────────────────────────────────────────────────────────────
export interface MrpComponent {
  id: string;
  name: string;
  qtyPerUnit: number;    // quantity needed per unit of finished product
  stockInitial: number;
  leadTime: number;       // in periods
  lotSize: number;        // 0 = lot-for-lot (order exactly net need); else round up
}

export interface MrpProduct {
  id: string;
  name: string;
  demands: number[];      // one value per period
  stockInitial: number;
  leadTime: number;       // in periods
  lotSize: number;        // 0 = lot-for-lot
  components: MrpComponent[];
}

export interface MrpInputs {
  problemName: string;
  periodType: PeriodType;
  periodCount: number;
  products: MrpProduct[];
}

// ── Output shapes ─────────────────────────────────────────────────────────────
export interface MrpRowResult {
  besoinsBruts: number;       // gross requirements
  stockDisponible: number;    // projected available at end of period
  besoinsNets: number;        // net requirements (before new receipt)
  ordreReception: number;     // planned order receipt (arrives this period)
  ordreLancement: number;     // planned order launch (placed this period for future receipt)
}

export interface MrpAlert {
  type: "late_order";
  itemName: string;
  msgFr: string;
  msgAr: string;
}

export interface MrpItemResult {
  id: string;
  name: string;
  isComponent: boolean;
  parentName?: string;
  rows: MrpRowResult[];
  totalOrders: number;    // sum of all order receipts (units)
  lateOrders: number;     // count of orders that need launch before period 1 (urgent)
}

export interface MrpResults {
  periodLabels: string[];
  items: MrpItemResult[];
  alerts: MrpAlert[];
  totalOrdersPlanned: number;
  urgentItemCount: number;
}

// ── Core single-level MRP engine ──────────────────────────────────────────────
function runMrp(
  grossRequirements: number[],
  stockInitial: number,
  leadTime: number,
  lotSize: number,
): { rows: MrpRowResult[]; orderLaunches: number[]; lateOrders: number } {
  const n = grossRequirements.length;
  const orderReceipts = new Array(n).fill(0);
  const orderLaunches = new Array(n).fill(0);
  let lateOrders = 0;
  let prevSD = stockInitial;
  const rows: MrpRowResult[] = [];

  for (let p = 0; p < n; p++) {
    const bb = Math.max(0, grossRequirements[p]);
    // Net requirement = max(0, gross – available stock carried from previous period)
    const bn = Math.max(0, bb - prevSD);

    if (bn > 0) {
      // Round up to lot size (1 = lot-for-lot = order exactly bn)
      const effLot = lotSize > 0 ? lotSize : 1;
      const receipt = Math.ceil(bn / effLot) * effLot;
      orderReceipts[p] = receipt;

      // Schedule the launch leadTime periods before the needed receipt
      const launchP = p - leadTime;
      if (launchP >= 0) {
        orderLaunches[launchP] += receipt;
      } else {
        // Order should have been placed before the planning horizon starts
        lateOrders++;
      }
    }

    const sd = prevSD - bb + orderReceipts[p];
    rows.push({
      besoinsBruts: bb,
      stockDisponible: Math.max(0, sd),
      besoinsNets: bn,
      ordreReception: orderReceipts[p],
      ordreLancement: orderLaunches[p],
    });
    prevSD = Math.max(0, sd);
  }

  return { rows, orderLaunches, lateOrders };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function buildPeriodLabels(periodType: PeriodType, count: number): string[] {
  const prefix = periodType === "semaines" ? "S" : "M";
  return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
}

// ── Main MRP explosion ────────────────────────────────────────────────────────
export function computeMrp(inputs: MrpInputs): MrpResults {
  const { periodCount, products } = inputs;
  const periodLabels = buildPeriodLabels(inputs.periodType, periodCount);

  const items: MrpItemResult[] = [];
  const alerts: MrpAlert[] = [];
  let totalOrdersPlanned = 0;
  let urgentItemCount = 0;

  for (const product of products) {
    // Pad demands to periodCount
    const demands = Array.from({ length: periodCount }, (_, i) => product.demands[i] ?? 0);

    const { rows, orderLaunches, lateOrders } = runMrp(
      demands, product.stockInitial, product.leadTime, product.lotSize,
    );

    const totalOrders = rows.reduce((s, r) => s + r.ordreReception, 0);
    totalOrdersPlanned += totalOrders;

    if (lateOrders > 0) {
      urgentItemCount++;
      alerts.push({
        type: "late_order",
        itemName: product.name,
        msgFr: `${product.name} : ${lateOrders} ordre(s) doit être lancé avant le début de l'horizon de planification. Action immédiate requise.`,
        msgAr: `${product.name} : يجب إطلاق ${lateOrders} أمر(أوامر) قبل بداية أفق التخطيط. إجراء فوري مطلوب.`,
      });
    }

    items.push({
      id: product.id,
      name: product.name,
      isComponent: false,
      rows,
      totalOrders,
      lateOrders,
    });

    // MRP explosion: derive component gross requirements from parent order launches
    for (const comp of product.components) {
      const compGrossReqs = orderLaunches.map(launch => launch * comp.qtyPerUnit);

      const compRes = runMrp(
        compGrossReqs, comp.stockInitial, comp.leadTime, comp.lotSize,
      );

      const compTotal = compRes.rows.reduce((s, r) => s + r.ordreReception, 0);
      totalOrdersPlanned += compTotal;

      if (compRes.lateOrders > 0) {
        urgentItemCount++;
        alerts.push({
          type: "late_order",
          itemName: comp.name,
          msgFr: `Composant "${comp.name}" (→ ${product.name}) : ${compRes.lateOrders} ordre(s) hors horizon de planification.`,
          msgAr: `مكوّن "${comp.name}" (← ${product.name}) : ${compRes.lateOrders} أمر(أوامر) خارج أفق التخطيط.`,
        });
      }

      items.push({
        id: `${product.id}-${comp.id}`,
        name: comp.name,
        isComponent: true,
        parentName: product.name,
        rows: compRes.rows,
        totalOrders: compTotal,
        lateOrders: compRes.lateOrders,
      });
    }
  }

  return { periodLabels, items, alerts, totalOrdersPlanned, urgentItemCount };
}

export function mrpOverallStatus(r: MrpResults): "good" | "warning" | "critical" {
  if (r.urgentItemCount > 0) return "critical";
  if (r.totalOrdersPlanned > 0) return "warning";
  return "good";
}

// ── Bilingual analysis & recommendations generators ───────────────────────────
export function generateMrpAnalysis(results: MrpResults): Array<{ fr: string; ar: string }> {
  const lines: Array<{ fr: string; ar: string }> = [];
  const labels = results.periodLabels;
  const periodRange = labels.length > 1
    ? `${labels[0]} à ${labels[labels.length - 1]}`
    : labels[0] ?? "la période analysée";
  const totalGross = results.items.reduce(
    (sum, item) => sum + item.rows.reduce((itemSum, row) => itemSum + row.besoinsBruts, 0),
    0,
  );
  const totalNet = results.items.reduce(
    (sum, item) => sum + item.rows.reduce((itemSum, row) => itemSum + row.besoinsNets, 0),
    0,
  );
  const totalReceipts = results.items.reduce(
    (sum, item) => sum + item.rows.reduce((itemSum, row) => itemSum + row.ordreReception, 0),
    0,
  );

  lines.push({
    fr: `Sur la période ${periodRange}, le plan prévoit ${totalGross} unités de besoins bruts et ${totalNet} unités de besoins nets après prise en compte des stocks disponibles. Il déclenche ${totalReceipts} unités de production ou d'approvisionnement pour ${results.items.length} articles, dont ${results.totalOrdersPlanned} unités réceptionnées dans le calendrier calculé. ${results.urgentItemCount > 0 ? `${results.urgentItemCount} article(s) doivent toutefois être traités avant le début de l'horizon, car leur délai ne permet plus de respecter le premier besoin.` : "Aucune commande ne doit être lancée avant le début de l'horizon, ce qui rend le calendrier exploitable tel quel pour cette période."}`,
    ar: `خلال الفترة ${periodRange}، تُظهر الخطة احتياجات إجمالية قدرها ${totalGross} وحدة واحتياجات صافية قدرها ${totalNet} وحدة بعد احتساب المخزون المتاح. وتبرمج ${totalReceipts} وحدة للإنتاج أو التوريد عبر ${results.items.length} أصناف، منها ${results.totalOrdersPlanned} وحدة مستلمة وفق الجدول المحسوب. ${results.urgentItemCount > 0 ? `لكن يجب معالجة ${results.urgentItemCount} صنف(أصناف) قبل بداية الأفق، لأن مدة التوريد لا تسمح باحترام أول احتياج.` : "ولا يوجد أي أمر يجب إطلاقه قبل بداية الأفق، لذلك يمكن تنفيذ الجدول كما هو خلال هذه الفترة."}`,
  });

  for (const item of results.items) {
    const gross = item.rows.reduce((sum, row) => sum + row.besoinsBruts, 0);
    const net = item.rows.reduce((sum, row) => sum + row.besoinsNets, 0);
    const receipts = item.rows
      .map((row, index) => row.ordreReception > 0 ? `${labels[index]} : ${row.ordreReception}` : "")
      .filter(Boolean)
      .join(", ");
    const launches = item.rows
      .map((row, index) => row.ordreLancement > 0 ? `${labels[index]} : ${row.ordreLancement}` : "")
      .filter(Boolean)
      .join(", ");
    const endingStock = item.rows.at(-1)?.stockDisponible ?? 0;
    const descriptorFr = item.isComponent ? `Le composant "${item.name}"` : `Le produit fini "${item.name}"`;
    const descriptorAr = item.isComponent ? `المكوّن "${item.name}"` : `المنتج النهائي "${item.name}"`;

    lines.push({
      fr: `${descriptorFr}${item.parentName ? `, utilisé dans "${item.parentName}",` : ""} cumule ${gross} unités de besoins bruts et ${net} unités de besoins nets sur ${periodRange}. Les réceptions prévues sont ${receipts || "nulles"} et les lancements correspondants sont ${launches || "aucun"} ; le stock disponible en fin d'horizon est de ${endingStock} unité(s). ${item.lateOrders > 0 ? `${item.lateOrders} ordre(s) doivent être lancés avant le début de la période : le risque porte donc sur la continuité de production dès le premier besoin.` : item.totalOrders > 0 ? `Ce calendrier indique précisément quand engager ${item.totalOrders} unité(s) pour couvrir la demande sans attendre une rupture.` : "Le stock existant couvre les besoins de l'horizon sans nouvel ordre."}`,
      ar: `${descriptorAr}${item.parentName ? ` المستخدم في "${item.parentName}"` : ""} يسجل ${gross} وحدة من الاحتياجات الإجمالية و${net} وحدة من الاحتياجات الصافية خلال ${periodRange}. الاستلامات المبرمجة هي ${receipts || "لا توجد"} والإطلاقات المقابلة هي ${launches || "لا توجد"}، بينما يبلغ المخزون المتاح في نهاية الأفق ${endingStock} وحدة. ${item.lateOrders > 0 ? `يجب إطلاق ${item.lateOrders} أمر(أوامر) قبل بداية الفترة، ولذلك يكمن الخطر في استمرارية الإنتاج منذ أول احتياج.` : item.totalOrders > 0 ? `يوضح هذا الجدول متى يجب تدبير ${item.totalOrders} وحدة لتغطية الطلب قبل حدوث أي نفاد.` : "يغطي المخزون الحالي احتياجات الأفق دون إصدار أمر جديد."}`,
    });
  }

  const tightComponents = results.items.filter(item =>
    item.isComponent && (item.lateOrders > 0 || item.rows.some(row => row.besoinsNets > 0)),
  );
  if (tightComponents.length > 0) {
    const criticalFr = tightComponents.map(item => {
      const net = item.rows.reduce((sum, row) => sum + row.besoinsNets, 0);
      const gross = item.rows.reduce((sum, row) => sum + row.besoinsBruts, 0);
      return `"${item.name}" (${gross} brutes, ${net} nettes${item.lateOrders > 0 ? ", lancement urgent" : ""})`;
    }).join(", ");
    const criticalAr = tightComponents.map(item => {
      const net = item.rows.reduce((sum, row) => sum + row.besoinsNets, 0);
      const gross = item.rows.reduce((sum, row) => sum + row.besoinsBruts, 0);
      return `"${item.name}" (${gross} إجمالية، ${net} صافية${item.lateOrders > 0 ? "، إطلاق عاجل" : ""})`;
    }).join("، ");
    lines.push({
      fr: `Les composants les plus contraints sont ${criticalFr}. Ils conditionnent directement les produits finis associés : une réception tardive ou insuffisante sur l'un d'eux décalera le programme, même si la demande de produits finis est correctement planifiée.`,
      ar: `المكونات الأكثر ضغطاً هي ${criticalAr}. وهي تؤثر مباشرة في المنتجات النهائية المرتبطة بها؛ فأي استلام متأخر أو غير كافٍ لأحدها سيؤخر البرنامج حتى لو كان طلب المنتجات النهائية مخططاً بشكل صحيح.`,
    });
  } else {
    lines.push({
      fr: "Aucun composant ne présente de besoin net sur cet horizon : les stocks disponibles couvrent les besoins calculés et la contrainte matière ne bloque pas le programme.",
      ar: "لا يظهر أي مكوّن باحتياج صافٍ خلال هذا الأفق؛ فالمخزونات المتاحة تغطي الاحتياجات المحسوبة ولا يمثل جانب المواد عائقاً للبرنامج.",
    });
  }

  return lines;
}

export function generateMrpRecommendations(
  results: MrpResults,
): Array<{ icon: string; fr: string; ar: string; descFr: string; descAr: string }> {
  const recos: Array<{ icon: string; fr: string; ar: string; descFr: string; descAr: string }> = [];
  const labels = results.periodLabels;
  const formatSchedule = (item: MrpItemResult, key: "ordreReception" | "ordreLancement") =>
    item.rows
      .map((row, index) => row[key] > 0 ? `${labels[index]} : ${row[key]}` : "")
      .filter(Boolean)
      .join(", ");

  if (results.urgentItemCount > 0) {
    const urgentItems = results.items.filter(item => item.lateOrders > 0);
    recos.push({
      icon: "🚨",
      fr: "Sécuriser immédiatement les articles hors délai",
      ar: "تأمين الأصناف المتجاوزة للمهلة فوراً",
      descFr: `${urgentItems.map(item => `"${item.name}" (${item.lateOrders} ordre(s) hors horizon)`).join(", ")} nécessitent une action avant ${labels[0] ?? "la première période"}. Contactez le fournisseur, utilisez une source alternative ou lancez la fabrication en priorité pour éviter que le premier besoin ne bloque toute la séquence.`,
      descAr: `تحتاج ${urgentItems.map(item => `"${item.name}" (${item.lateOrders} أمر(أوامر) خارج الأفق)`).join("، ")} إلى إجراء قبل ${labels[0] ?? "الفترة الأولى"}. تواصل مع المورد أو استخدم مصدراً بديلاً أو ابدأ التصنيع بأولوية حتى لا يعطل الاحتياج الأول كامل التسلسل.`,
    });
  }

  const excessItems = results.items.map(item => {
    const excess = item.rows.reduce((sum, row) => sum + Math.max(0, row.ordreReception - row.besoinsNets), 0);
    const endingStock = item.rows.at(-1)?.stockDisponible ?? 0;
    return { item, excess, endingStock };
  }).filter(entry => entry.excess > 0 || entry.endingStock > 0);

  if (excessItems.length > 0) {
    const excessSummaryFr = excessItems
      .map(({ item, excess, endingStock }) => `"${item.name}" (${excess} unité(s) au-delà du besoin net, stock final ${endingStock})`)
      .join(", ");
    const excessSummaryAr = excessItems
      .map(({ item, excess, endingStock }) => `"${item.name}" (${excess} وحدة فوق الاحتياج الصافي، مخزون نهائي ${endingStock})`)
      .join("، ");
    recos.push({
      icon: "📦",
      fr: "Limiter le sur-stock créé par les tailles de lot",
      ar: "الحد من المخزون الزائد الناتج عن أحجام الدفعات",
      descFr: `${excessSummaryFr}. Pour les articles dont la demande est incertaine, réduisez la taille des lots ou fractionnez les réceptions afin de ne pas immobiliser de matière au-delà du besoin de la période.`,
      descAr: `${excessSummaryAr}. بالنسبة للأصناف ذات الطلب غير المؤكد، قلّل حجم الدفعة أو جزّئ الاستلامات حتى لا تُجمّد مواداً تتجاوز احتياج الفترة.`,
    });
  }

  const scheduledItems = results.items.filter(item => item.totalOrders > 0);
  if (scheduledItems.length > 0) {
    const scheduleSummaryFr = scheduledItems
      .map(item => `"${item.name}" : lancements ${formatSchedule(item, "ordreLancement") || "à traiter avant l'horizon"}, réceptions ${formatSchedule(item, "ordreReception")}`)
      .join(" ; ");
    const scheduleSummaryAr = scheduledItems
      .map(item => `"${item.name}" : إطلاقات ${formatSchedule(item, "ordreLancement") || "تُعالج قبل الأفق"}، استلامات ${formatSchedule(item, "ordreReception")}`)
      .join("؛ ");
    recos.push({
      icon: "📋",
      fr: "Piloter les ordres selon le calendrier calculé",
      ar: "إدارة الأوامر وفق الجدول المحسوب",
      descFr: `${scheduleSummaryFr}. Contrôlez ces dates à chaque période et confirmez les quantités reçues avant de consommer le stock, afin que le plan de production reste aligné sur les besoins nets.`,
      descAr: `${scheduleSummaryAr}. راقب هذه التواريخ في كل فترة وتأكد من الكميات المستلمة قبل استهلاك المخزون حتى تبقى خطة الإنتاج متوافقة مع الاحتياجات الصافية.`,
    });
  }

  const tightComponents = results.items.filter(item =>
    item.isComponent && (item.lateOrders > 0 || item.rows.some(row => row.besoinsNets > 0)),
  );
  if (tightComponents.length > 0 && results.urgentItemCount === 0) {
    recos.push({
      icon: "🔧",
      fr: "Réserver les composants qui conditionnent la production",
      ar: "حجز المكونات التي تتحكم في الإنتاج",
      descFr: `Réservez en priorité ${tightComponents.map(item => `"${item.name}"`).join(", ")} et vérifiez leur disponibilité avant chaque lancement de produit fini. Une confirmation fournisseur ou un stock tampon ciblé est préférable à une interruption de ligne.`,
      descAr: `احجز أولاً ${tightComponents.map(item => `"${item.name}"`).join("، ")} وتحقق من توفرها قبل كل إطلاق لمنتج نهائي. ويُفضّل تأكيد المورد أو إنشاء مخزون أمان موجّه على توقف خط الإنتاج.`,
    });
  }

  recos.push({
    icon: "🔄",
    fr: "Réactualiser le plan avec la demande réelle",
    ar: "تحديث الخطة بالطلب الفعلي",
    descFr: `À la fin de chaque période, remplacez les prévisions par la demande observée et le stock réellement disponible. Le prochain calcul indiquera alors si les ${results.totalOrdersPlanned} unités prévues restent nécessaires ou si leur calendrier doit être décalé.`,
    descAr: `في نهاية كل فترة، استبدل التوقعات بالطلب الفعلي والمخزون المتاح فعلاً. وسيحدد الحساب التالي ما إذا كانت الوحدات الـ${results.totalOrdersPlanned} المبرمجة لا تزال ضرورية أو يجب تأجيل جدولها.`,
  });

  // Keep the report stable if two conditions ever produce the same user-facing action.
  return recos.filter((reco, index, all) =>
    all.findIndex(other => other.fr === reco.fr && other.descFr === reco.descFr) === index,
  );
}
