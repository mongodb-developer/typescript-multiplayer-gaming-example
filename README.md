# Coin Race: TypeScript Multiplayer Gaming Example

A two-player, real-time coin collecting game built with Phaser, Socket.io, Express, and MongoDB. Two players join a room and race to collect the most coins in 30 seconds. The server is the source of truth for movement, coins, and scoring, and MongoDB stores players, matches, and the leaderboard.

## Requirements

- Node.js 20+
- A MongoDB database, such as a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster or a local instance

## Getting Started

### 1. Install dependencies

From the project root:

```shell
npm install
npm run install:all
```

This installs the root dev tooling plus the `backend` and `frontend` projects.

### 2. Configure the backend

```shell
cp backend/.env.example backend/.env
```

Open **backend/.env** and set at least these two values:

```plaintext
MONGO_URI=<your MongoDB connection string>
MONGO_DB_NAME=<database name, e.g. coin_race>
```

Everything else (port, canvas size, coin spawning, match length, and so on) has a sensible default and can be left alone.

### 3. Configure the frontend

```shell
cp frontend/.env.example frontend/.env
```

The defaults point at a backend on `http://localhost:3000`. If you changed `PORT` in the backend, update `VITE_API_URL` and `VITE_SOCKET_URL` to match.

### 4. Run it

```shell
npm run dev
```

This starts the backend on port 3000 and the frontend on [http://localhost:5173](http://localhost:5173).

## Playing

1. Open the frontend in two browser windows.
2. Register a different username in each.
3. In one window, click **Create Match** and copy the room ID.
4. In the other window, paste the room ID and click **Join Match**.
5. Use the arrow keys or WASD to collect as many coins as you can before time runs out.

Scores are saved when the match ends, and the leaderboard in the lobby shows the top high scores.
