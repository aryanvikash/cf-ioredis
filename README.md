# cf-redis-kv

`cf-redis-kv` provides an `ioredis`-style API over a Cloudflare KV backend with both HTTP and WebSocket transports.

This is not a real Redis transport. It is a Redis-shaped client for the subset of operations that can map cleanly to a Worker-backed Cloudflare KV service.

## Install

```bash
npm install cf-redis-kv
```

## Deploy Worker

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/aryanvikash/cf-redis-kv-worker)

Use this button to deploy the companion Cloudflare Worker to your own account before pointing the client at its HTTP or WebSocket URL.

## Configuration

Config precedence is:

1. constructor URL
2. constructor options
3. environment variables
4. defaults

### Environment variables

- `CLOUDFLARE_KV_URL`
- `CLOUDFLARE_KV_TOKEN`
- `CLOUDFLARE_KV_TIMEOUT_MS`
- `CLOUDFLARE_KV_KEY_PREFIX`
- `CLOUDFLARE_KV_TRANSPORT`
- `CLOUDFLARE_KV_WS_URL`

### URL format

Use `cfkv://` or `redis+cfkv://`.

Example:

```text
cfkv://token@worker.example.com/kv?timeoutMs=5000&keyPrefix=app:
```

The URL is converted to an HTTPS Worker base URL internally.

## Usage

### Read from env

```ts
import { Redis } from 'cf-redis-kv'

const redis = new Redis()
const value = await redis.get('user:1')
```

### Override env with URL

```ts
import { Redis } from 'cf-redis-kv'

const redis = new Redis('cfkv://token@worker.example.com/kv?keyPrefix=demo:')
await redis.set('user:1', 'alice')
```

### Use options object

```ts
import { Redis } from 'cf-redis-kv'

const redis = new Redis({
  url: 'cfkv://token@worker.example.com/kv',
  timeoutMs: 3000,
  keyPrefix: 'app:'
})
```

### Use WebSocket transport

```ts
import { Redis } from 'cf-redis-kv'

const redis = new Redis({
  url: 'cfkv://token@worker.example.com/kv',
  transport: 'ws',
  wsUrl: 'wss://worker.example.com/ws',
  allowEmulatedCommands: true
})
```

### Run the repo example

```bash
npm run build
npm run example:ws
```

This example lives in `examples/node-websocket/` and shows the correct shutdown pattern for WebSocket transport with `await redis.quit()`.

## Supported API

The current surface focuses on string and key operations.

| Method | Status | Caveat |
| --- | --- | --- |
| `get` | supported | returns `string | null` |
| `set` | supported | returns `"OK"` or `null` for rejected conditional writes |
| `del` | supported | integer reply |
| `exists` | supported | integer reply |
| `mget` | supported | ordered array of values |
| `mset` | supported | object-based input in v1 |
| `expire` | supported | seconds mapped to Worker ttl ms |
| `pexpire` | supported | millisecond ttl |
| `ttl` | supported | derived from Worker ms ttl |
| `pttl` | supported | raw ms ttl |
| `persist` | supported | removes ttl if Worker supports it |
| `type` | supported | returns `string` or `none` |
| `pipeline` | supported | local queued batch executor |
| `multi` | emulated | requires `allowEmulatedCommands: true`, not atomic |
| `quit` | supported | returns `"OK"` |
| `disconnect` | supported | no-op compatibility method |

## Unsupported API Families

- pub/sub
- hashes
- lists
- sets
- sorted sets
- streams
- scripting
- watch/unwatch
- cluster/sentinel/server commands

Unsupported methods should throw `UnsupportedCommandError`.

## Pipeline semantics

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

## Transaction semantics

`multi()` is an emulated transaction-shaped wrapper on top of the same local queue.

- not atomic
- no optimistic locking
- no `watch`
- no rollback

Enable it explicitly:

```ts
const redis = new Redis({
  url: 'cfkv://token@worker.example.com/kv',
  allowEmulatedCommands: true
})

const result = await redis.multi().set('a', '1').get('a').exec()
```

## Included Worker

The repo includes a first-party Cloudflare Worker backend under `worker/`.

- `worker/src/index.ts` is the Worker entrypoint
- `worker/src/router.ts` uses `hono` to handle HTTP routes and auth middleware
- `worker/src/ws.ts` handles WebSocket request/response messages
- `worker/src/kv.ts` is the single source of truth for KV persistence and TTL metadata behavior

The Worker stores value payloads and TTL metadata in separate KV keys so `ttl`, `pttl`, and `persist` behave consistently across HTTP and WS.

### Local Worker development

```bash
cd worker
npm install
npm test
npx wrangler dev
```

For a public template/deploy-button flow, `worker/wrangler.jsonc` is set up for automatic KV provisioning. Configure `AUTH_TOKEN` as a Worker secret if you want bearer-token protection.

## Worker backend contract

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
- `GET /ws` for WebSocket upgrade

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

## Development

```bash
npm install
npm test
npm run build
npm --prefix worker install
npm --prefix worker test
```

## Local End-To-End Tests

Run the real Worker locally with `wrangler dev` and exercise the real client over both HTTP and WebSocket:

```bash
npm run test:integration:local
```

This suite:

- starts the Worker from `worker/`
- injects a local `AUTH_TOKEN=test`
- tests supported client methods over HTTP
- tests supported client methods over WebSocket
- prints warm local latency samples

To print only the local latency benchmark output:

```bash
npm run bench:local
```

Current illustrative deployed measurement from the live `workers.dev` test run:

- warm HTTP `get` average: about `189ms`
- warm WebSocket `get` average: about `112ms`

Treat these as directional numbers only; latency depends on region, Cloudflare account state, network path, and whether the test is local or deployed.
