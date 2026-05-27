import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { commentsApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useLiveComments } from "@/hooks/useLiveComments";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/utils";
import { Heart, MessageCircle, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

interface CommentSectionProps {
  matchId: number;
}

export function CommentSection({ matchId }: CommentSectionProps) {
  const { user, isAuthenticated } = useAuth();
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  // Initial comments from API
  const { data } = useQuery({
    queryKey: ["comments", matchId],
    queryFn: () => commentsApi.getByMatch(matchId, { limit: 50 }),
    select: (res) => res.data.comments,
  });

  // Real-time comments via Socket.io
  const { comments } = useLiveComments(matchId, data ?? []);

  const postMutation = useMutation({
    mutationFn: (payload: { content: string; parentId?: number }) =>
      commentsApi.post(matchId, payload),
    onSuccess: () => {
      setContent("");
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ["comments", matchId] });
    },
  });

  const likeMutation = useMutation({
    mutationFn: (commentId: number) => commentsApi.like(commentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comments", matchId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: number) => commentsApi.delete(commentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comments", matchId] }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || postMutation.isPending) return;
    postMutation.mutate({ content: content.trim(), parentId: replyTo ?? undefined });
  };

  return (
    <div className="space-y-4">
      {/* Input */}
      {isAuthenticated ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          {replyTo && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Respondiendo...</span>
              <button type="button" onClick={() => setReplyTo(null)} className="text-red-400 hover:underline">
                Cancelar
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Escribe un comentario..."
              rows={2}
              maxLength={500}
              className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!content.trim() || postMutation.isPending}
              className="self-end"
            >
              Enviar
            </Button>
          </div>
          <div className="text-right text-xs text-muted-foreground">{content.length}/500</div>
        </form>
      ) : (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-white underline">Inicia sesión</Link> para comentar
        </div>
      )}

      {/* Comments list */}
      <div className="space-y-3">
        {comments.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">
            Sin comentarios aún. ¡Sé el primero!
          </p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="rounded-lg border border-white/8 bg-white/3 p-3">
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="h-8 w-8 rounded-full bg-white/10 flex-shrink-0 overflow-hidden">
                  {comment.userImage ? (
                    <img src={comment.userImage} alt={comment.userName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs font-bold">
                      {comment.userName?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Link to={`/profile/${comment.userId}`} className="text-xs font-semibold hover:underline">
                      {comment.userName}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {formatRelative(comment.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-200 break-words">{comment.content}</p>

                  {/* Actions */}
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={() => isAuthenticated && likeMutation.mutate(comment.id)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <Heart className="h-3.5 w-3.5" />
                      {comment.likesCount > 0 && comment.likesCount}
                    </button>
                    {isAuthenticated && (
                      <button
                        onClick={() => { setReplyTo(comment.id); textareaRef.current?.focus(); }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-white transition-colors"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        Responder
                      </button>
                    )}
                    {user?.id === comment.userId && (
                      <button
                        onClick={() => deleteMutation.mutate(comment.id)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400 transition-colors ml-auto"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
