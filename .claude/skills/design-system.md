# Skill: Design System TorrentLeaf

## ⚠️ Idioma dos componentes: inglês

Qualquer texto visível em componente deste design system (labels, placeholders,
`aria-label`, tooltips, mensagens de estado vazio/erro) é escrito em **inglês**.
Não existe componente com copy em português no `apps/web`. Essa regra vale para
botões, cards, formulários, reader UI, skeletons — tudo.

Ao criar variantes de componentes em Storybook/docs, os exemplos também usam
texto em inglês. Ver CLAUDE.md §6.1 para a regra completa.

## Tokens de Design

```css
/* globals.css — sempre dark mode */
:root {
  --background: 222 47% 5%;
  --surface: 222 35% 9%;
  --surface-2: 222 30% 13%;
  --surface-3: 222 28% 17%;
  --border: 222 25% 18%;
  --border-strong: 222 20% 25%;
  
  --accent: 158 64% 52%;         /* verde esmeralda principal */
  --accent-hover: 158 64% 45%;
  --accent-muted: 158 64% 20%;   /* para backgrounds de badge */
  --accent-foreground: 222 47% 5%; /* texto sobre accent */
  
  --foreground: 210 20% 92%;
  --foreground-muted: 210 15% 60%;
  --foreground-subtle: 210 10% 40%;
  
  --destructive: 0 72% 51%;
  --warning: 38 92% 50%;
  --success: 142 71% 45%;
  --info: 217 91% 60%;
  
  --radius: 0.75rem;
  --radius-sm: 0.5rem;
  --radius-xs: 0.375rem;
}
```

## Componentes UI Principais

### TorrentCard
```tsx
// Cartão de torrent na biblioteca/catálogo
<TorrentCard
  title="One Piece"
  coverUrl="/covers/op.jpg"
  progress={0.42}         // 42% baixado
  status="downloading"
  peers={23}
  type="manga"
  onRead={() => router.push(`/reader/${id}`)}
/>
```
Aparência: imagem de capa, badge de status colorido, barra de progresso fina na base, overlay sutil no hover com botão "Ler".

### ReaderTopBar
```tsx
// Barra superior minimalista dentro do reader
<ReaderTopBar
  title="One Piece - Cap. 1172"
  currentPage={5}
  totalPages={18}
  readingMode="paginated"
  onModeChange={setMode}
  onClose={() => router.back()}
/>
```

### PageProgress
```tsx
// Indicador de progresso de leitura — linha fina no topo
<PageProgress current={currentPage} total={totalPages} />
```

### MagnetInput
```tsx
// Input estilizado para colar magnet link
<MagnetInput
  onSubmit={(magnet) => addTorrent(magnet)}
  placeholder="magnet:?xt=urn:btih:..."
/>
```

## Animações (Framer Motion)

```tsx
// Entrada de cards na biblioteca
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2, ease: "easeOut" }}
>

// Transição de página no reader
<AnimatePresence mode="wait">
  <motion.img
    key={currentPage}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.15 }}
    src={pageUrl}
  />
</AnimatePresence>
```

## Tailwind Classes Customizadas

```javascript
// tailwind.config.ts
extend: {
  colors: {
    background: 'hsl(var(--background))',
    surface: 'hsl(var(--surface))',
    'surface-2': 'hsl(var(--surface-2))',
    accent: {
      DEFAULT: 'hsl(var(--accent))',
      hover: 'hsl(var(--accent-hover))',
      muted: 'hsl(var(--accent-muted))',
      foreground: 'hsl(var(--accent-foreground))',
    },
    border: 'hsl(var(--border))',
    muted: 'hsl(var(--foreground-muted))',
  },
  fontFamily: {
    sans: ['var(--font-geist-sans)', 'Inter', 'sans-serif'],
    mono: ['var(--font-geist-mono)', 'monospace'],
  },
  backgroundImage: {
    'gradient-card': 'linear-gradient(135deg, hsl(var(--surface)) 0%, hsl(var(--surface-2)) 100%)',
  }
}
```

## Padrão de Layout

```tsx
// Layout de página padrão (dentro do (app) route group)
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="container mx-auto px-4 py-6 max-w-7xl">
        {children}
      </main>
    </div>
  )
}
```

## Reader Layout (fullscreen)

```tsx
// Reader ocupa 100vh, sem navbar
export default function ReaderLayout({ children }: Props) {
  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      <ReaderTopBar />
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
      <ReaderBottomBar />
    </div>
  )
}
```
