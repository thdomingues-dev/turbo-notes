const DEFAULT_API_INTERNAL_BASE_URL = "http://127.0.0.1:8000";

export function apiInternalBaseUrl(): string {
  const configured =
    process.env.API_INTERNAL_BASE_URL ?? DEFAULT_API_INTERNAL_BASE_URL;
  const baseUrl = /^https?:\/\//.test(configured)
    ? configured
    : `http://${configured}`;
  return baseUrl.replace(/\/$/, "");
}
