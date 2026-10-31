export const meta = {
  repo: "rastro-api",
  title: "Rastro API",
  engine: "effect-event-sourcing",
  accent: "#884a3c",
  headline: "O estado é o resultado da história.",
  description:
    "Uma entrega sintética percorre uma máquina de estados. Cada comando aceito gera um evento persistido; a projeção é atualizada na mesma transação.",
  behavior:
    "Comandos exigem revisão esperada e chave de idempotência. O mesmo comando pode ser repetido sem gerar outro evento; conteúdo diferente com a mesma chave é recusado. O histórico é reprocessado para conferir a projeção atual.",
  limits:
    "Streams isolados por token de 256 bits, com expiração de 24 horas, até 30 revisões e 10 criações por hora UTC globalmente. Sem transportadora, rastreamento real, notificações ou dados pessoais.",
};
