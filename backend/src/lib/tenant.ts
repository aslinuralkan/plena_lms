const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export function resolveSessionCustomerId(
  tokenCustomerId: string | null | undefined,
  userCustomerId: string,
) {
  if (!tokenCustomerId) return userCustomerId;
  return tokenCustomerId === userCustomerId ? userCustomerId : null;
}

export function customerStorageKey(input: {
  customerId: string;
  courseId: string;
  fileId: string;
  extension: "mp4" | "pdf";
}) {
  for (const value of [input.customerId, input.courseId, input.fileId]) {
    if (!SAFE_ID.test(value)) throw new Error("Geçersiz depolama kimliği");
  }
  return `customers/${input.customerId}/courses/${input.courseId}/${input.fileId}.${input.extension}`;
}

export function requestMatchesCustomerDomain(
  configuredDomain: string | null | undefined,
  requestHost: string | null | undefined,
) {
  if (!configuredDomain) return true;
  if (!requestHost) return false;
  return (
    requestHost.split(":")[0].toLowerCase() === configuredDomain.toLowerCase()
  );
}

export function isCustomerOwned(
  resourceCustomerId: string | null | undefined,
  sessionCustomerId: string,
) {
  return resourceCustomerId === sessionCustomerId;
}

export function isCustomerLoginEligible(input: {
  userActive: boolean;
  userDeletedAt: Date | null;
  customerStatus: string;
}) {
  return (
    input.userActive &&
    !input.userDeletedAt &&
    input.customerStatus === "ACTIVE"
  );
}
