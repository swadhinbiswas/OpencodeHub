import { describe, expect, it } from "vitest";
import { parseApiErrorMessage } from "./api-error.js";

describe("parseApiErrorMessage", () => {
  it("uses plain string error body", () => {
    expect(parseApiErrorMessage(400, "Bad request")).toBe("Bad request");
  });

  it("reads common message fields", () => {
    expect(parseApiErrorMessage(403, { message: "Forbidden" })).toBe("Forbidden");
    expect(parseApiErrorMessage(401, { error: "Unauthorized" })).toBe("Unauthorized");
    expect(parseApiErrorMessage(422, { detail: "Validation failed" })).toBe("Validation failed");
  });

  it("flattens array style errors", () => {
    expect(
      parseApiErrorMessage(422, {
        errors: [{ message: "name is required" }, "email is invalid"],
      }),
    ).toBe("name is required; email is invalid");
  });

  it("falls back when no message can be extracted", () => {
    expect(parseApiErrorMessage(500, { foo: "bar" })).toBe("API error: 500");
  });
});
