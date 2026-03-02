import type { Logger } from '@oclaw/shared'

export function setupGracefulShutdown(
	logger: Logger,
	shutdown: () => Promise<void>,
): void {
	const handle = async (signal: string) => {
		logger.info({ signal }, 'Shutting down...')
		try {
			await shutdown()
			process.exit(0)
		} catch (err) {
			logger.error({ err }, 'Error during shutdown')
			process.exit(1)
		}
	}

	process.once('SIGINT', () => handle('SIGINT'))
	process.once('SIGTERM', () => handle('SIGTERM'))
}
