// supabase.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://ayasirbxjxwslknhbsvn.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5YXNpcmJ4anh3c2xrbmhic3ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMjY1ODcsImV4cCI6MjA3NTYwMjU4N30.5E-ffTjzZ4pxkubtcBINHh_Jw9d6vltDs1kH8aAqB60";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function saveScore(username, biome, score, time) {
  const { error } = await supabase.from("leaderboards").insert([
    { username, biome, score, time }
  ]);
  if (error) console.error("Error saving score:", error);
}

export async function getLeaderboard(limit = 10) {
  const { data, error } = await supabase
    .from("leaderboards")
    .select("*")
    .order("score", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("Error fetching leaderboard:", error);
    return [];
  }
  return data;
}
