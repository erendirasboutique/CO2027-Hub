import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Guard so a missing env var gives a clear message instead of a cryptic crash.
if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.error(
    "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel."
  );
}

export const supabase = createClient(url || "http://localhost", anon || "public-anon-key");
