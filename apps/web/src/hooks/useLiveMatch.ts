import { useState, useEffect, useCallback } from "react";
import { useSocket } from "./useSocket";

interface LiveMatchState {
  matchId: number;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  status: string;
}

interface MatchEvent {
  matchId: number;
  minute: number;
  type: string;
  playerName?: string;
  assistName?: string;
  teamId?: number;
  detail?: string;
}

interface RoomCount {
  matchId: number;
  count: number;
}

export function useLiveMatch(matchId: number | null, initialData?: Partial<LiveMatchState>) {
  const socket = useSocket();
  const [liveData, setLiveData] = useState<LiveMatchState | null>(
    matchId && initialData
      ? { matchId, homeScore: null, awayScore: null, minute: null, status: "SCHEDULED", ...initialData }
      : null
  );
  const [recentEvents, setRecentEvents] = useState<MatchEvent[]>([]);
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    if (!matchId) return;

    // Join match room
    socket.emit("match:join", matchId);

    // Score/status updates
    const onMatchUpdate = (data: LiveMatchState) => {
      if (data.matchId === matchId) {
        setLiveData(data);
      }
    };

    // Match events (goals, cards, subs)
    const onMatchEvent = (event: MatchEvent) => {
      if (event.matchId === matchId) {
        setRecentEvents((prev) => [event, ...prev].slice(0, 20));
        // Flash notification for goals
        if (event.type === "GOAL") {
          triggerGoalAnimation();
        }
      }
    };

    // Viewer count
    const onRoomCount = (data: RoomCount) => {
      if (data.matchId === matchId) {
        setViewerCount(data.count);
      }
    };

    socket.on("match:update", onMatchUpdate);
    socket.on("match:event", onMatchEvent);
    socket.on("room:count", onRoomCount);

    return () => {
      socket.emit("match:leave", matchId);
      socket.off("match:update", onMatchUpdate);
      socket.off("match:event", onMatchEvent);
      socket.off("room:count", onRoomCount);
    };
  }, [matchId, socket]);

  const clearRecentEvents = useCallback(() => setRecentEvents([]), []);

  return { liveData, recentEvents, viewerCount, clearRecentEvents };
}

// Trigger a brief "GOAL!" animation class on body
function triggerGoalAnimation() {
  document.body.classList.add("goal-flash");
  setTimeout(() => document.body.classList.remove("goal-flash"), 2000);
}
