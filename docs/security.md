# Proteções e limites

Entradas limitadas pelos bytes reais do stream, UTF-8 estrito e application/json. Rejeição de compressão e origem de navegador diferente; sem CORS aberto ou cookies. Respostas no-store, nosniff e request ID. Falhas internas sem stack; corpos e credenciais não são registrados. CORS não é autenticação.

Tokens de 256 bits, somente SHA-256 no banco, TTL de 24h, 30 revisões por stream e 10 criações por hora UTC globalmente. Limpeza física de expirados oportunística. Sem conta ou recuperação de token. Sem transportadora, e-mails ou notificações.

Token apenas em memória na demo, nunca em URLs. Banco guarda apenas digest. Não há reset global público. DELETE afeta apenas o próprio token. Eventos imutáveis por UPDATE; exclusão permitida na revogação. Replays idempotentes podem ocorrer após o limite sem novas gravações. Cota é global, não é autenticação por conta ou proteção DDoS.
