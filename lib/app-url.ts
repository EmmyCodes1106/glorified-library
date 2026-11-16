export function appBaseUrl() {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return "http://localhost:3000";
}
