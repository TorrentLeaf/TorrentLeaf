# ADR 004 — Leitura de CBZ sem download completo

**Status:** Aceito
**Data:** 2026-04
**Autores:** TorrentLeaf Core

---

## Contexto

Torrents de mangá frequentemente vêm como arquivos `.cbz` (ZIP com imagens).
Queremos que o usuário leia o capítulo conforme as páginas chegam, sem
esperar o download completo e sem carregar o CBZ inteiro em memória do
navegador. O CBZ típico tem 5–20 MB e 15–40 imagens.

Opções consideradas:

1. **Baixar o CBZ completo, expor via `<a href>` direto.** Não usa streaming;
   força espera até 100%.
2. **Servir o CBZ inteiro como arquivo único; cliente extrai no browser
   (jszip).** Joga 5–20 MB para cada capítulo no cliente. Throw-away de CPU
   repetido e cache pobre entre abas.
3. **Extrair no engine sob demanda, expor cada entrada como endpoint HTTP.**
   ← Escolhida.

---

## Decisão

No engine Node.js, abrir cada CBZ via **`yauzl.fromRandomAccessReader`**
sobre um wrapper que chama `WTFile.createReadStream({start, end})` do
WebTorrent. O ZIP central directory fica nos últimos ~65 KB do arquivo,
então para listar as entradas basta pedir esses bytes ao swarm. Para ler
uma entrada específica, yauzl pede o range correspondente aos bytes
comprimidos (método "store" em CBZs reais = range plano, sem deflate).

Novas rotas internas no engine:

- `GET /engine/archive/:infoHash/:fileIndex/entries` — lista imagens
- `GET /engine/archive/:infoHash/:fileIndex/entry/:entryIndex` — bytes da entrada

Na API Go, `ReaderService.ListPages` desdobra cada CBZ em N `Page`s
carregando `entryIndex`. O handler `StreamPage` faz proxy para a rota
archive do engine. A UI (`MangaReader`) trata cada entrada como uma
`Page` comum via `pageStreamURL(fileId, entryIndex)`.

---

## Razões

**Range fetch só do necessário.** O webtorrent prioriza as peças que
contêm o EOCD + a entrada pedida. Um CBZ de 7 MB com 15 páginas abre
em <1s se o EOCD (~2 KB) chegou; a primeira página só precisa do range
dela (~400 KB) antes de aparecer.

**Sem duplicação no cliente.** O browser recebe PNG/JPEG pronto, não
precisa embutir jszip, não duplica o CBZ em memória para cada aba.

**Reutiliza a pipeline de progresso existente.** `entryIndex` vira só
mais um segmento de URL no stream; a UI não precisa de reader separado
para CBZ — o `MangaReader` já serve para imagens soltas e CBZ.

**Buffer em vez de stream direto.** Testes em produção mostraram race
entre yauzl abrir o read-stream e Fastify começar a pipear para a
resposta — resultava em `Content-Length` correto mas body zero bytes.
A solução foi drenar a entrada inteira para um `Buffer` antes de
responder. Páginas de comic são single-digit MB, não há pressão de
memória.

**Timeout de 15 s.** Se o swarm ainda não entregou os pedaços do
central directory ou da entrada, retornamos HTTP 503 com corpo JSON
`{"error":"archive not ready, retry"}`. A API mapeia para
`domain.ErrUnavailable` → 503, e a UI faz retry exponencial com
`TanStack Query`.

---

## Consequências

- Cada CBZ novo precisa de um round-trip ao engine para listar entradas —
  aceitável porque é cacheado pela própria API durante a sessão de leitura.
- Não há suporte a Range HTTP na rota `/engine/archive/.../entry/N` (o
  body vai inteiro). Não prejudica imagens (o `<img>` do browser pede
  byte-zero até fim) mas impede progressão por chunks. Se um dia um comic
  tiver páginas >10 MB fará sentido adicionar.
- CBZ compactado com método "deflate" (raro — imagens já são comprimidas)
  funciona, mas o tempo de extração sobe. Se virar problema, vale rejeitar
  na detecção ou usar worker threads.
- Tests unitários no engine cobrem `listCbzEntries` e `openCbzEntry` com
  fixtures construídas via `yazl` em memória (`archive.test.ts`).

---

## Revisão

Revisar se:
- Aparecer caso comum de CBZ com método deflate que trave leitura.
- Virar gargalo de memória no engine com muitos usuários lendo paralelo
  — aí vale avaliar voltar para streaming verdadeiro (com pool de
  connections dedicado ou custom chunk store).
- Implementarmos CBR (RAR) — fluxo será diferente (sem random-access
  confiável no RAR, provavelmente precisa download completo).
