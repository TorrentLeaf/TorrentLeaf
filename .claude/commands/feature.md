# /feature — Implementar nova feature

Use este comando para implementar uma feature completa no TorrentLeaf.

## Prompt
Implemente a feature: $ARGUMENTS

Siga este processo:
1. Identifique qual(is) serviço(s) serão modificados (web, api, torrent-engine)
2. Leia o agente correspondente em `.claude/agents/`
3. Planeje as mudanças: tipos, schema, migrations, handlers, frontend
4. Implemente na ordem: types → migration → repository → service → handler → frontend
5. Escreva testes para a lógica de negócio nova
6. Atualize a documentação em `docs/api.md` se criar novos endpoints
7. Garanta que `make lint && make test` passam
