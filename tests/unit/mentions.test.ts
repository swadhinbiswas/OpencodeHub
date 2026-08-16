import { describe, expect, it } from "vitest";
import { extractMentions } from "@/lib/mentions";

describe("mention extraction", () => {
  it("extracts simple usernames", () => {
    expect(extractMentions("Hi @alice, please review")).toEqual(["alice"]);
  });

  it("extracts multiple distinct usernames", () => {
    expect(extractMentions("@alice and @bob and @alice")).toEqual([
      "alice",
      "bob",
    ]);
  });

  it("supports usernames with hyphens and underscores", () => {
    expect(extractMentions("cc @dev-team @jane_doe")).toEqual([
      "dev-team",
      "jane_doe",
    ]);
  });

  it("ignores email addresses and plain text without @", () => {
    expect(extractMentions("contact alice@example.com for help")).toEqual([]);
    expect(extractMentions("no mentions here")).toEqual([]);
  });

  it("returns empty for empty input", () => {
    expect(extractMentions("")).toEqual([]);
    expect(extractMentions(undefined as unknown as string)).toEqual([]);
  });

  it("does not match bare @ at end of text", () => {
    expect(extractMentions("ping @")).toEqual([]);
  });
});
