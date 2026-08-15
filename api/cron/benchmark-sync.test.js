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

const AIRTABLE_ENV = {
  VITE_AIRTABLE_PAT: "pat_test",
  VITE_AIRTABLE_BASE_ID: "app_test",
  VITE_AIRTABLE_ENGAGEMENTS_TABLE_ID: "tbl_test",
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

/** @param {string} ref */
function engagement(ref) {
  return {
    ok: true,
    engagement: {
      engagement_reference: ref,
      client_name: "ACME SECRET CORP",
      project_name: "Project Nightingale",
      project_input: { ...structuredClone(v31Fixture.projectInput), project_id: ref },
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
    expect(result.written).toBe(0);
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
    expect(result.written).toBe(2);
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
    expect(result.written).toBe(2);
    expect(adapter.records).toHaveLength(2);
  });

  it("handles an empty engagement list without error", async () => {
    const result = await runBenchmarkSync(deps({ listImpl: async () => [] }));
    expect(result.written).toBe(0);
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
