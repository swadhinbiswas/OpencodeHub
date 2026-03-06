/**
 * HTML / XSS Sanitization Utilities
 * Strips or escapes dangerous HTML from user-supplied text fields.
 */

const DANGEROUS_TAGS =
  /<\s*\/?\s*(script|iframe|object|embed|form|link|style|meta|base|applet|svg|math)\b[^>]*>/gi;

const EVENT_HANDLERS = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;

const DANGEROUS_ATTRS =
  /\s+(href|src|action|formaction|data|xlink:href)\s*=\s*["']?\s*javascript:/gi;

/**
 * Strip dangerous HTML tags, event handler attributes, and javascript: URIs
 * from user-provided text.  Preserves benign HTML formatting.
 */
export function sanitizeHtml(input: string): string {
  if (!input) return input;
  let result = input;
  // Remove dangerous tags entirely
  result = result.replace(DANGEROUS_TAGS, "");
  // Remove event handler attributes
  result = result.replace(EVENT_HANDLERS, "");
  // Remove javascript: URIs in common attributes
  result = result.replace(DANGEROUS_ATTRS, "");
  return result;
}

/**
 * Escape all HTML — for contexts where no HTML is expected.
 */
export function escapeHtml(input: string): string {
  if (!input) return input;
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
