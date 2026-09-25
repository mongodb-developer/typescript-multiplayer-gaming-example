import { MongoClient, Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Opens the single shared MongoClient connection used by the whole process and
 * caches the resulting `Db` handle. Safe to call more than once — subsequent
 * calls return immediately. Throws if `MONGO_URI` or `MONGO_DB_NAME` is missing.
 */
export async function connectToMongoDB(): Promise<void> {
    if (client) return;

    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;

    if (!uri || !dbName) {
        throw new Error("MONGO_URI and MONGO_DB_NAME must be set in environment");
    }

    client = new MongoClient(uri, { appName: "devrel-github-typescript-multiplayergame" });

    await client.connect();
    db = client.db(dbName);

    console.log(`Connected to MongoDB — database: "${dbName}"`);
}

/**
 * Returns the cached database handle for the connected client.
 * Throws if called before {@link connectToMongoDB} has completed.
 */
export function getDb(): Db {
    if (!db) {
        throw new Error("MongoDB not connected. Call connectToMongoDB() first.");
    }
    return db;
}

/**
 * Closes the MongoDB connection and clears the cached client/database so a
 * later {@link connectToMongoDB} can reconnect. Used during graceful shutdown.
 */
export async function closeMongoDB(): Promise<void> {
    if (client) {
        await client.close();
        client = null;
        db = null;
    }
}
