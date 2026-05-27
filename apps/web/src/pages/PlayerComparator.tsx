import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { playersApi } from "@/lib/api";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";

const STAT_KEYS = ["goals", "assists", "minutes_played", "yellow_cards", "red_cards", "shots_on_target", "pass_accuracy"] as const;
const STAT_LABELS: Record<string, string> = {
  goals: "Goles", assists: "Asistencias", minutes_played: "Minutos",
  yellow_cards: "TA", red_cards: "TR", shots_on_target: "Tiros a puerta", pass_accuracy: "Precisión pases %",
};

export default function PlayerComparatorPage() {
  const [ids, setIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");

  const { data: playersData } = useQuery({
    queryKey: ["players"],
    queryFn: () => playersApi.getAll({ limit: 200 }),
    select: (res) => res.data.players,
  });

  const { data: compareData } = useQuery({
    queryKey: ["compare", ids],
    queryFn: () => playersApi.compare(ids),
    select: (res) => res.data.players,
    enabled: ids.length >= 2,
  });

  const players = playersData ?? [];
  const filtered = search
    ? players.filter((p: any) => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];

  const togglePlayer = (id: number) => {
    setIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  // Build radar chart data
  const radarData = STAT_KEYS.map((key) => ({
    stat: STAT_LABELS[key],
    ...Object.fromEntries(
      (compareData ?? []).map((p: any) => [p.name, Number(p[key] ?? 0)])
    ),
  }));

  const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b"];

  return (
    <main className="max-w-4xl mx-auto px-4 pb-24 pt-20">
      <h1 className="text-2xl font-black mb-2">⚖️ Comparador de jugadores</h1>
      <p className="text-muted-foreground text-sm mb-6">Selecciona hasta 4 jugadores para comparar</p>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar jugador..."
        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm mb-2 focus:outline-none focus:ring-1 focus:ring-white/20"
      />

      {/* Search results */}
      {filtered.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-card mb-6">
          {filtered.map((p: any) => (
            <button
              key={p.id}
              onClick={() => { togglePlayer(p.id); setSearch(""); }}
              className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-white/5 transition-colors text-sm border-b border-white/5 last:border-0"
            >
              {p.photo_url && <img src={p.photo_url} alt={p.name} className="h-7 w-7 rounded-full object-cover" />}
              <span className="flex-1 text-left font-medium">{p.name}</span>
              <span className="text-muted-foreground text-xs">{p.team_name}</span>
              {ids.includes(p.id) && <span className="text-green-400 text-xs font-bold">✓</span>}
            </button>
          ))}
        </div>
      )}

      {/* Selected players chips */}
      {ids.length > 0 && compareData && (
        <div className="flex flex-wrap gap-2 mb-6">
          {compareData.map((p: any, i: number) => (
            <div key={p.id} className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs" style={{ borderColor: COLORS[i] }}>
              <span style={{ color: COLORS[i] }}>●</span>
              <span>{p.name}</span>
              <button onClick={() => togglePlayer(p.id)} className="text-muted-foreground hover:text-white ml-1">✕</button>
            </div>
          ))}
        </div>
      )}

      {compareData && compareData.length >= 2 && (
        <>
          {/* Radar chart */}
          <div className="rounded-xl border border-white/10 bg-white/3 p-4 mb-6">
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis dataKey="stat" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                {compareData.map((p: any, i: number) => (
                  <Radar
                    key={p.id}
                    name={p.name}
                    dataKey={p.name}
                    stroke={COLORS[i]}
                    fill={COLORS[i]}
                    fillOpacity={0.15}
                  />
                ))}
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Stats table */}
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Stat</th>
                  {compareData.map((p: any, i: number) => (
                    <th key={p.id} className="px-4 py-3 text-center font-semibold" style={{ color: COLORS[i] }}>
                      {p.name.split(" ").slice(-1)[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STAT_KEYS.map((key) => {
                  const values = compareData.map((p: any) => Number(p[key] ?? 0));
                  const max = Math.max(...values);
                  return (
                    <tr key={key} className="border-t border-white/5">
                      <td className="px-4 py-3 text-muted-foreground">{STAT_LABELS[key]}</td>
                      {compareData.map((p: any, i: number) => {
                        const val = Number(p[key] ?? 0);
                        return (
                          <td key={p.id} className="px-4 py-3 text-center font-mono font-medium"
                            style={{ color: val === max && max > 0 ? COLORS[i] : "inherit" }}>
                            {key === "pass_accuracy" ? `${val}%` : val}
                            {val === max && max > 0 && <span className="ml-1 text-xs">↑</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {ids.length === 0 && (
        <div className="text-center text-muted-foreground py-16">
          <p className="text-4xl mb-3">⚽</p>
          <p>Busca y selecciona 2-4 jugadores para comparar</p>
        </div>
      )}
    </main>
  );
}
