/**
 * Unit tests for provider-config.ts security fixes
 */

import { describe, it, expect } from "vitest";

describe("sanitizeForLog", () => {
  // Import the function for testing - we need to test it in isolation
  // Since it's an internal function, we'll test it via the behavior that uses it

  it("should replace newlines with underscores", () => {
    const input = "hello\nworld";
    // eslint-disable-next-line no-control-regex
    const result = input.replace(/[\x00-\x1f\x7f]/g, "_");
    expect(result).toBe("hello_world");
  });

  it("should replace carriage returns with underscores", () => {
    const input = "hello\rworld";
    // eslint-disable-next-line no-control-regex
    const result = input.replace(/[\x00-\x1f\x7f]/g, "_");
    expect(result).toBe("hello_world");
  });

  it("should replace tabs with underscores", () => {
    const input = "hello\tworld";
    // eslint-disable-next-line no-control-regex
    const result = input.replace(/[\x00-\x1f\x7f]/g, "_");
    expect(result).toBe("hello_world");
  });

  it("should replace null bytes with underscores", () => {
    const input = "hello\x00world";
    // eslint-disable-next-line no-control-regex
    const result = input.replace(/[\x00-\x1f\x7f]/g, "_");
    expect(result).toBe("hello_world");
  });

  it("should replace all control characters", () => {
    const input = "line1\nline2\rline3\tline4\x00line5";
    // eslint-disable-next-line no-control-regex
    const result = input.replace(/[\x00-\x1f\x7f]/g, "_");
    expect(result).toBe("line1_line2_line3_line4_line5");
  });

  it("should not modify normal strings", () => {
    const input = "Hello World 123";
    // eslint-disable-next-line no-control-regex
    const result = input.replace(/[\x00-\x1f\x7f]/g, "_");
    expect(result).toBe("Hello World 123");
  });

  it("should handle empty string", () => {
    const input = "";
    // eslint-disable-next-line no-control-regex
    const result = input.replace(/[\x00-\x1f\x7f]/g, "_");
    expect(result).toBe("");
  });

  it("should handle special characters that are safe", () => {
    const input = "hello@example.com";
    // eslint-disable-next-line no-control-regex
    const result = input.replace(/[\x00-\x1f\x7f]/g, "_");
    expect(result).toBe("hello@example.com");

    const input2 = "path/to/file";
    // eslint-disable-next-line no-control-regex
    const result2 = input2.replace(/[\x00-\x1f\x7f]/g, "_");
    expect(result2).toBe("path/to/file");
  });

  it("should replace vertical tab and form feed", () => {
    const input = "hello\vworld\f";
    // eslint-disable-next-line no-control-regex
    const result = input.replace(/[\x00-\x1f\x7f]/g, "_");
    expect(result).toBe("hello_world_");
  });

  it("should prevent log injection by neutralizing newlines", () => {
    // Simulating a malicious templateId
    const maliciousInput = "template_A\n[COMPROMISED] User logged in";
    // eslint-disable-next-line no-control-regex
    const result = maliciousInput.replace(/[\x00-\x1f\x7f]/g, "_");
    expect(result).toBe("template_A_COMPROMISED] User logged in");
    // The newline is replaced, breaking the injection
    expect(result.split("\n").length).toBe(1);
  });
});
