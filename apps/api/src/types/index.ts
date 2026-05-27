export type MatchStatus = "SCHEDULED" | "TIMED" | "LIVE" | "IN_PLAY" | "PAUSED" | "FINISHED" | "POSTPONED" | "CANCELLED";
export type MatchStage =
  | "GROUP_STAGE"
  | "LAST_16"
  | "QUARTER_FINALS"
  | "SEMI_FINALS"
  | "THIRD_PLACE"
  | "FINAL";
export type EventType = "GOAL" | "YELLOW_CARD" | "RED_CARD" | "YELLOW_RED_CARD" | "SUBSTITUTION" | "VAR";
export type Winner = "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
export type Position = "GOALKEEPER" | "DEFENDER" | "MIDFIELDER" | "FORWARD";

export interface Team {
  id: number;
  fd_id: number;
  name: string;
  short_name: string | null;
  tla: string | null;
  crest_url: string | null;
  group_name: string | null;
}

export interface Match {
  id: number;
  fd_id: number;
  competition_id: number;
  home_team_id: number;
  away_team_id: number;
  status: MatchStatus;
  stage: MatchStage;
  group_name: string | null;
  match_day: number | null;
  utc_date: Date;
  home_score: number | null;
  away_score: number | null;
  home_score_ht: number | null;
  away_score_ht: number | null;
  minute: number | null;
  winner: Winner;
  venue: string | null;
  last_synced: Date | null;
  created_at: Date;
  // joined
  home_team?: Team;
  away_team?: Team;
}

export interface MatchEvent {
  id: number;
  match_id: number;
  minute: number;
  extra_time: number;
  type: EventType;
  team_id: number | null;
  player_name: string | null;
  player_id: number | null;
  assist_name: string | null;
  detail: string | null;
  created_at: Date;
}

export interface Player {
  id: number;
  fd_id: number | null;
  name: string;
  team_id: number | null;
  position: Position | null;
  nationality: string | null;
  date_of_birth: Date | null;
  shirt_number: number | null;
  photo_url: string | null;
}

export interface PlayerStats {
  id: number;
  player_id: number;
  competition_id: number;
  goals: number;
  assists: number;
  minutes_played: number;
  yellow_cards: number;
  red_cards: number;
  shots: number;
  shots_on_target: number;
  passes: number;
  pass_accuracy: number | null;
  updated_at: Date;
}

export interface Prediction {
  id: number;
  user_id: string;
  match_id: number;
  predicted_winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW";
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  points_earned: number;
  is_scored: boolean;
  created_at: Date;
}

export interface Comment {
  id: number;
  match_id: number;
  user_id: string;
  parent_id: number | null;
  content: string;
  likes_count: number;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
  // joined
  user_name?: string;
  user_image?: string;
  user_liked?: boolean;
}

export interface MatchPhoto {
  id: number;
  match_id: number;
  user_id: string;
  r2_key: string;
  url: string;
  caption: string | null;
  likes_count: number;
  is_approved: boolean;
  created_at: Date;
  // joined
  user_name?: string;
  user_image?: string;
}

// Socket.io event payloads
export interface MatchUpdatePayload {
  matchId: number;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  status: MatchStatus;
}

export interface MatchEventPayload extends MatchEvent {
  teamName?: string;
}

export interface CommentNewPayload {
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
