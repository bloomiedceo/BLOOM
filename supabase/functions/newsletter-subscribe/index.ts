// BLOOM double-opt-in newsletter endpoint using Resend.
// Required Supabase Edge Function secrets:
// RESEND_API_KEY, BLOOM_FROM_EMAIL, BLOOM_SITE_URL
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Never expose any secret in browser code or GitHub.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const siteDefault = "https://bloomiedceo.github.io/Bloom-Kpop-Community/";
const allowedOrigins = (Deno.env.get("BLOOM_ALLOWED_ORIGINS") || "https://bloomiedceo.github.io,http://localhost:5500,http://127.0.0.1:5500")
  .split(",").map((value) => value.trim()).filter(Boolean);
const siteUrl = (Deno.env.get("BLOOM_SITE_URL") || siteDefault).replace(/\/$/, "");
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const resendKey = Deno.env.get("RESEND_API_KEY") || "";
const fromEmail = Deno.env.get("BLOOM_FROM_EMAIL") || "";

function headers(origin: string | null) {
  const allowed = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  };
}
function json(status: number, body: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers(origin), "Content-Type": "application/json" } });
}
function page(title: string, message: string, origin: string | null, ok = true) {
  const safeTitle = title.replace(/[&<>"]/g, "");
  const safeMessage = message.replace(/[&<>"]/g, "");
  const link = siteUrl + "/";
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle} · BLOOM</title><body style="margin:0;background:#fbf9ff;color:#28213b;font:16px system-ui,sans-serif;display:grid;min-height:100vh;place-items:center"><main style="max-width:520px;margin:24px;padding:32px;border:1px solid #e8def6;border-radius:24px;background:white"><p style="font-size:28px">✿ BLOOM</p><h1>${safeTitle}</h1><p style="line-height:1.7">${safeMessage}</p><a href="${link}" style="display:inline-block;margin-top:12px;padding:12px 18px;border-radius:999px;background:#28213b;color:white;text-decoration:none">Back to BLOOM</a></main></body></html>`;
  return new Response(html, { status: ok ? 200 : 400, headers: { ...headers(origin), "Content-Type": "text/html; charset=utf-8" } });
}
function actionPage(title: string, message: string, action: "confirm" | "unsubscribe", token: string, origin: string | null) {
  const endpoint = supabaseUrl.replace(/\/$/, "") + "/functions/v1/newsletter-subscribe";
  const actionUrl = endpoint + "?action=" + action + "&token=" + encodeURIComponent(token);
  const button = action === "confirm" ? "Confirm my signup" : "Unsubscribe me";
  const safeTitle = title.replace(/[&<>"]/g, "");
  const safeMessage = message.replace(/[&<>"]/g, "");
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle} · BLOOM</title><body style="margin:0;background:#fbf9ff;color:#28213b;font:16px system-ui,sans-serif;display:grid;min-height:100vh;place-items:center"><main style="max-width:520px;margin:24px;padding:32px;border:1px solid #e8def6;border-radius:24px;background:white"><p style="font-size:28px">✿ BLOOM</p><h1>${safeTitle}</h1><p style="line-height:1.7">${safeMessage}</p><form method="post" action="${actionUrl}"><button type="submit" style="display:inline-block;margin-top:12px;padding:12px 18px;border:0;border-radius:999px;background:#28213b;color:white;font-weight:700">${button}</button></form></main></body></html>`;
  return new Response(html, { status: 200, headers: { ...headers(origin), "Content-Type": "text/html; charset=utf-8" } });
}
function client() {
  if (!supabaseUrl || !serviceKey) throw new Error("Newsletter database is not configured");
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function sendConfirmation(email: string, token: string, unsubscribeToken: string) {
  if (!resendKey || !fromEmail) throw new Error("Email provider is not configured");
  const endpoint = supabaseUrl.replace(/\/$/, "") + "/functions/v1/newsletter-subscribe";
  const confirmUrl = endpoint + "?action=confirm&token=" + encodeURIComponent(token);
  const unsubscribeUrl = endpoint + "?action=unsubscribe&token=" + encodeURIComponent(unsubscribeToken);
  const payload = {
    from: fromEmail,
    to: [email],
    subject: "Confirm your BLOOM newsletter signup 🌷",
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#28213b;line-height:1.7"><h1 style="color:#7452d6">✿ BLOOM</h1><h2>One little click to join the circle</h2><p>Someone entered this email address on BLOOM to receive K-pop fan updates. Confirm only if that was you.</p><p><a href="${confirmUrl}" style="display:inline-block;background:#28213b;color:white;padding:13px 20px;border-radius:999px;text-decoration:none">Confirm my signup</a></p><p>If you did not request this, you can ignore this message. Your signup will not be activated.</p><hr><p style="font-size:12px;color:#766d83">You can opt out at any time: <a href="${unsubscribeUrl}">unsubscribe</a>.</p></div>`,
    text: `Confirm your BLOOM newsletter signup: ${confirmUrl}\n\nIf you did not request this, ignore this email. Unsubscribe: ${unsubscribeUrl}`,
    headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
  };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": "Bearer " + resendKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const details = await response.text();
    console.error("Resend rejected newsletter confirmation:", response.status, details.slice(0, 300));
    throw new Error("Email provider rejected the confirmation");
  }
}
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    if (origin && !allowedOrigins.includes(origin)) return new Response("Origin not allowed", { status: 403, headers: headers(origin) });
    return new Response("ok", { status: 204, headers: headers(origin) });
  }
  if (origin && !allowedOrigins.includes(origin)) return json(403, { error: "Origin not allowed" }, origin);
  const url = new URL(req.url);
  const db = (() => { try { return client(); } catch (_) { return null; } })();
  if (!db) return req.method === "GET"
    ? page("Temporarily unavailable", "Newsletter settings are not ready yet. Please try again later.", origin, false)
    : json(503, { error: "Newsletter is temporarily unavailable. Please try again later." }, origin);

  if (req.method === "POST" && ["confirm", "unsubscribe"].includes(url.searchParams.get("action") || "")) {
    const action = url.searchParams.get("action");
    const token = url.searchParams.get("token") || "";
    if (!/^[a-f0-9]{64}$/.test(token)) return page("Invalid link", "This link is invalid or expired.", origin, false);
    const tokenHash = await sha256(token);
    const field = action === "confirm" ? "confirmation_token_hash" : "unsubscribe_token_hash";
    const { data, error } = await db.from("newsletter_subscribers").select("id").eq(field, tokenHash).maybeSingle();
    if (error || !data) return page("Link expired", "This link is no longer valid or has already been used.", origin, false);
    const now = new Date().toISOString();
    const updates = action === "confirm"
      ? { confirmed_at: now, confirmation_token_hash: null, updated_at: now }
      : { unsubscribed_at: now, confirmation_token_hash: null, updated_at: now };
    const { error: updateError } = await db.from("newsletter_subscribers").update(updates).eq("id", data.id);
    if (updateError) return page("Could not complete request", "We could not complete your request. Please try again later.", origin, false);
    return page(action === "confirm" ? "You're in the BLOOM circle!" : "You're unsubscribed",
      action === "confirm"
        ? "Your email is confirmed. You can unsubscribe at any time using the link in a BLOOM newsletter."
        : "You will no longer receive BLOOM newsletter updates at this address.", origin);
  }
  if (req.method === "GET") {
    const action = url.searchParams.get("action");
    const token = url.searchParams.get("token") || "";
    if (!/^[a-f0-9]{64}$/.test(token)) return page("Invalid link", "This link is invalid or expired. You can return to BLOOM and sign up again.", origin, false);
    if (action === "confirm" || action === "unsubscribe") {
      const tokenHash = await sha256(token);
      const field = action === "confirm" ? "confirmation_token_hash" : "unsubscribe_token_hash";
      const { data, error } = await db.from("newsletter_subscribers").select("id").eq(field, tokenHash).maybeSingle();
      if (error || !data) return page("Link expired", "This link is no longer valid or has already been used.", origin, false);
      return actionPage(
        action === "confirm" ? "Confirm your BLOOM signup" : "Unsubscribe from BLOOM",
        action === "confirm"
          ? "Press the button below to confirm you want to receive BLOOM newsletter updates."
          : "Press the button below to stop receiving BLOOM newsletter updates.",
        action, token, origin
      );
    }
    return page("Invalid link", "This link is invalid. Return to BLOOM for more information.", origin, false);
  }
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, origin);
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > 4096) return json(413, { error: "Request too large" }, origin);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch (_) { return json(400, { error: "Invalid request" }, origin); }
  if (typeof body.website === "string" && body.website.trim()) return json(200, { ok: true, message: "If the signup can be completed, check your inbox for confirmation." }, origin);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (body.consent !== true || email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: "Enter a valid email and confirm that you want BLOOM updates." }, origin);
  }
  if (!resendKey || !fromEmail || !Deno.env.get("BLOOM_SITE_URL")) {
    return json(503, { error: "Newsletter email is not configured yet. Please try again later." }, origin);
  }
  const { data: existing, error: lookupError } = await db.from("newsletter_subscribers")
    .select("id,confirmed_at,unsubscribed_at,last_confirmation_sent_at").eq("email", email).maybeSingle();
  if (lookupError) {
    console.error("Newsletter lookup failed:", lookupError.message);
    return json(503, { error: "Newsletter is temporarily unavailable. Please try again later." }, origin);
  }
  if (existing?.confirmed_at && !existing.unsubscribed_at) {
    return json(200, { ok: true, message: "If this address is subscribed, no further action is needed." }, origin);
  }
  if (existing?.last_confirmation_sent_at && Date.now() - Date.parse(existing.last_confirmation_sent_at) < 60_000) {
    return json(200, { ok: true, message: "If the signup can be completed, check your inbox for confirmation." }, origin);
  }
  const token = randomToken(), unsubscribeToken = randomToken(), now = new Date().toISOString();
  const { error: saveError } = await db.from("newsletter_subscribers").upsert({
    email, consent_at: now, source: "website", confirmation_token_hash: await sha256(token),
    unsubscribe_token_hash: await sha256(unsubscribeToken), confirmed_at: null, unsubscribed_at: null,
    last_confirmation_sent_at: now, updated_at: now
  }, { onConflict: "email" });
  if (saveError) {
    console.error("Newsletter signup could not be saved:", saveError.message);
    return json(503, { error: "Newsletter is temporarily unavailable. Please try again later." }, origin);
  }
  try {
    await sendConfirmation(email, token, unsubscribeToken);
  } catch (_) {
    return json(502, { error: "We could not send the confirmation email. Please try again in a minute." }, origin);
  }
  return json(200, { ok: true, message: "Check your inbox for a confirmation link to finish signing up." }, origin);
});
