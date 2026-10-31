import { InputError, exact, readJson, secure, problem } from "./transport.mjs";
import { spec } from "./spec.mjs";
import { appendProgram, execute, command, digest, replay } from "./domain.mjs";
export function createApi(db, clock = () => Math.floor(Date.now() / 1000)) {
  const repository = {
    existing: (id, cmd) =>
      db
        .prepare("SELECT * FROM events WHERE stream_id=? AND command_id=?")
        .bind(id, cmd)
        .first(),
    async insert(s, c, h, next, at) {
      try {
        return await db
          .prepare(
            "INSERT INTO events(stream_id,sequence,command_id,command_hash,type,from_state,to_state,occurred_at) SELECT id,revision+1,?,?,?,?,?,? FROM streams WHERE id=? AND revision=? AND state=? AND expires_at>? RETURNING *",
          )
          .bind(
            c.command_id,
            h,
            c.type,
            s.state,
            next,
            at,
            s.id,
            c.expected_revision,
            s.state,
            at,
          )
          .first();
      } catch (e) {
        if (await this.existing(s.id, c.command_id)) return null;
        throw e;
      }
    },
  };
  async function auth(req) {
    const token = req.headers.get("authorization");
    if (!token || !/^Bearer rst_[a-f0-9]{64}$/.test(token))
      throw new InputError("unauthorized", "Token de stream exigido.", 401);
    const s = await db
      .prepare("SELECT * FROM streams WHERE token_hash=? AND expires_at>?")
      .bind(await digest(token.slice(7)), clock())
      .first();
    if (!s)
      throw new InputError("unauthorized", "Token inválido ou expirado.", 401);
    return s;
  }
  return async function handle(req) {
    const id = crypto.randomUUID();
    try {
      const url = new URL(req.url),
        path = url.pathname,
        origin = req.headers.get("origin");
      if (origin && origin !== url.origin)
        throw new InputError("origin_denied", "Origem não autorizada.", 403);
      let value,
        status = 200;
      if (req.method === "GET" && path === "/api/openapi.json") {
        value = spec;
      } else if (req.method === "GET" && path === "/api/health") {
        await db.prepare("SELECT 1").first();
        value = {
          status: "ok",
          engine: "effect-event-sourcing",
          database: "ok",
        };
      } else if (req.method === "POST" && path === "/api/v1/streams") {
        const body = await readJson(req);
        exact(body, ["label"], "stream");
        if (
          typeof body.label !== "string" ||
          !/^demo-[a-z0-9-]{1,30}$/.test(body.label)
        )
          throw new InputError(
            "invalid_label",
            "Use label demo- seguido de 1–30 letras ASCII, números ou hífens.",
            422,
          );
        const now = clock();
        await db.batch([
          db
            .prepare(
              "DELETE FROM streams WHERE id IN (SELECT id FROM streams WHERE expires_at<=? LIMIT 100)",
            )
            .bind(now),
          db.prepare("DELETE FROM quotas WHERE expires_at<=?").bind(now),
        ]);
        const q = await db
          .prepare(
            "INSERT INTO quotas(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<10 RETURNING count",
          )
          .bind(
            "create:" + Math.floor(now / 3600),
            (Math.floor(now / 3600) + 1) * 3600,
          )
          .first();
        if (!q)
          throw new InputError(
            "rate_limited",
            "Limite global de 10 streams por hora UTC.",
            429,
          );
        const bytes = crypto.getRandomValues(new Uint8Array(32)),
          token =
            "rst_" +
            [...bytes].map((x) => x.toString(16).padStart(2, "0")).join(""),
          sid = crypto.randomUUID(),
          expires = now + 86400;
        await db
          .prepare(
            "INSERT INTO streams(id,token_hash,label,state,revision,created_at,expires_at) VALUES(?,?,?,'created',1,?,?)",
          )
          .bind(sid, await digest(token), body.label, now, expires)
          .run();
        value = {
          id: sid,
          token,
          label: body.label,
          state: "created",
          revision: 1,
          expires_at: expires,
        };
        status = 201;
      } else if (path === "/api/v1/events" && req.method === "POST") {
        const s = await auth(req),
          c = command(await readJson(req)),
          hash = await digest(
            JSON.stringify([c.expected_revision, c.command_id, c.type]),
          );
        const e = await execute(appendProgram(repository, s, c, hash, clock()));
        const { command_hash, stream_id, ...event } = e;
        value = { event };
      } else if (path === "/api/v1/stream" && req.method === "GET") {
        const s = await auth(req);
        if ([...url.searchParams.keys()].some((k) => k !== "after"))
          throw new InputError(
            "invalid_cursor",
            "Parâmetro desconhecido.",
            422,
          );
        const raw = url.searchParams.get("after") ?? "0";
        if (!/^(0|[1-9][0-9]?)$/.test(raw) || +raw > 30)
          throw new InputError("invalid_cursor", "after deve ser 0–30.", 422);
        const snapshot = await db.batch([
          db
            .prepare("SELECT * FROM streams WHERE id=? AND expires_at>?")
            .bind(s.id, clock()),
          db
            .prepare(
              "SELECT sequence,command_id,type,from_state,to_state,occurred_at FROM events WHERE stream_id=? ORDER BY sequence",
            )
            .bind(s.id),
        ]);
        if (!snapshot[0].results[0])
          throw new InputError("unauthorized", "Stream expirado.", 401);
        Object.assign(s, snapshot[0].results[0]);
        const all = snapshot[1].results;
        const projection = replay(all);
        value = {
          id: s.id,
          label: s.label,
          created_at: s.created_at,
          expires_at: s.expires_at,
          state: s.state,
          revision: s.revision,
          integrity:
            projection.state === s.state && projection.revision === s.revision,
          events: all.filter((e) => e.sequence > +raw),
          last_sequence: s.revision,
        };
      } else if (path === "/api/v1/stream" && req.method === "DELETE") {
        const s = await auth(req);
        await db.prepare("DELETE FROM streams WHERE id=?").bind(s.id).run();
        value = { revoked: true };
      } else throw new InputError("not_found", "Endpoint não encontrado.", 404);
      return secure(Response.json(value, { status }), id);
    } catch (e) {
      return secure(problem(e, id), id);
    }
  };
}
