import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { matchesApi } from "@/lib/api";
import { LiveScoreHeader } from "@/components/match/LiveScoreHeader";
import { MatchTimeline } from "@/components/match/MatchTimeline";
import { CommentSection } from "@/components/social/CommentSection";
import { PredictionForm } from "@/components/predictions/PredictionForm";
import { useLiveMatch } from "@/hooks/useLiveMatch";
import { cn, getStageLabel } from "@/lib/utils";

type Tab = "events" | "stats" | "lineups" | "comments" | "photos" | "prediction";

export default function MatchPage() {
  const { id } = useParams<{ id: string }>();
  const matchId = parseInt(id ?? "0", 10);
  const [activeTab, setActiveTab] = useState<Tab>("events");

  const { data, isLoading } = useQuery({
    queryKey: ["match", matchId],
    queryFn: () => matchesApi.getById(matchId),
    select: (res) => res.data,
    refetchInterval: (q) => {
      const status = (q.state.data as any)?.match?.status;
      return ["LIVE", "IN_PLAY", "PAUSED"].includes(status) ? 30_000 : false;
    },
  });

  // Subscribe to live Socket.io updates
  const { liveData, recentEvents, viewerCount } = useLiveMatch(
    matchId,
    data?.match
      ? { homeScore: data.match.home_score, awayScore: data.match.away_score, minute: data.match.minute, status: data.match.status }
      : undefined
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    );
  }

  if (!data?.match) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Partido no encontrado</p>
      </div>
    );
  }

  const match = data.match;
  const homeScore = liveData?.homeScore ?? match.home_score;
  const awayScore = liveData?.awayScore ?? match.away_score;
  const minute = liveData?.minute ?? match.minute;
  const status = liveData?.status ?? match.status;

  const TABS: { key: Tab; label: string }[] = [
    { key: "events", label: "Eventos" },
    { key: "stats", label: "Estadísticas" },
    { key: "lineups", label: "Alineaciones" },
    { key: "comments", label: "💬 Comentarios" },
    { key: "photos", label: "📸 Fotos" },
    { key: "prediction", label: "🎯 Predicción" },
  ];

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      {/* Sticky live score header */}
      <div className="pt-14">
        <LiveScoreHeader
          homeTeam={{ name: match.home_team_name, crest: match.home_team_crest, tla: match.home_team_tla }}
          awayTeam={{ name: match.away_team_name, crest: match.away_team_crest, tla: match.away_team_tla }}
          homeScore={homeScore}
          awayScore={awayScore}
          minute={minute}
          status={status}
        />
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-4">
        {/* Stage / viewer count */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
          <span>{getStageLabel(match.stage)}{match.group_name ? ` — ${match.group_name}` : ""}</span>
          {viewerCount > 1 && (
            <span>{viewerCount} viendo ahora</span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1 mb-6 scrollbar-hide">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                activeTab === key
                  ? "bg-white text-black"
                  : "text-muted-foreground hover:text-white hover:bg-white/10"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "events" && (
          <MatchTimeline
            events={data.events ?? []}
            homeTeamId={match.home_team_id}
            awayTeamId={match.away_team_id}
          />
        )}

        {activeTab === "stats" && (
          <MatchStats stats={data.stats} />
        )}

        {activeTab === "lineups" && (
          <MatchLineups lineups={data.lineups} />
        )}

        {activeTab === "comments" && (
          <CommentSection matchId={matchId} />
        )}

        {activeTab === "photos" && (
          <PhotoFeed matchId={matchId} />
        )}

        {activeTab === "prediction" && (
          <PredictionForm
            matchId={matchId}
            homeTeamName={match.home_team_name}
            homeTeamCrest={match.home_team_crest}
            awayTeamName={match.away_team_name}
            awayTeamCrest={match.away_team_crest}
            existingPrediction={data.userPrediction}
            matchStatus={status}
          />
        )}
      </div>
    </div>
  );
}

// ── Simple stat bars ───────────────────────────────────────────────────────────

function MatchStats({ stats }: { stats: any[] }) {
  if (!stats?.length) {
    return <p className="text-center text-muted-foreground py-8 text-sm">Estadísticas no disponibles</p>;
  }

  const home = stats[0];
  const away = stats[1];

  const statKeys = ["Possession", "Shots on Goal", "Total Shots", "Corners", "Fouls", "Yellow Cards", "Red Cards"];

  return (
    <div className="space-y-4 py-4">
      {statKeys.map((key) => {
        const hStat = home?.statistics?.find((s: any) => s.type === key);
        const aStat = away?.statistics?.find((s: any) => s.type === key);
        const hVal = parseInt(String(hStat?.value ?? "0").replace("%", "")) || 0;
        const aVal = parseInt(String(aStat?.value ?? "0").replace("%", "")) || 0;
        const total = hVal + aVal || 1;

        return (
          <div key={key}>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span className="font-mono font-medium text-white">{hStat?.value ?? 0}</span>
              <span>{key}</span>
              <span className="font-mono font-medium text-white">{aStat?.value ?? 0}</span>
            </div>
            <div className="flex h-1.5 rounded-full overflow-hidden bg-white/10">
              <div className="bg-blue-500 transition-all" style={{ width: `${(hVal / total) * 100}%` }} />
              <div className="bg-red-500 transition-all" style={{ width: `${(aVal / total) * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MatchLineups({ lineups }: { lineups: any[] }) {
  if (!lineups?.length) {
    return <p className="text-center text-muted-foreground py-8 text-sm">Alineaciones no disponibles</p>;
  }

  return (
    <div className="grid sm:grid-cols-2 gap-6 py-4">
      {lineups.map((team: any) => (
        <div key={team.team?.id}>
          <div className="flex items-center gap-2 mb-3">
            {team.team?.logo && <img src={team.team.logo} alt="" className="h-6 w-6 object-contain" />}
            <h3 className="font-semibold text-sm">{team.team?.name}</h3>
            <span className="text-xs text-muted-foreground">{team.formation}</span>
          </div>
          <ul className="space-y-1.5">
            {team.startXI?.map((p: any) => (
              <li key={p.player?.id} className="flex items-center gap-2 text-sm">
                <span className="w-6 text-right text-xs font-mono text-muted-foreground">{p.player?.number}</span>
                <span>{p.player?.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{p.player?.pos}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// Placeholder — photos implemented with PhotoFeed component
function PhotoFeed({ matchId }: { matchId: number }) {
  return (
    <div className="py-8 text-center text-muted-foreground text-sm">
      📸 Sube tu foto viendo el partido<br />
      <span className="text-xs">Máx. 5 fotos por partido</span>
    </div>
  );
}
