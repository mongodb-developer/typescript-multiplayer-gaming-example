import { createPlayer, createRoom, getLeaderboard } from "../api";
import { connectSocket, socket } from "../socket";
import type { GameStartPayload } from "../types";

const USERNAME_STORAGE_KEY = "coin-race-username";

/**
 * Callback the lobby invokes once a match is actually starting, handing off the
 * room ID, which slot this client plays, and the server's start payload.
 */
export type MatchReadyHandler = (
    roomId: string,
    mySlot: 1 | 2,
    startPayload: GameStartPayload
) => void;

/**
 * Connects the socket if needed and asks the server to seat this username in the
 * given room. The server replies with `room:joined`, and later `game:start` once
 * the second player arrives.
 */
function joinRoom(roomId: string, username: string): void {
    connectSocket();
    socket.emit("room:join", { roomId, username });
}

/**
 * Sets up the lobby screen: grabs the DOM elements, restores the last used
 * username from local storage, loads the leaderboard, and wires the register,
 * create-match, and join-match buttons plus the lobby socket events. Calls
 * `onMatchReady` when the server starts the match. Returns a function that puts
 * the lobby back into its create/join state and reloads the leaderboard.
 */
export function initLobby(onMatchReady: MatchReadyHandler): () => void {
    const usernameInput = document.getElementById("username") as HTMLInputElement;
    const registerBtn = document.getElementById("register-btn") as HTMLButtonElement;
    const lobbyError = document.getElementById("lobby-error") as HTMLParagraphElement;
    const lobbyRegister = document.getElementById("lobby-register") as HTMLDivElement;
    const lobbyActions = document.getElementById("lobby-actions") as HTMLDivElement;
    const lobbyWaiting = document.getElementById("lobby-waiting") as HTMLDivElement;
    const welcomeMessage = document.getElementById("welcome-message") as HTMLParagraphElement;
    const createMatchBtn = document.getElementById("create-match-btn") as HTMLButtonElement;
    const roomIdInput = document.getElementById("room-id-input") as HTMLInputElement;
    const joinMatchBtn = document.getElementById("join-match-btn") as HTMLButtonElement;
    const waitingRoomId = document.getElementById("waiting-room-id") as HTMLElement;
    const leaderboardList = document.getElementById("leaderboard-list") as HTMLOListElement;

    let username = "";
    let pendingRoomId: string | null = null;
    let pendingSlot: 1 | 2 | null = null;

    const savedUsername = localStorage.getItem(USERNAME_STORAGE_KEY);
    if (savedUsername) usernameInput.value = savedUsername;

    /** Displays an error message beneath the lobby controls. */
    function showError(message: string): void {
        lobbyError.textContent = message;
        lobbyError.classList.remove("hidden");
    }

    /** Hides the lobby error message. */
    function clearError(): void {
        lobbyError.classList.add("hidden");
    }

    /**
     * Returns from the "waiting for opponent" state back to the create/join
     * buttons and forgets the pending room, e.g. after a join is rejected.
     */
    function resetToActions(): void {
        lobbyWaiting.classList.add("hidden");
        lobbyActions.classList.remove("hidden");
        pendingRoomId = null;
        pendingSlot = null;
    }

    /**
     * Fetches the leaderboard and renders it as a list, falling back to an
     * inline message if the request fails.
     */
    async function loadLeaderboard(): Promise<void> {
        try {
            const entries = await getLeaderboard();
            leaderboardList.innerHTML = entries
                .map((e) => `<li>${e.username} — ${e.high_score}</li>`)
                .join("");
        } catch {
            leaderboardList.innerHTML = "<li>Unable to load leaderboard.</li>";
        }
    }

    registerBtn.addEventListener("click", async () => {
        const value = usernameInput.value.trim();
        if (!value) {
            showError("Enter a username.");
            return;
        }

        clearError();
        try {
            await createPlayer(value);
            username = value;
            localStorage.setItem(USERNAME_STORAGE_KEY, username);
            welcomeMessage.textContent = `Welcome, ${username}!`;
            lobbyRegister.classList.add("hidden");
            lobbyActions.classList.remove("hidden");
        } catch {
            showError("Failed to register. Try again.");
        }
    });

    createMatchBtn.addEventListener("click", async () => {
        clearError();
        try {
            const match = await createRoom(username);
            pendingRoomId = match._id;
            joinRoom(match._id, username);
        } catch {
            showError("Failed to create match.");
        }
    });

    joinMatchBtn.addEventListener("click", () => {
        const roomId = roomIdInput.value.trim();
        if (!roomId) {
            showError("Enter a room ID.");
            return;
        }
        clearError();
        pendingRoomId = roomId;
        joinRoom(roomId, username);
    });

    socket.on("room:joined", ({ slot, roomId }) => {
        pendingSlot = slot;
        pendingRoomId = roomId;
        waitingRoomId.textContent = roomId;
        lobbyActions.classList.add("hidden");
        lobbyWaiting.classList.remove("hidden");
    });

    socket.on("error", ({ message }) => {
        resetToActions();
        showError(message);
    });

    socket.on("game:start", (payload) => {
        if (!pendingRoomId || !pendingSlot) return;
        onMatchReady(pendingRoomId, pendingSlot, payload);
    });

    void loadLeaderboard();

    return () => {
        clearError();
        resetToActions();
        void loadLeaderboard();
    };
}
