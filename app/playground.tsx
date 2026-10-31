"use client";
import { useState } from "react";
type Reply = {
  token?: string;
  event?: { replayed?: boolean };
  integrity?: boolean;
};
export default function Playground() {
  const [token, setToken] = useState(""),
    [status, setStatus] = useState("Pronto para criar um histórico sintético."),
    [busy, setBusy] = useState(false),
    [logs, setLogs] = useState<unknown[]>([]);
  async function request(
    path: string,
    method: string,
    t: string,
    body?: unknown,
  ) {
    const r = await fetch(path, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(t ? { authorization: "Bearer " + t } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = (await r.json()) as Reply;
    const safe = { ...data };
    if (safe.token) safe.token = "[omitido: apenas na memória da aba]";
    setLogs((old) => [
      ...old,
      { method, path, status: r.status, response: safe },
    ]);
    return { status: r.status, data };
  }
  async function run() {
    setBusy(true);
    setLogs([]);
    try {
      const created = await request("/api/v1/streams", "POST", "", {
        label: "demo-entrega",
      });
      if (created.status !== 201)
        throw new Error(
          "Não foi possível criar stream. Confira a resposta e a cota da demo.",
        );
      const t = created.data.token;
      if (typeof t !== "string") throw new Error("Token ausente na resposta.");
      setToken(t);
      const c = {
        expected_revision: 1,
        command_id: crypto.randomUUID(),
        type: "DISPATCH",
      };
      const a = await request("/api/v1/events", "POST", t, c);
      const replay = await request("/api/v1/events", "POST", t, c);
      const stale = await request("/api/v1/events", "POST", t, {
        ...c,
        command_id: crypto.randomUUID(),
        type: "CANCEL",
      });
      const history = await request("/api/v1/stream", "GET", t);
      if (
        a.status !== 200 ||
        !replay.data.event?.replayed ||
        stale.status !== 409 ||
        !history.data.integrity
      )
        throw new Error("O roteiro não confirmou todas as invariantes.");
      setStatus(
        "Roteiro concluído: evento persistido, repetição idempotente e conflito de revisão recusado.",
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Falha na API.");
    } finally {
      setBusy(false);
    }
  }
  async function read() {
    setBusy(true);
    try {
      const r = await request("/api/v1/stream", "GET", token);
      setStatus(
        r.status === 200
          ? "Histórico relido do banco; integridade: " + r.data.integrity
          : "Token expirado ou indisponível.",
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Falha ao reler histórico.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="lab" aria-labelledby="lab-title">
      <div className="entry">
        <h2 id="lab-title">Uma história, três garantias.</h2>
        <ol>
          <li>Criar stream isolado</li>
          <li>Despachar entrega sintética</li>
          <li>Repetir comando sem duplicação</li>
          <li>Recusar comando com revisão antiga</li>
          <li>Reprocessar eventos e conferir estado</li>
        </ol>
        <div className="actions">
          <button className="primary" disabled={busy || !!token} onClick={run}>
            {busy ? "Processando…" : "Executar roteiro →"}
          </button>
          <button disabled={busy || !token} onClick={read}>
            Reler histórico
          </button>
        </div>
        <p className="small">
          Token apenas na memória desta aba e oculto nas respostas. Recarregar
          perde acesso. Stream expira em 24 horas; exclusão física é
          oportunística. Use somente dados sintéticos.
        </p>
      </div>
      <div className="response">
        <span className="eyebrow">EVENTOS REAIS / BANCO D1</span>
        <p role="status" aria-live="polite">
          {status}
        </p>
        <pre aria-label="Respostas da API">
          {logs.length
            ? JSON.stringify(logs, null, 2)
            : "As respostas aparecem aqui."}
        </pre>
      </div>
    </section>
  );
}
