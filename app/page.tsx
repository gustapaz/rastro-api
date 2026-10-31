import type { CSSProperties } from "react";
import Playground from "./playground";
import { meta } from "../server/meta.mjs";
export default function Home() {
  return (
    <main style={{ "--accent": meta.accent } as CSSProperties}>
      <header>
        <a className="brand" href="/">
          {meta.title}
          <span>BACK-END LAB</span>
        </a>
        <nav aria-label="Recursos">
          <a href="/docs.html">Swagger ↗</a>
          <a href="/api/openapi.json">OpenAPI ↗</a>
          <a href={"https://github.com/gustapaz/" + meta.repo}>GitHub ↗</a>
        </nav>
      </header>
      <section className="intro">
        <p className="eyebrow">
          {meta.engine.toUpperCase()} / PROCESSAMENTO REAL
        </p>
        <h1>{meta.headline}</h1>
        <p>{meta.description}</p>
        <div className="tags">
          <span>EVENTOS PERSISTIDOS</span>
          <span>EXEMPLOS SINTÉTICOS</span>
          <span>OPENAPI 3</span>
        </div>
      </section>
      <Playground />
      <section className="notes">
        <div>
          <h2>O que o motor faz</h2>
          <p>{meta.behavior}</p>
        </div>
        <div>
          <h2>Escopo e limites</h2>
          <p>{meta.limits}</p>
          <p>
            Serviço público, sem efeitos externos ou armazenamento. Use somente
            dados sintéticos. A disponibilidade depende da hospedagem.
          </p>
          <a href="/api/health">Verificar motor →</a>
        </div>
      </section>
      <footer>
        <span>{meta.title} · Gustavo Paz</span>
        <a
          href={
            "https://github.com/gustapaz/" + meta.repo + "#executar-localmente"
          }
        >
          Código, testes e execução local ↗
        </a>
      </footer>
    </main>
  );
}
