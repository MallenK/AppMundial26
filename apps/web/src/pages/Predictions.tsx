import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { predictionsApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { cn, formatDate } from "@/lib/utils";
import { Trophy, Users } from "lucide-react";
import { Link } from "react-router-dom";

type Tab = "global" | "friends" | "my";

export default function PredictionsPage() {
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("global");

  const globalQuery = useQuery({
    queryKey: ["ranking", "global"],
    queryFn: () => predictionsApi.getRankingGlobal({ limit: 50 }),
    select: (res) => res.data.ranking,
    enabled: tab === "global",
  });

  const friendsQuery = useQuery({
    queryKey: ["ranking", "friends"],
    queryFn: () => predictionsApi.getRankingFriends(),
    select: (res) => res.data.ranking,
    enabled: tab === "friends" && isAuthenticated,
  });

  const myQuery = useQuery({
    queryKey: ["predictions", "my"],
    queryFn: () => predictionsApi.getMy({ limit: 50 }),
    select: (res) => res.data.predictions,
    enabled: tab === "my" && isAuthenticated,
  });

  const ranking = tab === "global" ? globalQuery.data : friendsQuery.data;

  return (
    <main className="max-w-2xl mx-auto px-4 pb-24 pt-20">
      <h1 className="text-2xl font-black mb-6 flex items-center gap-2">
        <Trophy className="h-6 w-6 text-yellow-400" />
        Predicciones
      </h1>

      {/* Scoring explanation */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 mb-6 flex gap-6 text-sm">
        <div className="text-center">
          <p className="font-bold text-lg">+3</p>
          <p className="text-muted-foreground text-xs">Ganador correcto</p>
        </div>
        <div className="text-center">
          <p className="font-bold text-lg text-green-400">+5</p>
          <p className="text-muted-foreground text-xs">Resultado exacto</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(["global", "friends", "my"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              tab === t ? "bg-white text-black" : "text-muted-foreground hover:text-white hover:bg-white/10"
            )}
          >
            {t === "global" ? "🌍 Global" : t === "friends" ? "👥 Amigos" : "🎯 Mis predicciones"}
          </button>
        ))}
      </div>

      {/* Ranking */}
      {(tab === "global" || tab === "friends") && (
        <div className="space-y-2">
          {!isAuthenticated && tab === "friends" && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Link to="/login" className="text-white underline">Inicia sesión</Link> para ver el ranking de amigos
            </div>
          )}
          {ranking?.map((user: any) => (
            <Link
              key={user.id}
              to={`/profile/${user.id}`}
              className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 p-3 hover:border-white/20 transition-colors"
            >
              <span className={cn(
                "w-8 text-center font-bold text-sm",
                user.rank === 1 && "text-yellow-400",
                user.rank === 2 && "text-slate-300",
                user.rank === 3 && "text-amber-600",
              )}>
                {user.rank === 1 ? "🥇" : user.rank === 2 ? "🥈" : user.rank === 3 ? "🥉" : `#${user.rank}`}
              </span>

              <div className="h-9 w-9 rounded-full bg-white/10 flex-shrink-0 overflow-hidden">
                {user.image
                  ? <img src={user.image} alt={user.name} className="h-full w-full object-cover" />
                  : <div className="h-full w-full flex items-center justify-center text-xs font-bold">{user.name?.[0]}</div>
                }
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground">
                  {user.correct_predictions ?? 0} / {user.total_predictions ?? 0} correctas
                </p>
              </div>

              <div className="text-right">
                <p className="font-bold text-yellow-400">{user.total_points} pts</p>
              </div>
            </Link>
          ))}
          {ranking?.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">Aún no hay predicciones</p>
          )}
        </div>
      )}

      {/* My predictions */}
      {tab === "my" && (
        <div className="space-y-3">
          {!isAuthenticated ? (
            <div className="text-center py-8">
              <Link to="/login" className="text-white underline">Inicia sesión</Link> para ver tus predicciones
            </div>
          ) : myQuery.data?.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">
              Aún no has hecho predicciones. Busca un partido y predice el resultado.
            </p>
          ) : (
            myQuery.data?.map((pred: any) => (
              <Link
                key={pred.id}
                to={`/match/${pred.match_id}`}
                className="block rounded-xl border border-white/8 bg-white/3 p-4 hover:border-white/20 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {pred.home_team_crest && <img src={pred.home_team_crest} alt="" className="h-5 w-5 object-contain" />}
                    <span>{pred.home_team_name}</span>
                    <span className="text-muted-foreground">vs</span>
                    <span>{pred.away_team_name}</span>
                    {pred.away_team_crest && <img src={pred.away_team_crest} alt="" className="h-5 w-5 object-contain" />}
                  </div>
                  {pred.is_scored && (
                    <span className={cn(
                      "text-sm font-bold",
                      pred.points_earned === 5 && "text-green-400",
                      pred.points_earned === 3 && "text-yellow-400",
                      pred.points_earned === 0 && "text-muted-foreground"
                    )}>
                      {pred.points_earned > 0 ? `+${pred.points_earned}` : "0"} pts
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Tu predicción:</span>
                  <span className="font-medium text-white">
                    {pred.predicted_winner === "HOME_TEAM" ? pred.home_team_name
                      : pred.predicted_winner === "AWAY_TEAM" ? pred.away_team_name
                      : "Empate"}
                  </span>
                  {pred.predicted_home_score !== null && (
                    <span className="font-mono">({pred.predicted_home_score}-{pred.predicted_away_score})</span>
                  )}
                </div>

                {pred.status === "FINISHED" && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Resultado final: {pred.home_score}-{pred.away_score}
                  </div>
                )}
              </Link>
            ))
          )}
        </div>
      )}
    </main>
  );
}
