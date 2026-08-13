import jsPDF from "jspdf";
import type { MSTResult } from "./mstAlgorithm";

interface MstPDFOptions {
  problemName: string;
  result: MSTResult;
  language: "fr" | "ar";
  analysis: Array<{ fr: string; ar: string }>;
  recommendations: Array<{ icon: string; fr: string; ar: string; descFr: string; descAr: string }>;
}

export function generateMstPDF({ problemName, result, language, analysis, recommendations }: MstPDFOptions): void {
  const isAr = language === "ar";
  const t = (fr: string, ar: string) => (isAr ? ar : fr);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 42;
  let y = 54;

  doc.setFillColor(0, 77, 64);
  doc.rect(0, 0, 595, 86, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text("OptimDZ", margin, 38);
  doc.setFontSize(10);
  doc.text(t("Arbre couvrant minimal", "الشجرة الممتدة الصغرى"), margin, 61);

  doc.setTextColor(12, 38, 33);
  doc.setFontSize(16);
  doc.text(problemName || t("Réseau sans titre", "شبكة بدون عنوان"), margin, y + 62);
  y += 88;

  doc.setFontSize(10);
  doc.text(`${t("Nœuds", "العقد")}: ${result.nodeCount}`, margin, y);
  doc.text(`${t("Connexions retenues", "الوصلات المختارة")}: ${result.edgeCountUsed}`, margin + 125, y);
  doc.text(`${t("Coût total", "التكلفة الإجمالية")}: ${result.totalWeight.toFixed(1)}`, margin + 290, y);
  y += 18;
  doc.text(`${t("Économie", "التوفير")}: ${result.savingsPercentage}%`, margin, y);
  y += 28;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(t("Connexions du réseau", "وصلات الشبكة"), margin, y);
  doc.setFont("helvetica", "normal");
  y += 18;
  doc.setFontSize(9);
  result.selectedEdges.forEach((edge) => {
    doc.text(`✓ ${edge.fromName} — ${edge.toName}: ${edge.weight}`, margin, y);
    y += 14;
  });
  result.excludedEdges.forEach((edge) => {
    doc.text(`× ${edge.fromName} — ${edge.toName}: ${edge.weight} (${t("exclue", "مستبعدة")})`, margin, y);
    y += 14;
  });

  y += 12;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(t("Analyse de la situation", "تحليل الوضع"), margin, y);
  doc.setFont("helvetica", "normal");
  y += 17;
  doc.setFontSize(9);
  analysis.forEach((line) => {
    const wrapped = doc.splitTextToSize(isAr ? line.ar : line.fr, 510);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 12 + 5;
  });

  y += 10;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(t("Recommandations", "التوصيات"), margin, y);
  doc.setFont("helvetica", "normal");
  y += 17;
  doc.setFontSize(9);
  recommendations.forEach((rec) => {
    const wrapped = doc.splitTextToSize(`${rec.icon} ${isAr ? rec.ar : rec.fr}: ${isAr ? rec.descAr : rec.descFr}`, 510);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 12 + 5;
  });

  doc.save(`optimdz-mst-${Date.now()}.pdf`);
}