export class InputError extends Error {
  constructor(code, message, status = 422) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export const invalid = (code, message) => {
  throw new InputError(code, message);
};
export const object = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export function exact(v, allowed, where) {
  if (!object(v) || Object.keys(v).some((k) => !allowed.includes(k)))
    invalid(
      "invalid_input",
      "Objeto inválido ou propriedade desconhecida: " + where,
    );
}
export async function readJson(request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new InputError(
      "unsupported_media_type",
      "Use application/json.",
      415,
    );
  if (
    request.headers.has("content-encoding") &&
    request.headers.get("content-encoding") !== "identity"
  )
    throw new InputError(
      "unsupported_encoding",
      "Corpo comprimido não é aceito.",
      415,
    );
  const reader = request.body?.getReader();
  if (!reader)
    throw new InputError("invalid_json", "Envie um objeto JSON.", 400);
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        throw new InputError(
          "body_too_large",
          "Limite de 32 KiB por requisição.",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new InputError("invalid_json", "JSON ou UTF-8 inválido.", 400);
  }
}

export function secure(response, id) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Request-Id", id);
  return new Response(response.body, { status: response.status, headers });
}
export function problem(e, id) {
  const known = e instanceof InputError;
  return Response.json(
    {
      code: known ? e.code : "internal_error",
      message: known ? e.message : "Falha interna ao processar requisi��o.",
      request_id: id,
    },
    { status: known ? e.status : 500 },
  );
}
