import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn, formatTime, formatDate, getMatchStatusLabel } from "@/lib/utils";
import { useMatchStore } from "@/stores/matchStore";

interface Team {
  name: string;
  short_name?: string;
  tla?: string;
  crest_url?: string;
  flag_url?: string;
}

interface MatchCardProps {
  id: number;
  afl_id?: number;
  status: string;
  stage?: string;
  utc_date: string;
  home_score?: number | null;
  away_score?: number | null;
  minute?: number | null;
  home_team_name: string;
  home_team_tla?: string;
  home_team_crest?: string;
  away_team_name: string;
  away_team_tla?: string;
  away_team_crest?: string;
  className?: string;
}

export function MatchCard({
  id,
  status,
  utc_date,
  home_score: initialHomeScore,
  away_score: initialAwayScore,
  minute: initialMinute,
  home_team_name,
  home_team_tla,
  home_team_crest,
  away_team_name,
  away_team_tla,
  away_team_crest,
  className,
}: MatchCardProps) {
  // Try to get live score from global store (updated by Socket.io)
  const liveScore = useMatchStore((s) => s.getLiveScore(id));
  const homeScore = liveScore?.homeScore ?? initialHomeScore;
  const awayScore = liveScore?.awayScore ?? initialAwayScore;
  const minute = liveScore?.minute ?? initialMinute;
  const currentStatus = liveScore?.status ?? status;

  const isLive = ["LIVE", "IN_PLAY", "PAUSED"].includes(currentStatus);
  const isFinished = currentStatus === "FINISHED";
  const isScheduled = !isLive && !isFinished;

  return (
    <Link
      to={`/match/${id}`}
      className={cn(
        "block rounded-xl border border-white/8 bg-card p-4 transition-all hover:border-white/20 hover:bg-card/80",
        isLive && "border-red-500/30 bg-red-500/5",
        className
      )}
    >
      {/* Status badge */}
      <div className="flex items-center justify-between mb-3">
        {isLive ? (
          <Badge variant="live">● LIVE {minute ? `${minute}'` : ""}</Badge>
        ) : isFinished ? (
          <Badge variant="finished">Finalizado</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            {formatDate(utc_date)} · {formatTime(utc_date)}
          </span>
        )}
      </div>

      {/* Teams + score */}
      <div className="flex items-center justify-between gap-4">
        {/* Home team */}
        <div className="flex flex-1 items-center gap-2 min-w-0">
          {home_team_crest && (
            <img src={home_team_crest} alt={home_team_name} className="h-7 w-7 object-contain flex-shrink-0" />
          )}
          <span className="font-semibold text-sm truncate">
            {home_team_tla ?? home_team_name}
          </span>
        </div>

        {/* Score */}
        <div className="flex items-center gap-2 text-center">
          {isScheduled ? (
            <span className="text-muted-foreground font-mono text-sm">
              {formatTime(utc_date)}
            </span>
          ) : (
            <span className={cn("font-mono font-bold text-2xl tabular-nums", isLive && "text-white")}>
              {homeScore ?? 0} - {awayScore ?? 0}
            </span>
          )}
        </div>

        {/* Away team */}
        <div className="flex flex-1 items-center gap-2 justify-end min-w-0">
          <span className="font-semibold text-sm truncate text-right">
            {away_team_tla ?? away_team_name}
          </span>
          {away_team_crest && (
            <img src={away_team_crest} alt={away_team_name} className="h-7 w-7 object-contain flex-shrink-0" />
          )}
        </div>
      </div>

      {/* Live indicator */}
      {isLive && (
        <div className="mt-2 flex items-center justify-center">
          <div className="h-1 w-full rounded-full bg-white/10">
            <div
              className="h-1 rounded-full bg-red-500 transition-all duration-1000"
              style={{ width: `${Math.min(((minute ?? 0) / 90) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
    </Link>
  );
}
