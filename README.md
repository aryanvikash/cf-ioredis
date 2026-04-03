# cf-redis-kv

`cf-redis-kv` provides an `ioredis`-style API over a Cloudflare KV HTTP backend.

This is not a real Redis transport. It is a Redis-shaped client for the subset of operations that can map cleanly to a Worker-backed Cloudflare KV service.

## Install

```bash
npm install cf-redis-kv
```

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

Payloads are JSON and values are encoded into a small envelope so future non-string types can be introduced without changing storage format.

## Development

```bash
npm install
npm test
npm run build
```
