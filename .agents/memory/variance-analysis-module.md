---
name: Variance Analysis module
description: Full details on the Variance Analysis module at /variance-analysis in OptimDZ
---

## Location
`artifacts/optimdz/src/pages/variance-analysis/`
- `VarianceAnalysis.tsx` — main form + sector selection + computation
- `VarianceAnalysisReport.tsx` — results, ratios card, analysis, suggestions, save, PDF
- `src/lib/generateVariancePDF.ts` — PDF generator (types + HTML build)

## Objectives (4 modes)
- `"revenue"` — Écarts sur Revenus (favorable when positive)
- `"materials"` — Écarts sur Matières (favorable when negative)
- `"labor"` — Écarts sur Main-d'œuvre (favorable when negative)
- `"overhead"` — Écarts sur Charges Indirectes (favorable when negative)

## Sector templates (5)
- Commerce → revenue
- Industrie → materials
- Agriculture → materials
- Services → labor
- **Énergie → overhead** (Complexe Industriel Annaba, 4 cost centers)

## Overhead mode — 4-variance model (proper budget flexible)
### Inputs per row (6 form columns)
- CB = standardPrice (charges budgétées totales)
- CR = actualPrice (charges réelles)
- Nh = standardQty (activité standard)
- Nr = actualQty (activité réelle)
- CS = extra1 (coût std unitaire d'imputation)
- CF = extra2 (charges fixes, portion of CB — clamped ≤ CB)

### Computed variances (additive, sum = Total = CR − Nh×CS)
- **priceVariance** = É/Budget = CR − BF  where BF = CF + (CB−CF)×(Nr/Nh)
- **var4** = É/Sous-activité = CF×(1 − Nr/Nh)
- **var3** = É/Activité = Nr×(CB/Nh − CS)
- **qtyVariance** = É/Rendement = (Nr−Nh)×CS

**Why:** Proper budget flexible requires knowing fixed cost CF. With CF=0 (all-variable legacy), the model reduces to the original 3-variance form (var4=0, É/Budget = old formula). The four components are mathematically additive and sum exactly to Total.

### dominantFactor: 5-way — "price" | "qty" | "var3" | "var4" | "equal"
(PDF export maps var3/var4 → "equal" since VariancePDFOptions only has price|qty|equal)

## مؤشرات ونسب التسيير (Ratios card) — ALL modes
- Added after the numerical results table in VarianceAnalysisReport.tsx
- Also included in the PDF analysis page (buildAnalysisPage)
- **Base**: sum(standardPrice × standardQty) for revenue/materials/labor; sum(CB) for overhead
- **Badge thresholds**: green "مقبول" < 5%; orange "يستدعي انتباه" 5–15%; red "حرج" > 15%
- Shows all variance components (including var3/var4 for overhead) + total

## Type structure
```typescript
VarianceRowResult: { ..., extra1?, extra2?, priceVariance, qtyVariance, var3?, var4?, totalVariance }
VarianceTotals:    { priceVariance, qtyVariance, var3?, var4?, totalVariance }
```

## Save pattern
POST /api/problems — objective in problemData; all 4 variances in result.totals.

## PDF structure (4 pages)
1. Cover — overhead: 5 KPI tiles (budget, sous-activité, activité, rendement, total)
2. Results table — overhead: 12-column (6 inputs + 4 variances + total)
3. Analysis + Ratios card + Recommendations
4. Digital stamp

## Reporting convention
- The four-mode report and its PDF should present connected, data-driven paragraphs rather than repeated label fragments.
- The narrative states the computed price variance, quantity variance, total variance, favorability according to the objective, significant effects, dominant driver, and a practical action for the largest effect.
- Recommendation cards should not repeat a separate title that restates the analysis; use a focused action paragraph instead.

**Why:** Managers need the numerical cause and business implication in one readable decision path, while calculation formulas remain independently testable and unchanged.

**How to apply:** When extending the four-mode report, derive wording from `VarianceTotals` and the objective’s favorability direction; keep PDF and screen copy aligned and do not alter `computeRows`/`computeTotals` for presentation changes.

## 5th mode: Overall Result Synthesis (الانحراف الإجمالي)
- **Route**: `/variance-analysis/overall`
- **File**: `VarianceAnalysis.tsx` has a 5th navigation button (not in OBJECTIVES array) that routes there
- **Page**: `pages/variance-analysis/OverallVariance.tsx` — standalone, no overlap with 4 existing modes
- **PDF lib**: `src/lib/generateOverallVariancePDF.ts` — exports `generateOverallVariancePDF(opts)`
- **Computation**: grandTotal = sum of 4 rawValues; % contribution = |component|/Σ|components|×100
- **Favorability**: revenue positive = good; cost types negative = good; grandTotal > 0 = net favorable
- **referenceBase priority**: user-entered → extracted from saved revenue problem's result.rows (Σ Ps×Qs) → falls back to Σ|rawValues|
- **Component sources**: multi-select from السجل filtered by type (pulls result.totals.totalVariance), OR manual fallback
- **Waterfall**: pure CSS/div bars with running-total positioning, no external chart lib
