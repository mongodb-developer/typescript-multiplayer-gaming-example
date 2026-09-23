import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "./types";

// Typing the socket with the event maps means socket.on / socket.emit are
// checked against the server's events — no per-event wrapper functions needed.
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
    import.meta.env.VITE_SOCKET_URL,
    { autoConnect: false }
);

/**
 * Opens the socket connection if it is not already open. The socket is created
 * with `autoConnect: false`, so nothing connects until a player joins a room.
 */
export function connectSocket(): void {
    if (!socket.connected) socket.connect();
}

/**
 * Detaches the in-match event listeners. Called when a match ends so that
 * starting a second match does not stack duplicate handlers on the same socket.
 * Lobby listeners (`room:joined`, `game:start`, `error`) are left in place.
 */
export function removeAllGameListeners(): void {
    socket.off("coin:spawned");
    socket.off("player:moved");
    socket.off("coin:collected");
    socket.off("game:end");
}
