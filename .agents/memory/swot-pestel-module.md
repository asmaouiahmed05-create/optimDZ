---
name: SWOT / PESTEL module
description: Bilingual strategic analysis module integrated into OptimDZ.
---

- The module is available at `/industrial-management/swot-analysis` and is linked from both the industrial-management home and the platform home.
- `src/lib/swotAlgorithm.ts` contains the pure SWOT/PESTEL engine: validation, IFE/EFE scores, quadrant classification, PESTEL coverage, TOWS pairings, bilingual analysis, and bilingual recommendations.
- The UI intentionally starts with a partial strengths/opportunities example; missing weakness/threat categories produce explicit analysis and skipped-strategy notes instead of errors.
- Save posts `strategic-swot-pestel` data through `/api/problems`; PDF export is handled by `src/lib/generateSwotPDF.ts`.