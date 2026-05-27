import { cn } from "@/lib/utils";

interface MatchEvent {
  id: number;
  minute: number;
  extra_time?: number;
  type: string;
  player_name?: string;
  assist_name?: string;
  detail?: string;
  team_id?: number;
  teamName?: string;
}

interface MatchTimelineProps {
  events: MatchEvent[];
  homeTeamId?: number;
  awayTeamId?: number;
}

const EVENT_ICONS: Record<string, string> = {
  GOAL: "⚽",
  YELLOW_CARD: "🟨",
  RED_CARD: "🟥",
  YELLOW_RED_CARD: "🟨🟥",
  SUBSTITUTION: "🔄",
  VAR: "📺",
};

export function MatchTimeline({ events, homeTeamId, awayTeamId }: MatchTimelineProps) {
  if (!events?.length) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        Aún no hay eventos en este partido
      </div>
    );
  }

  const sorted = [...events].sort((a, b) => a.minute - b.minute);

  return (
    <div className="space-y-1 py-4">
      {sorted.map((event) => {
        const isHome = event.team_id === homeTeamId;
        const isAway = event.team_id === awayTeamId;
        const icon = EVENT_ICONS[event.type] ?? "📌";

        return (
          <div
            key={event.id}
            className={cn(
              "flex items-center gap-3 px-4 py-2 rounded-lg",
              event.type === "GOAL" && "bg-green-500/10 border border-green-500/20"
            )}
          >
            {/* Minute */}
            <span className="text-xs text-muted-foreground font-mono w-8 text-right flex-shrink-0">
              {event.minute}{event.extra_time ? `+${event.extra_time}` : ""}'
            </span>

            {/* Icon */}
            <span className="text-base flex-shrink-0">{icon}</span>

            {/* Player info — home left, away right */}
            {isHome ? (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{event.player_name}</p>
                  {event.assist_name && (
                    <p className="text-xs text-muted-foreground truncate">Asistencia: {event.assist_name}</p>
                  )}
                  {event.detail && event.detail !== "Normal Goal" && (
                    <p className="text-xs text-muted-foreground">{event.detail}</p>
                  )}
                </div>
                <div className="flex-1" />
              </>
            ) : (
              <>
                <div className="flex-1" />
                <div className="flex-1 min-w-0 text-right">
                  <p className="text-sm font-medium truncate">{event.player_name}</p>
                  {event.assist_name && (
                    <p className="text-xs text-muted-foreground truncate">Asistencia: {event.assist_name}</p>
                  )}
                  {event.detail && event.detail !== "Normal Goal" && (
                    <p className="text-xs text-muted-foreground">{event.detail}</p>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
