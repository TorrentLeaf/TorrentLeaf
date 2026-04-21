# Skill: Segurança — TorrentLeaf

Leia esta skill **antes de qualquer auditoria, implementação de auth ou endpoint novo**.
Cobre OWASP Top 10, práticas específicas para Go/Node.js/Next.js e o contexto do TorrentLeaf.

---

## 1. Autenticação e JWT

### Regras obrigatórias
```go
// ✅ Access token curto (15min), refresh token longo (7 dias)
// ✅ Refresh token rotacionado a cada uso (rotation)
// ✅ Refresh token armazenado no banco (permite revogação)
// ✅ JWT assinado com HS256 mínimo, RS256 preferível em produção
// ✅ Claims obrigatórias: sub (userID), exp, iat, jti (JWT ID único)
// ❌ NUNCA armazenar JWT em localStorage — usar httpOnly cookie
// ❌ NUNCA logar o token em qualquer nível de log
// ❌ NUNCA retornar detalhes do erro de JWT ao cliente ("token expired" vs "invalid token" — ambos retornam 401 genérico)

type Claims struct {
    UserID uuid.UUID `json:"sub"`
    Role   string    `json:"role"`
    JTI    string    `json:"jti"` // UUID único por token
    jwt.RegisteredClaims
}

// Middleware de validação
func JWTMiddleware(secret string) fiber.Handler {
    return func(c *fiber.Ctx) error {
        token := extractToken(c) // header Authorization OU cookie httpOnly
        claims, err := validateToken(token, secret)
        if err != nil {
            // NUNCA expor o erro real
            return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
        }
        c.Locals("userID", claims.UserID)
        c.Locals("role", claims.Role)
        return c.Next()
    }
}
```

### Cookie httpOnly (mais seguro que Authorization header para browsers)
```go
// No login handler
c.Cookie(&fiber.Cookie{
    Name:     "access_token",
    Value:    accessToken,
    HTTPOnly: true,   // JS não acessa
    Secure:   true,   // só HTTPS
    SameSite: "Strict",
    MaxAge:   15 * 60, // 15 min
    Path:     "/",
})
```

---

## 2. Rate Limiting

### Por IP (global)
```go
// middleware/ratelimit.go
// Usar go-redis + sliding window
// Limites recomendados para TorrentLeaf:
const (
    RateLimitAuth    = 5   // tentativas de login por minuto por IP
    RateLimitAPI     = 100 // requests por minuto por usuário autenticado
    RateLimitTorrent = 10  // torrents adicionados por hora por usuário
    RateLimitStream  = 300 // requests de stream por minuto por usuário
)

func RateLimitMiddleware(rdb *redis.Client, limit int, window time.Duration) fiber.Handler {
    return func(c *fiber.Ctx) error {
        key := fmt.Sprintf("ratelimit:%s:%s", c.Path(), c.IP())
        count, err := rdb.Incr(c.Context(), key).Result()
        if count == 1 {
            rdb.Expire(c.Context(), key, window)
        }
        if count > int64(limit) {
            c.Set("Retry-After", strconv.Itoa(int(window.Seconds())))
            return fiber.NewError(fiber.StatusTooManyRequests, "too many requests")
        }
        return c.Next()
    }
}
```

---

## 3. Validação de Input — Go

```go
// ❌ NUNCA confiar em input do usuário sem validar
// ✅ Validar ANTES de qualquer operação de banco ou engine

// Magnet link: regex estrita
var magnetRegex = regexp.MustCompile(`^magnet:\?xt=urn:btih:[a-fA-F0-9]{40}(&.*)?$`)

func validateMagnet(uri string) error {
    if len(uri) > 2048 {
        return domain.NewError(domain.ErrInvalidInput, "magnet URI too long", nil)
    }
    if !magnetRegex.MatchString(uri) {
        return domain.NewError(domain.ErrInvalidInput, "invalid magnet URI format", nil)
    }
    return nil
}

// UUID: usar google/uuid para parse — não aceitar strings arbitrárias
func parseUUID(s string) (uuid.UUID, error) {
    id, err := uuid.Parse(s)
    if err != nil {
        return uuid.Nil, domain.NewError(domain.ErrInvalidInput, "invalid ID", nil)
    }
    return id, nil
}

// Paginação: nunca permitir limit arbitrário
const (
    DefaultPageSize = 20
    MaxPageSize     = 100
)
```

---

## 4. Validação de Input — Torrent Engine (Node.js)

```typescript
// Extensões bloqueadas — nunca servir executáveis
const BLOCKED_EXTENSIONS = new Set([
    '.exe', '.sh', '.bash', '.zsh', '.bat', '.cmd', '.ps1',
    '.msi', '.dmg', '.pkg', '.deb', '.rpm', '.appimage',
    '.vbs', '.js', '.ts', '.py', '.rb', '.pl', // scripts
])

function isSafeFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase()
    return !BLOCKED_EXTENSIONS.has(ext)
}

// Limite de tamanho de arquivo individual
const MAX_FILE_SIZE_GB = 5
function isFileSizeAcceptable(bytes: number): boolean {
    return bytes <= MAX_FILE_SIZE_GB * 1024 * 1024 * 1024
}

// Path traversal — nunca permitir ../ no nome de arquivo
function isSafePath(filePath: string): boolean {
    const normalized = path.normalize(filePath)
    return !normalized.includes('..') && !path.isAbsolute(normalized)
}
```

---

## 5. Headers de Segurança HTTP

```go
// middleware/security.go — aplicar em TODOS os endpoints
func SecurityHeaders() fiber.Handler {
    return func(c *fiber.Ctx) error {
        c.Set("X-Content-Type-Options", "nosniff")
        c.Set("X-Frame-Options", "DENY")
        c.Set("X-XSS-Protection", "0") // CSP é mais moderno
        c.Set("Referrer-Policy", "strict-origin-when-cross-origin")
        c.Set("Permissions-Policy", "interest-cohort=()")
        c.Set("Content-Security-Policy",
            "default-src 'self'; "+
            "script-src 'self' 'unsafe-eval'; "+ // unsafe-eval necessário para PDF.js worker
            "style-src 'self' 'unsafe-inline'; "+
            "img-src 'self' data: blob:; "+
            "worker-src blob:; "+
            "connect-src 'self' ws: wss:;",
        )
        // Em produção adicionar:
        // c.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return c.Next()
    }
}
```

---

## 6. Proteção contra Path Traversal e SSRF

```go
// SSRF: o backend NUNCA deve fazer fetch para URLs fornecidas pelo usuário
// Magnet links são aceitos, URLs HTTP diretas não
// O engine Node.js também não deve fazer fetch para URLs arbitrárias

// Path traversal em nomes de arquivo do torrent
func sanitizeFilePath(p string) string {
    // Remove ../ e componentes absolutos
    cleaned := filepath.Clean(p)
    if filepath.IsAbs(cleaned) {
        cleaned = cleaned[1:]
    }
    return strings.ReplaceAll(cleaned, "..", "")
}
```

---

## 7. SQL Injection

```go
// ✅ sqlc gera queries parametrizadas — não há interpolação de string em SQL
// ✅ NUNCA construir SQL com fmt.Sprintf
// ✅ NUNCA aceitar ORDER BY dinâmico sem whitelist

// Whitelist de campos ordenáveis
var allowedSortFields = map[string]string{
    "added_at":    "li.added_at",
    "last_read_at": "li.last_read_at",
    "title":       "li.title",
}

func validateSortField(field string) (string, error) {
    if col, ok := allowedSortFields[field]; ok {
        return col, nil
    }
    return "li.added_at", nil // default seguro
}
```

---

## 8. CORS

```go
// Produção: só aceitar origem do domínio real
// Desenvolvimento: aceitar localhost nas portas conhecidas
func CORSConfig(env string) cors.Config {
    if env == "production" {
        return cors.Config{
            AllowOrigins:     "https://seudominio.com",
            AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS",
            AllowHeaders:     "Origin,Content-Type,Authorization",
            AllowCredentials: true, // necessário para cookies httpOnly
            MaxAge:           86400,
        }
    }
    return cors.Config{
        AllowOrigins:     "http://localhost:3000,http://localhost:8080",
        AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS",
        AllowHeaders:     "Origin,Content-Type,Authorization",
        AllowCredentials: true,
    }
}
```

---

## 9. Senhas

```go
// ✅ bcrypt com custo mínimo 12
// ✅ Verificar com constant-time comparison
import "golang.org/x/crypto/bcrypt"

const bcryptCost = 12

func hashPassword(password string) (string, error) {
    if len(password) < 8 {
        return "", domain.NewError(domain.ErrInvalidInput, "password too short", nil)
    }
    if len(password) > 72 { // bcrypt trunca em 72 bytes
        return "", domain.NewError(domain.ErrInvalidInput, "password too long", nil)
    }
    hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
    return string(hash), err
}

func verifyPassword(hash, password string) bool {
    return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
```

---

## 10. Exposição de Erros

```go
// ✅ Log interno com stack trace + contexto
// ✅ Response ao cliente: mensagem genérica sem detalhes internos
// ❌ NUNCA expor: stack traces, queries SQL, paths internos, versões de libs

func ErrorHandler(c *fiber.Ctx, err error) error {
    var fiberErr *fiber.Error
    if errors.As(err, &fiberErr) {
        return c.Status(fiberErr.Code).JSON(fiber.Map{
            "error": fiberErr.Message, // mensagem controlada
        })
    }

    var domErr *domain.Error
    if errors.As(err, &domErr) {
        return c.Status(domErr.HTTPStatus()).JSON(fiber.Map{
            "error": domErr.Message, // mensagem de domínio, sem internos
        })
    }

    // Erro interno: logar, não expor
    log.Error().Err(err).
        Str("path", c.Path()).
        Str("method", c.Method()).
        Msg("unhandled error")

    return c.Status(500).JSON(fiber.Map{
        "error": "internal server error", // genérico ao cliente
    })
}
```

---

## 11. Checklist de Auditoria

Antes de qualquer PR que toque em auth, endpoints ou infra, verificar:

```
[ ] Todos os endpoints protegidos têm middleware JWT aplicado
[ ] Rate limiting aplicado em /auth/login e /auth/register
[ ] Magnet links validados com regex antes de passar ao engine
[ ] Nenhum erro interno exposto no response JSON
[ ] Headers de segurança aplicados globalmente
[ ] CORS configurado com AllowOrigins explícito (não *)
[ ] Senhas com bcrypt custo >= 12
[ ] Refresh tokens armazenados no banco (revogáveis)
[ ] Cookies com httpOnly + Secure + SameSite=Strict
[ ] Extensões de arquivo bloqueadas no engine (.exe, .sh, etc.)
[ ] Path traversal prevenido em nomes de arquivo do torrent
[ ] SQL construído apenas via sqlc (sem fmt.Sprintf em queries)
[ ] govulncheck passando sem vulnerabilidades críticas
[ ] pnpm audit sem vulnerabilidades high/critical
```