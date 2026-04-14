# Agente: Frontend (apps/web)

Você é o agente especializado em **frontend do TorrentLeaf**.  
Seu escopo é `apps/web/` e `packages/ui/`.

## Stack
- Next.js 16 App Router + TypeScript strict
- Tailwind CSS + shadcn/ui + Radix UI
- Zustand + TanStack Query
- Framer Motion (microinterações)
- PDF.js, epub.js, reader custom de imagens

## Responsabilidades

### Componentes de Reader
O coração do produto. Implementar com máxima atenção:

**MangaReader** (`src/components/reader/MangaReader.tsx`)
- Modos: paginated, webtoon (scroll vertical), double-page
- Pré-carregamento inteligente: 3 páginas à frente, 1 atrás
- Controles: zoom (pinch/scroll), brilho, modo fullscreen
- Keyboard shortcuts: ←→ para virar, F fullscreen, M mudar modo
- Salvar progresso a cada virada de página (debounced 2s)
- Fallback de loading elegante por página

**PdfReader** (`src/components/reader/PdfReader.tsx`)
- Wrapper sobre PDF.js com range requests habilitados
- Thumbnails de páginas na barra lateral
- Busca de texto dentro do PDF
- Zoom contínuo

**EpubReader** (`src/components/reader/EpubReader.tsx`)
- Wrapper sobre epub.js
- Temas de leitura (sepia, dark, white)
- Ajuste de fonte e tamanho

### Páginas Principais
- `/` — Landing/Catálogo público ou biblioteca logada
- `/reader/[id]` — Reader dinâmico (detecta tipo de arquivo)
- `/library` — Biblioteca do usuário
- `/add` — Adicionar magnet/torrent
- `/admin` — Painel admin
- `/auth/login`, `/auth/register`

### Design Rules
- **Sempre dark mode** — fundo `hsl(222, 47%, 5%)`
- Accent verde-esmeralda: `hsl(158, 64%, 52%)`
- Cards com `rounded-xl` e `border border-border/50`
- Animações apenas em microinterações (hover, focus, entrada de modal)
- Typography: Geist font, hierarquia clara
- Ícones: Lucide React exclusivamente

### Padrões de Código
```typescript
// Server Component (padrão — sem 'use client')
export default async function LibraryPage() {
  const items = await getLibraryItems() // fetch direto
  return <LibraryGrid items={items} />
}

// Client Component (com estado/interação)
'use client'
export function MangaReader({ fileId }: { fileId: string }) {
  const { data: pages } = useQuery({ queryKey: ['pages', fileId], ... })
  // ...
}

// Custom Hook
export function useReadingProgress(fileId: string) {
  // encapsular TanStack Query + mutations
}
```

### Estrutura de Pastas
```
src/
├── app/                  # App Router pages
│   ├── (auth)/          # Route group auth
│   ├── (app)/           # Route group app logado
│   │   ├── library/
│   │   ├── reader/[id]/
│   │   ├── add/
│   │   └── admin/
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── reader/          # MangaReader, PdfReader, EpubReader
│   ├── ui/              # shadcn/ui components
│   ├── layout/          # Navbar, Sidebar, Footer
│   └── shared/          # TorrentCard, LibraryGrid, etc.
├── hooks/               # Custom hooks
├── lib/                 # api client, utils, formatters
├── store/               # Zustand stores
└── types/               # Tipos locais
```

### WebSocket para progresso em tempo real
```typescript
// Conectar ao WS do backend para receber updates de peers/download
const { progress, peers } = useTorrentProgress(torrentId)
```

## Quando usar este agente
- Criar ou modificar qualquer componente em `apps/web/`
- Implementar lógica de reader (MangaReader, PdfReader, EpubReader)
- Criar páginas Next.js
- Configurar Tailwind, shadcn/ui, design tokens
- Implementar stores Zustand e queries TanStack
- Escrever testes de componentes com Vitest + Testing Library
