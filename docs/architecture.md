# Arquitetura e aprendizado

Effect.gen encadeia leitura idempotente, revisão, transição e gravação. INSERT SELECT condicionado à revisão e índices únicos protegem sequência e comando. Trigger projeta o estado na mesma transação; falha reverte ambos. GET usa snapshot transacional, reprocessa eventos e compara a projeção (integrity). Estado inicial created/revision 1 precede os eventos de comando.

Objetivo: estudar Entregas sintéticas por eventos, com revisão otimista e idempotência.

POST /api/v1/streams; POST /api/v1/events; GET /api/v1/stream?after=0; DELETE /api/v1/stream; GET /api/health; GET /api/openapi.json. Bearer exigido para eventos e stream.

Tokens de 256 bits, somente SHA-256 no banco, TTL de 24h, 30 revisões por stream e 10 criações por hora UTC globalmente. Limpeza física de expirados oportunística. Sem conta ou recuperação de token. Sem transportadora, e-mails ou notificações.
