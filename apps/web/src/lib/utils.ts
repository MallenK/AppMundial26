import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    ...options,
  }).format(new Date(date));
}

export function formatTime(date: string | Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(new Date(date));
}

export function formatRelative(date: string | Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function getMatchStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    SCHEDULED: "Programado",
    TIMED: "Programado",
    LIVE: "En vivo",
    IN_PLAY: "En juego",
    PAUSED: "Descanso",
    FINISHED: "Finalizado",
    POSTPONED: "Aplazado",
    CANCELLED: "Cancelado",
  };
  return labels[status] ?? status;
}

export function getStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    GROUP_STAGE: "Fase de Grupos",
    LAST_16: "Octavos de Final",
    QUARTER_FINALS: "Cuartos de Final",
    SEMI_FINALS: "Semifinales",
    THIRD_PLACE: "Tercer Puesto",
    FINAL: "Final",
  };
  return labels[stage] ?? stage;
}
