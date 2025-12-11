import client from "prom-client";

// Create a Registry which registers the metrics
const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: "opencodehub",
});

// Enable the collection of default metrics
client.collectDefaultMetrics({ register });

// Define custom metrics
export const httpRequestDurationMicroseconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "code"],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

export const activeRunners = new client.Gauge({
  name: "active_runners",
  help: "Number of active CI/CD runners",
});

register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(activeRunners);

export { register };
