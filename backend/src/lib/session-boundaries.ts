export const CUSTOMER_SESSION_COOKIE = "marti_session";
export const PLATFORM_SESSION_COOKIE = "plena_platform_session";

export function platformSigningSecret(baseSecret: string) {
  return `${baseSecret}:platform`;
}
