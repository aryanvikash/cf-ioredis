# cf-ioredis

[![Package CI/CD](https://github.com/aryanvikash/cf-ioredis/actions/workflows/package.yml/badge.svg?branch=main)](https://github.com/aryanvikash/cf-ioredis/actions/workflows/package.yml)

`cf-ioredis` lets Node.js, servers, CLIs, and other non-Cloudflare runtimes use Cloudflare KV through an `ioredis`-style API. It connects to a companion Cloudflare Worker over HTTP or WebSocket.

This library is built for code running outside Cloudflare Workers, where KV bindings are not directly available. It is not a real Redis transport; it is a Redis-shaped client for the subset of operations that can map cleanly to a Worker-backed Cloudflare KV service.

## Install

```bash
npm install cf-ioredis
```

## Deploy Worker

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/aryanvikash/cf-redis-kv-worker)

Use this button to deploy the companion Cloudflare Worker to your own account before pointing the client at its HTTP or WebSocket URL.

For a public template/deploy-button flow, `worker/wrangler.jsonc` is set up for automatic KV provisioning. Configure `AUTH_TOKEN` as a Worker secret if you want bearer-token protection.

## Configuration

Configuration is resolved in this order:

1. Constructor URL
2. Constructor options
3. Environment variables
4. Defaults

### Environment Variables

| Variable | Description |
| --- | --- |
| `CLOUDFLARE_KV_URL` | Worker URL in `cfkv://` or `redis+cfkv://` format |
| `CLOUDFLARE_KV_TOKEN` | Bearer token for the Worker |
| `CLOUDFLARE_KV_TIMEOUT_MS` | Request timeout in milliseconds |
| `CLOUDFLARE_KV_KEY_PREFIX` | Prefix applied to keys before requests are sent |
| `CLOUDFLARE_KV_TRANSPORT` | Transport mode: `http` or `ws` |
| `CLOUDFLARE_KV_WS_URL` | Optional WebSocket URL override for custom routes |

### URL Format

Use `cfkv://` or `redis+cfkv://`.

```text
cfkv://token@worker.example.com?timeoutMs=5000&keyPrefix=app:
```

The URL is converted to an HTTPS Worker base URL internally.

The client appends Worker routes such as `/get`, `/set`, `/ws`, and `/pubsub/ws` under the hood. When `transport: 'ws'` or pub/sub opens a WebSocket, the WebSocket URL is derived from the same Worker URL. Use `wsUrl` or `CLOUDFLARE_KV_WS_URL` only to override that default.

## Usage

### Read From Environment

```ts
import { Redis } from 'cf-ioredis'

const redis = new Redis()
const value = await redis.get('user:1')
```

### Use a Connection URL

```ts
import { Redis } from 'cf-ioredis'

const redis = new Redis('cfkv://token@worker.example.com?keyPrefix=demo:')
await redis.set('user:1', 'alice')
```

### Use Options

```ts
import { Redis } from 'cf-ioredis'

const redis = new Redis({
  url: 'cfkv://token@worker.example.com',
  timeoutMs: 3000,
  keyPrefix: 'app:'
})
```

### Use WebSocket Transport

```ts
import { Redis } from 'cf-ioredis'

const redis = new Redis({
  url: 'cfkv://token@worker.example.com',
  transport: 'ws',
  allowEmulatedCommands: true
})
```

### Pub/Sub

```ts
import { Redis } from 'cf-ioredis'

const publisher = new Redis({
  url: 'cfkv://token@worker.example.com'
})

const subscriber = new Redis({
  url: 'cfkv://token@worker.example.com'
})

subscriber.on('message', (channel, message) => {
  console.log(channel, message)
})

await subscriber.subscribe('updates')
await publisher.publish('updates', 'hello')
await subscriber.unsubscribe('updates')
await Promise.all([publisher.quit(), subscriber.quit()])
```

Pub/sub behavior:

- `subscribe` and `unsubscribe` use a dedicated WebSocket pub/sub connection.
- `publish` prefers WebSocket when there is an active pub/sub socket for that channel.
- `publish` falls back to HTTP `POST /publish` when no active pub/sub socket is available.
- v1 supports exact channel names only, with live delivery only.

## API Support

The current surface focuses on string and key operations.

| Method | Status | Caveat |
| --- | --- | --- |
| `get` | supported | returns `string | null` |
| `set` | supported | returns `"OK"` or `null` for rejected conditional writes |
| `del` | supported | integer reply |
| `exists` | supported | integer reply |
| `mget` | supported | ordered array of values |
| `mset` | supported | object-based input in v1 |
| `expire` | supported | seconds mapped to Worker TTL ms |
| `pexpire` | supported | millisecond TTL |
| `ttl` | supported | derived from Worker ms TTL |
| `pttl` | supported | raw ms TTL |
| `persist` | supported | removes TTL if Worker supports it |
| `type` | supported | returns `string` or `none` |
| `pipeline` | supported | local queued batch executor |
| `multi` | emulated | requires `allowEmulatedCommands: true`, not atomic |
| `publish` | supported | uses pub/sub WS when active, otherwise HTTP fallback |
| `subscribe` | supported | exact channel names only, requires WebSocket support |
| `unsubscribe` | supported | exact channel names only, requires WebSocket support |
| `quit` | supported | returns `"OK"` |
| `disconnect` | supported | no-op compatibility method |

### Unsupported API Families

- Hashes
- Lists
- Sets
- Sorted sets
- Streams
- Scripting
- Watch/unwatch
- Cluster, sentinel, and server commands

Unsupported methods should throw `UnsupportedCommandError`.

## Command Semantics

### Pipeline

`pipeline()` queues commands locally and executes them in order.

```ts
const result = await redis.pipeline().get('a').set('a', '2').del('a').exec()
```

Result format matches common `ioredis` tuple style:

```ts
[
  [null, '1'],
  [null, 'OK'],
  [null, 1]
]
```

This is not Redis wire pipelining.

### Transactions

`multi()` is an emulated transaction-shaped wrapper on top of the same local queue.

- Not atomic
- No optimistic locking
- No `watch`
- No rollback

Enable it explicitly:

```ts
const redis = new Redis({
  url: 'cfkv://token@worker.example.com',
  allowEmulatedCommands: true
})

const result = await redis.multi().set('a', '1').get('a').exec()
```

## Examples

```bash
npm run build
npm run example:ws
npm run example:pubsub
```

The WebSocket example lives in `examples/node-websocket/` and shows the correct shutdown pattern with `await redis.quit()`.

The pub/sub example lives in `examples/node-pubsub/`.

## Worker Backend

The repo includes a first-party Cloudflare Worker backend under `worker/`.

- `worker/src/index.ts` is the Worker entrypoint.
- `worker/src/router.ts` uses `hono` to handle HTTP routes and auth middleware.
- `worker/src/ws.ts` handles WebSocket request/response messages.
- `worker/src/kv.ts` is the single source of truth for KV persistence and TTL metadata behavior.

The Worker stores value payloads and TTL metadata in separate KV keys so `ttl`, `pttl`, and `persist` behave consistently across HTTP and WS.

### Backend Contract

The library expects a Worker or HTTP service that exposes operations like:

- `GET /get?key=...`
- `POST /set`
- `POST /mget`
- `POST /mset`
- `DELETE /delete`
- `POST /exists`
- `POST /expire`
- `GET /ttl?key=...`
- `POST /persist`
- `GET /type?key=...`
- `POST /publish`
- `GET /ws` for WebSocket upgrade
- `GET /pubsub/ws?channel=...` for pub/sub WebSocket upgrade

Payloads are JSON and values are encoded into a small envelope so future non-string types can be introduced without changing storage format.

WebSocket messages use the same action model as the transport layer:

```json
{
  "id": "1",
  "action": "get",
  "payload": {
    "key": "user:1"
  }
}
```

Responses are correlated by `id` and return either `data` or a typed error payload.

Pub/sub uses a separate WebSocket protocol with frames like:

```json
{ "type": "subscribe", "channels": ["updates"] }
```

and message deliveries like:

```json
{ "type": "message", "channel": "updates", "message": "hello" }
```

## Development

```bash
npm install
npm test
npm run build
npm --prefix worker install
npm --prefix worker test
```

### Local Worker Development

```bash
cd worker
npm install
npm test
npx wrangler dev
```

### Local End-To-End Tests

Run the real Worker locally with `wrangler dev` and exercise the real client over both HTTP and WebSocket:

```bash
npm run test:integration:local
```

This suite:

- Starts the Worker from `worker/`.
- Injects a local `AUTH_TOKEN=test`.
- Tests supported client methods over HTTP.
- Tests supported client methods over WebSocket.
- Prints warm local latency samples.

To print only the local latency benchmark output:

```bash
npm run bench:local
```

Current illustrative deployed measurement from the live `workers.dev` test run:

- Warm HTTP `get` average: about `189ms`.
- Warm WebSocket `get` average: about `112ms`.

Treat these as directional numbers only; latency depends on region, Cloudflare account state, network path, and whether the test is local or deployed.
