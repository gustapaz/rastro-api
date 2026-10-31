import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";
import { createApi } from "../server/api.mjs";
let mf, db, api, directory, time;
const runtime = () =>
  new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: "2026-05-15",
    d1Databases: { DB: "rastro-test" },
    d1Persist: directory,
  });
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "rastro-tests-"));
  mf = runtime();
  db = await mf.getD1Database("DB");
  for (const sql of (
    await readFile(
      new URL("../drizzle/0000_first_madame_hydra.sql", import.meta.url),
      "utf8",
    )
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean))
    await db.prepare(sql).run();
});
beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM streams"),
    db.prepare("DELETE FROM quotas"),
  ]);
  time = 2000000000;
  api = createApi(db, () => time);
});
after(async () => {
  await mf.dispose();
  const actual = resolve(directory);
  if (
    !actual.startsWith(resolve(tmpdir()) + sep) ||
    !basename(actual).startsWith("rastro-tests-")
  )
    throw new Error("Unsafe cleanup");
  await rm(actual, { recursive: true, force: true });
});
async function request(path, method = "GET", token, body, headers = {}) {
  const r = await api(
    new Request("https://rastro.test" + path, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: "Bearer " + token } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
  return { status: r.status, body: await r.json(), headers: r.headers };
}
async function session() {
  const r = await request("/api/v1/streams", "POST", null, {
    label: "demo-test",
  });
  assert.equal(r.status, 201);
  return r.body;
}
const cmd = (type, rev, id = crypto.randomUUID()) => ({
  expected_revision: rev,
  command_id: id,
  type,
});
const append = (s, c) => request("/api/v1/events", "POST", s.token, c);
test("health queries real DB; missing and forged credentials denied", async () => {
  assert.equal((await request("/api/health")).status, 200);
  assert.equal((await request("/api/v1/stream")).status, 401);
  assert.equal(
    (await request("/api/v1/stream", "GET", "rst_" + "0".repeat(64))).status,
    401,
  );
});
test("stream stores token hash only, isolated from another stream", async () => {
  const a = await session(),
    b = await session();
  await append(a, cmd("DISPATCH", 1));
  const r = await request("/api/v1/stream", "GET", b.token);
  assert.equal(r.body.events.length, 0);
  assert.equal(r.body.state, "created");
  const raw = await db
    .prepare("SELECT * FROM streams WHERE id=?")
    .bind(a.id)
    .first();
  assert.notEqual(raw.token_hash, a.token);
  assert.ok(!JSON.stringify(raw).includes(a.token));
});
test("full happy delivery path and replayed projection", async () => {
  const s = await session();
  for (const [i, t] of ["DISPATCH", "OUT_FOR_DELIVERY", "DELIVER"].entries())
    assert.equal((await append(s, cmd(t, i + 1))).status, 200);
  const r = await request("/api/v1/stream", "GET", s.token);
  assert.equal(r.body.state, "delivered");
  assert.equal(r.body.revision, 4);
  assert.equal(r.body.events.length, 3);
  assert.equal(r.body.integrity, true);
  assert.equal((await append(s, cmd("RESUME", 4))).status, 409);
});
test("exception may resume, cancellation is terminal", async () => {
  const s = await session();
  for (const [i, t] of [
    "DISPATCH",
    "REPORT_EXCEPTION",
    "RESUME",
    "CANCEL",
  ].entries())
    assert.equal((await append(s, cmd(t, i + 1))).status, 200);
  assert.equal(
    (await append(s, cmd("DISPATCH", 5))).body.code,
    "invalid_transition",
  );
});
test("identical idempotent command replays before stale revision checks", async () => {
  const s = await session(),
    c = cmd("DISPATCH", 1);
  const a = await append(s, c),
    b = await append(s, c);
  assert.equal(a.body.event.replayed, false);
  assert.equal(b.body.event.replayed, true);
  assert.equal(b.body.event.sequence, 2);
  assert.equal(
    (await request("/api/v1/stream", "GET", s.token)).body.events.length,
    1,
  );
});
test("same key with changed content rejected", async () => {
  const s = await session(),
    c = cmd("DISPATCH", 1);
  await append(s, c);
  assert.equal(
    (await append(s, { ...c, type: "CANCEL" })).body.code,
    "idempotency_conflict",
  );
});
test("concurrent different commands yield exactly one winner", async () => {
  const s = await session(),
    r = await Promise.all([
      append(s, cmd("DISPATCH", 1)),
      append(s, cmd("CANCEL", 1)),
    ]);
  assert.deepEqual(r.map((x) => x.status).sort(), [200, 409]);
  const read = await request("/api/v1/stream", "GET", s.token);
  assert.equal(read.body.events.length, 1);
  assert.equal(read.body.integrity, true);
});
test("concurrent identical commands produce one event and a replay", async () => {
  const s = await session(),
    c = cmd("DISPATCH", 1),
    r = await Promise.all([append(s, c), append(s, c)]);
  assert.deepEqual(
    r.map((x) => x.status),
    [200, 200],
  );
  assert.deepEqual(r.map((x) => x.body.event.replayed).sort(), [false, true]);
});
test("SQL projection failure rolls back event and state together", async () => {
  const s = await session();
  await db
    .prepare(
      "CREATE TRIGGER fail_projection BEFORE UPDATE ON streams BEGIN SELECT RAISE(ABORT,'injected'); END",
    )
    .run();
  try {
    assert.equal((await append(s, cmd("DISPATCH", 1))).status, 500);
  } finally {
    await db.prepare("DROP TRIGGER fail_projection").run();
  }
  const r = await request("/api/v1/stream", "GET", s.token);
  assert.equal(r.body.events.length, 0);
  assert.equal(r.body.revision, 1);
  assert.equal(r.body.integrity, true);
});
test("events cannot be updated in SQL", async () => {
  const s = await session();
  await append(s, cmd("DISPATCH", 1));
  await assert.rejects(() =>
    db
      .prepare("UPDATE events SET type='CANCEL' WHERE stream_id=?")
      .bind(s.id)
      .run(),
  );
});
test("event cursor excludes earlier sequences and rejects malformed cursors", async () => {
  const s = await session();
  await append(s, cmd("DISPATCH", 1));
  await append(s, cmd("OUT_FOR_DELIVERY", 2));
  assert.deepEqual(
    (await request("/api/v1/stream?after=2", "GET", s.token)).body.events.map(
      (e) => e.sequence,
    ),
    [3],
  );
  assert.equal(
    (await request("/api/v1/stream?after=-1", "GET", s.token)).status,
    422,
  );
  assert.equal(
    (await request("/api/v1/stream?bad=1", "GET", s.token)).status,
    422,
  );
});
test("expiry rejects reads and writes; revocation cascades events", async () => {
  const s = await session();
  await append(s, cmd("DISPATCH", 1));
  time += 86400;
  assert.equal((await request("/api/v1/stream", "GET", s.token)).status, 401);
  assert.equal((await append(s, cmd("CANCEL", 2))).status, 401);
  time -= 86400;
  assert.equal(
    (await request("/api/v1/stream", "DELETE", s.token)).status,
    200,
  );
  assert.equal((await request("/api/v1/stream", "GET", s.token)).status, 401);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS n FROM events").first()).n,
    0,
  );
});
test("creation quota is atomic and resets next UTC hour", async () => {
  const r = await Promise.all(
    Array.from({ length: 12 }, () =>
      request("/api/v1/streams", "POST", null, { label: "demo-test" }),
    ),
  );
  assert.equal(r.filter((x) => x.status === 201).length, 10);
  assert.equal(r.filter((x) => x.status === 429).length, 2);
  time += 3600;
  assert.equal((await session()).revision, 1);
});
test("event limit is enforced without breaking idempotency", async () => {
  const s = await session();
  let last;
  for (let rev = 1; rev < 30; rev++) {
    const type =
      rev === 1 ? "DISPATCH" : rev % 2 === 0 ? "REPORT_EXCEPTION" : "RESUME";
    last = cmd(type, rev);
    assert.equal((await append(s, last)).status, 200);
  }
  assert.equal((await append(s, cmd("CANCEL", 30))).status, 429);
  assert.equal((await append(s, last)).body.event.replayed, true);
});
test("transport limits, origin, unknown fields and invalid transitions", async () => {
  const s = await session();
  assert.equal(
    (await append(s, cmd("DELIVER", 1))).body.code,
    "invalid_transition",
  );
  assert.equal(
    (await append(s, { ...cmd("DISPATCH", 1), other: 1 })).status,
    422,
  );
  assert.equal(
    (
      await request("/api/health", "GET", null, null, {
        origin: "https://evil.test",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/v1/streams", "POST", null, {
        label: "x".repeat(33000),
      })
    ).status,
    413,
  );
  const r = await api(
    new Request("https://rastro.test/api/v1/streams", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    }),
  );
  assert.equal(r.status, 415);
  assert.equal(
    (await request("/api/health")).headers.get("cache-control"),
    "no-store",
  );
});
test("persisted events survive runtime disposal and reopening", async () => {
  const s = await session();
  await append(s, cmd("DISPATCH", 1));
  await mf.dispose();
  mf = runtime();
  db = await mf.getD1Database("DB");
  api = createApi(db, () => time);
  const r = await request("/api/v1/stream", "GET", s.token);
  assert.equal(r.body.state, "in_transit");
  assert.equal(r.body.integrity, true);
});
