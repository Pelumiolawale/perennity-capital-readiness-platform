// Airtable client extracted from src/App.jsx (originally lines 19–57).
// One wrapper for both the legacy route (/) and the snapshot/report flows
// that write to Airtable. Reads the same VITE_AIRTABLE_PAT as
// src/lib/airtableEngagement.js so a single credential covers both reads
// and writes; the PAT must carry data.records:write scope on the base for
// writes to succeed.

const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID;
const AIRTABLE_PAT = import.meta.env.VITE_AIRTABLE_PAT;

export async function sendToAirtable(tableName, fields) {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_PAT) {
    console.error("❌ Airtable credentials not configured. Set VITE_AIRTABLE_BASE_ID and VITE_AIRTABLE_PAT in .env.local (local) or the Vercel project env (prod), then restart / redeploy.");
    console.log("BASE_ID present:", !!AIRTABLE_BASE_ID, "PAT present:", !!AIRTABLE_PAT);
    return false;
  }
  console.log(`📤 Sending to Airtable table "${tableName}":`, fields);
  try {
    const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${AIRTABLE_PAT}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      const error = await res.json();
      console.error("❌ Airtable error:", error);
      return false;
    }
    console.log(`✅ Successfully sent to Airtable table "${tableName}"`);
    return true;
  } catch (err) {
    console.error("❌ Airtable send failed:", err);
    return false;
  }
}
