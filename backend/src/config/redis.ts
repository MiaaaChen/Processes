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

    const isTls = redisUrl.startsWith("rediss://");

    redisClient = new Redis(redisUrl, isTls ? { tls: {} } : {});

    redisClient.on("connect", () => {
        console.log("Connected to Redis");
    });

    redisClient.on("error", (err) => {
        console.error("Redis connection error:", err);
        console.trace("Redis error triggered stack trace");
    });
}

export default redisClient;