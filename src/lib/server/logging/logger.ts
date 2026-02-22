import pino from 'pino';
import { dev } from '$app/environment';

// Configuración base de pino
const pinoConfig: pino.LoggerOptions = {
	level: dev ? 'debug' : 'info',
	...(dev && {
		transport: {
			target: 'pino-pretty',
			options: {
				colorize: true,
				translateTime: 'SYS:standard',
				ignore: 'pid,hostname'
			}
		}
	})
};

// Logger principal
export const logger = pino(pinoConfig);

// Loggers especializados (child loggers)
export const httpLogger = logger.child({ module: 'http' });
export const authLogger = logger.child({ module: 'auth' });
export const systemLogger = logger.child({ module: 'system' });
export const aiLogger = logger.child({ module: 'ai' });
export const dbLogger = logger.child({ module: 'db' });
