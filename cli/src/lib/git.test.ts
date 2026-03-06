import { describe, expect, it } from "vitest";
import { parseRepoFromRemoteUrl } from "./git.js";

describe("parseRepoFromRemoteUrl", () => {
  it("parses https remotes", () => {
    expect(parseRepoFromRemoteUrl("https://git.example.com/acme/platform.git")).toEqual({
      owner: "acme",
      repo: "platform",
    });
  });

  it("parses ssh remotes", () => {
    expect(parseRepoFromRemoteUrl("git@git.example.com:acme/platform.git")).toEqual({
      owner: "acme",
      repo: "platform",
    });
  });

  it("returns null for invalid remote format", () => {
    expect(parseRepoFromRemoteUrl("git.example.com")).toBeNull();
  });
});
