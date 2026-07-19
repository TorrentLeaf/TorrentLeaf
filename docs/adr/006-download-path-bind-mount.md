# ADR 006 — Download path via host bind-mount, subpath-only por usuário

## Status
Aceito — 2026-07-13

## Contexto
O engine recebia um `downloadPath` por usuário, mas o container só montava um
volume nomeado (`torrent_data:/data/torrents`). Não havia como os arquivos
aparecerem no filesystem do host, e o guard de disco sempre media o caminho
fixo do container. O setting "download path" era efetivamente inócuo.

## Decisão
1. O diretório de dados do engine passa a ser um **bind-mount** de uma pasta do
   host, via `TORRENTLEAF_DATA_DIR` (default `./data/torrents`) → `/data/torrents`
   em `docker-compose.dev.yml`.
2. O "download path" por usuário é uma **subpasta relativa** validada dentro
   de `/data/torrents`. Caminhos absolutos e `..` são rejeitados (segurança —
   impede escrever fora da árvore montada / path traversal). A resolução fica em
   `apps/torrent-engine/src/torrent/downloadPath.ts` (`resolveDownloadPath`),
   e a validação server-side do setting fica em `settings.go`.
3. O guard de disco (`statfs`) mede o caminho resolvido, não mais o fixo.

## Consequências
- Torrents aparecem no host em `TORRENTLEAF_DATA_DIR/<subpasta>`.
- **Permissões:** o container roda como root, então os arquivos no host ficam
  `root:root`. Em um host multiusuário, ajuste ownership ou rode o container
  com `user:` mapeado. A pasta do host precisa ser gravável pelo container.
- Não expomos escolha de caminho absoluto na UI — apenas subpastas.
- O antigo volume nomeado `torrent_data` foi removido do compose; conteúdo
  baixado anteriormente nele fica órfão (re-baixado via reseed).
