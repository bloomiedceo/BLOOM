// Deploy with: supabase functions deploy delete-account
// Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as server-side function secrets only.
// Never copy a service-role key into bloom-config.js or any browser file.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function listUserObjects(admin: ReturnType<typeof createClient>, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" }
    });
    if (error) throw new Error("Unable to inspect account media");
    const rows = data ?? [];
    for (const item of rows) {
      const path = prefix ? prefix + "/" + item.name : item.name;
      // Storage folder entries have no object id; recurse to find their files.
      if (!item.id) {
        paths.push(...await listUserObjects(admin, bucket, path));
      } else {
        paths.push(path);
      }
    }
    if (rows.length < limit) break;
    offset += limit;
  }
  return paths;
}

async function removeUserMedia(admin: ReturnType<typeof createClient>, userId: string) {
  for (const bucket of ["bloom-media", "bloom-post-media", "bloom-story-media"]) {
    const paths = await listUserObjects(admin, bucket, userId);
    for (let offset = 0; offset < paths.length; offset += 100) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(offset, offset + 100));
      if (error) throw new Error("Unable to remove account media");
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return reply(401, { error: "Unauthorized" });
  const token = authHeader.slice("Bearer ".length);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply(503, { error: "Server is not configured" });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return reply(401, { error: "Unauthorized" });

  try {
    await removeUserMedia(admin, data.user.id);
  } catch (mediaError) {
    console.error("[delete-account] Media cleanup failed:", mediaError);
    return reply(500, { error: "Account media could not be removed. The account was not deleted." });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) return reply(500, { error: "Account deletion failed" });
  return reply(200, { deleted: true });
});
