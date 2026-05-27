import { create } from "zustand";

interface LiveMatchScore {
  matchId: number;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  status: string;
}

interface MatchStore {
  liveScores: Map<number, LiveMatchScore>;
  updateLiveScore: (data: LiveMatchScore) => void;
  getLiveScore: (matchId: number) => LiveMatchScore | undefined;
}

export const useMatchStore = create<MatchStore>((set, get) => ({
  liveScores: new Map(),

  updateLiveScore: (data) => {
    set((state) => {
      const newMap = new Map(state.liveScores);
      newMap.set(data.matchId, data);
      return { liveScores: newMap };
    });
  },

  getLiveScore: (matchId) => get().liveScores.get(matchId),
}));
