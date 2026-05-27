import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
  withCredentials: true,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login if session expired
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// Typed API helpers
export const matchesApi = {
  getLive: () => api.get("/matches/live"),
  getToday: () => api.get("/matches/today"),
  getAll: (params?: Record<string, any>) => api.get("/matches", { params }),
  getById: (id: number) => api.get(`/matches/${id}`),
  getEvents: (id: number) => api.get(`/matches/${id}/events`),
  getLineups: (id: number) => api.get(`/matches/${id}/lineups`),
  getStats: (id: number) => api.get(`/matches/${id}/stats`),
};

export const predictionsApi = {
  submit: (data: { matchId: number; predictedWinner: string; predictedHomeScore?: number; predictedAwayScore?: number }) =>
    api.post("/predictions", data),
  getMy: (params?: { limit?: number; offset?: number }) => api.get("/predictions/my", { params }),
  getRankingGlobal: (params?: { limit?: number; offset?: number }) =>
    api.get("/predictions/ranking/global", { params }),
  getRankingFriends: () => api.get("/predictions/ranking/friends"),
  getMatchStats: (matchId: number) => api.get(`/predictions/match/${matchId}`),
};

export const commentsApi = {
  getByMatch: (matchId: number, params?: { limit?: number; offset?: number; parentId?: number }) =>
    api.get(`/comments/match/${matchId}`, { params }),
  post: (matchId: number, data: { content: string; parentId?: number }) =>
    api.post(`/comments/match/${matchId}`, data),
  like: (commentId: number) => api.post(`/comments/${commentId}/like`),
  delete: (commentId: number) => api.delete(`/comments/${commentId}`),
};

export const photosApi = {
  getByMatch: (matchId: number, params?: { limit?: number; offset?: number }) =>
    api.get(`/photos/match/${matchId}`, { params }),
  presign: (data: { matchId: number; contentType: string }) => api.post("/photos/presign", data),
  confirm: (data: { matchId: number; r2Key: string; url: string; caption?: string }) =>
    api.post("/photos/confirm", data),
  like: (photoId: number) => api.post(`/photos/${photoId}/like`),
  delete: (photoId: number) => api.delete(`/photos/${photoId}`),
};

export const playersApi = {
  getAll: (params?: { teamId?: number; position?: string; limit?: number }) =>
    api.get("/players", { params }),
  getTopScorers: () => api.get("/players/top-scorers"),
  getById: (id: number) => api.get(`/players/${id}`),
  compare: (ids: number[]) => api.get("/players/compare", { params: { ids: ids.join(",") } }),
};

export const groupsApi = {
  getStandings: () => api.get("/groups/standings"),
};

export const usersApi = {
  getProfile: (id: string) => api.get(`/users/${id}/profile`),
  updateMe: (data: { name?: string; bio?: string }) => api.patch("/users/me", data),
  follow: (id: string) => api.post(`/users/${id}/follow`),
  unfollow: (id: string) => api.delete(`/users/${id}/follow`),
  getFollowers: (id: string) => api.get(`/users/${id}/followers`),
  getFollowing: (id: string) => api.get(`/users/${id}/following`),
};
