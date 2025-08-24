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
// --- Handle safety helpers ---
export function isBannedHandle(h) {
  if (!h) return false;
  const bad = ["fuck","shit","cunt","nazi","hitler","rape"];
  const lower = String(h).toLowerCase();
  return bad.some(b => lower.includes(b));
}

// if you ever want to mask on display:
export function safeDisplayHandle(h) {
  return isBannedHandle(h) ? "Player" : (h || "Player");
}

export async function updateHandle(userId, handle) {
  if (!userId || !handle) return { ok:false, error:"missing" };
  if (isBannedHandle(handle)) {
    return { ok:false, error:"banned" };
  }
  const { error } = await supabase.from("users").update({ handle }).eq("id", userId);
  if (error) return { ok:false, error };
  return { ok:true };
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
// ---- Daily stats helpers (streaks, wins, win %) ----

// Parse "YYYYMMDD" into a UTC Date (so DST/locale doesn't bite us)
function _parseDayUTC(yyyymmdd) {
  const y = +yyyymmdd.slice(0, 4);
  const m = +yyyymmdd.slice(4, 6) - 1; // 0-based
  const d = +yyyymmdd.slice(6, 8);
  return new Date(Date.UTC(y, m, d));
}

// Compute stats from a list of rows: [{ seed: "YYYYMMDD|type", won: boolean }, ...]
export function computeDailyStats(rows) {
  if (!rows || !rows.length) {
    return { currentStreak: 0, maxStreak: 0, totalWins: 0, totalPlayed: 0, winPct: 0 };
  }

  // Consolidate by day (win if ANY row that day was a win)
  const byDay = new Map(); // key: "YYYYMMDD" -> { won: boolean }
  for (const r of rows) {
    const dateStr = String(r.seed).split("|")[0];
    const entry = byDay.get(dateStr) || { won: false };
    entry.won = entry.won || !!r.won;
    byDay.set(dateStr, entry);
  }

  const days = [...byDay.keys()].sort(); // "YYYYMMDD" strings ascending
  const totalPlayed = days.length;
  const totalWins = days.reduce((acc, k) => acc + (byDay.get(k).won ? 1 : 0), 0);
  const winPct = totalPlayed ? Math.round((totalWins / totalPlayed) * 100) : 0;

  // Streaks with gap detection (missing day breaks)
  let maxStreak = 0;
  let curStreak = 0;
  let prevDate = null;

  for (const k of days) {
    const dt = _parseDayUTC(k);
    if (prevDate) {
      const diff = Math.round((dt - prevDate) / 86400000);
      if (diff !== 1) curStreak = 0; // gap resets
    }
    if (byDay.get(k).won) {
      curStreak += 1;
      maxStreak = Math.max(maxStreak, curStreak);
    } else {
      curStreak = 0;
    }
    prevDate = dt;
  }

  // If last played day isn't today or yesterday, streak should be 0 (missed days at the end)
  const lastPlayed = _parseDayUTC(days[days.length - 1]);
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const gapToToday = Math.round((todayUTC - lastPlayed) / 86400000);
  if (gapToToday >= 2) curStreak = 0;

  return { currentStreak: curStreak, maxStreak, totalWins, totalPlayed, winPct };
}

// Fetch this user's DAILY rows for one game type, then compute stats
export async function getDailyStats(userId, gameType) {
  const { data, error } = await supabase
    .from("games")
    .select("seed, won")
    .eq("user_id", userId)
    .eq("game_type", gameType)
    .eq("run_mode", "daily")
    .order("seed", { ascending: true });

  if (error) {
    console.error("getDailyStats error:", error);
    return { currentStreak: 0, maxStreak: 0, totalWins: 0, totalPlayed: 0, winPct: 0 };
  }
  return computeDailyStats(data || []);
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
