import { useState, useEffect, useCallback } from "react";
import { useSocket } from "./useSocket";

export interface LiveComment {
  id: number;
  matchId: number;
  userId: string;
  userName: string;
  userImage: string | null;
  content: string;
  parentId: number | null;
  likesCount: number;
  createdAt: Date;
}

export function useLiveComments(matchId: number | null, initialComments: LiveComment[] = []) {
  const socket = useSocket();
  const [comments, setComments] = useState<LiveComment[]>(initialComments);

  useEffect(() => {
    if (!matchId) return;

    const onNewComment = (comment: LiveComment) => {
      if (comment.matchId === matchId && comment.parentId === null) {
        setComments((prev) => [comment, ...prev]);
      }
    };

    const onCommentLike = (data: { commentId: number; likesCount: number }) => {
      setComments((prev) =>
        prev.map((c) =>
          c.id === data.commentId ? { ...c, likesCount: data.likesCount } : c
        )
      );
    };

    socket.on("comment:new", onNewComment);
    socket.on("comment:like", onCommentLike);

    return () => {
      socket.off("comment:new", onNewComment);
      socket.off("comment:like", onCommentLike);
    };
  }, [matchId, socket]);

  const addComment = useCallback((comment: LiveComment) => {
    setComments((prev) => [comment, ...prev]);
  }, []);

  return { comments, setComments, addComment };
}
