import jsPDF from "jspdf";
import type { FactorInput, SwotResult } from "@/lib/swotAlgorithm";

interface SwotPdfOptions {
  problemName: string;
  factors: FactorInput[];
  result: SwotResult;
  language: "fr" | "ar";
  analysis: Array<{ fr: string; ar: string }>;
  recommendations: Array<{ icon: string; fr: string; ar: string; descFr: string; descAr: string }>;
}

const categoryLabels = {
  fr: { strength: "Force", weakness: "Faiblesse", opportunity: "Opportunité", threat: "Menace" },
  ar: { strength: "قوة", weakness: "ضعف", opportunity: "فرصة", threat: "تهديد" },
} as const;

export function generateSwotPDF(options: SwotPdfOptions) {
  const { problemName, factors, result, language, analysis, recommendations } = options;
  const isAr = language === "ar";
  const text = (fr: string, ar: string) => (isAr ? ar : fr);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  let y = 52;

  const ensureSpace = (height: number) => {
    if (y + height > 770) {
      doc.addPage();
      y = 48;
    }
  };
  const heading = (value: string, size = 13) => {
    ensureSpace(28);
    doc.setTextColor(22, 70, 111);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.text(value, margin, y);
    y += size + 8;
    doc.setTextColor(38, 38, 38);
    doc.setFont("helvetica", "normal");
  };
  const paragraph = (value: string, size = 9.5, gap = 5) => {
    const lines = doc.splitTextToSize(value, contentWidth);
    ensureSpace(lines.length * (size + 3) + gap);
    doc.setFontSize(size);
    doc.text(lines, margin, y);
    y += lines.length * (size + 3) + gap;
  };

  doc.setFillColor(22, 70, 111);
  doc.rect(0, 0, pageWidth, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("OptimDZ", margin, 20);
  doc.setTextColor(35, 35, 35);
  doc.setFontSize(20);
  doc.text(text("Analyse SWOT / PESTEL", "تحليل SWOT / PESTEL"), margin, y);
  y += 26;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  paragraph(`${text("Session", "المسألة")}: ${problemName}`, 10);
  paragraph(
    `${text("Position", "الموقع")}: ${text(
      { offensive: "Offensif", conservative: "Conservateur", competitive: "Compétitif", defensive: "Défensif" }[result.quadrant],
      { offensive: "هجومي", conservative: "تحفظي", competitive: "تنافسي", defensive: "دفاعي" }[result.quadrant],
    )} — IFE ${result.ifeScore.toFixed(2)}/4 · EFE ${result.efeScore.toFixed(2)}/4`,
  );

  heading(text("Facteurs saisis", "العوامل المدخلة"));
  factors.forEach((factor, index) => {
    paragraph(
      `${index + 1}. ${categoryLabels[language][factor.category]} — ${factor.label} | ${text("Poids", "الوزن")} ${factor.weight.toFixed(2)} | ${text("Note", "التقييم")} ${factor.rating}/4`,
    );
  });

  heading(text("Analyse", "التحليل"));
  analysis.forEach((line) => paragraph(isAr ? line.ar : line.fr));

  heading(text("Recommandations TOWS", "توصيات TOWS"));
  recommendations.forEach((recommendation) => {
    paragraph(`${recommendation.icon} ${isAr ? recommendation.ar : recommendation.fr}`, 10, 2);
    paragraph(isAr ? recommendation.descAr : recommendation.descFr, 9, 5);
  });

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("OptimDZ — Strategic analysis", margin, 810);
  doc.save(`${problemName.replace(/[^a-z0-9\u0600-\u06ff]+/gi, "-").replace(/^-|-$/g, "") || "swot-analysis"}.pdf`);
}