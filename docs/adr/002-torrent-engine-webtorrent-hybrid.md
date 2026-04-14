# ADR 002 — Engine de torrent: webtorrent-hybrid, não libtorrent puro

**Status:** Aceito  
**Data:** 2025-04  
**Autores:** TorrentLeaf Core

---

## Contexto

O TorrentLeaf precisa de um cliente BitTorrent no servidor que:
- Conecte com peers tradicionais UDP/TCP (swarm do Nyaa.si, por exemplo)
- Suporte streaming progressivo — ler peças na ordem de chegada
- Permita priorizar arquivos/peças específicas
- Seja possível hospedar como container Node.js sem dependências nativas complexas
- Opcionalmente permita conectar peers de browser via WebRTC no futuro

As alternativas avaliadas foram:
1. `webtorrent` puro (Node.js, apenas WebRTC)
2. `webtorrent-hybrid` (Node.js, WebRTC + BitTorrent TCP/UDP)
3. `anacrolix/torrent` (Go, BitTorrent puro)
4. `libtorrent` via binding C++ (Python/Node)
5. `qBittorrent-nox` + API RPC

---

## Decisão

**webtorrent-hybrid como engine principal, com possibilidade de migrar para qBittorrent-nox se o volume exigir.**

---

## Razões

**webtorrent puro está fora:** Usa apenas WebRTC para peers. A esmagadora maioria
do swarm do Nyaa.si e trackers públicos usa BitTorrent UDP/TCP tradicional.
Um engine WebRTC-only teria conectividade mínima com esses peers e tornaria
o TorrentLeaf inutilizável para o caso de uso principal.

**webtorrent-hybrid resolve o problema central:** É o mesmo webtorrent mas com
suporte a peers TCP/UDP via `bittorrent-protocol` + `ut_pex` + `dht`. Conecta
com o swarm completo e ainda mantém suporte a peers WebRTC para futura
funcionalidade de seeding cooperativo entre usuários do browser.

**Por que não anacrolix/torrent (Go):** É uma biblioteca sólida, mas:
- Menos documentação e exemplos de streaming progressivo
- Menos madura em borda cases de compatibilidade com trackers
- Exigiria implementar do zero a interface de streaming que webtorrent já entrega
- Seria mais código para manter no backend Go que já tem outras responsabilidades

**Por que não libtorrent via binding:** Dependências nativas C++ tornam o build
e o deploy em containers Alpine muito mais complexos. O Dockerfile ficaria frágil
e o CI/CD mais lento. A vantagem de performance não justifica esse custo operacional
no estágio atual.

**Por que não qBittorrent-nox:** É a opção de fallback se o volume crescer.
qBittorrent tem uma API Web bem documentada, suporte maduro a libtorrent
internamente e é facilmente containerizável. A desvantagem é que você perde
controle programático fino sobre peças individuais — você gerencia downloads,
não streams. Para MVP onde controle de streaming é central, webtorrent-hybrid
é mais adequado.

---

## Consequências

- O torrent engine é um serviço Node.js separado, não código Go inline.
- Comunicação entre Go (backend) e Node (engine) via HTTP interno + Redis pub/sub.
- webtorrent-hybrid tem dependências nativas (`utp` para UDP). O Dockerfile
  precisa de `python3 make g++` no build stage.
- Se o número de torrents simultâneos crescer muito (>200 ativos), avaliar
  migração para qBittorrent-nox com API RPC.

---

## Revisão

Reavaliar em produção quando ultrapassar 100 torrents ativos simultâneos.
Medir: uso de memória por torrent, tempo até primeira peça, taxa de conexão
com peers. Se webtorrent-hybrid mostrar degradação, migrar engine para
qBittorrent-nox mantendo a mesma interface HTTP interna.
