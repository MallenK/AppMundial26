import { cn } from "@/lib/utils";

interface LiveScoreHeaderProps {
  homeTeam: { name: string; crest?: string; tla?: string };
  awayTeam: { name: string; crest?: string; tla?: string };
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  status: string;
}

export function LiveScoreHeader({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  minute,
  status,
}: LiveScoreHeaderProps) {
  const isLive = ["LIVE", "IN_PLAY", "PAUSED"].includes(status);
  const isPaused = status === "PAUSED";
  const isFinished = status === "FINISHED";

  return (
    <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-white/10 py-4 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Status */}
        <div className="flex justify-center mb-2">
          {isLive && !isPaused && (
            <span className="flex items-center gap-1.5 text-red-400 text-sm font-semibold">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              {minute ? `${minute}'` : "En vivo"}
            </span>
          )}
          {isPaused && (
            <span className="text-yellow-400 text-sm font-semibold">Descanso</span>
          )}
          {isFinished && (
            <span className="text-slate-400 text-sm font-semibold">Partido finalizado</span>
          )}
          {!isLive && !isFinished && (
            <span className="text-muted-foreground text-sm">Próximamente</span>
          )}
        </div>

        {/* Teams + score */}
        <div className="flex items-center justify-between gap-4">
          {/* Home */}
          <div className="flex flex-1 items-center gap-3 min-w-0">
            {homeTeam.crest && (
              <img src={homeTeam.crest} alt={homeTeam.name} className="h-10 w-10 object-contain" />
            )}
            <div className="min-w-0">
              <p className="font-bold text-base sm:text-lg truncate">{homeTeam.name}</p>
              <p className="text-xs text-muted-foreground">{homeTeam.tla}</p>
            </div>
          </div>

          {/* Score */}
          <div className="text-center flex-shrink-0">
            <span
              className={cn(
                "font-mono font-black text-4xl sm:text-5xl tabular-nums",
                isLive && "text-white",
                isFinished && "text-slate-300"
              )}
            >
              {homeScore ?? 0}
              <span className="text-muted-foreground mx-1">-</span>
              {awayScore ?? 0}
            </span>
          </div>

          {/* Away */}
          <div className="flex flex-1 items-center gap-3 justify-end min-w-0">
            <div className="min-w-0 text-right">
              <p className="font-bold text-base sm:text-lg truncate">{awayTeam.name}</p>
              <p className="text-xs text-muted-foreground">{awayTeam.tla}</p>
            </div>
            {awayTeam.crest && (
              <img src={awayTeam.crest} alt={awayTeam.name} className="h-10 w-10 object-contain" />
            )}
          </div>
        </div>

        {/* Progress bar for live */}
        {isLive && minute && (
          <div className="mt-3 h-0.5 w-full rounded-full bg-white/10">
            <div
              className="h-0.5 rounded-full bg-red-500 transition-all duration-1000"
              style={{ width: `${Math.min((minute / 90) * 100, 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
