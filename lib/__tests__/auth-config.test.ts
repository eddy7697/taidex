import { describe, it, expect } from "vitest";
import * as authModule from "@/auth";

describe("auth config", () => {
  it("匯出 handlers / auth / signIn / signOut", () => {
    expect(authModule.handlers).toBeDefined();
    expect(typeof authModule.auth).toBe("function");
    expect(typeof authModule.signIn).toBe("function");
    expect(typeof authModule.signOut).toBe("function");
  });
});
