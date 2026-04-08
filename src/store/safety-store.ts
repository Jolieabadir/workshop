/**
 * Safety Supervisor Store
 *
 * Maintains the audit log of all Builder actions for review and analysis.
 */

import { create } from 'zustand';
import type { SafetyLogEntry } from '@/types/canvas';

const MAX_LOG_ENTRIES = 100;

interface SafetyStore {
  /** Audit log of Builder actions (most recent first) */
  log: SafetyLogEntry[];

  /** Add a new log entry */
  addEntry: (entry: Omit<SafetyLogEntry, 'id'>) => void;

  /** Clear all log entries */
  clearLog: () => void;

  /** Get recent entries */
  getRecentEntries: (count?: number) => SafetyLogEntry[];
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const useSafetyStore = create<SafetyStore>((set, get) => ({
  log: [],

  addEntry: (entry) => {
    const newEntry: SafetyLogEntry = {
      ...entry,
      id: uid(),
    };

    set((s) => ({
      log: [newEntry, ...s.log].slice(0, MAX_LOG_ENTRIES),
    }));
  },

  clearLog: () => set({ log: [] }),

  getRecentEntries: (count = 10) => {
    return get().log.slice(0, count);
  },
}));
