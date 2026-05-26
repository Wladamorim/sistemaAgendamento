import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CreateUserBody {
  name?: string;
  email?: string;
  phone?: string | null;
  password?: string;
  roleName?: "Administrador" | "Atendente" | string;
}

function normalizeSupabaseUrl(url: string) {
  const parsedUrl = new URL(url);
  return parsedUrl.origin;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrlEnv = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrlEnv || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase environment variables are missing." }, 500);
  }

  let supabaseUrl: string;

  try {
    supabaseUrl = normalizeSupabaseUrl(supabaseUrlEnv);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Invalid SUPABASE_URL." }, 500);
  }

  const authorization = req.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing authorization header." }, 401);
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    return jsonResponse({ error: "Missing authorization header." }, 401);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.getUser(token);

  if (authUserError || !authUserData.user) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
    .from("users")
    .select(`
      id,
      is_active,
      roles (
        id,
        name
      )
    `)
    .eq("auth_user_id", authUserData.user.id)
    .maybeSingle();

  if (callerProfileError) {
    console.error(callerProfileError);
    return jsonResponse({ error: "Could not validate caller." }, 500);
  }

  const callerRole = Array.isArray(callerProfile?.roles) ? callerProfile?.roles[0] : callerProfile?.roles;

  if (!callerProfile || callerProfile.is_active === false || callerRole?.name !== "Administrador") {
    return jsonResponse({ error: "Apenas administradores podem criar atendentes." }, 403);
  }

  let body: CreateUserBody;

  try {
    body = (await req.json()) as CreateUserBody;
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const phone = body.phone?.trim() || null;
  const password = body.password;
  const roleName = body.roleName;

  if (!name || !email || !password || !roleName) {
    return jsonResponse({ error: "Name, email, password and roleName are required." }, 400);
  }

  if (roleName !== "Administrador" && roleName !== "Atendente") {
    return jsonResponse({ error: "Invalid roleName." }, 400);
  }

  const { data: createdAuthUser, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
      phone,
    },
  });

  if (createAuthError || !createdAuthUser.user) {
    console.error(createAuthError);
    return jsonResponse({ error: createAuthError?.message ?? "Could not create auth user." }, 400);
  }

  const authUserId = createdAuthUser.user.id;

  const { data: role, error: roleError } = await supabaseAdmin
    .from("roles")
    .select("id, name")
    .eq("name", roleName)
    .single();

  if (roleError || !role) {
    console.error(roleError);
    await supabaseAdmin.auth.admin.deleteUser(authUserId);
    return jsonResponse({ error: "Role not found." }, 400);
  }

  const { data: existingPublicUser, error: existingUserError } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (existingUserError) {
    console.error(existingUserError);
    await supabaseAdmin.auth.admin.deleteUser(authUserId);
    return jsonResponse({ error: "Could not check public user." }, 500);
  }

  const publicUserPayload = {
    auth_user_id: authUserId,
    role_id: role.id,
    name,
    email,
    phone,
    is_active: true,
  };

  const publicUserQuery = existingPublicUser
    ? supabaseAdmin.from("users").update(publicUserPayload).eq("id", existingPublicUser.id)
    : supabaseAdmin.from("users").insert(publicUserPayload);

  const { data: publicUser, error: publicUserError } = await publicUserQuery
    .select(`
      id,
      auth_user_id,
      name,
      email,
      phone,
      is_active,
      created_at,
      updated_at,
      roles (
        id,
        name
      )
    `)
    .single();

  if (publicUserError) {
    console.error(publicUserError);
    await supabaseAdmin.auth.admin.deleteUser(authUserId);
    return jsonResponse({ error: "Could not create public user." }, 500);
  }

  return jsonResponse({ user: publicUser }, 201);
});
