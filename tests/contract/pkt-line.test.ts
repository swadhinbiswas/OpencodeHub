/**
 * Contract: Git pkt-line protocol framing
 *
 * Guards the wire format used by the smart-HTTP git server
 * (`src/lib/git-server.ts`). Any change to framing breaks git clients.
 */
import { describe, expect, it } from "vitest";
import { pktLine, flushPkt } from "@/lib/git-server";

describe("pkt-line framing contract", () => {
  it("encodes length-prefixed pkt-lines (4 hex digits + payload)", () => {
    const line = pktLine("service=git-upload-pack");
    // payload is 23 bytes + 4-byte header = 27 -> "001b"
    expect(line).toBe("001bservice=git-upload-pack");
  });

  it("matches the exact byte layout git clients expect", () => {
    const line = pktLine("abc");
    const bytes = Buffer.from(line, "utf8");
    // header bytes "0007" == 7, meaning 3 payload bytes + 4 header bytes
    expect(bytes.subarray(0, 4).toString("utf8")).toBe("0007");
    expect(bytes.subarray(4).toString("utf8")).toBe("abc");
    expect(bytes.length).toBe(7);
  });

  it("handles unicode payloads by byte length, not char length", () => {
    const line = pktLine("héllo");
    // 6 bytes payload + 4 header = 10 -> "000a"
    expect(line.slice(0, 4)).toBe("000a");
    expect(Buffer.byteLength(line, "utf8")).toBe(10);
  });

  it("handles empty payload as 0004", () => {
    expect(pktLine("")).toBe("0004");
  });

  it("flush-pkt is exactly 0000", () => {
    expect(flushPkt()).toBe("0000");
  });

  it("large lines do not overflow the 4-hex-digit length field", () => {
    const payload = "x".repeat(65500);
    const line = pktLine(payload);
    expect(line.length).toBe(4 + 65500);
    // length hex must be < 0xffff+4
    const len = Buffer.byteLength(payload) + 4;
    expect(len).toBeLessThanOrEqual(0xffff);
  });

  it("advertised-refs response starts with service header + flush", () => {
    const serviceHeader = pktLine("# service=git-upload-pack");
    // the 4-char length prefix is followed by the "# service=" payload
    expect(serviceHeader.slice(4)).toBe("# service=git-upload-pack");
    expect(flushPkt()).toBe("0000");
  });
});
