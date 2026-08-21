const DEFAULT_API_SERVER_BASE_URL = "http://127.0.0.1:8000";

export function apiServerBaseUrl(): string {
  const configured =
    process.env.API_SERVER_BASE_URL ?? DEFAULT_API_SERVER_BASE_URL;
  const baseUrl = /^https?:\/\//.test(configured)
    ? configured
    : `http://${configured}`;
  return baseUrl.replace(/\/$/, "");
}
