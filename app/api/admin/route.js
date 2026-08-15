import { createClient } from "@supabase/supabase-js";

// Run on the Node.js runtime (needs Buffer for image decoding).
export const runtime = "nodejs";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Admin client uses the SECRET service-role key and bypasses row-level security.
// It only ever runs on the server, never in the browser.
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }

  const code = process.env.OFFICER_CODE;
  if (!code) {
    return json({ error: "Server isn't configured yet: set OFFICER_CODE in Vercel." }, 500);
  }
  if (!body || body.code !== code) {
    return json({ error: "That passcode didn't match." }, 401);
  }

  const db = adminClient();
  const { op, data } = body;

  try {
    switch (op) {
      case "verify":
        return json({ ok: true });

      case "saveEvent":
        return json(await saveEvent(db, data));

      case "deleteEvent": {
        const { error } = await db.from("events").delete().eq("id", data.id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "saveMember":
        return json(await saveMember(db, data));

      case "deleteMember": {
        const { error } = await db.from("members").delete().eq("id", data.id);
        if (error) throw error;
        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: e.message || "Server error" }, 500);
  }
}

async function saveEvent(db, d) {
  const payload = {
    title: d.title,
    date: d.date,
    time: d.time || "",
    type: d.type || "other",
    location: d.location || "",
    notes: d.notes || "",
  };
  let id = d.id;
  if (id) {
    const { error } = await db.from("events").update(payload).eq("id", id);
    if (error) throw error;
  } else {
    const { data: row, error } = await db.from("events").insert(payload).select().single();
    if (error) throw error;
    id = row.id;
  }
  // Reset assignments to match the current selection.
  await db.from("assignments").delete().eq("event_id", id);
  const rows = (d.memberIds || []).map((mid) => ({ event_id: id, member_id: mid }));
  if (rows.length) {
    const { error } = await db.from("assignments").insert(rows);
    if (error) throw error;
  }
  return { id };
}

async function saveMember(db, d) {
  let id = d.id;
  const base = { name: d.name, role: d.role || "", bio: d.bio || "" };
  if (id) {
    const { error } = await db.from("members").update(base).eq("id", id);
    if (error) throw error;
  } else {
    const { data: row, error } = await db.from("members").insert(base).select().single();
    if (error) throw error;
    id = row.id;
  }

  if (d.imageDataUrl) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(d.imageDataUrl);
    if (match) {
      const contentType = match[1];
      const buf = Buffer.from(match[2], "base64");
      const ext = contentType.includes("webp")
        ? "webp"
        : contentType.includes("png")
        ? "png"
        : "jpg";
      const path = `${id}/${Date.now()}.${ext}`;
      const { error: upErr } = await db.storage
        .from("avatars")
        .upload(path, buf, { contentType, upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = db.storage.from("avatars").getPublicUrl(path);
      const { error } = await db.from("members").update({ photo_url: pub.publicUrl }).eq("id", id);
      if (error) throw error;
    }
  } else if (d.removePhoto) {
    const { error } = await db.from("members").update({ photo_url: "" }).eq("id", id);
    if (error) throw error;
  }

  return { id };
}
