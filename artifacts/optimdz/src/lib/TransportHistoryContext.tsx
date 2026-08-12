// ── Transport Problem History — localStorage persistence ─────────────────────
// Separate from Simplex history (which uses PostgreSQL).
// Storage key: "optimdz_transport_problems"

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { TransportProblem } from "./TransportContext";
import type { MODIResult } from "./modiAlgorithm";

async function writeSharedTransportHistory(saved: SavedTransportProblem): Promise<void> {
  try {
    await fetch("/api/shared-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        moduleName: "transportation",
        problemName: saved.name,
        keyResultValues: {
          initialCost: saved.initialCost,
          finalCost: saved.finalCost,
          improvement: saved.improvement,
        },
      }),
    });
  } catch {
    // The existing local history remains the source of truth for this module.
  }
}

export type TransportSectorKey = "industry" | "trade" | "services" | "agriculture" | "custom";

export interface SavedTransportProblem {
  id:          string;
  name:        string;
  sector:      TransportSectorKey;
  savedAt:     string;
  problem:     TransportProblem;
  modiResult:  MODIResult;
  initialCost: number;
  finalCost:   number;
  improvement: number;  // (initialCost - finalCost) / initialCost * 100
}

const STORAGE_KEY  = "optimdz_transport_problems";
const MAX_PROBLEMS = 50;

function genId(): string {
  return `tp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const SECTOR_NAME_FR: Record<TransportSectorKey, string> = {
  industry:    "Industrie",
  trade:       "Commerce",
  services:    "Services",
  agriculture: "Agriculture",
  custom:      "Personnalisé",
};
const SECTOR_NAME_AR: Record<TransportSectorKey, string> = {
  industry:    "صناعة",
  trade:       "تجارة",
  services:    "خدمات",
  agriculture: "فلاحة",
  custom:      "مخصص",
};

export function generateTransportProjectName(sector: TransportSectorKey, lang: string): string {
  const now = new Date();
  if (lang === "ar") {
    const monthsAr = ["يناير","فبراير","مارس","أبريل","مايو","يونيو",
                       "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
    return `نقل ${SECTOR_NAME_AR[sector]} — ${now.getDate()} ${monthsAr[now.getMonth()]} ${now.getFullYear()}`;
  }
  return `Transport ${SECTOR_NAME_FR[sector]} — ${now.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;
}

function load(): SavedTransportProblem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedTransportProblem[]) : [];
  } catch {
    return [];
  }
}

function persist(problems: SavedTransportProblem[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(problems)); } catch { /* quota */ }
}

interface TransportHistoryState {
  problems:       SavedTransportProblem[];
  addProblem:     (problem: TransportProblem, modiResult: MODIResult, initialCost: number, sector: TransportSectorKey, lang: string) => string;
  deleteProblem:  (id: string) => void;
  renameProblem:  (id: string, name: string) => void;
  clearAll:       () => void;
}

const Ctx = createContext<TransportHistoryState | undefined>(undefined);

export function TransportHistoryProvider({ children }: { children: React.ReactNode }) {
  const [problems, setProblems] = useState<SavedTransportProblem[]>(() => load());

  useEffect(() => { persist(problems); }, [problems]);

  const addProblem = useCallback(
    (problem: TransportProblem, modiResult: MODIResult, initialCost: number, sector: TransportSectorKey, lang: string): string => {
      const finalCost    = modiResult.finalCost;
      const improvement  = initialCost > 0 ? ((initialCost - finalCost) / initialCost) * 100 : 0;
      const saved: SavedTransportProblem = {
        id: genId(),
        name: generateTransportProjectName(sector, lang),
        sector,
        savedAt: new Date().toISOString(),
        problem,
        modiResult,
        initialCost,
        finalCost,
        improvement,
      };
      setProblems(prev => [saved, ...prev].slice(0, MAX_PROBLEMS));
      void writeSharedTransportHistory(saved);
      return saved.id;
    },
    []
  );

  const deleteProblem = useCallback((id: string) => {
    setProblems(prev => prev.filter(p => p.id !== id));
  }, []);

  const renameProblem = useCallback((id: string, name: string) => {
    setProblems(prev => prev.map(p => p.id === id ? { ...p, name } : p));
  }, []);

  const clearAll = useCallback(() => { setProblems([]); }, []);

  return (
    <Ctx.Provider value={{ problems, addProblem, deleteProblem, renameProblem, clearAll }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTransportHistory() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTransportHistory must be used inside TransportHistoryProvider");
  return ctx;
}
