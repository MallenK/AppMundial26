import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { predictionsApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface PredictionFormProps {
  matchId: number;
  homeTeamName: string;
  homeTeamCrest?: string;
  awayTeamName: string;
  awayTeamCrest?: string;
  existingPrediction?: {
    predictedWinner: string;
    predictedHomeScore?: number;
    predictedAwayScore?: number;
  } | null;
  matchStatus: string;
}

type Winner = "HOME_TEAM" | "AWAY_TEAM" | "DRAW";

export function PredictionForm({
  matchId,
  homeTeamName,
  homeTeamCrest,
  awayTeamName,
  awayTeamCrest,
  existingPrediction,
  matchStatus,
}: PredictionFormProps) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const [winner, setWinner] = useState<Winner | null>(
    (existingPrediction?.predictedWinner as Winner) ?? null
  );
  const [homeScore, setHomeScore] = useState<string>(
    existingPrediction?.predictedHomeScore?.toString() ?? ""
  );
  const [awayScore, setAwayScore] = useState<string>(
    existingPrediction?.predictedAwayScore?.toString() ?? ""
  );
  const [showExact, setShowExact] = useState(
    !!existingPrediction?.predictedHomeScore || !!existingPrediction?.predictedAwayScore
  );
  const [success, setSuccess] = useState(false);

  const canPredict = matchStatus === "SCHEDULED" || matchStatus === "TIMED";

  const mutation = useMutation({
    mutationFn: () =>
      predictionsApi.submit({
        matchId,
        predictedWinner: winner!,
        predictedHomeScore: showExact && homeScore !== "" ? parseInt(homeScore) : undefined,
        predictedAwayScore: showExact && awayScore !== "" ? parseInt(awayScore) : undefined,
      }),
    onSuccess: () => {
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["match", matchId] });
      queryClient.invalidateQueries({ queryKey: ["predictions", "my"] });
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-sm text-muted-foreground mb-3">
          <Link to="/login" className="text-white underline font-medium">Inicia sesión</Link> para predecir el resultado
        </p>
        <div className="flex justify-center gap-4 text-xs text-muted-foreground">
          <span>🏆 +3 puntos por ganador</span>
          <span>⭐ +5 puntos resultado exacto</span>
        </div>
      </div>
    );
  }

  if (!canPredict) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
        <p className="text-sm text-muted-foreground">
          Las predicciones cierran cuando el partido comienza
        </p>
        {existingPrediction && (
          <p className="text-sm font-medium mt-2">
            Tu predicción: {existingPrediction.predictedWinner === "HOME_TEAM"
              ? homeTeamName
              : existingPrediction.predictedWinner === "AWAY_TEAM"
              ? awayTeamName
              : "Empate"}
            {existingPrediction.predictedHomeScore !== undefined && (
              <span className="text-muted-foreground ml-1">
                ({existingPrediction.predictedHomeScore}-{existingPrediction.predictedAwayScore})
              </span>
            )}
          </p>
        )}
      </div>
    );
  }

  if (success) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-6 text-center">
        <p className="text-green-400 font-semibold">¡Predicción guardada! 🎯</p>
        <p className="text-xs text-muted-foreground mt-1">Puedes cambiarla hasta que empiece el partido</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Tu predicción</h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>+3 ganador</span>
          <span className="text-green-400 font-medium">+5 exacto</span>
        </div>
      </div>

      {/* Winner selector */}
      <div className="grid grid-cols-3 gap-2">
        {(["HOME_TEAM", "DRAW", "AWAY_TEAM"] as Winner[]).map((option) => {
          const label =
            option === "HOME_TEAM" ? homeTeamName :
            option === "AWAY_TEAM" ? awayTeamName : "Empate";
          const crest =
            option === "HOME_TEAM" ? homeTeamCrest :
            option === "AWAY_TEAM" ? awayTeamCrest : null;

          return (
            <button
              key={option}
              onClick={() => setWinner(option)}
              className={cn(
                "rounded-lg border p-3 text-center transition-all text-xs font-medium",
                winner === option
                  ? "border-white bg-white text-black"
                  : "border-white/10 bg-white/5 hover:border-white/30"
              )}
            >
              {crest && option !== "DRAW" && (
                <img src={crest} alt={label} className="h-6 w-6 mx-auto mb-1 object-contain" />
              )}
              {option === "DRAW" && <span className="text-2xl block mb-1">🤝</span>}
              <span className="truncate block">{option === "DRAW" ? "Empate" : label.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>

      {/* Exact score toggle */}
      <button
        onClick={() => setShowExact(!showExact)}
        className="text-xs text-muted-foreground hover:text-white transition-colors"
      >
        {showExact ? "▼" : "▶"} Predecir marcador exacto (+5 pts)
      </button>

      {showExact && (
        <div className="flex items-center justify-center gap-4">
          <input
            type="number"
            min={0}
            max={30}
            value={homeScore}
            onChange={(e) => setHomeScore(e.target.value)}
            placeholder="0"
            className="w-16 rounded-lg border border-white/10 bg-white/5 p-2 text-center text-xl font-mono focus:outline-none focus:ring-1 focus:ring-white/20"
          />
          <span className="text-muted-foreground font-bold">-</span>
          <input
            type="number"
            min={0}
            max={30}
            value={awayScore}
            onChange={(e) => setAwayScore(e.target.value)}
            placeholder="0"
            className="w-16 rounded-lg border border-white/10 bg-white/5 p-2 text-center text-xl font-mono focus:outline-none focus:ring-1 focus:ring-white/20"
          />
        </div>
      )}

      <Button
        onClick={() => mutation.mutate()}
        disabled={!winner || mutation.isPending}
        className="w-full"
      >
        {mutation.isPending ? "Guardando..." : existingPrediction ? "Actualizar predicción" : "Guardar predicción"}
      </Button>

      {mutation.isError && (
        <p className="text-red-400 text-xs text-center">
          Error al guardar. Inténtalo de nuevo.
        </p>
      )}
    </div>
  );
}
