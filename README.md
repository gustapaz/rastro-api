# Rastro API

Entregas sintéticas por eventos, com revisão otimista e idempotência.

**Stack:** Effect 3 + SQLite/D1 + event sourcing. Backend real. Vinext/React fornecem transporte e laboratório técnico, sem substituir as regras do servidor.

- [Demo](https://rastro-api-gustapaz.starrylinen.chatgpt.site)
- [Documentação](https://rastro-api-gustapaz.starrylinen.chatgpt.site/docs.html)
- [Arquitetura](docs/architecture.md) · [Segurança](docs/security.md)

## Executar localmente

Node.js 24 e npm; nenhuma conta, cartão ou segredo para execução local.

```sh
npm ci
npm test
npm run build
npm run db:migrate
npm start -- --port 5233
```

Em outro terminal:

```sh
npm run smoke -- http://127.0.0.1:5233
```

O smoke usa apenas dados sintéticos. Cria e revoga apenas seu próprio stream. Veja examples/request.json para a entrada inicial.

## Contrato e arquitetura

POST /api/v1/streams; POST /api/v1/events; GET /api/v1/stream?after=0; DELETE /api/v1/stream; GET /api/health; GET /api/openapi.json. Bearer exigido para eventos e stream.

Effect.gen encadeia leitura idempotente, revisão, transição e gravação. INSERT SELECT condicionado à revisão e índices únicos protegem sequência e comando. Trigger projeta o estado na mesma transação; falha reverte ambos. GET usa snapshot transacional, reprocessa eventos e compara a projeção (integrity). Estado inicial created/revision 1 precede os eventos de comando.

## Testes e CI

16 testes contra D1/SQLite real: isolamento, autorização, idempotência, concorrência, rollback injetado, TTL, cotas, cursor e persistência após reabrir runtime. A CI executa instalação limpa, testes, tipos, formatação e build. Use também npm run check e npm run typecheck.

## Hospedagem e limites

Tokens de 256 bits, somente SHA-256 no banco, TTL de 24h, 30 revisões por stream e 10 criações por hora UTC globalmente. Limpeza física de expirados oportunística. Sem conta ou recuperação de token. Sem transportadora, e-mails ou notificações. JSON até 32 KiB.

Persistência real D1 independente da memória do Worker. Migrações versionadas são aplicadas antes do deploy. DELETE revoga e exclui somente o stream autenticado e seus eventos.

Demo gratuita no Sites/Cloudflare Workers, sem cartão, trial ou faturamento ativado. A disponibilidade e as cotas dependem da hospedagem; não há SLA nem promessa de gratuidade permanente.

Dados da demonstração são sintéticos. Regras internas são reais. Não há efeitos externos mockados apresentados como processamento real.

## Licença

MIT — Gustavo Paz. Arquivos e dependências de terceiros preservam suas próprias licenças e avisos.
