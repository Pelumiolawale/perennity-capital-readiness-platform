// Airtable client extracted from src/App.jsx (originally lines 19–57).
//
// Sep 2026: this no longer talks to Airtable directly. It used to read
// VITE_AIRTABLE_PAT, which Vite inlines into the public bundle, so anyone could
// lift a read/write token for the whole base. Writes now go through the
// api/leads.js serverless function, which holds the token server-side
// (AIRTABLE_PAT) and only ever writes to the Leads table.
//
// The (tableName, fields) signature is kept so callers and their tests are
// unchanged. The payload is never logged: it holds personal data.

const ENDPOINTS = {
  Leads: "/api/leads",
};

export async function sendToAirtable(tableName, fields) {
  const endpoint = ENDPOINTS[tableName];
  if (!endpoint) {
    console.error(`❌ No server endpoint for Airtable table "${tableName}".`);
    return false;
  }
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      console.error(`❌ Airtable write via ${endpoint} failed: ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      `❌ Airtable write via ${endpoint} failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}
