# cf-ioredis

[![Package CI/CD](https://github.com/aryanvikash/cf-ioredis/actions/workflows/package.yml/badge.svg?branch=main)](https://github.com/aryanvikash/cf-ioredis/actions/workflows/package.yml)

`cf-ioredis` lets Node.js apps, servers, CLIs, and other non-Cloudflare runtimes use a Redis-shaped API backed by a Cloudflare Worker + Durable Object stack. It connects over HTTP or WebSocket and gives you atomic strings, TTL keys, and live pub/sub on Cloudflare's free tier.

This is **not real Redis**. It is a Redis-shaped client for the subset of operations that map cleanly onto a single SQLite-backed Durable Object.

## Why use it

- **Free tier friendly.** Storage is SQLite inside a Durable Object, billed in cheap row reads/writes — not KV operations.
- **Truly atomic.** A DO is single-threaded, so `incr`, `decr`, `getset`, and `SET NX/XX` are race-free without locks.
- **Cheap pub/sub.** Subscribers connect over WebSocket Hibernation, so idle subscribers don't bill duration. Channels live in memory inside the DO — no per-channel DO sprawl.
- **No infrastructure to run.** One-click deploy a Worker; no Redis instance, no Upstash, no provider lock-in beyond Cloudflare.

## Install

```bash
npm install cf-ioredis
```

## Deploy the Worker backend

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/aryanvikash/cf-redis-kv-worker)

Click to deploy the companion Worker into your own account, then point the client at its URL. The Worker provisions a single SQLite-backed `NamespaceDO` and accepts an optional `AUTH_TOKEN` secret for bearer-token auth.

## Configuration

Configuration is resolved in this order: constructor URL → constructor options → environment variables → defaults.

### URL format

Use `cfkv://` (or the alias `redis+cfkv://`):

```text
cfkv://token@worker.example.com?keyPrefix=app:&namespace=tenant-a&timeoutMs=2000
```

The URL is converted to an HTTPS Worker base URL internally.

### Environment variables

| Variable                   | Description                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_KV_URL`        | Worker URL in `cfkv://` or `redis+cfkv://` form                                                                               |
| `CLOUDFLARE_KV_TOKEN`      | Bearer token for the Worker                                                                                                   |
| `CLOUDFLARE_KV_TIMEOUT_MS` | Per-request timeout in milliseconds (default 5000)                                                                            |
| `CLOUDFLARE_KV_KEY_PREFIX` | Prefix applied to keys before they leave the client                                                                           |
| `CLOUDFLARE_KV_NAMESPACE`  | Routes traffic to a specific Durable Object namespace (multi-tenant isolation)                                                |
| `CLOUDFLARE_KV_TRANSPORT`  | `http` or `ws`. Defaults to `ws` when a global `WebSocket` is available (Node 22+, browsers, edge runtimes), otherwise `http` |
| `CLOUDFLARE_KV_WS_URL`     | Custom WebSocket URL override                                                                                                 |

### Options

```ts
import { Redis } from 'cf-ioredis'

const redis = new Redis({
  url: 'cfkv://token@worker.example.com',
  transport: 'ws', // default
  timeoutMs: 3000,
  keyPrefix: 'app:',
  namespace: 'tenant-a' // optional: isolate this client to its own DO
})
```

The transport defaults to **`ws`** when a global `WebSocket` is available (Node 22+, browsers, Cloudflare Workers, Deno), and falls back to **`http`** when it isn't (Node 18 / 20 without polyfill). On older Node versions you can opt into `ws` by passing your own `webSocketFactory`, e.g. `import WebSocket from 'ws'` and `webSocketFactory: (url) => new WebSocket(url)`.

## Usage

### Strings + counters

```ts
await redis.set('user:1', 'alice')
await redis.set('user:1', 'bob', { nx: true }) // returns null — already exists

await redis.incr('hits') // 1 — atomic
await redis.incr('hits') // 2
await redis.incrby('hits', 10) // 12

await redis.getset('user:1', 'carol') // returns 'alice', stores 'carol'
```

### TTL

```ts
await redis.set('session:42', 'data')
await redis.expire('session:42', 60) // 60 seconds
await redis.ttl('session:42') // 60
await redis.persist('session:42') // remove TTL
```

Expired keys are cleaned up by a Durable Object alarm — no zombie data.

### Pub/Sub

```ts
const subscriber = new Redis({ url: 'cfkv://token@worker.example.com' })
const publisher = new Redis({ url: 'cfkv://token@worker.example.com' })

subscriber.on('message', (channel, message) => {
  console.log(channel, message)
})

await subscriber.subscribe('updates')
await publisher.publish('updates', 'hello')
await subscriber.unsubscribe('updates')
await Promise.all([publisher.quit(), subscriber.quit()])
```

Pub/sub uses a dedicated WebSocket connection per subscriber. Channel state lives in the Durable Object's in-memory map; there is one DO per `namespace`, not per channel.

### Pipelines and emulated MULTI

```ts
const result = await redis.pipeline().get('a').set('a', '2').incr('counter').exec()
// [ [null, '1'], [null, 'OK'], [null, 5] ]
```

`multi()` is an alias for `pipeline()` — it executes commands in order but is **not** a Redis transaction. The DO already serializes individual commands, so atomicity per command is real; cross-command atomicity is not.

## API support

| Method                      | Status    | Notes                                                              |
| --------------------------- | --------- | ------------------------------------------------------------------ |
| `get`                       | supported | `string \| null`                                                   |
| `set`                       | supported | `'OK' \| null` (null when NX/XX rejects)                           |
| `getset`                    | supported | atomic — returns previous value                                    |
| `mget`                      | supported | ordered array                                                      |
| `mset`                      | supported | object input                                                       |
| `incr` / `decr`             | supported | atomic, integer reply                                              |
| `incrby` / `decrby`         | supported | atomic, integer reply                                              |
| `del`                       | supported | integer reply                                                      |
| `exists`                    | supported | integer reply                                                      |
| `expire` / `pexpire`        | supported | seconds / milliseconds                                             |
| `ttl` / `pttl`              | supported | `-1` no expiry, `-2` missing key                                   |
| `persist`                   | supported | removes TTL                                                        |
| `type`                      | supported | `'string' \| 'none'`                                               |
| `pipeline`                  | supported | local queued batch                                                 |
| `multi`                     | emulated  | requires `allowEmulatedCommands: true`, not atomic across commands |
| `publish`                   | supported | uses pub/sub WS when active, else HTTP                             |
| `subscribe` / `unsubscribe` | supported | exact channel names only                                           |
| `quit` / `disconnect`       | supported | closes transports + sockets                                        |

### Not supported

Hashes, lists, sets, sorted sets, streams, scripting (`EVAL`), `WATCH`/`UNWATCH`, cluster/sentinel, server commands. Calling them throws `UnsupportedCommandError`.

## How it works

```
┌──────────┐ HTTP/WS  ┌──────────┐ stub.fetch  ┌──────────────────┐
│  Client  │─────────►│  Worker  │────────────►│   NamespaceDO    │
│cf-ioredis│          │ (router) │             │ SQLite + WS hib. │
└──────────┘          └──────────┘             └──────────────────┘
```

- **Worker** authenticates the request and forwards it to a `NamespaceDO` instance keyed by namespace name.
- **NamespaceDO** holds:
  - SQLite table `kv(key, value, expires_at)` for persistent storage
  - in-memory `Map<channel, Set<WebSocket>>` for pub/sub fanout
  - hibernating WebSockets so idle subscribers don't bill duration
  - alarms for TTL cleanup

### Wire protocol

Both HTTP and WebSocket use the same RPC envelope:

**Request**

```json
{
  "id": "req-1",
  "action": "set",
  "payload": { "key": "user:1", "value": { "type": "string", "encoding": "utf8", "value": "alice" } }
}
```

**Response**

```json
{ "id": "req-1", "ok": true, "data": { "ok": true, "applied": true, "previous": null } }
```

- HTTP transport: `POST /rpc` with the envelope as body.
- WebSocket transport: same envelope multiplexed over `/ws`, correlated by `id`.

Pub/sub uses a separate frame protocol on `/pubsub/ws?channel=...`.

### Multi-tenant routing

The `namespace` option (or `?ns=` URL param, or `CLOUDFLARE_KV_NAMESPACE` env var) selects which Durable Object instance handles the request. Different namespaces are completely isolated SQLite stores.

## Development

```bash
npm install
npm test                  # unit tests
npm run build             # tsup → dist/
npm run format            # prettier
npm --prefix ../worker install
npm --prefix ../worker test
```

### Local end-to-end tests

Run the real Worker locally with `wrangler dev` and exercise the client over both HTTP and WebSocket:

```bash
npm run test:integration:local
```

To benchmark warm latency only:

```bash
npm run bench:local
```

## Trade-offs vs real Redis

- **Regional, not global.** A Durable Object lives in one region. KV is globally cached but eventually consistent; the DO is consistent but regional.
- **Per-DO throughput cap.** ~1k requests/second per DO. For higher scale, shard by namespace.
- **String type only.** No hashes, lists, sets, sorted sets, or streams.
- **No `WATCH` / optimistic locking.** Use `incr`, `getset`, or `SET NX` for atomicity.

For most hobby and small-SaaS workloads on Cloudflare's free tier, these limits are not binding.
