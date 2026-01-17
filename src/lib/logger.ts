import pino from "pino";

// Custom OTLP transport for Grafana Cloud
const createOtlpTransport = () => {
  const endpoint = process.env.GRAFANA_OTLP_ENDPOINT;
  const instanceId = process.env.GRAFANA_INSTANCE_ID;
  const apiKey = process.env.GRAFANA_API_KEY;

  if (!endpoint || !instanceId || !apiKey) {
    return null;
  }

  const authPair = `${instanceId}:${apiKey}`;
  const encoded = Buffer.from(authPair).toString('base64');

  return {
    send: async (level: string, message: string, extra: Record<string, unknown> = {}) => {
      try {
        const body = {
          resourceLogs: [{
            resource: {
              attributes: [
                { key: "service.name", value: { stringValue: "opencodehub" } },
                { key: "environment", value: { stringValue: process.env.NODE_ENV || "development" } }
              ]
            },
            scopeLogs: [{
              logRecords: [{
                timeUnixNano: String(Date.now() * 1e6),
                severityText: level.toUpperCase(),
                body: { stringValue: message },
                attributes: Object.entries(extra).map(([key, value]) => ({
                  key,
                  value: { stringValue: String(value) }
                }))
              }]
            }]
          }]
        };

        await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${encoded}`,
          },
          body: JSON.stringify(body)
        });
      } catch (error) {
        // Silently fail to avoid infinite logging loops
        console.error('[OTLP Transport Error]', error);
      }
    }
  };
};

const transports = [];

// Always add standard output (pretty in dev, json in prod)
if (process.env.NODE_ENV === "development") {
  transports.push({
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  });
} else {
  transports.push({
    target: "pino/file",
    options: { destination: 1 }
  });
}

// Initialize OTLP transport
const otlpTransport = createOtlpTransport();

// Create base pino logger
const baseLogger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: transports.length > 0 ? {
    targets: transports
  } : undefined,
});

// Wrap logger to also send to OTLP if configured
const createWrappedLogger = () => {
  const wrap = (level: string) => (msg: string | object, ...args: unknown[]) => {
    // Call original pino method
    (baseLogger as unknown as Record<string, Function>)[level](msg, ...args);

    // Send to OTLP if configured
    if (otlpTransport) {
      const message = typeof msg === 'string' ? msg : JSON.stringify(msg);
      const extra = typeof msg === 'object' ? msg : (args[0] as Record<string, unknown>) || {};
      otlpTransport.send(level, message, extra as Record<string, unknown>);
    }
  };

  return {
    trace: wrap('trace'),
    debug: wrap('debug'),
    info: wrap('info'),
    warn: wrap('warn'),
    error: wrap('error'),
    fatal: wrap('fatal'),
    child: baseLogger.child.bind(baseLogger),
    level: baseLogger.level,
  };
};

export const logger = otlpTransport ? createWrappedLogger() : baseLogger;
