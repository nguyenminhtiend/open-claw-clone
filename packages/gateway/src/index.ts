import { Gateway } from './server.js'
import { setupGracefulShutdown } from './services/lifecycle.js'
import { createLogger } from '@oclaw/shared'

const logger = createLogger('gateway:main')

const gateway = new Gateway()
gateway.boot().then(() => {
	setupGracefulShutdown(logger, () => gateway.shutdown())
}).catch((err) => {
	console.error('Failed to boot gateway', err)
	process.exit(1)
})
