# ADR 005 — Reader EPUB e progresso via CFI

**Status:** Aceito
**Data:** 2026-04
**Autores:** TorrentLeaf Core

---

## Contexto

EPUBs são ZIPs com HTML/CSS/imagens internas + um spine ordenado de
seções. Diferente de imagens soltas e CBZ, não há uma "página N" estável:
a posição dentro de um EPUB é descrita por **CFI** (Canonical Fragment
Identifier), uma string tipo
`epubcfi(/6/12[chap02ref]!/4[body01]/10/2/1:3)`. Para salvar onde o
usuário parou, precisamos persistir essa string — inteiros de
`current_page` não servem.

---

## Decisão

**Frontend:** reader dedicado `EpubReader.tsx` usando a lib
[`epubjs`](https://github.com/futurepress/epub.js) carregada no browser.
O livro inteiro é baixado via `/api/v1/stream/:fileId?token=…` (epubjs
usa `fetch`, aceita `?token=`). A lib faz parse local com jszip e
renderiza seções via iframe.

**Backend:** migration `002_progress_location` adiciona coluna
`location TEXT NULL` em `reading_progress`. O `progress_service`
aceita `Location` no `UpdateProgress` struct; o repositório usa
`COALESCE(EXCLUDED.location, reading_progress.location)` no upsert
para não apagar o CFI quando um reader não-EPUB atualiza
`current_page`.

**Rota:** `/read/epub/:sessionId?fileId=…`. Decidida no detail page
da torrent-session por `file.fileType === 'epub'`.

---

## Razões

**epubjs é o padrão de facto no JS.** Mantida ativamente, suporta CFI
nativamente, renderiza por iframe (sandbox de CSS hostil do livro).
Alternativas (`foliate-js`, manual) ou exigem peer deps pesadas ou
são imaturas.

**EPUB inteiro no cliente é aceitável.** Livros raramente passam de
5 MB e o Range request via `/stream/:fileId` garante que só os
pedaços baixados do torrent são enviados. O reader só inicia quando
o `.epub` completo chega — não é streaming fino, mas é aceitável para
a UX de leitura de livro (você não lê aos pulos como em mangá).

**CFI em coluna opcional.** `current_page` segue existindo (zero para
EPUB) e `location` fica nulo para image/CBZ/PDF. `COALESCE` evita que
updates cruzados entre readers apaguem estado um do outro — cenário
possível se o usuário abrir o mesmo livro em duas abas com readers
diferentes.

**Sem endpoint API novo.** Toda a inteligência de spine/CFI mora no
epubjs. O backend só serve bytes e armazena strings. Simplificação
importante: não recriamos parser de EPUB server-side.

---

## Consequências

- Livros gigantes (>50 MB) vão demorar pra abrir. Raro o suficiente
  para ignorar agora.
- `reading_progress.total_pages` fica zero para EPUB — tela
  biblioteca e componentes de progresso precisam tratar esse caso
  (mostrar "last read" em vez de barra numérica). Atualmente mostram
  barra só se `totalPages > 0`, então já está defensivo.
- Se virar necessidade ter "capítulo atual" como número visível na
  biblioteca, dá pra derivar do CFI mas exige parsing — fora de escopo.
- `allowScriptedContent: false` na rendition — livros com JS embutido
  perdem interatividade. Decisão consciente de segurança (XSS via
  EPUB hostil).

---

## Revisão

Revisar se:
- Aparecer demanda forte por leitura de livros >50 MB (RPG handbooks,
  artbooks). Aí vale avaliar reader server-side que fatiava por seção.
- Quisermos sync cross-device — o CFI já é estável por livro, basta
  garantir que o mesmo infohash vira mesma chave de progresso.
