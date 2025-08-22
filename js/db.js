// public/js/db.js
// Fill in your actual URL + anon key from Supabase → Settings → API
export const SUPABASE_URL = "https://acmkzgzdeooicgsvudxd.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjbWt6Z3pkZW9vaWNnc3Z1ZHhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MDk5NzMsImV4cCI6MjA3MTA4NTk3M30.6l7bslgFupbVd1ASV_ukFyYaxHMb9wubaXDLCi-lSmc";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- identity (no email): device ID ----------
export function getDeviceId() {
  try {
    let id = localStorage.getItem("whendle_device_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("whendle_device_id", id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export async function updateHandle(userId, handle) {
  if (!userId || !handle) return;
  const { error } = await supabase.from("users").update({ handle }).eq("id", userId);
  if (error) console.warn("updateHandle error:", error);
}

// Optionally fetch country via Vercel (we’ll add /api/country below)
export async function fetchCountry() {
  try {
    const resp = await fetch("/api/country", { cache: "no-store" });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json.country || null;
  } catch {
    return null;
  }
}

// Upsert the user row (no email) keyed by deviceId
export async function ensureUser(deviceId, country) {
  const row = { id: deviceId };
  if (country) row.country = country;
  const { error } = await supabase.from("users").upsert(row, { onConflict: "id" });
  if (error) console.error("ensureUser error:", error);
  return deviceId;
}

// Build Wordle-style share text
export function buildShare({ title, tries, won, rows, url }) {
  const grid = rows
    .map((r) => "🟩".repeat(r.green) + "🟨".repeat(r.amber) + "🟥".repeat(r.red))
    .join("\n");
  const score = won ? `${tries}/6` : "X/6";
  return `${title}\n${score}\n\n${grid}\n\n${url}`;
}

// Country flag helper
export function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return "🏳️";
  const codePoints = [...cc.toUpperCase()].map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...codePoints);
}

// Record a completed game (Daily or Practice)
export async function recordGame({
  userId, gameType, runMode, seed, entityName, won, tries, msElapsed, rows
}) {
  const lampsGrid = rows?.length
    ? rows.map((r) => "🟩".repeat(r.green) + "🟨".repeat(r.amber) + "🟥".repeat(r.red)).join("\n")
    : null;

  const { error } = await supabase.from("games").insert([{
    user_id: userId,
    game_type: gameType,   // 'births' | 'events'
    run_mode: runMode,     // 'daily'  | 'practice'
    seed,
    entity_name: entityName,
    won,
    tries,
    ms_elapsed: msElapsed,
    lamps_grid: lampsGrid
  }]);

  if (error) {
    console.error("recordGame error:", error);
    return { ok: false, error };
  }
  return { ok: true };
}
