export const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") || "http://localhost:8787";

export async function createBackendSubmission(payload: unknown) {
  const res = await fetch(`${BACKEND_BASE_URL}/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Backend request failed");
  return data.submission;
}
