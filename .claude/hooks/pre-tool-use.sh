#!/bin/bash
# .claude/hooks/pre-tool-use.sh
# Executado ANTES de qualquer tool use pelo Claude Code
# Variáveis disponíveis: $TOOL_NAME, $TOOL_INPUT

set -euo pipefail

TOOL_NAME="${TOOL_NAME:-}"
TOOL_INPUT="${TOOL_INPUT:-}"

# ─── Proteções de segurança ───────────────────────────────────────────────────

# Bloquear acesso a arquivos de secrets
if echo "$TOOL_INPUT" | grep -qE "\.(env|pem|key|secret|credentials)$"; then
  if echo "$TOOL_INPUT" | grep -qv "\.env\.example"; then
    echo "⛔ BLOQUEADO: Tentativa de acessar arquivo sensível"
    exit 1
  fi
fi

# Bloquear rm -rf em diretórios críticos
if echo "$TOOL_INPUT" | grep -qE "rm\s+-rf\s+(\/|~|\/home|\/etc|\/var)"; then
  echo "⛔ BLOQUEADO: Comando destrutivo perigoso"
  exit 1
fi

# ─── Validações de qualidade ──────────────────────────────────────────────────

# Para escrita de arquivos Go, lembrar de seguir padrões
if [[ "$TOOL_NAME" == "Write" ]] && echo "$TOOL_INPUT" | grep -qE "apps/api.*\.go$"; then
  echo "ℹ️  Arquivo Go: lembre-se de seguir padrões do agente backend (handler→service→repository)"
fi

# Para escrita de arquivos TypeScript em apps/web
if [[ "$TOOL_NAME" == "Write" ]] && echo "$TOOL_INPUT" | grep -qE "apps/web.*\.(tsx?|jsx?)$"; then
  echo "ℹ️  Arquivo Frontend: verificar se precisa de 'use client' ou se deve ser Server Component"
fi

exit 0
