import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

// Confirm the caller is signed in AND is an admin, using their access token.
async function requireAdmin(req, db) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "Not signed in", status: 401 };
  const { data: userData, error } = await db.auth.getUser(token);
  if (error || !userData?.user) return { error: "Not signed in", status: 401 };
  const { data: me } = await db
    .from("members")
    .select("id, is_admin")
    .eq("auth_user_id", userData.user.id)
    .single();
  if (!me?.is_admin) return { error: "Admins only", status: 403 };
  return { ok: true };
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Server isn't configured: set SUPABASE_SERVICE_ROLE_KEY in Vercel." }, 500);
  }

  const db = serviceClient();
  const gate = await requireAdmin(req, db);
  if (gate.error) return json({ error: gate.error }, gate.status);

  const { op, data } = body;
  try {
    switch (op) {
      case "inviteMember": {
        const email = (data.email || "").trim().toLowerCase();
        const name = (data.name || "").trim();
        const password = data.tempPassword || "";
        if (!email || !name || !password) {
          return json({ error: "Name, email, and a temporary password are all required." }, 400);
        }
        if (password.length < 6) {
          return json({ error: "Temporary password must be at least 6 characters." }, 400);
        }
        const { error } = await db.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name },
        });
        if (error) {
          const msg = /already/i.test(error.message)
            ? "Someone with that email already has an account."
            : error.message;
          return json({ error: msg }, 400);
        }
        return json({ ok: true });
      }

      case "resetPassword": {
        const { data: m } = await db
          .from("members")
          .select("auth_user_id")
          .eq("id", data.memberId)
          .single();
        if (!m?.auth_user_id) return json({ error: "That member has no login to reset." }, 400);
        if (!data.newPassword || data.newPassword.length < 6) {
          return json({ error: "New password must be at least 6 characters." }, 400);
        }
        const { error } = await db.auth.admin.updateUserById(m.auth_user_id, {
          password: data.newPassword,
        });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case "removeMember": {
        const { data: m } = await db
          .from("members")
          .select("auth_user_id")
          .eq("id", data.memberId)
          .single();
        if (m?.auth_user_id) {
          const { error } = await db.auth.admin.deleteUser(m.auth_user_id);
          if (error) return json({ error: error.message }, 400);
        } else {
          await db.from("members").delete().eq("id", data.memberId);
        }
        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: e.message || "Server error" }, 500);
  }
}
