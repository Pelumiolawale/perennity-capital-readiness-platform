// @ts-check
//
// Benchmark sweep tests (Task: finish the benchmark pipeline).
//
// Negative-first, mirroring the engine's datastore tests. The assertions that
// matter most are the ones proving nothing gets written: the benchmark table is
// append-only, so a row written in error is permanent. A test suite that only
// covered the happy path would be checking the least consequential behaviour.

import { describe, it, expect, vi } from "vitest";
import handler, { runBenchmarkSync, buildRunInput } from "./benchmark-sync.js";
import v31Fixture from "../../src/__fixtures__/v3.1-assessment.json";

const GOOD_SALT = "a-production-grade-salt-value";
const SECRET = "cron-secret-value";

// The names the deploy actually uses. These were VITE_-prefixed until Sep
// 2026, which only worked because airtableConfigFromEnv accepted the legacy
// spelling — the same spelling vite.config.js fails the build on, because the
// PAT once shipped in the public bundle under it. A test seeding the forbidden
// names was quietly documenting the wrong configuration.
const AIRTABLE_ENV = {
  AIRTABLE_PAT: "pat_test",
  AIRTABLE_BASE_ID: "app_test",
  AIRTABLE_ENGAGEMENTS_TABLE_ID: "tbl_test",
};

const ENV = { ...AIRTABLE_ENV, PERENNITY_BENCHMARK_SALT: GOOD_SALT };

/** A collecting adapter standing in for Postgres. */
function collector() {
  return {
    name: "test",
    records: /** @type {object[]} */ ([]),
    async append(record) {
      this.records.push(record);
    },
  };
}

const ISSUED_AT = "2026-06-03T00:00:00.000Z";

/**
 * @param {string} ref
 * @param {{projectId?: string|null, issuedAt?: string|null}} [o]
 */
function engagement(ref, o = {}) {
  const projectId = o.projectId === undefined ? ref : o.projectId;
  const issuedAt = o.issuedAt === undefined ? ISSUED_AT : o.issuedAt;
  return {
    ok: true,
    engagement: {
      engagement_reference: ref,
      client_name: "ACME SECRET CORP",
      project_name: "Project Nightingale",
      // As fetchEngagement builds it: a blank Issued At becomes "now" on
      // project_input, and only report_metadata keeps the raw value.
      project_input: {
        ...structuredClone(v31Fixture.projectInput),
        project_id: projectId,
        intake_timestamp: issuedAt ?? new Date().toISOString(),
      },
      report_metadata: { project_id: projectId, issued_at: issuedAt },
    },
  };
}

function deps(overrides = {}) {
  return {
    env: ENV,
    logger: () => {},
    storageAdapter: collector(),
    listImpl: async () => ["ref-1", "ref-2"],
    fetchEngagementImpl: async (ref) => engagement(ref),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The endpoint is closed
// ---------------------------------------------------------------------------

describe("handler authorisation", () => {
  function mockRes() {
    const res = {
      statusCode: 0,
      body: /** @type {any} */ (null),
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    return res;
  }

  it("rejects a request with no Authorization header", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = mockRes();
    await handler({ headers: {} }, res);
    expect(res.statusCode).toBe(401);
    vi.unstubAllEnvs();
  });

  it("rejects a wrong bearer token", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = mockRes();
    await handler({ headers: { authorization: "Bearer wrong" } }, res);
    expect(res.statusCode).toBe(401);
    vi.unstubAllEnvs();
  });

  it("refuses to run at all when CRON_SECRET is unset — closed by default", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = mockRes();
    await handler({ headers: { authorization: "Bearer anything" } }, res);
    // 503, not 200. An unconfigured secret must never mean "open".
    expect(res.statusCode).toBe(503);
    vi.unstubAllEnvs();
  });
});

// ---------------------------------------------------------------------------
// Fail safe
// ---------------------------------------------------------------------------

describe("fail safe", () => {
  it("writes NOTHING when the salt is absent", async () => {
    const adapter = collector();
    const result = await runBenchmarkSync(
      deps({ env: { ...AIRTABLE_ENV }, storageAdapter: adapter }),
    );
    expect(adapter.records).toHaveLength(0);
    expect(result.skipped).toBe(true);
    expect(result.emitted).toBe(0);
  });

  it("writes NOTHING when the salt is too weak", async () => {
    const adapter = collector();
    const result = await runBenchmarkSync(
      deps({
        env: { ...AIRTABLE_ENV, PERENNITY_BENCHMARK_SALT: "short" },
        storageAdapter: adapter,
      }),
    );
    expect(adapter.records).toHaveLength(0);
    expect(result.skipped).toBe(true);
  });

  it("does not even reach Airtable when the salt is absent", async () => {
    const listImpl = vi.fn(async () => ["ref-1"]);
    await runBenchmarkSync(deps({ env: { ...AIRTABLE_ENV }, listImpl }));
    expect(listImpl).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

describe("sweep", () => {
  it("writes exactly one record per engagement", async () => {
    const adapter = collector();
    const result = await runBenchmarkSync(deps({ storageAdapter: adapter }));
    expect(adapter.records).toHaveLength(2);
    expect(result.emitted).toBe(2);
    expect(result.processed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("skips engagements that are no longer entitled, without counting them as failures", async () => {
    const adapter = collector();
    const result = await runBenchmarkSync(
      deps({
        storageAdapter: adapter,
        fetchEngagementImpl: async (ref) =>
          ref === "ref-1" ? engagement(ref) : { ok: false, reason: "expired" },
      }),
    );
    expect(adapter.records).toHaveLength(1);
    expect(result.ineligible).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("one broken engagement does not abort the sweep", async () => {
    const adapter = collector();
    const result = await runBenchmarkSync(
      deps({
        storageAdapter: adapter,
        listImpl: async () => ["ref-1", "boom", "ref-3"],
        fetchEngagementImpl: async (ref) => {
          if (ref === "boom") throw new Error("malformed engagement");
          return engagement(ref);
        },
      }),
    );
    expect(result.failed).toBe(1);
    expect(result.emitted).toBe(2);
    expect(adapter.records).toHaveLength(2);
  });

  it("handles an empty engagement list without error", async () => {
    const result = await runBenchmarkSync(deps({ listImpl: async () => [] }));
    expect(result.emitted).toBe(0);
    expect(result.failed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The records themselves
// ---------------------------------------------------------------------------

describe("record content", () => {
  it("carries no client name, project name or raw identifier", async () => {
    const adapter = collector();
    await runBenchmarkSync(deps({ storageAdapter: adapter }));
    const serialised = JSON.stringify(adapter.records);
    expect(serialised).not.toContain("ACME SECRET CORP");
    expect(serialised).not.toContain("Project Nightingale");
    expect(serialised).not.toContain("ref-1");
  });

  it("carries a salted hash and coarse region only", async () => {
    const adapter = collector();
    await runBenchmarkSync(deps({ storageAdapter: adapter }));
    for (const record of adapter.records) {
      expect(record.assetHash).toMatch(/^bh1:/);
      expect(record.region).toBeTruthy();
      expect(record.metrics.context).not.toHaveProperty("hostJurisdiction");
    }
  });

  it("distinct engagements produce distinct hashes", async () => {
    const adapter = collector();
    await runBenchmarkSync(deps({ storageAdapter: adapter }));
    const hashes = adapter.records.map((r) => r.assetHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("the same engagement hashes identically across runs — the dedup key is stable", async () => {
    const first = collector();
    const second = collector();
    await runBenchmarkSync(deps({ storageAdapter: first }));
    await runBenchmarkSync(deps({ storageAdapter: second }));
    // Idempotency is enforced by the database's unique index, but it only works
    // if the key is reproducible. This is the half we can prove here.
    expect(second.records[0].assetHash).toBe(first.records[0].assetHash);
    expect(second.records[0].assessmentDate).toBe(first.records[0].assessmentDate);
    expect(second.records[0].configVersion).toBe(first.records[0].configVersion);
  });
});

// ---------------------------------------------------------------------------
// ITEM-14 / ITEM-15: an engagement without a stable identity writes nothing
// ---------------------------------------------------------------------------

describe("identity preconditions", () => {
  it("ITEM-14: a blank Issued At writes nothing, and says why", async () => {
    const adapter = collector();
    const lines = [];
    const result = await runBenchmarkSync(
      deps({
        storageAdapter: adapter,
        logger: (m) => lines.push(m),
        fetchEngagementImpl: async (ref) =>
          engagement(ref, ref === "ref-1" ? { issuedAt: null } : {}),
      }),
    );
    // A blank date used to become "now", so every nightly run was a new
    // (hash, date) pair and ON CONFLICT never fired: one new permanent row
    // per night for the same engagement.
    expect(adapter.records).toHaveLength(1);
    expect(result.ineligible).toBe(1);
    expect(result.failed).toBe(0);
    expect(lines.join("\n")).toMatch(/ref-1.*no Issued At/);
  });

  it("ITEM-15: a blank Project ID writes nothing, and says why", async () => {
    const adapter = collector();
    const lines = [];
    const result = await runBenchmarkSync(
      deps({
        storageAdapter: adapter,
        logger: (m) => lines.push(m),
        fetchEngagementImpl: async (ref) =>
          engagement(ref, ref === "ref-2" ? { projectId: null } : {}),
      }),
    );
    // A blank id hashed as the string "null", merging every such engagement
    // into one asset in the benchmark set.
    expect(adapter.records).toHaveLength(1);
    expect(result.ineligible).toBe(1);
    expect(lines.join("\n")).toMatch(/ref-2.*no Project ID/);
  });

  it("two engagements with blank Project IDs do not share a record", async () => {
    const adapter = collector();
    await runBenchmarkSync(
      deps({
        storageAdapter: adapter,
        fetchEngagementImpl: async (ref) => engagement(ref, { projectId: null }),
      }),
    );
    expect(adapter.records).toHaveLength(0);
  });

  it("the record's date is the engagement's Issued At, never the run time", async () => {
    const adapter = collector();
    await runBenchmarkSync(deps({ storageAdapter: adapter }));
    for (const record of adapter.records) {
      expect(String(record.assessmentDate)).toContain("2026-06-03");
    }
  });
});

// ---------------------------------------------------------------------------
// Input assembly parity with the paid route
// ---------------------------------------------------------------------------

describe("buildRunInput", () => {
  it("returns a bare project input when there are no entity disclosures", () => {
    const input = buildRunInput(engagement("ref-1").engagement);
    expect(input).toHaveProperty("project_id");
    expect(input).not.toHaveProperty("project");
  });

  it("passes the engagement's project_input through intact", () => {
    const input = buildRunInput(engagement("ref-9").engagement);
    expect(input.project_id).toBe("ref-9");
    expect(input.facility_type).toBe("hyperscale");
  });
});

// ---------------------------------------------------------------------------
// Insert reporting — the signal that tells you deduplication is working
// ---------------------------------------------------------------------------

describe("insert reporting", () => {
  /** Stands in for PostgresStorageAdapter, including its accounting surface. */
  function countingAdapter(rowCounts) {
    let i = 0;
    return {
      name: "counting",
      attemptedCount: 0,
      insertedCount: 0,
      get duplicateCount() {
        return this.attemptedCount - this.insertedCount;
      },
      rowCountUnknown: false,
      async append() {
        this.attemptedCount += 1;
        this.insertedCount += rowCounts[i++] ?? 0;
      },
    };
  }

  it("a first run reports rows actually inserted", async () => {
    const adapter = countingAdapter([1, 1]);
    const result = await runBenchmarkSync(deps({ storageAdapter: adapter }));
    expect(result.emitted).toBe(2);
    expect(result.inserted).toBe(2);
    expect(result.duplicates).toBe(0);
  });

  it("a RE-RUN of unchanged data reports inserted:0 — the whole point", async () => {
    // Driver reports 0 rows affected: both records already exist.
    const adapter = countingAdapter([0, 0]);
    const result = await runBenchmarkSync(deps({ storageAdapter: adapter }));
    // Attempts still happened and did not error...
    expect(result.emitted).toBe(2);
    // ...but nothing new was written, and the summary now says so.
    expect(result.inserted).toBe(0);
    expect(result.duplicates).toBe(2);
  });

  it("a partial re-run distinguishes new rows from duplicates", async () => {
    const adapter = countingAdapter([0, 1]);
    const result = await runBenchmarkSync(deps({ storageAdapter: adapter }));
    expect(result.inserted).toBe(1);
    expect(result.duplicates).toBe(1);
  });

  it("reports null rather than a fabricated zero when the adapter cannot count", async () => {
    // The plain collector used elsewhere has no accounting surface.
    const result = await runBenchmarkSync(deps());
    expect(result.inserted).toBeNull();
    expect(result.duplicates).toBeNull();
  });

  it("surfaces rowCountUnknown when the driver reported no rowCount", async () => {
    const adapter = countingAdapter([0]);
    adapter.rowCountUnknown = true;
    const result = await runBenchmarkSync(deps({ storageAdapter: adapter }));
    expect(result.rowCountUnknown).toBe(true);
  });
});
