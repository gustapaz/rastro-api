import assert from "node:assert/strict";
const base = process.argv[2];
if (!base || !["http:", "https:"].includes(new URL(base).protocol))
  throw new Error("Use npm run smoke -- URL");
let token;
async function req(path, method = "GET", body) {
  const r = await fetch(new URL(path, base), {
    method,
    headers: {
      ...(token ? { authorization: "Bearer " + token } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
try {
  assert.equal((await req("/api/health")).status, 200);
  const s = await req("/api/v1/streams", "POST", { label: "demo-smoke" });
  assert.equal(s.status, 201);
  token = s.data.token;
  const c = {
    expected_revision: 1,
    command_id: crypto.randomUUID(),
    type: "DISPATCH",
  };
  assert.equal(
    (await req("/api/v1/events", "POST", c)).data.event.replayed,
    false,
  );
  assert.equal(
    (await req("/api/v1/events", "POST", c)).data.event.replayed,
    true,
  );
  assert.equal(
    (
      await req("/api/v1/events", "POST", {
        ...c,
        command_id: crypto.randomUUID(),
        type: "CANCEL",
      })
    ).status,
    409,
  );
  const history = await req("/api/v1/stream");
  assert.equal(history.data.integrity, true);
  assert.equal(history.data.events.length, 1);
  assert.equal(history.data.state, "in_transit");
  assert.equal((await req("/api/openapi.json")).data.info.title, "Rastro API");
  console.log(
    JSON.stringify(
      {
        ok: true,
        base,
        checks: [
          "database health",
          "persisted event",
          "idempotency replay",
          "stale revision",
          "projection replay integrity",
          "OpenAPI",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  if (token) {
    assert.equal((await req("/api/v1/stream", "DELETE")).status, 200);
    assert.equal((await req("/api/v1/stream")).status, 401);
    console.log("Synthetic smoke stream revoked.");
  }
}
