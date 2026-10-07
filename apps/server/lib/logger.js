'use strict';

const { createLogger, format, transports } = require('winston');
const config = require('../config');

const { combine, timestamp, errors, json, colorize, printf } = format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} [${level}]: ${stack || message}${metaStr}`;
  })
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const isTest = process.env.NODE_ENV === 'test';

const logger = createLogger({
  level: config.isProd ? 'info' : 'debug',
  format: config.isProd ? prodFormat : devFormat,
  defaultMeta: { service: 'dilivygo-backend' },
  transports: [
    new transports.Console(),
  ],
  ...(isTest ? {} : {
    exceptionHandlers: [new transports.Console()],
    rejectionHandlers: [new transports.Console()],
  }),
});

module.exports = logger;
