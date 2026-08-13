import { useRef, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle, ArrowLeft, Calculator, CheckCircle2, Factory, FileText,
  Info, Leaf, Loader2, Monitor, PencilRuler, Plus, Save, ShoppingBag,
  Trash2, Network,
} from "lucide-react";
import { useLanguage } from "@/lib/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  computeMST,
  generateMSTAnalysis,
  generateMSTRecommendations,
  validateMSTInput,
  type EdgeInput,
  type MSTResult,
  type NodeInput,
  type ValidationError,
} from "@/lib/mstAlgorithm";
import { generateMstPDF } from "@/lib/generateMstPDF";

type SectorKey = "industrie" | "commerce" | "agriculture" | "services" | "custom";
type EdgeRow = Omit<EdgeInput, "weight"> & { weight: string };

interface Sector {
  id: SectorKey;
  icon: React.ElementType;
  nameFr: string;
  nameAr: string;
}

const SECTORS: Sector[] = [
  { id: "industrie", icon: Factory, nameFr: "Industrie", nameAr: "الصناعة" },
  { id: "commerce", icon: ShoppingBag, nameFr: "Commerce", nameAr: "التجارة" },
  { id: "agriculture", icon: Leaf, nameFr: "Agriculture", nameAr: "الفلاحة" },
  { id: "services", icon: Monitor, nameFr: "Services", nameAr: "الخدمات" },
  { id: "custom", icon: PencilRuler, nameFr: "Personnalisé", nameAr: "مخصص" },
];

const SAMPLE: Record<SectorKey, { nodes: NodeInput[]; edges: EdgeRow[] }> = {
  industrie: {
    nodes: [
      { id: "A", name: "Atelier Nord" }, { id: "B", name: "Atelier Sud" },
      { id: "C", name: "Entrepôt" }, { id: "D", name: "Bureau" },
    ],
    edges: [
      { id: "e1", fromId: "A", toId: "B", weight: "10" },
      { id: "e2", fromId: "B", toId: "C", weight: "20" },
      { id: "e3", fromId: "C", toId: "D", weight: "30" },
      { id: "e4", fromId: "A", toId: "D", weight: "40" },
      { id: "e5", fromId: "A", toId: "C", weight: "50" },
    ],
  },
  commerce: {
    nodes: [
      { id: "A", name: "Dépôt" }, { id: "B", name: "Boutique Oran" },
      { id: "C", name: "Boutique Alger" }, { id: "D", name: "Boutique Blida" },
    ],
    edges: [
      { id: "e1", fromId: "A", toId: "B", weight: "12" },
      { id: "e2", fromId: "A", toId: "C", weight: "18" },
      { id: "e3", fromId: "A", toId: "D", weight: "24" },
      { id: "e4", fromId: "B", toId: "C", weight: "16" },
      { id: "e5", fromId: "C", toId: "D", weight: "22" },
    ],
  },
  agriculture: {
    nodes: [
      { id: "A", name: "Forage" }, { id: "B", name: "Ferme 1" },
      { id: "C", name: "Ferme 2" }, { id: "D", name: "Marché" },
    ],
    edges: [
      { id: "e1", fromId: "A", toId: "B", weight: "8" },
      { id: "e2", fromId: "A", toId: "C", weight: "14" },
      { id: "e3", fromId: "B", toId: "C", weight: "11" },
      { id: "e4", fromId: "B", toId: "D", weight: "19" },
      { id: "e5", fromId: "C", toId: "D", weight: "16" },
    ],
  },
  services: {
    nodes: [
      { id: "A", name: "Siège" }, { id: "B", name: "Agence Est" },
      { id: "C", name: "Agence Ouest" }, { id: "D", name: "Centre client" },
    ],
    edges: [
      { id: "e1", fromId: "A", toId: "B", weight: "7" },
      { id: "e2", fromId: "A", toId: "C", weight: "9" },
      { id: "e3", fromId: "B", toId: "D", weight: "15" },
      { id: "e4", fromId: "C", toId: "D", weight: "12" },
      { id: "e5", fromId: "B", toId: "C", weight: "13" },
    ],
  },
  custom: {
    nodes: [{ id: "A", name: "" }, { id: "B", name: "" }],
    edges: [{ id: "e1", fromId: "A", toId: "B", weight: "" }],
  },
};

function cloneTemplate(sector: SectorKey) {
  return {
    nodes: SAMPLE[sector].nodes.map((node) => ({ ...node })),
    edges: SAMPLE[sector].edges.map((edge) => ({ ...edge })),
  };
}

function displayError(msgFr: string, msgAr: string): ValidationError {
  return { type: "missing_fields", msgFr, msgAr };
}

export default function Mst() {
  const { t, language } = useLanguage();
  const isAr = language === "ar";
  const [phase, setPhase] = useState<"form" | "results">("form");
  const [problemName, setProblemName] = useState("");
  const [sector, setSector] = useState<SectorKey>("industrie");
  const [nodes, setNodes] = useState<NodeInput[]>(() => cloneTemplate("industrie").nodes);
  const [edges, setEdges] = useState<EdgeRow[]>(() => cloneTemplate("industrie").edges);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [result, setResult] = useState<MSTResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const loadTemplate = (nextSector: SectorKey) => {
    const template = cloneTemplate(nextSector);
    setSector(nextSector);
    setNodes(template.nodes);
    setEdges(template.edges);
    setErrors([]);
    setResult(null);
    setPhase("form");
  };

  const updateNode = (id: string, field: keyof NodeInput, value: string) => {
    setNodes((current) => current.map((node) => node.id === id ? { ...node, [field]: value } : node));
  };

  const updateEdge = (id: string, field: keyof EdgeRow, value: string) => {
    setEdges((current) => current.map((edge) => edge.id === id ? { ...edge, [field]: value } : edge));
  };

  const addNode = () => {
    const next = nodes.length + 1;
    setNodes((current) => [...current, { id: `N${next}`, name: "" }]);
  };

  const addEdge = () => {
    setEdges((current) => [...current, { id: `e${Date.now()}`, fromId: "", toId: "", weight: "" }]);
  };

  const handleSolve = () => {
    const parsedEdges: EdgeInput[] = edges.map((edge) => {
      const weight = Number(edge.weight);
      return { ...edge, weight: Number.isFinite(weight) ? weight : 0 };
    });
    const engineErrors = validateMSTInput(nodes, parsedEdges);
    const inputErrors = [...engineErrors];
    if (nodes.some((node) => !node.id.trim() || !node.name.trim())) {
      inputErrors.push(displayError(
        "Chaque nœud doit avoir un identifiant et un nom.",
        "يجب أن تحتوي كل عقدة على معرّف واسم."
      ));
    }
    const ids = nodes.map((node) => node.id.trim()).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      inputErrors.push(displayError(
        "Chaque identifiant de nœud doit être unique.",
        "يجب أن يكون معرّف كل عقدة فريدًا."
      ));
    }
    setErrors(inputErrors);
    if (inputErrors.length > 0) return;

    const computed = computeMST(nodes, parsedEdges);
    setResult(computed);
    setPhase("results");
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      await fetch("/api/problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "industrial-mst",
          name: problemName || t("Réseau sans titre", "شبكة بدون عنوان"),
          content: { sector, nodes, edges, result },
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    if (!result) return;
    setExporting(true);
    try {
      generateMstPDF({
        problemName: problemName || t("Réseau sans titre", "شبكة بدون عنوان"),
        result,
        language: language as "fr" | "ar",
        analysis: generateMSTAnalysis(result),
        recommendations: generateMSTRecommendations(result),
      });
    } finally {
      setExporting(false);
    }
  };

  const analysis = result ? generateMSTAnalysis(result) : [];
  const recommendations = result ? generateMSTRecommendations(result) : [];

  return (
    <div className={`min-h-[100dvh] bg-muted/20 ${isAr ? "rtl" : "ltr"}`} dir={isAr ? "rtl" : "ltr"}>
      <main className="container mx-auto px-4 py-8 space-y-8 max-w-5xl">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/industrial-management" className="hover:text-primary transition-colors flex items-center gap-1">
            <ArrowLeft className={`w-3.5 h-3.5 ${isAr ? "rotate-180" : ""}`} />
            {t("Gestion Industrielle", "التسيير الصناعي")}
          </Link>
          <span>/</span>
          <span className="font-semibold text-foreground">{t("Arbre couvrant minimal", "الشجرة الممتدة الصغرى")}</span>
        </nav>

        <section className="bg-primary text-primary-foreground rounded-xl p-6 md:p-8 shadow-md relative overflow-hidden">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 bg-primary-foreground/15 rounded-full px-3 py-1 text-xs font-medium mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
              {t("Module — Réseaux & Connexions", "وحدة — الشبكات والوصلات")}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2 leading-tight">
              {t("Arbre couvrant minimal", "الشجرة الممتدة الصغرى")}
            </h1>
            <p className="text-primary-foreground/80 max-w-2xl text-sm leading-relaxed">
              {t(
                "Construisez le réseau de coût minimal avec l'algorithme de Kruskal et identifiez les connexions redondantes.",
                "ابنِ شبكة بأقل تكلفة باستخدام خوارزمية كروسكال وحدد الوصلات الزائدة."
              )}
            </p>
          </div>
          <div className="absolute -right-16 -bottom-16 opacity-10 pointer-events-none">
            <Network className="w-64 h-64" />
          </div>
        </section>

        {phase === "form" ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Network className="w-5 h-5 text-primary" />
                  {t("Secteur et nom du réseau", "القطاع واسم الشبكة")}
                </CardTitle>
                <CardDescription>
                  {t("Choisissez un exemple de départ ou saisissez votre propre réseau.", "اختر مثالًا للبدء أو أدخل شبكتك الخاصة.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="max-w-sm space-y-1.5">
                  <Label className="text-xs font-semibold">{t("Nom de la session", "اسم المسألة")}</Label>
                  <Input
                    value={problemName}
                    onChange={(event) => setProblemName(event.target.value)}
                    placeholder={t("ex. Réseau de distribution — Batna", "مثال: شبكة التوزيع — باتنة")}
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  {SECTORS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => loadTemplate(item.id)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all",
                          sector === item.id
                            ? "bg-primary text-primary-foreground border-primary shadow"
                            : "bg-card border-border text-muted-foreground hover:border-primary/50"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        {isAr ? item.nameAr : item.nameFr}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{t("Nœuds du réseau", "عقد الشبكة")}</CardTitle>
                    <CardDescription>{t("Chaque nœud représente un site, une machine ou un service.", "كل عقدة تمثل موقعًا أو آلة أو خدمة.")}</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={addNode} className="gap-1.5 shrink-0">
                    <Plus className="w-4 h-4" />{t("Ajouter", "إضافة")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead><tr className="bg-primary text-primary-foreground">
                      <th className="px-3 py-2.5 text-start text-xs font-semibold">#</th>
                      <th className="px-3 py-2.5 text-start text-xs font-semibold">{t("Identifiant", "المعرّف")}</th>
                      <th className="px-3 py-2.5 text-start text-xs font-semibold">{t("Nom du nœud", "اسم العقدة")}</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold">{t("Action", "إجراء")}</th>
                    </tr></thead>
                    <tbody>{nodes.map((node, index) => (
                      <tr key={`${node.id}-${index}`} className={cn("border-b border-border", index % 2 === 0 ? "bg-card" : "bg-muted/10")}>
                        <td className="px-3 py-2 text-xs text-muted-foreground font-bold">{index + 1}</td>
                        <td className="px-2 py-2"><Input value={node.id} onChange={(event) => updateNode(node.id, "id", event.target.value)} className="h-8 text-xs" /></td>
                        <td className="px-2 py-2"><Input value={node.name} onChange={(event) => updateNode(node.id, "name", event.target.value)} placeholder={t("Nom du site", "اسم الموقع")} className="h-8 text-xs" /></td>
                        <td className="px-2 py-2 text-center">
                          {nodes.length > 2 && <button onClick={() => setNodes((current) => current.filter((_, i) => i !== index))} className="text-red-400 hover:text-red-600" title={t("Supprimer", "حذف")}><Trash2 className="w-4 h-4 mx-auto" /></button>}
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{t("Connexions du réseau", "وصلات الشبكة")}</CardTitle>
                    <CardDescription>{t("Ajoutez les coûts, distances ou temps entre les nœuds.", "أضف التكلفة أو المسافة أو الزمن بين العقد.")}</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={addEdge} className="gap-1.5 shrink-0">
                    <Plus className="w-4 h-4" />{t("Ajouter", "إضافة")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-600" />
                  {t("Le réseau doit relier tous les nœuds. Les connexions qui ferment un cycle seront écartées.", "يجب أن تربط الشبكة كل العقد. سيتم استبعاد الوصلات التي تكوّن دورة.")}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[620px]">
                    <thead><tr className="bg-primary text-primary-foreground">
                      <th className="px-3 py-2.5 text-start text-xs font-semibold">#</th>
                      <th className="px-3 py-2.5 text-start text-xs font-semibold">{t("Départ", "من")}</th>
                      <th className="px-3 py-2.5 text-start text-xs font-semibold">{t("Arrivée", "إلى")}</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold">{t("Coût / poids", "التكلفة / الوزن")}</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold">{t("Action", "إجراء")}</th>
                    </tr></thead>
                    <tbody>{edges.map((edge, index) => (
                      <tr key={edge.id} className={cn("border-b border-border", index % 2 === 0 ? "bg-card" : "bg-muted/10")}>
                        <td className="px-3 py-2 text-xs text-muted-foreground font-bold">{index + 1}</td>
                        <td className="px-2 py-2"><Input value={edge.fromId} onChange={(event) => updateEdge(edge.id, "fromId", event.target.value)} placeholder="A" className="h-8 text-xs" /></td>
                        <td className="px-2 py-2"><Input value={edge.toId} onChange={(event) => updateEdge(edge.id, "toId", event.target.value)} placeholder="B" className="h-8 text-xs" /></td>
                        <td className="px-2 py-2"><Input type="number" min={0} step="0.1" value={edge.weight} onChange={(event) => updateEdge(edge.id, "weight", event.target.value)} placeholder="10" className="h-8 text-xs text-center" /></td>
                        <td className="px-2 py-2 text-center"><button onClick={() => setEdges((current) => current.filter((item) => item.id !== edge.id))} className="text-red-400 hover:text-red-600" title={t("Supprimer", "حذف")}><Trash2 className="w-4 h-4 mx-auto" /></button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {errors.map((error, index) => (
              <div key={`${error.type}-${index}`} className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <span>{isAr ? error.msgAr : error.msgFr}</span>
              </div>
            ))}

            <div className="flex justify-end">
              <Button onClick={handleSolve} size="lg" className="gap-2 px-8">
                <Calculator className="w-5 h-5" />{t("Construire l'arbre minimal", "حساب الشجرة الدنيا")}
              </Button>
            </div>
          </div>
        ) : result ? (
          <div className="space-y-8" ref={resultRef}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                [t("Nœuds analysés", "العقد المحللة"), String(result.nodeCount), "bg-primary/10 text-primary border-primary/20"],
                [t("Connexions retenues", "الوصلات المختارة"), String(result.edgeCountUsed), "bg-green-50 text-green-700 border-green-200"],
                [t("Coût minimal", "التكلفة الدنيا"), result.totalWeight.toFixed(1), "bg-blue-50 text-blue-700 border-blue-200"],
                [t("Économie réalisée", "التوفير المحقق"), `${result.savingsPercentage}%`, "bg-amber-50 text-amber-700 border-amber-200"],
              ].map(([label, value, cls]) => (
                <div key={label} className={cn("rounded-xl border p-4 space-y-1", cls)}>
                  <div className="text-xs font-medium opacity-75">{label}</div>
                  <div className="text-2xl font-black">{value}</div>
                </div>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Network className="w-5 h-5 text-primary" />{t("Connexions retenues et écartées", "الوصلات المختارة والمستبعدة")}</CardTitle>
                <CardDescription>{t("Kruskal conserve les connexions nécessaires et écarte celles qui créeraient un cycle.", "تحتفظ خوارزمية كروسكال بالوصلات اللازمة وتستبعد ما يكوّن دورة.")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[580px]">
                    <thead><tr className="bg-primary text-primary-foreground">
                      <th className="px-3 py-2.5 text-start text-xs font-semibold">{t("Connexion", "الوصلة")}</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold">{t("Poids", "الوزن")}</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold">{t("Statut", "الحالة")}</th>
                    </tr></thead>
                    <tbody>{[
                      ...result.selectedEdges.map((edge) => ({ edge, selected: true })),
                      ...result.excludedEdges.map((edge) => ({ edge, selected: false })),
                    ].map(({ edge, selected }, index) => (
                      <tr key={`${edge.fromId}-${edge.toId}-${index}`} className={cn("border-b border-border", index % 2 === 0 ? "bg-card" : "bg-muted/10")}>
                        <td className="px-3 py-2.5 font-semibold">{edge.fromName} <span className="text-muted-foreground">→</span> {edge.toName}</td>
                        <td className="px-3 py-2.5 text-center font-mono">{edge.weight.toFixed(1)}</td>
                        <td className="px-3 py-2.5 text-center"><span className={cn("inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full", selected ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground")}>
                          {selected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                          {selected ? t("Retenue", "مختارة") : t("Écartée — cycle", "مستبعدة — دورة")}
                        </span></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Info className="w-5 h-5 text-primary" />{t("Analyse de la Situation", "تحليل الوضع")}</CardTitle></CardHeader><CardContent className="space-y-3">
              {analysis.map((line, index) => <div key={index} className="bg-primary/5 border border-primary/15 rounded-lg px-4 py-3 text-sm leading-relaxed">{isAr ? line.ar : line.fr}</div>)}
            </CardContent></Card>

            <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="w-5 h-5 text-primary" />{t("Recommandations Managériales", "التوصيات الإدارية")}</CardTitle></CardHeader><CardContent className="space-y-4">
              {recommendations.map((rec, index) => <div key={index} className={cn("border rounded-xl p-4 space-y-1.5", isAr ? "border-r-4" : "border-l-4", index === 0 ? "border-primary" : "border-amber-400")}>
                <div className="font-bold text-sm flex items-start gap-2"><span>{rec.icon}</span><span>{isAr ? rec.ar : rec.fr}</span></div>
                <p className="text-xs text-muted-foreground leading-relaxed">{isAr ? rec.descAr : rec.descFr}</p>
              </div>)}
            </CardContent></Card>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <Button variant="outline" onClick={() => setPhase("form")} className="gap-2 w-full sm:w-auto"><ArrowLeft className={`w-4 h-4 ${isAr ? "rotate-180" : ""}`} />{t("Modifier les données", "تعديل البيانات")}</Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={handleSave} disabled={saving || saved} className="gap-2 w-full sm:w-auto">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Save className="w-4 h-4" />}
                {saving ? t("Enregistrement…", "جارٍ الحفظ…") : saved ? t("Enregistré !", "تم الحفظ!") : t("Enregistrer", "حفظ في السجل")}
              </Button>
              <Button onClick={handleExport} disabled={exporting} className="gap-2 w-full sm:w-auto">
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {exporting ? t("Export en cours…", "جارٍ التصدير…") : t("Exporter PDF", "تصدير PDF")}
              </Button>
            </div>
          </div>
        ) : null}

        <footer className="border-t pt-8 pb-4 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2"><div className="bg-primary text-primary-foreground p-1 rounded"><Network className="w-4 h-4" /></div><span className="font-bold text-foreground">OptimDZ</span><span>·</span><span>{t("Arbre couvrant minimal", "الشجرة الممتدة الصغرى")}</span></div>
          <Link href="/industrial-management" className="hover:text-primary transition-colors">{t("← Gestion Industrielle", "→ التسيير الصناعي")}</Link>
        </footer>
      </main>
    </div>
  );
}