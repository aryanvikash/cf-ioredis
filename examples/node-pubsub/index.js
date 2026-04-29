const { Redis } = require('../../dist/index.cjs')

const publisher = new Redis({
  url: 'cfkv://test@cf-redis-kv-worker.aryanvikash.workers.dev'
})

const subscriber = new Redis({
  url: 'cfkv://test@cf-redis-kv-worker.aryanvikash.workers.dev'
})

const channel = 'example:pubsub:updates'

async function main() {
  subscriber.on('subscribe', (subscribedChannel, count) => {
    console.log('subscribed:', subscribedChannel, 'count:', count)
  })

  subscriber.on('unsubscribe', (unsubscribedChannel, count) => {
    console.log('unsubscribed:', unsubscribedChannel, 'count:', count)
  })

  subscriber.on('message', (receivedChannel, message) => {
    console.log('message:', receivedChannel, message)
  })

  await subscriber.subscribe(channel)
  const receivers = await publisher.publish(channel, 'hello from pubsub')
  console.log('receivers:', receivers)

  await new Promise((resolve) => setTimeout(resolve, 250))
  await subscriber.unsubscribe(channel)
}

;(async () => {
  try {
    await main()
    console.log('DONE')
  } finally {
    await Promise.allSettled([publisher.quit(), subscriber.quit()])
  }
})()
