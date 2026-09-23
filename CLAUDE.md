# TypeScript Multiplayer Gaming Example

A demo of a gaming platform with real-time multiplayer capabilities. When two players join a room, it becomes a race to see who can collect the most coins in 30 seconds.

## Technical Requirements

**Backend:** TypeScript, Zod, Socket.io, Express
**Frontend:** Phaser, TypeScript, Socket.io, Axios (HTTP Requests)
**Database:** MongoDB
**Package Manager:** NPM

## Features

- Player / user creation
- Match / room creation
- Leaderboards

## Technical Implementation Details

The REST surface is deliberately limited to the three endpoints the game actually
calls — everything else about a match happens over sockets. This keeps the demo
small and easy to follow.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/players` | Register a player (409 if the username exists) |
| `GET` | `/players/leaderboard` | Top N players by `high_score` |
| `POST` | `/rooms` | Create a match; requester becomes `player_1` |

Joining a room, movement, coin collection, and scoring are socket-only. All three
handlers live in a single `backend/routes.ts`.

The game should be simple. The player, once registered, can either create a match or join a match. The match id is the hash of an object id. When two players are in the match, the game starts. Each player is a white square in a 2D space. Coins, represented by smaller yellow squares will appear randomly on the screen for 30 seconds. When a player touches the coin square, the coin is removed from the scene and that particular player has their score increased. Player movements are done via sockets between the client and the backend. In other words if the player decides to push a key on the keyboard that does movement, that info is sent to the server and only when the server broadcasts with a socket does the player move on the screen for both clients. The client should not control score, movement, etc. Requests for all this should be sent to the server to figure out. When the match ends, both players scores are presented on the screen. If the player wants to play again, they need to create a new match.

The official MongoDB driver for Node.js should be used. We are not going to use Mongoose, Prisma, or any other ODM.

### Data Modeling in MongoDB

The player / user model:

```json
{
    "_id": ObjectId(...),
    "username": "nraboy",
    "high_score": 1000,
    "total_matches_played": 10,
    "total_wins": 4,
    "created_at": TIMESTAMP_HERE
}
```

The match / room model:

```json
{
    "_id": ObjectId(...),
    "status": "waiting | in_progress | finished",
    "player_1": {
        "username": "nraboy",
        "score": 25
    },
    "player_2": {
        "username": "ndaza",
        "score": 50
    },
    "winner": "nraboy",
    "created_at": TIMESTAMP_HERE,
    "ended_at": TIMESTAMP_HERE
}
```

### Canvas / World

- The Phaser canvas is fixed at **1920x1080** (1080p) and is centered in the browser tab.
- Players and coins are constrained to the canvas bounds — the server enforces that no position update can place a player outside the canvas dimensions.
- Players cannot move out of bounds; movement that would exceed the canvas edge is clamped server-side.

### Coin Spawning

Coin spawn behavior is configured via environment variables in the backend `.env` file:

| Variable | Description | Example |
|---|---|---|
| `COIN_MAX_ON_SCREEN` | Maximum number of coins visible at once | `10` |
| `COIN_SPAWN_INTERVAL_MS` | How often (ms) a new coin spawns if below max | `2000` |
| `COIN_SIZE` | Width/height of a coin square in pixels | `20` |
| `PLAYER_SIZE` | Width/height of a player square in pixels | `40` |
| `PLAYER_SPEED` | Pixels moved per movement event | `10` |
| `MATCH_DURATION_MS` | Total match duration in milliseconds | `30000` |

The server is the source of truth for which coins are currently on screen and their positions. When a coin spawns, the server generates a random `(x, y)` position within the canvas bounds and broadcasts it to all players in the room.

### Collision Detection

Collision detection (player touching a coin) is performed **client-side** using Phaser's built-in overlap/bounds checks. When a client detects a collision, it sends a `coin:collect` event to the server with the coin ID and the player's current position. The server validates the claim — verifying the coin exists, is still on screen, and the reported player position is within a reasonable distance of the coin — before removing the coin and incrementing the player's score. The server then broadcasts the updated game state to both clients.

### Player Identity & Room Joining

- There is no authentication. A player identifies themselves by username when they register (create a player document).
- The match ID (derived from the MongoDB ObjectId hash) is the only way to join a room — there is no lobby or room list.
- No room expiration or timeout — this is a demo.
- If a player disconnects mid-game the match ends as-is; no automatic winner is declared.

### Leaderboard

The leaderboard ranks players by `high_score` descending. It is a read-only REST endpoint returning the top N players. `high_score` is updated at match end if the player's score in that match exceeds their stored `high_score`.

### Project Structure

The Phaser game in the frontend directory and the Express server with Socket IO support in the backend directory. They are two independent npm projects — there is no root package, no workspaces, and no shared package.

Because of that, the socket payload types are duplicated between `backend/types/index.ts` and `frontend/src/types.ts` and must be kept in sync by hand. This is a deliberate trade: a shared package would mean build wiring that would have to be set up before writing any game code.

The frontend is a single `index.html` with three `<section class="screen">` elements (lobby, game, results). There is no router: screens and the lobby's sub-states (register, create/join, waiting) are shown and hidden by toggling a global `.hidden` utility class, so that class must not be scoped to `.screen`. `initLobby` returns a reset function that `main.ts` calls on "Play Again" to put the lobby back into create/join and reload the leaderboard.

### Environment Variables

**Backend (`.env`):**

All of these except `MONGO_URI` / `MONGO_DB_NAME` are read once at startup into
`backend/config.ts` and imported from there — nothing reads `process.env` on a
hot path such as player movement.

| Variable | Description |
|---|---|
| `PORT` | Express server port |
| `MONGO_URI` | MongoDB connection string (required) |
| `MONGO_DB_NAME` | Database name (required) |
| `FRONTEND_URL` | Frontend origin for CORS |
| `CANVAS_WIDTH` | Canvas width in pixels |
| `CANVAS_HEIGHT` | Canvas height in pixels |
| `COIN_MAX_ON_SCREEN` | Max coins on screen at once |
| `COIN_SPAWN_INTERVAL_MS` | Coin spawn interval in ms |
| `COIN_SIZE` | Coin square size in pixels |
| `PLAYER_SIZE` | Player square size in pixels |
| `PLAYER_SPEED` | Pixels per movement event |
| `MATCH_DURATION_MS` | Match length in milliseconds |
| `LEADERBOARD_LIMIT` | Number of players returned by the leaderboard |

**Frontend (`.env`):**

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend REST API base URL |
| `VITE_SOCKET_URL` | Backend Socket.io URL |