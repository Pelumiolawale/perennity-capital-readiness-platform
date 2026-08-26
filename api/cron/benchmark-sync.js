// @ts-check
/**
 * Nightly benchmark sweep — the server-side half of Decision 3.
 *
 * Reads active engagements from Airtable, runs the v4 engine over each, and
 * appends one anonymised benchmark record per engagement to Postgres.
 *
 * ============================================================================
 * WHY THIS IS A CRON SWEEP AND NOT A WRITE ENDPOINT
 * ============================================================================
 *
 * The paid report renders in the browser. Emitting benchmark records from there
 * would need a browser-reachable write endpoint — and `benchmark_records` is
 * append-only by design, so anything written to it is permanent. A public write
 * path would be an unfixable pollution vector for the dataset the table exists
 * to protect.
 *
 * A scheduled server-side sweep has no caller to authenticate beyond Vercel
 * itself, so the only exposed surface is this path, closed by CRON_SECRET.
 *
 * IDEMPOTENCY IS STRUCTURAL. The table's unique key is
 * (asset_hash, assessment_date, config_version) and the adapter issues
 * ON CONFLICT DO NOTHING. `assessment_date` derives from the engagement's stable
 * intake timestamp, so re-processing an engagement is a no-op. The sweep can
 * therefore run over everything every night without tracking what it has seen.
 */

import { sql } from "@vercel/postgres";
import { assess, PostgresStorageAdapter, resolveBenchmarkSalt } from "@perennity/engine/v4";
import { fetchEngagement } from "../../src/lib/airtableEngagement.js";
import {
  airtableConfigFromEnv,
  listEngagementReferences,
} from "../../src/lib/listEngagements.js";
import { buildSFDRInputs } from "../../src/lib/sfdrInputAdapter.js";
import { buildUKSDRInputs } from "../../src/lib/ukSDRInputAdapter.js";
import { buildEntityInputs } from "../../src/lib/entityInputAdapter.js";

/**
 * Compose the engine input from an engagement.
 *
 * Mirrors ReportRoute.jsx:141-161 exactly. If that assembly changes, this must
 * change with it — otherwise the benchmark record describes a different
 * assessment from the one the client was shown, which would quietly corrupt the
 * dataset rather than fail loudly.
 *
 * @param {object} engagement
 */
export function buildRunInput(engagement) {
  const sfdrInputs = buildSFDRInputs(engagement);
  const ukSDRInputs = buildUKSDRInputs(engagement);
  const projectInput = {
    ...engagement.project_input,
    ...(sfdrInputs ? { sfdr: sfdrInputs } : {}),
    ...(ukSDRInputs ? { uk_sdr: ukSDRInputs } : {}),
  };
  const entityInput = buildEntityInputs(engagement);
  return entityInput ? { project: projectInput, entity: entityInput } : projectInput;
}

/**
 * @typedef {object} SyncDeps
 * @property {typeof fetchEngagement} [fetchEngagementImpl]
 * @property {typeof listEngagementReferences} [listImpl]
 * @property {object} [storageAdapter]
 * @property {NodeJS.ProcessEnv} [env]
 * @property {(m: string) => void} [logger]
 */

/**
 * The sweep itself, separated from the HTTP handler so it is testable without
 * constructing a request.
 *
 * @param {SyncDeps} [deps]
 */
export async function runBenchmarkSync(deps = {}) {
  const env = deps.env ?? process.env;
  const log = deps.logger ?? ((m) => console.log(m));
  const listImpl = deps.listImpl ?? listEngagementReferences;
  const fetchImpl = deps.fetchEngagementImpl ?? fetchEngagement;

  // FAIL SAFE, checked before anything else. No salt means no write — not a
  // weaker hash, not a partial run. Returning 200 is deliberate: an unset salt
  // is a configuration state, not a job failure, and retrying will not fix it.
  const salt = resolveBenchmarkSalt({ env });
  if (salt.salt === null) {
    log(`[benchmark-sync] ${salt.reason}`);
    // Same shape as the completed-sweep summary below, so a consumer never has
    // to branch on which path produced it.
    return {
      skipped: true,
      reason: salt.reason,
      listed: 0,
      processed: 0,
      emitted: 0,
      inserted: 0,
      duplicates: 0,
      ineligible: 0,
      failed: 0,
    };
  }

  const airtable = airtableConfigFromEnv(env);
  const references = await listImpl(airtable);

  const storageAdapter =
    deps.storageAdapter ??
    new PostgresStorageAdapter({ query: (text, values) => sql.query(text, values) });

  let processed = 0;
  let emitted = 0;
  let failed = 0;
  let ineligible = 0;

  for (const reference of references) {
    try {
      const entitlement = await fetchImpl(reference, airtable);
      if (!entitlement.ok) {
        // Expired or deactivated between listing and fetching. Not an error.
        ineligible += 1;
        continue;
      }
      processed += 1;
      const result = await assess(buildRunInput(entitlement.engagement), {
        storageAdapter,
        env,
        benchmarkLogger: log,
      });
      if (result.benchmarkEmit?.emitted) emitted += 1;
    } catch (err) {
      // One malformed engagement must not abort the sweep. The whole point of a
      // nightly job is that it keeps going; a single bad row should cost one
      // record, not the entire night's collection.
      failed += 1;
      log(
        `[benchmark-sync] engagement ${reference} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // Report ACTUAL inserts, not attempts.
  //
  // `emitted` counts appends that didn't throw. Because the INSERT carries
  // ON CONFLICT DO NOTHING, that number is identical on a first run and on a
  // re-run of the same data — it cannot tell you whether deduplication works.
  // The adapter reads the driver's rowCount, so `inserted` and `duplicates`
  // can. A sweep over unchanged engagements should show inserted:0.
  //
  // `null` where the adapter cannot report (e.g. an injected test double) —
  // never a fabricated zero.
  const inserted =
    typeof storageAdapter.insertedCount === "number" ? storageAdapter.insertedCount : null;
  const duplicates =
    typeof storageAdapter.duplicateCount === "number" ? storageAdapter.duplicateCount : null;

  const summary = {
    skipped: false,
    listed: references.length,
    processed,
    emitted,
    inserted,
    duplicates,
    ineligible,
    failed,
    ...(storageAdapter.rowCountUnknown ? { rowCountUnknown: true } : {}),
  };
  log(`[benchmark-sync] ${JSON.stringify(summary)}`);
  return summary;
}

/**
 * Vercel serverless handler.
 *
 * This path is publicly addressable on the production custom domain, so the
 * bearer check is the only thing standing between the internet and the dataset.
 * Vercel attaches `Authorization: Bearer $CRON_SECRET` to cron invocations
 * automatically; anything else gets 401 and never reaches the database.
 *
 * Typed structurally rather than via `@vercel/node` so this file needs no
 * types-only dependency.
 *
 * @param {{headers: Record<string, string|undefined>}} req
 * @param {{status: (c: number) => {json: (b: unknown) => unknown}}} res
 */
export default async function handler(req, res) {
  const expected = process.env.CRON_SECRET;

  // Closed by default. An unset CRON_SECRET means the endpoint refuses
  // everything rather than accidentally running open.
  if (!expected) {
    return res
      .status(503)
      .json({ error: "CRON_SECRET is not configured; endpoint disabled" });
  }
  if (req.headers.authorization !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const summary = await runBenchmarkSync();
    return res.status(200).json(summary);
  } catch (err) {
    console.error("[benchmark-sync] sweep failed", err);
    return res
      .status(500)
      .json({ error: err instanceof Error ? err.message : String(err) });
  }
}
