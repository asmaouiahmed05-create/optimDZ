// —— Minimum Spanning Tree (Arbre couvrant minimal / الشجرة الممتدة الصغرى) — pure computation ——————
// Kruskal's algorithm with union-find cycle detection.
// No i18n here; all user-facing strings live in the UI layer.

export interface NodeInput {
  id: string;
  name: string;
}

export interface EdgeInput {
  id: string;
  fromId: string;
  toId: string;
  weight: number; // cost / distance / time
}

// —— Output shapes ——————

export interface SelectedEdge {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  weight: number;
}

export interface MSTResult {
  selectedEdges: SelectedEdge[];
  excludedEdges: SelectedEdge[];
  totalWeight: number;
  totalPossibleWeight: number;
  savingsPercentage: number;
  nodeCount: number;
  edgeCountUsed: number;
}

// —— Validation ——————

export interface ValidationError {
  type: "empty" | "insufficient_nodes" | "disconnected" | "missing_fields" | "invalid_weight";
  edgeLabel?: string;
  msgFr: string;
  msgAr: string;
}

export function validateMSTInput(nodes: NodeInput[], edges: EdgeInput[]): ValidationError[] {
  const errors: ValidationError[] = [];

  if (nodes.length === 0) {
    errors.push({
      type: "empty",
      msgFr: "Aucun nœud saisi. Ajoutez au moins deux nœuds pour construire un réseau.",
      msgAr: "لم يتم إدخال أي عقدة. أضف عقدتين على الأقل لبناء الشبكة.",
    });
    return errors;
  }

  if (nodes.length < 2) {
    errors.push({
      type: "insufficient_nodes",
      msgFr: "Au moins deux nœuds sont nécessaires pour calculer un arbre couvrant.",
      msgAr: "يلزم وجود عقدتين على الأقل لحساب الشجرة الممتدة.",
    });
  }

  for (const edge of edges) {
    if (!edge.fromId || !edge.toId) {
      errors.push({
        type: "missing_fields",
        msgFr: "Une connexion n'a pas ses deux extrémités définies.",
        msgAr: "توجد وصلة بدون تحديد طرفيها بالكامل.",
      });
    }
    if (edge.weight <= 0) {
      const fromName = nodes.find((n) => n.id === edge.fromId)?.name ?? "?";
      const toName = nodes.find((n) => n.id === edge.toId)?.name ?? "?";
      errors.push({
        type: "invalid_weight",
        edgeLabel: `${fromName}-${toName}`,
        msgFr: `La connexion "${fromName}-${toName}" a un coût nul ou invalide. Saisissez une valeur supérieure à 0.`,
        msgAr: `الوصلة "${fromName}-${toName}" لها تكلفة صفرية أو غير صحيحة. أدخل قيمة أكبر من 0.`,
      });
    }
  }

  if (nodes.length >= 2) {
    const uf = new UnionFind();
    nodes.forEach((n) => uf.makeSet(n.id));
    edges.forEach((e) => uf.union(e.fromId, e.toId));
    const roots = new Set(nodes.map((n) => uf.find(n.id)));
    if (roots.size > 1) {
      errors.push({
        type: "disconnected",
        msgFr: "Le réseau saisi est incomplet : certains nœuds ne sont reliés à aucun autre par une connexion.",
        msgAr: "الشبكة المُدخلة غير مكتملة: بعض العقد غير مرتبطة بأي رابط مع الباقي.",
      });
    }
  }

  return errors;
}

// —— Union-Find ——————

class UnionFind {
  private parent = new Map<string, string>();

  makeSet(id: string) {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    const p = this.parent.get(id)!;
    if (p !== id) {
      const root = this.find(p);
      this.parent.set(id, root);
      return root;
    }
    return p;
  }

  union(a: string, b: string): boolean {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return false;
    this.parent.set(rootA, rootB);
    return true;
  }
}

// —— Computation ——————

export function computeMST(nodes: NodeInput[], edges: EdgeInput[]): MSTResult {
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;

  const uf = new UnionFind();
  nodes.forEach((n) => uf.makeSet(n.id));

  const sortedEdges = [...edges].sort((a, b) => a.weight - b.weight);

  const selectedEdges: SelectedEdge[] = [];
  const excludedEdges: SelectedEdge[] = [];

  for (const edge of sortedEdges) {
    const record: SelectedEdge = {
      fromId: edge.fromId,
      fromName: nameOf(edge.fromId),
      toId: edge.toId,
      toName: nameOf(edge.toId),
      weight: edge.weight,
    };
    if (uf.union(edge.fromId, edge.toId)) {
      selectedEdges.push(record);
    } else {
      excludedEdges.push(record);
    }
  }

  const totalWeight = selectedEdges.reduce((sum, e) => sum + e.weight, 0);
  const totalPossibleWeight = edges.reduce((sum, e) => sum + e.weight, 0);
  const savingsPercentage =
    totalPossibleWeight > 0
      ? Math.round(((totalPossibleWeight - totalWeight) / totalPossibleWeight) * 1000) / 10
      : 0;

  return {
    selectedEdges,
    excludedEdges,
    totalWeight,
    totalPossibleWeight,
    savingsPercentage,
    nodeCount: nodes.length,
    edgeCountUsed: selectedEdges.length,
  };
}

// —— Bilingual analysis generator ——————

export function generateMSTAnalysis(result: MSTResult): Array<{ fr: string; ar: string }> {
  const lines: Array<{ fr: string; ar: string }> = [];

  lines.push({
    fr: `✅ Le réseau optimal relie les ${result.nodeCount} nœuds avec seulement ${result.edgeCountUsed} connexions, pour un coût total de ${result.totalWeight.toFixed(1)}.`,
    ar: `✅ الشبكة المثلى تربط ${result.nodeCount} عقدة بـ ${result.edgeCountUsed} وصلات فقط، بتكلفة إجمالية قدرها ${result.totalWeight.toFixed(1)}.`,
  });

  lines.push({
    fr: `📊 Comparé au coût total si toutes les connexions étaient utilisées (${result.totalPossibleWeight.toFixed(1)}), ce plan réalise une économie de ${result.savingsPercentage}%.`,
    ar: `📊 مقارنة بالتكلفة الإجمالية لو استُخدمت كل الوصلات (${result.totalPossibleWeight.toFixed(1)})، يحقق هذا المخطط توفيرًا بنسبة ${result.savingsPercentage}%.`,
  });

  if (result.selectedEdges.length > 0) {
    const cheapest = [...result.selectedEdges].sort((a, b) => a.weight - b.weight)[0];
    const priciest = [...result.selectedEdges].sort((a, b) => b.weight - a.weight)[0];
    lines.push({
      fr: `🔵 La connexion la moins chère relie "${cheapest.fromName}" à "${cheapest.toName}" (${cheapest.weight.toFixed(1)}).`,
      ar: `🔵 أرخص وصلة تربط "${cheapest.fromName}" بـ"${cheapest.toName}" (${cheapest.weight.toFixed(1)}).`,
    });
    lines.push({
      fr: `🔴 La connexion la plus coûteuse mais nécessaire relie "${priciest.fromName}" à "${priciest.toName}" (${priciest.weight.toFixed(1)}) — aucune alternative moins chère ne relie ce nœud sans créer de cycle.`,
      ar: `🔴 أغلى وصلة ضرورية تربط "${priciest.fromName}" بـ"${priciest.toName}" (${priciest.weight.toFixed(1)}) — لا يوجد بديل أرخص يربط هذه العقدة دون تكوين دورة.`,
    });
  }

  if (result.excludedEdges.length > 0) {
    lines.push({
      fr: `⚪ ${result.excludedEdges.length} connexion(s) ont été écartées car elles auraient formé un cycle redondant sans améliorer la connectivité.`,
      ar: `⚪ تم استبعاد ${result.excludedEdges.length} وصلة لأنها كانت ستُكوّن دورة زائدة دون تحسين الاتصال.`,
    });
  }

  return lines;
}

// —— Bilingual recommendations generator ——————

export function generateMSTRecommendations(
  result: MSTResult,
): Array<{ icon: string; fr: string; ar: string; descFr: string; descAr: string }> {
  const recos: Array<{ icon: string; fr: string; ar: string; descFr: string; descAr: string }> = [];

  if (result.selectedEdges.length === 0) {
    return recos;
  }

  const priciest = [...result.selectedEdges].sort((a, b) => b.weight - a.weight)[0];
  const avgWeight = result.totalWeight / result.edgeCountUsed;

  if (priciest.weight > avgWeight * 2) {
    recos.push({
      icon: "🔴",
      fr: "Examiner la connexion la plus coûteuse",
      ar: "مراجعة الوصلة الأعلى تكلفة",
      descFr: `La connexion "${priciest.fromName}-${priciest.toName}" (${priciest.weight.toFixed(1)}) coûte plus du double de la moyenne (${avgWeight.toFixed(1)}). Vérifiez s'il existe une alternative non incluse dans les données avant de valider l'investissement.`,
      descAr: `الوصلة "${priciest.fromName}-${priciest.toName}" (${priciest.weight.toFixed(1)}) تكلف أكثر من ضعف المتوسط (${avgWeight.toFixed(1)}). تحقق من وجود بديل غير مُدرج في البيانات قبل اعتماد الاستثمار.`,
    });
  } else {
    recos.push({
      icon: "✅",
      fr: "Plan équilibré, prêt pour exécution",
      ar: "مخطط متوازن، جاهز للتنفيذ",
      descFr: "La répartition des coûts entre les connexions sélectionnées est raisonnable ; aucune connexion ne nécessite de révision exceptionnelle.",
      descAr: "توزيع التكاليف بين الوصلات المختارة متوازن؛ لا توجد وصلة تستدعي مراجعة استثنائية.",
    });
  }

  if (result.excludedEdges.length > 0) {
    recos.push({
      icon: "📋",
      fr: "Conserver les connexions écartées comme plan de secours",
      ar: "الاحتفاظ بالوصلات المستبعدة كخطة احتياطية",
      descFr: "Les connexions exclues peuvent servir de redondance en cas de panne sur une connexion active du réseau.",
      descAr: "يمكن استخدام الوصلات المستبعدة كاحتياط في حال تعطل إحدى الوصلات النشطة في الشبكة.",
    });
  }

  return recos;
}