#!/bin/bash
# .claude/hooks/post-tool-use.sh
# Executado APÓS qualquer tool use
# Auto-formata arquivos após edição

TOOL_NAME="${TOOL_NAME:-}"
TOOL_INPUT="${TOOL_INPUT:-}"
FILE_PATH="${FILE_PATH:-}"

# ─── Auto-format após escrita ─────────────────────────────────────────────────

if [[ "$TOOL_NAME" == "Write" || "$TOOL_NAME" == "Edit" ]]; then
  
  # Formatar Go
  if [[ "$FILE_PATH" =~ \.go$ ]]; then
    if command -v gofmt &>/dev/null; then
      gofmt -w "$FILE_PATH" 2>/dev/null || true
      echo "✅ gofmt aplicado"
    fi
    if command -v goimports &>/dev/null; then
      goimports -w "$FILE_PATH" 2>/dev/null || true
    fi
  fi

  # Formatar TypeScript/JavaScript
  if [[ "$FILE_PATH" =~ \.(tsx?|jsx?|json)$ ]]; then
    if command -v prettier &>/dev/null; then
      prettier --write "$FILE_PATH" 2>/dev/null || true
      echo "✅ prettier aplicado"
    fi
  fi

  # Formatar SQL
  if [[ "$FILE_PATH" =~ \.sql$ ]]; then
    echo "ℹ️  Arquivo SQL criado — lembre de rodar 'make migrate-up'"
  fi
fi

# ─── Lembretes contextuais ────────────────────────────────────────────────────

# Se criou novo handler Go, lembrar dos testes
if [[ "$FILE_PATH" =~ internal/handler/.*\.go$ ]] && [[ ! "$FILE_PATH" =~ _test\.go$ ]]; then
  TESTFILE="${FILE_PATH/.go/_test.go}"
  if [[ ! -f "$TESTFILE" ]]; then
    echo "⚠️  Novo handler criado sem arquivo de testes. Considere criar $TESTFILE"
  fi
fi

# Se criou novo componente React, lembrar dos testes
if [[ "$FILE_PATH" =~ apps/web/src/components/.*\.tsx$ ]] && [[ ! "$FILE_PATH" =~ \.test\.tsx$ ]]; then
  echo "⚠️  Novo componente criado. Considere adicionar testes com Vitest + Testing Library"
fi

exit 0
