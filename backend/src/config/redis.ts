import Redis from "ioredis";
import RedisMock from "ioredis-mock";

let redisClient: Redis;

if (process.env.NODE_ENV === "test") {
    redisClient = new RedisMock();
    console.log("Using Redis mock client");
} else {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
        throw new Error("REDIS_URL is not defined in environment variables.");
    }

    redisClient = new Redis(redisUrl, {
        db: 0,
        tls: {},
    });

    redisClient.on("connect", () => {
        console.log("Connected to Redis");
    });

    redisClient.on("error", (err) => {
        console.error("Redis connection error:", err);
    });
}

export default redisClient;