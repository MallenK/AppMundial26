import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Trophy, Users } from "lucide-react";

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user: me } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["profile", id],
    queryFn: () => usersApi.getProfile(id!),
    select: (res) => res.data,
    enabled: !!id,
  });

  const followMutation = useMutation({
    mutationFn: (following: boolean) =>
      following ? usersApi.unfollow(id!) : usersApi.follow(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile", id] }),
  });

  if (isLoading) return (
    <div className="flex justify-center pt-32">
      <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
    </div>
  );

  if (!data?.user) return (
    <div className="pt-32 text-center text-muted-foreground">Usuario no encontrado</div>
  );

  const { user, stats, recentPredictions, social } = data;
  const isMe = me?.id === user.id;

  return (
    <main className="max-w-2xl mx-auto px-4 pb-24 pt-20">
      {/* Profile header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="h-20 w-20 rounded-full bg-white/10 flex-shrink-0 overflow-hidden">
          {user.image
            ? <img src={user.image} alt={user.name} className="h-full w-full object-cover" />
            : <div className="h-full w-full flex items-center justify-center text-2xl font-black">{user.name[0]}</div>
          }
        </div>

        <div className="flex-1">
          <h1 className="text-xl font-black">{user.name}</h1>
          {user.bio && <p className="text-sm text-muted-foreground mt-1">{user.bio}</p>}

          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            <span><strong className="text-white">{social.followers}</strong> seguidores</span>
            <span><strong className="text-white">{social.following}</strong> siguiendo</span>
          </div>
        </div>

        {!isMe && me && (
          <Button
            size="sm"
            variant={social.isFollowing ? "outline" : "default"}
            onClick={() => followMutation.mutate(social.isFollowing)}
            disabled={followMutation.isPending}
          >
            {social.isFollowing ? "Siguiendo" : "Seguir"}
          </Button>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <p className="text-2xl font-black text-yellow-400">{user.total_points}</p>
          <p className="text-xs text-muted-foreground mt-1">Puntos</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <p className="text-2xl font-black">{stats.correct_predictions ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Correctas</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <p className="text-2xl font-black text-green-400">{stats.exact_scores ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Exactas</p>
        </div>
      </div>

      {/* Recent predictions */}
      {recentPredictions.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Últimas predicciones
          </h2>
          <div className="space-y-2">
            {recentPredictions.map((pred: any) => (
              <div key={pred.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 p-3 text-sm">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {pred.home_team_crest && <img src={pred.home_team_crest} alt="" className="h-5 w-5 object-contain" />}
                  <span className="text-muted-foreground text-xs truncate">
                    {pred.home_team_name} vs {pred.away_team_name}
                  </span>
                </div>
                {pred.is_scored && (
                  <span className={cn(
                    "font-bold text-xs flex-shrink-0",
                    pred.points_earned === 5 && "text-green-400",
                    pred.points_earned === 3 && "text-yellow-400",
                    pred.points_earned === 0 && "text-muted-foreground",
                  )}>
                    {pred.points_earned > 0 ? `+${pred.points_earned}` : "0"} pts
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
