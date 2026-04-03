const { Redis } = require("../../dist/index.cjs");

const redis = new Redis({
  url: "cfkv://test@cf-redis-kv-worker.aryanvikash.workers.dev",
  transport: "ws",
  wsUrl: "wss://cf-redis-kv-worker.aryanvikash.workers.dev/ws",
});

async function main() {
  await redis.set("example:ws:test", "hello from ws");
  const value = await redis.get("example:ws:test");
  console.log("value:", value);
}

(async () => {
  try {
    await main();
    console.log("DONE");
  } finally {
    await redis.quit();
  }
})();
