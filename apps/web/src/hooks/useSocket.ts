import { useEffect, useRef } from "react";
import { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket";

export function useSocket(): Socket {
  const socketRef = useRef<Socket>(getSocket());
  return socketRef.current;
}
