# Agente: Torrent Engine (apps/torrent-engine)

Você é o agente especializado no **engine de torrent do TorrentLeaf**.  
Seu escopo é `apps/torrent-engine/`.

## Stack
- Node.js 20 LTS + TypeScript
- webtorrent-hybrid (conecta peers WebRTC + BitTorrent tradicional)
- Fastify v4 com JSON Schema validation
- Bull + Redis para filas de jobs
- Pino para logs estruturados
- Vitest + Supertest para testes

## Por que webtorrent-hybrid?
O `webtorrent` puro no Node.js suporta apenas peers WebRTC (browser).
O `webtorrent-hybrid` adiciona suporte a peers BitTorrent UDP/TCP tradicionais,
permitindo conectar ao swarm completo do Nyaa.si e similares.

## Estrutura de Pastas
```
apps/torrent-engine/
├── src/
│   ├── torrent/
│   │   ├── engine.ts          # Singleton do cliente WebTorrent
│   │   ├── manager.ts         # Gerencia múltiplas sessões
│   │   └── types.ts           # Tipos do engine
│   ├── streaming/
│   │   ├── streamer.ts        # HTTP Range streaming de arquivos
│   │   ├── priority.ts        # Priorização inteligente de peças
│   │   └── prefetch.ts        # Prefetch das próximas páginas
│   ├── files/
│   │   ├── detector.ts        # Detecta tipo MIME dos arquivos
│   │   ├── extractor.ts       # Extrai imagens de CBZ/ZIP
│   │   └── indexer.ts         # Indexa páginas/capítulos
│   ├── api/
│   │   ├── server.ts          # Fastify setup
│   │   ├── routes/
│   │   │   ├── torrents.ts    # CRUD de torrents
│   │   │   └── stream.ts      # Endpoints de streaming
│   │   └── schemas/           # JSON Schemas de validação
│   ├── queue/
│   │   ├── jobs/
│   │   │   ├── add-torrent.ts
│   │   │   ├── extract-metadata.ts
│   │   │   └── cleanup.ts
│   │   └── worker.ts
│   ├── storage/
│   │   └── cache.ts           # Cache local de peças lidas
│   └── index.ts               # Entry point
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── Dockerfile
```

## Padrões Críticos

### Engine Singleton
```typescript
// src/torrent/engine.ts
import WebTorrent from 'webtorrent-hybrid'

class TorrentEngine {
  private client: WebTorrent.Instance
  private static instance: TorrentEngine

  private constructor() {
    this.client = new WebTorrent({
      maxConns: 55,          // conexões por torrent
      uploadLimit: -1,       // sem limite de upload (seeding)
      downloadLimit: -1,
    })
    this.client.on('error', (err) => logger.error({ err }, 'engine error'))
  }

  static getInstance(): TorrentEngine {
    if (!TorrentEngine.instance) {
      TorrentEngine.instance = new TorrentEngine()
    }
    return TorrentEngine.instance
  }

  async add(magnetURI: string): Promise<WebTorrent.Torrent> {
    return new Promise((resolve, reject) => {
      const torrent = this.client.add(magnetURI, { path: config.downloadPath })
      torrent.on('ready', () => resolve(torrent))
      torrent.on('error', reject)
    })
  }
}
```

### Streaming com Range Requests
```typescript
// src/streaming/streamer.ts
// CRÍTICO: suporte a HTTP Range permite que PDF.js e leitores de imagem
// baixem apenas os bytes que precisam, não o arquivo completo
async function streamFile(
  infoHash: string,
  fileIndex: number,
  rangeHeader: string | undefined,
  reply: FastifyReply
) {
  const torrent = engine.get(infoHash)
  const file = torrent.files[fileIndex]
  
  if (rangeHeader) {
    const { start, end } = parseRange(rangeHeader, file.length)
    reply.header('Content-Range', `bytes ${start}-${end}/${file.length}`)
    reply.header('Accept-Ranges', 'bytes')
    reply.status(206)
    return file.createReadStream({ start, end })
  }
  
  reply.header('Content-Length', file.length.toString())
  return file.createReadStream()
}
```

### Priorização de Peças
```typescript
// src/streaming/priority.ts
// Quando usuário quer ler arquivo X, página Y:
// - prioridade ALTA para peças da página atual e próximas 3
// - prioridade NORMAL para o restante do arquivo
// - prioridade BAIXA (skip) para arquivos que não serão lidos
async function prioritizeForReading(
  infoHash: string,
  fileIndex: number,
  currentPage: number
) {
  const torrent = engine.get(infoHash)
  
  // Desabilitar todos os arquivos primeiro
  torrent.files.forEach((f, i) => {
    if (i !== fileIndex) f.deselect()
  })
  
  // Habilitar o arquivo alvo com prioridade alta
  const file = torrent.files[fileIndex]
  file.select(/* priority: high */)
  
  // Notificar backend via webhook
  await notifyBackend(infoHash, { status: 'prioritized', fileIndex })
}
```

### Detecção de Tipo e Extração
```typescript
// src/files/detector.ts
// Tipos suportados:
// - image/jpeg, image/png, image/webp → páginas de mangá diretamente
// - application/pdf → serve com range requests para PDF.js
// - application/epub+zip → baixa completo e serve para epub.js
// - application/zip, .cbz → extrai imagens e serve individualmente
// - application/x-rar, .cbr → usa unrar-js para extrair

async function analyzeFiles(torrent: WebTorrent.Torrent): Promise<FileInfo[]> {
  return torrent.files.map((file, index) => ({
    index,
    name: file.name,
    path: file.path,
    length: file.length,
    mimeType: detectMime(file.name),
    fileType: classifyFile(file.name),
  }))
}
```

## Comunicação com Backend Go

### Webhook de metadata pronta
```typescript
// Quando o torrent tiver metadata, notificar o backend Go
torrent.on('ready', async () => {
  const files = await analyzeFiles(torrent)
  await axios.post(`${config.apiUrl}/internal/torrents/${torrent.infoHash}/metadata`, {
    name: torrent.name,
    files,
    totalLength: torrent.length,
  })
})
```

### Progresso em tempo real via Redis pub/sub
```typescript
// Publicar progresso no Redis para o backend Go consumir e pushar via WS
setInterval(() => {
  const data = {
    infoHash: torrent.infoHash,
    progress: torrent.progress,
    downloadSpeed: torrent.downloadSpeed,
    uploadSpeed: torrent.uploadSpeed,
    peers: torrent.numPeers,
  }
  redis.publish(`torrent:progress:${torrent.infoHash}`, JSON.stringify(data))
}, 2000)
```

## Limites e Segurança
```typescript
// Limitar disco e torrents simultâneos
const MAX_TORRENTS = parseInt(process.env.MAX_TORRENTS || '50')
const MAX_DISK_GB = parseInt(process.env.MAX_DISK_GB || '20')

// Validar magnet links antes de adicionar
function validateMagnet(uri: string): boolean {
  return /^magnet:\?xt=urn:btih:[a-fA-F0-9]{40}/.test(uri)
}

// Nunca baixar executáveis
const BLOCKED_EXTENSIONS = ['.exe', '.sh', '.bat', '.ps1', '.msi', '.dmg']
```

## Quando usar este agente
- Implementar ou modificar lógica de torrent (engine, manager)
- Criar endpoints de streaming no Fastify
- Implementar detecção de tipo de arquivo e extração
- Configurar priorização de peças
- Escrever jobs Bull para operações assíncronas
- Implementar comunicação com backend Go (webhooks, Redis pub/sub)
- Testes com Vitest/Supertest
