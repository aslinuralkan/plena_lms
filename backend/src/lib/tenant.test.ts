import { describe, expect, it } from "vitest";
import {
  customerStorageKey,
  isCustomerOwned,
  isCustomerLoginEligible,
  requestMatchesCustomerDomain,
  resolveSessionCustomerId,
} from "./tenant";
import {
  CUSTOMER_SESSION_COOKIE,
  PLATFORM_SESSION_COOKIE,
  platformSigningSecret,
} from "./session-boundaries";

describe("multi-customer security boundaries", () => {
  it("uses the verified User customer for legacy sessions without customerId", () => {
    expect(resolveSessionCustomerId(undefined, "marti")).toBe("marti");
  });

  it("rejects a token whose customerId does not match the verified User", () => {
    expect(resolveSessionCustomerId("plena", "marti")).toBeNull();
  });

  it("does not accept a resource from another customer", () => {
    expect(isCustomerOwned("plena", "marti")).toBe(false);
  });

  it("accepts a resource owned by the session customer", () => {
    expect(isCustomerOwned("marti", "marti")).toBe(true);
  });

  it("builds the required customer-scoped video key", () => {
    expect(
      customerStorageKey({
        customerId: "customer-marti",
        courseId: "course-1",
        fileId: "file-1",
        extension: "mp4",
      }),
    ).toBe("customers/customer-marti/courses/course-1/file-1.mp4");
  });

  it("builds the required customer-scoped PDF key", () => {
    expect(
      customerStorageKey({
        customerId: "customer-plena",
        courseId: "course-2",
        fileId: "file-2",
        extension: "pdf",
      }),
    ).toBe("customers/customer-plena/courses/course-2/file-2.pdf");
  });

  it("blocks path traversal in generated storage keys", () => {
    expect(() =>
      customerStorageKey({
        customerId: "../other",
        courseId: "course-1",
        fileId: "file-1",
        extension: "mp4",
      }),
    ).toThrow("Geçersiz depolama kimliği");
  });

  it("requires a configured branded domain to match", () => {
    expect(requestMatchesCustomerDomain("marti.example.com", "plena.example.com")).toBe(false);
    expect(requestMatchesCustomerDomain("marti.example.com", "marti.example.com:443")).toBe(true);
  });

  it("keeps unbranded localhost login compatible", () => {
    expect(requestMatchesCustomerDomain(null, "localhost:3001")).toBe(true);
  });

  it("rejects login when the customer is inactive", () => {
    expect(
      isCustomerLoginEligible({
        userActive: true,
        userDeletedAt: null,
        customerStatus: "INACTIVE",
      }),
    ).toBe(false);
  });

  it("keeps platform and customer sessions in different cookies", () => {
    expect(PLATFORM_SESSION_COOKIE).not.toBe(CUSTOMER_SESSION_COOKIE);
  });

  it("derives a platform-only signing boundary", () => {
    expect(platformSigningSecret("shared-fallback")).not.toBe("shared-fallback");
  });
});
