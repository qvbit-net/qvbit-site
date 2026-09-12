import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server configuration is incomplete." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const authHeader = req.headers.get("Authorization");
  const accessToken = authHeader?.replace(/^Bearer\s+/i, "").trim();

  if (!accessToken) {
    return new Response(JSON.stringify({ error: "Authentication required." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  const caller = userData.user;

  if (userError || !caller) {
    return new Response(JSON.stringify({ error: "Authentication could not be verified." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: callerProfile, error: profileError } = await admin
    .from("user_profiles")
    .select("role, is_active")
    .eq("id", caller.id)
    .maybeSingle();

  if (profileError) {
    console.error("Caller profile lookup failed", profileError);
    return new Response(JSON.stringify({ error: "Unable to verify permissions." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (callerProfile?.role !== "owner" || callerProfile?.is_active === false) {
    return new Response(JSON.stringify({ error: "Only Owner / Super Admin accounts may invite users." }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { email?: unknown; display_name?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "A valid JSON request body is required." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";

  if (!email || !email.includes("@") || email.length > 320) {
    return new Response(JSON.stringify({ error: "Enter a valid email address." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const inviteOptions: { redirectTo: string; data?: Record<string, string> } = {
    redirectTo: "https://qvbit.net/crm/login",
  };

  if (displayName) {
    inviteOptions.data = { full_name: displayName };
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, inviteOptions);

  if (inviteError) {
    console.error("User invite failed", inviteError);
    const message = inviteError.message?.toLowerCase().includes("already been registered")
      ? "That email address already has a CRM account."
      : inviteError.message || "Unable to send the invitation.";

    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const invitedUser = invited.user;

  if (invitedUser?.id) {
    await admin
      .from("user_profiles")
      .update({
        display_name: displayName || invitedUser.user_metadata?.full_name || invitedUser.email,
        role: "read_only",
        is_active: true,
      })
      .eq("id", invitedUser.id);

    await admin.from("crm_audit_log").insert({
      actor_id: caller.id,
      action: "invite_user",
      module: "user_management",
      record_id: invitedUser.id,
      details: { email, display_name: displayName || null, initial_role: "read_only" },
    });
  }

  return new Response(JSON.stringify({
    success: true,
    email,
    message: `Invitation sent to ${email}. The account starts as Read Only.`,
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
