export type BillingInterval = "month" | "year";
export type BillingPlan = "pro" | "club";
type BillingResponse = { url?: string; error?: string; recovery?: "portal" };

async function readResponse(response: Response): Promise<BillingResponse> {
  try { return await response.json() as BillingResponse; }
  catch { return { error: "Billing returned an unreadable response" }; }
}

export async function beginCheckout(plan: BillingPlan, interval: BillingInterval): Promise<string> {
  const response = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify({ plan, interval }),
  });
  const result = await readResponse(response);
  if (response.status === 409 && result.recovery === "portal") return openBillingPortal();
  if (!response.ok || !result.url) throw new Error(result.error ?? "Checkout is unavailable");
  return result.url;
}

export async function openBillingPortal(): Promise<string> {
  const response = await fetch("/api/billing/portal", { method: "POST" });
  const result = await readResponse(response);
  if (!response.ok || !result.url) throw new Error(result.error ?? "Billing management is unavailable");
  return result.url;
}
