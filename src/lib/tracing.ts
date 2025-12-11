import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { logger } from "./logger";

const traceExporter = new OTLPTraceExporter({
  url:
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    "http://localhost:4318/v1/traces",
});

const sdk = new NodeSDK({
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations()],
  serviceName: "opencodehub",
});

export function initTracing() {
  if (process.env.ENABLE_TRACING === "true") {
    try {
      sdk.start();
      logger.info("OpenTelemetry tracing initialized");
    } catch (e) {
      logger.error({ err: e }, "Failed to initialize OpenTelemetry");
    }
  }
}
