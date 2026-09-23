import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { config } from "./config";
import { connectToMongoDB, getDb } from "./libs/mongodb";
import { registerGameSockets } from "./game/socket";
import apiRouter from "./routes";

const { PORT, FRONTEND_URL } = config;

/**
 * Starts the application: connects to MongoDB, builds the Express app with CORS
 * and the REST routes, attaches a Socket.io server to the same HTTP server,
 * registers the game socket handlers, and listens on `PORT`.
 */
async function bootstrap(): Promise<void> {
    await connectToMongoDB();

    const app = express();

    app.use(cors({ origin: FRONTEND_URL }));
    app.use(express.json());

    app.use(apiRouter);

    const httpServer = http.createServer(app);

    const io = new Server(httpServer, {
        cors: {
            origin: FRONTEND_URL,
            methods: ["GET", "POST"],
        },
    });

    registerGameSockets(io, getDb());

    httpServer.listen(PORT, () => {
        console.log(`Server listening on http://localhost:${PORT}`);
    });
}

bootstrap().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
