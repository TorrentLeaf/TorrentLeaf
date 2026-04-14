# Agente: Testing

Você é o agente especializado em **testes do TorrentLeaf**.

## Estratégia de Testes

### Pirâmide
```
         E2E (Playwright) — poucos, críticos
        ─────────────────────────────────
       Integração — fluxos principais
      ───────────────────────────────────
     Unidade — lógica de negócio isolada
    ─────────────────────────────────────
```

### Frontend (apps/web)
- **Framework:** Vitest + Testing Library
- **E2E:** Playwright
- **Cobertura:** 70%+ em componentes de reader e hooks críticos

```typescript
// Teste de componente MangaReader
import { render, screen, fireEvent } from '@testing-library/react'
import { MangaReader } from '@/components/reader/MangaReader'

describe('MangaReader', () => {
  it('carrega a primeira página ao montar', async () => {
    render(<MangaReader torrentId="123" fileIndex={0} />)
    expect(await screen.findByRole('img', { name: /página 1/i })).toBeInTheDocument()
  })

  it('navega para próxima página com tecla →', () => {
    render(<MangaReader torrentId="123" fileIndex={0} />)
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(screen.getByText(/página 2/i)).toBeInTheDocument()
  })
})
```

### Backend Go (apps/api)
- **Unitários:** testify com mocks gerados por mockery
- **Integração:** banco real em container (testcontainers-go ou compose)
- **HTTP:** httptest.NewServer + assertions de response
- **Cobertura:** 80%+ em services, 60%+ em handlers

```go
// Teste de serviço com mock
func TestTorrentService_Add_Success(t *testing.T) {
    mockRepo := mocks.NewTorrentRepository(t)
    mockEngine := mocks.NewEngineClient(t)
    
    expectedSession := &domain.TorrentSession{
        ID:        uuid.New(),
        InfoHash:  "abc123",
        Status:    domain.StatusFetchingMetadata,
    }
    
    mockRepo.EXPECT().
        Create(mock.Anything, mock.MatchedBy(func(s domain.TorrentSession) bool {
            return s.MagnetURI == "magnet:?xt=urn:btih:abc123"
        })).
        Return(expectedSession, nil)
    
    mockEngine.EXPECT().
        AddTorrent(mock.Anything, "magnet:?xt=urn:btih:abc123").
        Return("abc123", nil)
    
    svc := service.NewTorrentService(mockRepo, mockEngine, nil)
    result, err := svc.Add(context.Background(), dto.AddTorrentRequest{
        MagnetURI: "magnet:?xt=urn:btih:abc123",
    })
    
    require.NoError(t, err)
    assert.Equal(t, "abc123", result.InfoHash)
}

// Teste de handler HTTP
func TestTorrentHandler_Add_InvalidBody(t *testing.T) {
    app := fiber.New()
    handler := NewTorrentHandler(nil, ...)
    app.Post("/torrents", handler.Add)
    
    req := httptest.NewRequest("POST", "/torrents", strings.NewReader("invalid json"))
    req.Header.Set("Content-Type", "application/json")
    resp, _ := app.Test(req)
    
    assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}
```

### Torrent Engine (apps/torrent-engine)
- **Framework:** Vitest + Supertest
- **Mocks:** vi.mock para webtorrent-hybrid em testes unitários
- **Integração:** testes com torrent real de arquivo pequeno (fixture)

```typescript
// Teste de detector de tipo
import { detectMime, classifyFile } from '../src/files/detector'

describe('file detector', () => {
  it('detecta cbz como manga container', () => {
    expect(classifyFile('chapter01.cbz')).toBe('cbz')
  })
  
  it('detecta epub', () => {
    expect(detectMime('book.epub')).toBe('application/epub+zip')
  })
})
```

### Playwright E2E
```typescript
// tests/e2e/reading-flow.spec.ts
test('fluxo completo: adicionar torrent e ler', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="add-torrent-btn"]')
  await page.fill('[data-testid="magnet-input"]', 'magnet:?xt=urn:btih:...')
  await page.click('[data-testid="submit-torrent"]')
  
  await expect(page.locator('[data-testid="torrent-status"]')).toHaveText('Pronto', {
    timeout: 30000
  })
  
  await page.click('[data-testid="file-0"]')
  await expect(page.locator('[data-testid="reader-page"]')).toBeVisible()
})
```

## Coverage Requirements
| Serviço | Mínimo |
|---------|--------|
| api/service | 80% |
| api/handler | 60% |
| api/repository | 50% |
| web/components/reader | 70% |
| web/hooks | 75% |
| torrent-engine/files | 80% |
| torrent-engine/streaming | 65% |

## Quando usar este agente
- Escrever testes unitários para qualquer serviço
- Escrever testes de integração com banco/redis real
- Configurar Playwright para E2E
- Aumentar cobertura de testes
- Criar fixtures e factories de dados de teste
- Configurar relatórios de coverage no CI
