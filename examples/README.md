# Examples

These examples are meant to be run from this repo after building the library:

```bash
npm run build
```

## WebSocket example

Runs a simple `set` + `get` against the deployed worker and then closes the socket cleanly:

```bash
npm run example:ws
```

## Pub/Sub example

Runs a subscriber and publisher against the deployed worker, prints `subscribe`, `message`, and `unsubscribe` events, and then closes both clients cleanly:

```bash
npm run example:pubsub
```

The example uses:

- `cfkv://test@cf-redis-kv-worker.aryanvikash.workers.dev`
- `wss://cf-redis-kv-worker.aryanvikash.workers.dev/ws`

If you adapt these for your own worker, make sure to call `await redis.quit()` before exit when using WebSocket transport or pub/sub.
