# Skill: Torrent Streaming

Padrões específicos do TorrentLeaf para trabalhar com streaming de torrents.

## HTTP Range Requests — Obrigatório para readers

Todo endpoint que serve arquivo de torrent DEVE suportar Range Requests:

```go
// Go: handler de stream com range
func (h *ReaderHandler) StreamPage(c *fiber.Ctx) error {
    fileID := c.Params("fileId")
    rangeHeader := c.Get("Range")
    
    // Proxy para o engine com o Range header intacto
    engineURL := fmt.Sprintf("%s/engine/stream/%s/%s", 
        h.engineURL, infoHash, fileIndex)
    
    req, _ := http.NewRequestWithContext(c.Context(), "GET", engineURL, nil)
    if rangeHeader != "" {
        req.Header.Set("Range", rangeHeader)
    }
    
    resp, err := h.httpClient.Do(req)
    // ... proxy response headers e body
    c.Status(resp.StatusCode)
    c.Set("Accept-Ranges", "bytes")
    c.Set("Content-Type", resp.Header.Get("Content-Type"))
    return c.SendStream(resp.Body)
}
```

```typescript
// TypeScript engine: resposta com Range
import { FastifyRequest, FastifyReply } from 'fastify'

async function handleStream(req: FastifyRequest, reply: FastifyReply) {
  const { infoHash, fileIndex } = req.params as any
  const rangeHeader = req.headers.range
  
  const torrent = engine.get(infoHash)
  if (!torrent) return reply.status(404).send({ error: 'Torrent not found' })
  
  const file = torrent.files[parseInt(fileIndex)]
  const fileLength = file.length
  
  if (rangeHeader) {
    const [, rangeStr] = rangeHeader.split('=')
    const [startStr, endStr] = rangeStr.split('-')
    const start = parseInt(startStr)
    const end = endStr ? parseInt(endStr) : fileLength - 1
    const chunkSize = end - start + 1
    
    reply.headers({
      'Content-Range': `bytes ${start}-${end}/${fileLength}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize.toString(),
      'Content-Type': getMimeType(file.name),
    })
    reply.status(206)
    return reply.send(file.createReadStream({ start, end }))
  }
  
  reply.headers({
    'Content-Length': fileLength.toString(),
    'Accept-Ranges': 'bytes',
    'Content-Type': getMimeType(file.name),
  })
  return reply.send(file.createReadStream())
}
```

## Prefetch Inteligente — Frontend

```typescript
// hooks/useMangaReader.ts
export function useMangaReader(fileId: string, totalPages: number) {
  const [currentPage, setCurrentPage] = useState(0)
  const queryClient = useQueryClient()
  
  // Pré-carregar próximas 3 páginas
  useEffect(() => {
    const pagesToPreload = [1, 2, 3].map(offset => currentPage + offset)
      .filter(p => p < totalPages)
    
    pagesToPreload.forEach(page => {
      queryClient.prefetchQuery({
        queryKey: ['page', fileId, page],
        queryFn: () => fetchPage(fileId, page),
        staleTime: 5 * 60 * 1000,
      })
    })
  }, [currentPage, fileId, totalPages])
  
  return { currentPage, setCurrentPage }
}
```

## Detecção de Tipo de Arquivo

```typescript
// Hierarquia de tipos suportados
const FILE_TYPES = {
  // Mangá: imagens ou containers de imagens
  DIRECT_IMAGES: ['.jpg', '.jpeg', '.png', '.webp', '.avif'],
  CBZ: ['.cbz'],       // ZIP com imagens → extrair no servidor
  CBR: ['.cbr'],       // RAR com imagens → extrair no servidor
  // Documentos
  PDF: ['.pdf'],       // Range requests direto
  EPUB: ['.epub'],     // Baixar completo e servir
  // Outros
  ZIP: ['.zip'],       // Tentar tratar como CBZ
}

function classifyTorrentFile(filename: string): FileType {
  const ext = path.extname(filename).toLowerCase()
  if (FILE_TYPES.DIRECT_IMAGES.includes(ext)) return 'image'
  if (FILE_TYPES.CBZ.includes(ext)) return 'cbz'
  if (FILE_TYPES.CBR.includes(ext)) return 'cbr'
  if (FILE_TYPES.PDF.includes(ext)) return 'pdf'
  if (FILE_TYPES.EPUB.includes(ext)) return 'epub'
  return 'unknown'
}
```

## Redis Pub/Sub para Progresso

```go
// Backend Go: subscribe no canal e pushar para WebSocket
func (h *WSHandler) StreamTorrentProgress(c *websocket.Conn) {
    torrentID := c.Params("id")
    
    pubsub := h.redis.Subscribe(c.Context(), 
        fmt.Sprintf("torrent:progress:%s", torrentID))
    defer pubsub.Close()
    
    for msg := range pubsub.Channel() {
        if err := c.WriteMessage(1, []byte(msg.Payload)); err != nil {
            return
        }
    }
}
```

## Priorização de Peças — Estratégia

Quando o usuário abre um arquivo para leitura:
1. `file.deselect()` em todos os outros arquivos do torrent
2. `file.select()` com prioridade alta no arquivo escolhido
3. Calcular peças correspondentes às primeiras N páginas
4. Usar `torrent._selections` para forçar download dessas peças primeiro
5. À medida que o usuário avança, ajustar o `select` dinamicamente
