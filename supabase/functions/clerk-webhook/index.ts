import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

async function verifyWebhook(
  payload: string,
  headers: Headers,
  secret: string
): Promise<boolean> {
  const svixId = headers.get("svix-id");
  const svixTimestamp = headers.get("svix-timestamp");
  const svixSignature = headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Check timestamp is within 5 minutes
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(svixTimestamp, 10);
  if (Math.abs(now - ts) > 300) return false;

  // Decode the secret (remove "whsec_" prefix and base64 decode)
  const secretBytes = Uint8Array.from(
    atob(secret.replace("whsec_", "")),
    (c) => c.charCodeAt(0)
  );

  const toSign = new TextEncoder().encode(`${svixId}.${svixTimestamp}.${payload}`);
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, toSign);
  const computedSig = btoa(String.fromCharCode(...new Uint8Array(signature)));

  // svix-signature can contain multiple signatures separated by spaces
  const signatures = svixSignature.split(" ");
  return signatures.some((sig) => {
    const sigValue = sig.split(",")[1]; // format: "v1,<base64>"
    return sigValue === computedSig;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookSecret = Deno.env.get("CLERK_WEBHOOK_SECRET");
    if (!webhookSecret) {
      throw new Error("CLERK_WEBHOOK_SECRET not configured");
    }

    const payload = await req.text();
    const isValid = await verifyWebhook(payload, req.headers, webhookSecret);
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(payload);
    const { type, data } = event;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log(`Processing Clerk event: ${type}`);

    if (type === "user.created") {
      const userId = data.id;
      const email = data.email_addresses?.[0]?.email_address || "";
      const fullName =
        [data.first_name, data.last_name].filter(Boolean).join(" ") || email;
      const avatarUrl = data.image_url || null;

      // Create profile
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          { user_id: userId, email, full_name: fullName, avatar_url: avatarUrl },
          { onConflict: "user_id" }
        );

      if (profileError) {
        console.error("Profile creation error:", profileError);
        throw profileError;
      }

      // Create default student role
      const { error: roleError } = await supabase
        .from("user_roles")
        .upsert(
          { user_id: userId, role: "student" },
          { onConflict: "user_id" }
        );

      if (roleError) {
        console.error("Role creation error:", roleError);
        throw roleError;
      }

      console.log(`Synced new user: ${userId}`);
    }

    if (type === "user.updated") {
      const userId = data.id;
      const email = data.email_addresses?.[0]?.email_address || "";
      const fullName =
        [data.first_name, data.last_name].filter(Boolean).join(" ") || email;
      const avatarUrl = data.image_url || null;
      const role = data.public_metadata?.role;

      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          { user_id: userId, email, full_name: fullName, avatar_url: avatarUrl },
          { onConflict: "user_id" }
        );

      if (profileError) {
        console.error("Profile update error:", profileError);
        throw profileError;
      }

      // Update role if set in public metadata
      if (role && ["admin", "student", "tutor"].includes(role)) {
        const { error: roleError } = await supabase
          .from("user_roles")
          .upsert(
            { user_id: userId, role },
            { onConflict: "user_id" }
          );

        if (roleError) {
          console.error("Role update error:", roleError);
          throw roleError;
        }
      }

      console.log(`Updated user: ${userId}`);
    }

    if (type === "user.deleted") {
      const userId = data.id;

      await supabase.from("user_roles").delete().eq("user_id", userId);
      await supabase.from("profiles").delete().eq("user_id", userId);

      console.log(`Deleted user: ${userId}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
