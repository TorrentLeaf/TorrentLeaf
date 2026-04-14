# ADR 001 — Backend principal em Go, não Python ou Node.js

**Status:** Aceito  
**Data:** 2025-04  
**Autores:** TorrentLeaf Core

---

## Contexto

O TorrentLeaf precisa de um backend que:
- Sirva arquivos via HTTP Range Requests com alta concorrência
- Faça proxy de streams do torrent engine para o frontend
- Mantenha múltiplas conexões WebSocket abertas (progresso em tempo real)
- Consuma pouca memória em estado ocioso (self-hosted em VPS barato)
- Seja fácil de manter por um time pequeno

As opções consideradas foram Python (FastAPI/Django), Node.js (Fastify/NestJS) e Go (Fiber/Gin).

---

## Decisão

**Go com Fiber v2.**

---

## Razões

**Concorrência sem overhead:** Go foi desenhado para este padrão — muitas goroutines
leves para conexões simultâneas, sem event loop de single-thread (Node) e sem GIL
nem async/await explícito (Python). Para um servidor de streaming com WebSockets,
isso se traduz em código mais simples e comportamento mais previsível sob carga.

**Consumo de memória:** Um binário Go em idle fica em ~15-20MB de RAM. Um processo
Node.js equivalente começa em ~60-80MB. Importante para deploy em VPS de ~4GB
onde rodam 7 containers simultaneamente.

**Binário único sem runtime:** O build gera um binário estático que roda no container
`distroless/static`. Não há interpretador, não há dependências de sistema. O
Dockerfile de produção fica com ~8MB de imagem final.

**Tipagem estrita em compile time:** Diferente de TypeScript (que transpila e pode
ter erros em runtime), Go falha no build se os tipos não batem. Para um backend
de produção self-hostado, isso reduz surpresas em deploy.

**Por que não Node.js no backend principal:** Node já é usado no torrent-engine
porque o ecossistema webtorrent-hybrid é Node-nativo. Usar Node também no backend
principal criaria dois processos Node sem vantagem real — e Go faz melhor o que
o backend principal precisa fazer (streaming, concorrência, performance previsível).

**Por que não Python:** FastAPI é excelente para APIs de dados e ML, mas para
streaming de bytes e concorrência pura Go é mais adequado. Python seria a escolha
certa se houvesse necessidade de processamento com numpy/scikit dentro do backend,
o que não é o caso aqui.

---

## Consequências

- O time precisa saber Go. Curva de aprendizado inicial se vier de Python/Node.
- sqlc em vez de ORM: queries em SQL puro, mais verboso mas mais explícito e performático.
- Geração de mocks com mockery para testes — passo extra no setup.
- Ganho: deploy simples, performance previsível, binário pequeno.

---

## Revisão

Revisar se o volume de lógica de ML/embeddings crescer ao ponto de justificar um
microserviço Python separado para geração de vetores. Nesse caso, Go continua como
backend principal e Python entra como serviço especializado de embedding.
