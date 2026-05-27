import { useQuery } from "@tanstack/react-query";
import { matchesApi, groupsApi } from "@/lib/api";
import { MatchCard } from "@/components/match/MatchCard";
import { getStageLabel, formatDate } from "@/lib/utils";

export default function Home() {
  const { data: liveData, isLoading: liveLoading } = useQuery({
    queryKey: ["matches", "live"],
    queryFn: () => matchesApi.getLive(),
    select: (res) => res.data.matches,
    refetchInterval: 30_000, // poll every 30s as fallback
  });

  const { data: todayData, isLoading: todayLoading } = useQuery({
    queryKey: ["matches", "today"],
    queryFn: () => matchesApi.getToday(),
    select: (res) => res.data.matches,
    refetchInterval: 60_000,
  });

  const { data: upcomingData } = useQuery({
    queryKey: ["matches", "upcoming"],
    queryFn: () => matchesApi.getAll({ status: "SCHEDULED", limit: 10 }),
    select: (res) => res.data.matches,
    refetchInterval: 300_000,
  });

  const { data: standingsData } = useQuery({
    queryKey: ["standings"],
    queryFn: () => groupsApi.getStandings(),
    select: (res) => res.data,
    staleTime: 5 * 60_000,
  });

  const liveMatches = liveData ?? [];
  const todayMatches = todayData ?? [];
  const upcomingMatches = upcomingData ?? [];

  return (
    <main className="max-w-6xl mx-auto px-4 pb-24 pt-20">
      {/* Hero */}
      <section className="py-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-black mb-2">
          🌍 Mundial FIFA 2026
        </h1>
        <p className="text-muted-foreground">
          Sigue todos los partidos en tiempo real
        </p>
      </section>

      {/* LIVE now */}
      {liveMatches.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            En directo
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {liveMatches.map((m: any) => (
              <MatchCard key={m.fixture?.id ?? m.id} id={m.id ?? m.fixture?.id} {...normalizeMatch(m)} status="LIVE" />
            ))}
          </div>
        </section>
      )}

      {/* Today */}
      {todayMatches.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3 text-muted-foreground">
            Hoy — {formatDate(new Date())}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {todayMatches.map((m: any) => (
              <MatchCard key={m.fixture?.id ?? m.id} id={m.id ?? m.fixture?.id} {...normalizeMatch(m)} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming */}
      {upcomingMatches.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3 text-muted-foreground">
            Próximos partidos
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {upcomingMatches.slice(0, 6).map((m: any) => (
              <MatchCard key={m.id} id={m.id} {...m} />
            ))}
          </div>
        </section>
      )}

      {/* Standings preview */}
      {standingsData?.standings?.[0] && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3 text-muted-foreground">
            Clasificación — Grupos
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {standingsData.standings[0].slice(0, 6).map((group: any, i: number) => (
              <GroupTable key={i} group={group} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function GroupTable({ group }: { group: any[] }) {
  if (!group?.length) return null;
  const groupName = group[0]?.group ?? "Grupo";

  return (
    <div className="rounded-xl border border-white/8 overflow-hidden">
      <div className="px-4 py-2.5 bg-white/5 border-b border-white/8">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">{groupName}</h3>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left px-4 py-2">Equipo</th>
            <th className="px-2 py-2">PJ</th>
            <th className="px-2 py-2">G</th>
            <th className="px-2 py-2">E</th>
            <th className="px-2 py-2">P</th>
            <th className="px-2 py-2 text-right font-bold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {group.map((team: any) => (
            <tr key={team.team?.id ?? team.position} className="border-t border-white/5">
              <td className="px-4 py-2 flex items-center gap-2">
                {team.team?.crest && (
                  <img src={team.team.crest} alt="" className="h-4 w-4 object-contain" />
                )}
                <span className="truncate font-medium">{team.team?.shortName ?? team.team?.name}</span>
              </td>
              <td className="px-2 py-2 text-center text-muted-foreground">{team.playedGames}</td>
              <td className="px-2 py-2 text-center text-muted-foreground">{team.won}</td>
              <td className="px-2 py-2 text-center text-muted-foreground">{team.draw}</td>
              <td className="px-2 py-2 text-center text-muted-foreground">{team.lost}</td>
              <td className="px-2 py-2 text-right font-bold">{team.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Normalize api-football.com response shape to our MatchCard props
function normalizeMatch(m: any) {
  const isAfl = !!m.fixture; // api-football.com shape
  if (isAfl) {
    return {
      status: mapAflStatus(m.fixture?.status?.short),
      utc_date: m.fixture?.date,
      home_score: m.goals?.home,
      away_score: m.goals?.away,
      minute: m.fixture?.status?.elapsed,
      home_team_name: m.teams?.home?.name,
      home_team_crest: m.teams?.home?.logo,
      away_team_name: m.teams?.away?.name,
      away_team_crest: m.teams?.away?.logo,
    };
  }
  return m; // already our DB shape
}

function mapAflStatus(short: string): string {
  const map: Record<string, string> = {
    "1H": "LIVE", HT: "LIVE", "2H": "LIVE", ET: "LIVE", P: "LIVE",
    FT: "FINISHED", AET: "FINISHED", PEN: "FINISHED",
    NS: "SCHEDULED", TBD: "SCHEDULED",
  };
  return map[short] ?? "SCHEDULED";
}
