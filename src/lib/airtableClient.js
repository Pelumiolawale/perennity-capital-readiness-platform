// Airtable client extracted from src/App.jsx (originally lines 19–57).
// Behavior unchanged from the inlined version. Shared so both the legacy
// route (/) and any future snapshot/report flows can submit through one
// wrapper. Day 3: SnapshotRoute does NOT call Airtable yet — that's Day 4+.

const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID;
const AIRTABLE_API_KEY = import.meta.env.VITE_AIRTABLE_API_KEY;

export async function sendToAirtable(tableName, fields) {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
    console.error("❌ Airtable credentials not configured. Check your .env.local file and restart the dev server.");
    console.log("BASE_ID present:", !!AIRTABLE_BASE_ID, "API_KEY present:", !!AIRTABLE_API_KEY);
    return false;
  }
  console.log(`📤 Sending to Airtable table "${tableName}":`, fields);
  try {
    const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      const error = await res.json();
      console.error("❌ Airtable error:", error);
      if (tableName === "Users") {
        console.error('Airtable Users error:', error);
      }
      return false;
    }
    const result = await res.json();
    console.log(`✅ Successfully sent to Airtable table "${tableName}"`);
    if (tableName === "Users") {
      console.log('Airtable Users response:', result);
    }
    return true;
  } catch (err) {
    console.error("❌ Airtable send failed:", err);
    if (tableName === "Users") {
      console.error('Airtable Users error:', err);
    }
    return false;
  }
}
