const ref = {
  type: "object",
  additionalProperties: false,
  required: ["expected_revision", "command_id", "type"],
  properties: {
    expected_revision: { type: "integer", minimum: 1, maximum: 30 },
    command_id: { type: "string", pattern: "^[-a-zA-Z0-9_]{8,64}$" },
    type: {
      type: "string",
      enum: [
        "DISPATCH",
        "CANCEL",
        "OUT_FOR_DELIVERY",
        "REPORT_EXCEPTION",
        "DELIVER",
        "RESUME",
      ],
    },
  },
};
const event = {
  type: "object",
  properties: {
    sequence: { type: "integer" },
    command_id: { type: "string" },
    type: { type: "string" },
    from_state: { type: "string" },
    to_state: { type: "string" },
    occurred_at: { type: "integer" },
    replayed: { type: "boolean" },
  },
};
const fail = {
  description:
    "Erro com code, message e request_id. Conflitos: revision_conflict, idempotency_conflict, invalid_transition.",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          request_id: { type: "string" },
        },
      },
    },
  },
};
const errors = Object.fromEntries(
  [400, 401, 403, 404, 409, 413, 415, 422, 429, 500].map((x) => [x, fail]),
);
const ok = (schema, description = "Resultado real no banco") => ({
  description,
  content: { "application/json": { schema } },
});
const request = (schema) => ({
  required: true,
  content: { "application/json": { schema } },
});
export const spec = {
  openapi: "3.0.3",
  info: {
    title: "Rastro API",
    version: "1.0.0",
    description:
      "Histórico de entrega sintética por eventos, Effect e D1. Tokens isolados com TTL de 24h. Sem integração externa. Horários em Unix seconds UTC. Limite global de 10 streams por hora UTC e 30 revisões por stream. Estado inicial created/revision 1 não é um evento de comando. Banco e eventos reais; use dados sintéticos.",
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: {
      streamToken: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "rst_<64 hex>",
      },
    },
  },
  paths: {
    "/api/health": {
      get: {
        responses: {
          200: ok({
            type: "object",
            properties: {
              status: { type: "string" },
              engine: { type: "string" },
              database: { type: "string" },
            },
          }),
          ...errors,
        },
      },
    },
    "/api/v1/streams": {
      post: {
        summary: "Criar stream sintético isolado",
        requestBody: request({
          type: "object",
          additionalProperties: false,
          required: ["label"],
          properties: {
            label: { type: "string", pattern: "^demo-[a-z0-9-]{1,30}$" },
          },
        }),
        responses: {
          201: ok(
            {
              type: "object",
              properties: {
                id: { type: "string" },
                token: { type: "string" },
                label: { type: "string" },
                state: { type: "string" },
                revision: { type: "integer" },
                expires_at: { type: "integer" },
              },
            },
            "Token aparece uma vez; guarde apenas temporariamente.",
          ),
          ...errors,
        },
      },
    },
    "/api/v1/events": {
      post: {
        summary: "Aplicar comando com idempotência e revisão esperada",
        description:
          "A chave de comando pertence ao stream. Repetição com conteúdo idêntico retorna replayed=true mesmo se a revisão atual mudou. Mesmo ID com conteúdo diferente retorna 409. Apenas um comando por revisão vence.",
        security: [{ streamToken: [] }],
        requestBody: request(ref),
        responses: {
          200: ok({ type: "object", properties: { event } }),
          ...errors,
        },
      },
    },
    "/api/v1/stream": {
      get: {
        summary: "Reler projeção e eventos após um cursor",
        description:
          "Snapshot transacional. integrity compara o replay completo à projeção armazenada. after é um número de sequência exclusivo (0–30); não muda a integridade calculada.",
        security: [{ streamToken: [] }],
        parameters: [
          {
            name: "after",
            in: "query",
            schema: { type: "integer", minimum: 0, maximum: 30, default: 0 },
          },
        ],
        responses: {
          200: ok({
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              state: { type: "string" },
              revision: { type: "integer" },
              created_at: { type: "integer" },
              expires_at: { type: "integer" },
              integrity: { type: "boolean" },
              last_sequence: { type: "integer" },
              events: { type: "array", items: event },
            },
          }),
          ...errors,
        },
      },
      delete: {
        summary: "Revogar e excluir somente o próprio stream sintético",
        security: [{ streamToken: [] }],
        responses: {
          200: ok({
            type: "object",
            properties: { revoked: { type: "boolean" } },
          }),
          ...errors,
        },
      },
    },
  },
};
