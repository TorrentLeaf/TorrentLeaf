# Skill: Reader Components

O reader é o **coração diferencial do TorrentLeaf**. Toda decisão aqui afeta
diretamente a experiência de leitura. Leia esta skill completa antes de tocar
em qualquer componente de reader.

> **Idioma da UI do reader: inglês.** Todo texto visível (controles, tooltips
> de zoom/modo, mensagens de "Loading page X", atalhos no help overlay,
> `aria-label` dos botões de navegação) é escrito em inglês. Ver CLAUDE.md §6.1.

---

## MangaReader — Arquitetura completa

```
MangaReader (container, lida com estado global)
├── ReaderTopBar        (título, página atual, controles de modo)
├── PageCanvas          (renderiza a página atual + vizinhas pré-carregadas)
│   ├── PageImage       (img com loading state elegante)
│   └── PagePlaceholder (skeleton enquanto carrega)
├── NavigationOverlay   (áreas clicáveis esquerda/direita + swipe)
├── ReaderBottomBar     (barra de progresso, thumbnail strip opcional)
└── ReaderSettings      (drawer: modo, zoom, brilho — abre com S ou botão)
```

---

## Preload inteligente com IntersectionObserver

**Nunca usar `useEffect` com array de deps para preload** — causa re-renders desnecessários.
Use a estratégia abaixo com `prefetchQuery` do TanStack Query:

```typescript
// hooks/useMangaPreload.ts
export function useMangaPreload(fileId: string, currentPage: number, totalPages: number) {
  const queryClient = useQueryClient()

  // Preload das próximas 3 páginas e da anterior (para navegação rápida)
  const pagesToLoad = useMemo(() => {
    const ahead = [1, 2, 3].map(n => currentPage + n).filter(p => p < totalPages)
    const behind = [currentPage - 1].filter(p => p >= 0)
    return [...ahead, ...behind]
  }, [currentPage, totalPages])

  useEffect(() => {
    pagesToLoad.forEach(page => {
      queryClient.prefetchQuery({
        queryKey: ['page', fileId, page],
        queryFn: () => fetchPage(fileId, page),
        staleTime: 10 * 60 * 1000,  // 10min — página carregada não re-busca
      })
    })
  }, [pagesToLoad, fileId, queryClient])
}
```

---

## Modos de leitura

### Paginated (mangá japonês — direita para esquerda)
```typescript
// Direção de leitura controlável
type ReadingDirection = 'ltr' | 'rtl'  // rtl = padrão para mangá JP

// Navegação:
// RTL: clique direita → página anterior, clique esquerda → próxima
// LTR: clique direita → próxima, clique esquerda → anterior
```

### Webtoon (scroll vertical — manhwa/manhua)
```typescript
// Webtoon: todas as páginas em coluna, scroll contínuo
// Usar IntersectionObserver para detectar página atual:
const observerRef = useRef<IntersectionObserver>()

useEffect(() => {
  observerRef.current = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible) {
        const page = parseInt(visible.target.getAttribute('data-page') || '0')
        setCurrentPage(page)
        // Salvar progresso debounced
        debouncedSaveProgress(fileId, page)
      }
    },
    { threshold: [0.3, 0.5, 0.7] }
  )
  
  document.querySelectorAll('[data-page]').forEach(el => {
    observerRef.current?.observe(el)
  })
  
  return () => observerRef.current?.disconnect()
}, [fileId])
```

### Double Page (desktop — livros, comics ocidentais)
```typescript
// Renderiza duas páginas lado a lado
// Página 0 (capa) sempre sozinha
// Páginas 1-2, 3-4, etc. em pares
function getDoublePage(page: number): [number, number | null] {
  if (page === 0) return [0, null]
  const isEven = page % 2 === 0
  return isEven ? [page - 1, page] : [page, page + 1]
}
```

---

## Imagens de tamanho variável — problema crítico no webtoon

Páginas de manhwa têm alturas muito diferentes (algumas têm 2000px, outras 800px).
**Nunca usar height fixo.** Usar esta estratégia:

```typescript
// components/reader/PageImage.tsx
'use client'
export function PageImage({ src, page, onLoad }: PageImageProps) {
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Aspect ratio preservado, largura 100% do container
  return (
    <div
      className="relative w-full bg-surface-2"
      style={dimensions
        ? { paddingBottom: `${(dimensions.h / dimensions.w) * 100}%` }
        : { minHeight: '60vh' }  // placeholder até carregar dimensões
      }
      data-page={page}
    >
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-surface-3" />
      )}
      <img
        src={src}
        alt={`Página ${page + 1}`}
        className={cn(
          "absolute inset-0 w-full h-full object-contain transition-opacity duration-200",
          loaded ? "opacity-100" : "opacity-0"
        )}
        loading="lazy"
        onLoad={(e) => {
          const img = e.currentTarget
          setDimensions({ w: img.naturalWidth, h: img.naturalHeight })
          setLoaded(true)
          onLoad?.()
        }}
      />
    </div>
  )
}
```

---

## Salvar posição de leitura

**Regra:** salvar a cada virada de página com debounce de 2s.
Nunca salvar em cada scroll — gera flood de requests no modo webtoon.

```typescript
// hooks/useReadingProgress.ts
export function useReadingProgress(fileId: string) {
  const saveProgress = useMutation({
    mutationFn: (page: number) =>
      api.put(`/progress/${fileId}`, { currentPage: page }),
  })

  const debouncedSave = useMemo(
    () => debounce((page: number) => saveProgress.mutate(page), 2000),
    [saveProgress]
  )

  // Salvar também no unload (usuário fecha aba)
  useEffect(() => {
    return () => { debouncedSave.flush() }
  }, [debouncedSave])

  return { saveProgress: debouncedSave }
}
```

---

## Keyboard shortcuts

```typescript
// hooks/useReaderKeyboard.ts
const SHORTCUTS: Record<string, () => void> = {
  ArrowRight: () => goToNext(),
  ArrowLeft:  () => goToPrev(),
  ArrowDown:  () => goToNext(),   // webtoon: scroll para próxima
  ArrowUp:    () => goToPrev(),
  f:          () => toggleFullscreen(),
  F:          () => toggleFullscreen(),
  m:          () => cycleReadingMode(),  // paginated → webtoon → double
  Escape:     () => router.back(),
  ' ':        () => goToNext(),   // space = próxima (padrão comics)
}

useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    // Não interceptar se foco está em input/textarea
    if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
    SHORTCUTS[e.key]?.()
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [])
```

---

## Loading state elegante — nunca spinner genérico

```typescript
// Três estados visuais distintos:

// 1. Metadata ainda sendo buscada (torrent recém adicionado)
<div className="flex flex-col items-center gap-3 text-muted">
  <TorrentProgress infoHash={infoHash} />
  <p className="text-sm">Conectando ao swarm...</p>
</div>

// 2. Arquivo priorizado, aguardando primeiras peças
<div className="grid grid-cols-1 gap-0">
  {Array.from({ length: 3 }).map((_, i) => (
    <div key={i} className="w-full bg-surface-2 animate-pulse"
      style={{ height: `${[60, 80, 55][i]}vh` }} />
  ))}
</div>

// 3. Página individual carregando (dentro do reader)
// → ver PageImage acima com aspect-ratio placeholder
```

---

## PdfReader — integrando PDF.js com Range Requests

```typescript
// components/reader/PdfReader.tsx
'use client'
import * as pdfjsLib from 'pdfjs-dist'

// CRÍTICO: configurar worker e URL base corretamente
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'

export function PdfReader({ fileId }: { fileId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null)

  useEffect(() => {
    // PDF.js com range requests — ele vai buscar só as partes que precisa
    pdfjsLib.getDocument({
      url: `/api/v1/stream/${fileId}`,
      rangeChunkSize: 65536,  // 64KB por chunk
      disableStream: false,   // habilita streaming progressivo
    }).promise.then(setPdf)
  }, [fileId])

  // Renderizar página no canvas
  const renderPage = async (pageNum: number) => {
    if (!pdf || !canvasRef.current) return
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = canvasRef.current
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({
      canvasContext: canvas.getContext('2d')!,
      viewport,
    }).promise
  }

  // ...
}
```

---

## EpubReader — estratégia de download completo

EPUB é um ZIP. Não vale a pena streaming parcial — baixar completo no servidor
e servir ao epub.js via URL é sempre melhor UX:

```typescript
// Para EPUB: a API Go baixa o arquivo completo no engine,
// extrai via endpoint /api/v1/epub/:fileId e serve via URL estável.
// O frontend recebe a URL e passa para epub.js:

const book = ePub(`/api/v1/epub/${fileId}`)
const rendition = book.renderTo(viewerRef.current, {
  width: '100%',
  height: '100%',
  flow: 'paginated',
})
rendition.themes.register('dark', {
  body: { background: 'hsl(222,47%,5%)', color: 'hsl(210,20%,92%)' }
})
rendition.themes.select('dark')
rendition.display()
```

---

## Regras de performance do reader

- **Nunca renderizar mais de 5 imagens simultâneas no DOM** no modo paginated
  (use virtualização ou desmonte as distantes)
- **No modo webtoon**: renderizar com `loading="lazy"` nativo + IntersectionObserver
  para preload das que estão a 2 páginas de distância
- **Imagens sempre com `decoding="async"`** para não bloquear o thread principal
- **Nunca usar `position: absolute` em páginas** no modo webtoon — quebra o scroll natural
- **Cache de ObjectURL**: revogar URLs de blob quando o componente desmontar para evitar memory leak
