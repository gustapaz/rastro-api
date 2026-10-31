import { Effect, Either } from "effect";
import { InputError, exact, invalid } from "./transport.mjs";
export const transitions = {
  created: { DISPATCH: "in_transit", CANCEL: "cancelled" },
  in_transit: {
    OUT_FOR_DELIVERY: "out_for_delivery",
    REPORT_EXCEPTION: "exception",
    CANCEL: "cancelled",
  },
  out_for_delivery: { DELIVER: "delivered", REPORT_EXCEPTION: "exception" },
  exception: { RESUME: "in_transit", CANCEL: "cancelled" },
  delivered: {},
  cancelled: {},
};
export function transition(state, type) {
  const next = transitions[state]?.[type];
  if (!next)
    throw new InputError(
      "invalid_transition",
      "Transição não permitida a partir de " + state + ".",
      409,
    );
  return next;
}
export function command(v) {
  exact(v, ["expected_revision", "command_id", "type"], "command");
  if (
    !Number.isInteger(v.expected_revision) ||
    v.expected_revision < 1 ||
    v.expected_revision > 30 ||
    typeof v.command_id !== "string" ||
    !/^[-a-zA-Z0-9_]{8,64}$/.test(v.command_id) ||
    ![
      "DISPATCH",
      "CANCEL",
      "OUT_FOR_DELIVERY",
      "REPORT_EXCEPTION",
      "DELIVER",
      "RESUME",
    ].includes(v.type)
  )
    invalid("invalid_command", "Comando inválido.");
  return v;
}
export async function digest(s) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function replay(events) {
  let state = "created",
    revision = 1;
  for (const e of events) {
    if (e.sequence !== revision + 1 || e.from_state !== state)
      throw new Error("Broken event sequence");
    const next = transition(state, e.type);
    if (next !== e.to_state) throw new Error("Broken event projection");
    state = next;
    revision = e.sequence;
  }
  return { state, revision };
}
export async function execute(effect) {
  const result = await Effect.runPromise(Effect.either(effect));
  if (Either.isLeft(result)) throw result.left;
  return result.right;
}
export const attempt = (fn) => Effect.tryPromise({ try: fn, catch: (e) => e });
export function appendProgram(repo, stream, c, hash, at) {
  return Effect.gen(function* () {
    const existing = yield* attempt(() =>
      repo.existing(stream.id, c.command_id),
    );
    if (existing) {
      if (existing.command_hash !== hash)
        return yield* Effect.fail(
          new InputError(
            "idempotency_conflict",
            "command_id já usado com outro conteúdo.",
            409,
          ),
        );
      return { ...existing, replayed: true };
    }
    if (stream.revision !== c.expected_revision)
      return yield* Effect.fail(
        new InputError("revision_conflict", "Revisão desatualizada.", 409),
      );
    if (stream.revision >= 30)
      return yield* Effect.fail(
        new InputError("event_limit", "Limite de 30 revisões.", 429),
      );
    const next = yield* Effect.try({
      try: () => transition(stream.state, c.type),
      catch: (e) => e,
    });
    const saved = yield* attempt(() => repo.insert(stream, c, hash, next, at));
    if (saved) return { ...saved, replayed: false };
    // Another writer may have won between read and INSERT. Reconcile idempotency.
    const winner = yield* attempt(() => repo.existing(stream.id, c.command_id));
    if (winner && winner.command_hash === hash)
      return { ...winner, replayed: true };
    return yield* Effect.fail(
      new InputError(
        winner ? "idempotency_conflict" : "revision_conflict",
        "Outro comando venceu a disputa. Releia o histórico.",
        409,
      ),
    );
  });
}
