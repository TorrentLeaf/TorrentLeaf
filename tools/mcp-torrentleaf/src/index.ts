/**
 * TorrentLeaf MCP Server
 *
 * Expõe tools da própria API do TorrentLeaf para o Claude Code usar durante
 * o desenvolvimento — testar endpoints, inspecionar estado, debugar sem curl.
 *
 * Uso no .mcp.json:
 * {
 *   "torrentleaf": {
 *     "command": "node",
 *     "args": ["tools/mcp-torrentleaf/dist/index.js"],
 *     "env": { "TORRENTLEAF_API_URL": "http://localhost:8080" }
 *   }
 * }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";
import { z } from "zod";

const API_URL = process.env.TORRENTLEAF_API_URL || "http://localhost:8080";
const DEV_TOKEN = process.env.TORRENTLEAF_DEV_TOKEN || "";

// ─── HTTP Client ──────────────────────────────────────────────────────────────
const api: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api/v1`,
  timeout: 30_000,
  headers: DEV_TOKEN ? { Authorization: `Bearer ${DEV_TOKEN}` } : {},
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function err(message: string) {
  return {
    content: [{ type: "text" as const, text: `❌ Erro: ${message}` }],
    isError: true,
  };
}

async function safeCall<T>(fn: () => Promise<T>) {
  try {
    return ok(await fn());
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || "Erro desconhecido";
    const status = e?.response?.status;
    return err(status ? `HTTP ${status} — ${msg}` : msg);
  }
}

// ─── Definições das Tools ─────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "health_check",
    description:
      "Verifica se a API do TorrentLeaf está rodando e retorna status de todos os serviços (banco, redis, engine).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "add_torrent",
    description:
      "Adiciona um magnet link à sessão de desenvolvimento. Útil para testar o fluxo de ingestão sem precisar da UI.",
    inputSchema: {
      type: "object",
      properties: {
        magnetURI: {
          type: "string",
          description: "Magnet link completo (magnet:?xt=urn:btih:...)",
        },
      },
      required: ["magnetURI"],
    },
  },
  {
    name: "list_torrents",
    description: "Lista todos os torrents ativos na sessão de desenvolvimento.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_torrent",
    description:
      "Retorna detalhes completos de um torrent: status, progresso, lista de arquivos, peers.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID do torrent" },
      },
      required: ["id"],
    },
  },
  {
    name: "get_reader_pages",
    description:
      "Retorna a lista de páginas de um arquivo de torrent (imagens de mangá, páginas de PDF). Útil para verificar se o indexador está funcionando.",
    inputSchema: {
      type: "object",
      properties: {
        torrentId: { type: "string", description: "UUID do torrent" },
        fileIndex: { type: "number", description: "Índice do arquivo no torrent" },
      },
      required: ["torrentId", "fileIndex"],
    },
  },
  {
    name: "check_stream",
    description:
      "Testa se o endpoint de stream de uma página está respondendo corretamente (verifica headers HTTP Range e Content-Type).",
    inputSchema: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "UUID do arquivo" },
        page: { type: "number", description: "Número da página (0-indexed)" },
      },
      required: ["fileId", "page"],
    },
  },
  {
    name: "get_reading_progress",
    description: "Retorna o progresso de leitura de um arquivo.",
    inputSchema: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "UUID do arquivo" },
      },
      required: ["fileId"],
    },
  },
  {
    name: "inspect_queue",
    description:
      "Inspeciona o estado das filas de jobs (Bull/Redis): jobs pendentes, ativos, falhos. Útil para debugar workers.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_metrics",
    description:
      "Retorna métricas Prometheus da API em formato legível: requests/s, latência, torrents ativos, uso de disco.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "simulate_reading_session",
    description:
      "Simula uma sessão completa de leitura: adiciona torrent → espera metadata → prioriza arquivo → verifica stream das primeiras 3 páginas. Ideal para smoke test do fluxo principal.",
    inputSchema: {
      type: "object",
      properties: {
        magnetURI: { type: "string", description: "Magnet link para testar" },
        timeoutSeconds: {
          type: "number",
          description: "Timeout para aguardar metadata (padrão: 30s)",
        },
      },
      required: ["magnetURI"],
    },
  },
];

// ─── Server Setup ─────────────────────────────────────────────────────────────
const server = new Server(
  { name: "torrentleaf", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    // ── Health ──────────────────────────────────────────────────────────────
    case "health_check":
      return safeCall(async () => {
        const { data } = await api.get("/health", { baseURL: API_URL });
        return data;
      });

    // ── Torrents ────────────────────────────────────────────────────────────
    case "add_torrent":
      return safeCall(async () => {
        const { magnetURI } = z
          .object({ magnetURI: z.string().startsWith("magnet:") })
          .parse(args);
        const { data } = await api.post("/torrents", { magnetURI });
        return data;
      });

    case "list_torrents":
      return safeCall(async () => {
        const { data } = await api.get("/torrents");
        return data;
      });

    case "get_torrent":
      return safeCall(async () => {
        const { id } = z.object({ id: z.string().uuid() }).parse(args);
        const { data } = await api.get(`/torrents/${id}`);
        return data;
      });

    // ── Reader ──────────────────────────────────────────────────────────────
    case "get_reader_pages":
      return safeCall(async () => {
        const { torrentId, fileIndex } = z
          .object({ torrentId: z.string().uuid(), fileIndex: z.number().int() })
          .parse(args);
        // Primeiro pega o torrent para obter o fileId
        const { data: torrent } = await api.get(`/torrents/${torrentId}`);
        const file = torrent.files?.[fileIndex];
        if (!file) return { error: `Arquivo ${fileIndex} não encontrado` };
        const { data } = await api.get(`/reader/${torrentId}/pages?fileIndex=${fileIndex}`);
        return { file: file.name, ...data };
      });

    case "check_stream":
      return safeCall(async () => {
        const { fileId, page } = z
          .object({ fileId: z.string().uuid(), page: z.number().int().min(0) })
          .parse(args);
        // HEAD request para verificar headers sem baixar o conteúdo
        const response = await axios.head(
          `${API_URL}/api/v1/stream/${fileId}/${page}`,
          {
            headers: {
              Range: "bytes=0-1023",
              ...(DEV_TOKEN ? { Authorization: `Bearer ${DEV_TOKEN}` } : {}),
            },
            validateStatus: (s) => s < 500,
          }
        );
        return {
          status: response.status,
          statusText: response.statusText,
          headers: {
            "content-type": response.headers["content-type"],
            "content-range": response.headers["content-range"],
            "accept-ranges": response.headers["accept-ranges"],
            "content-length": response.headers["content-length"],
          },
          rangeSupported: response.status === 206,
        };
      });

    // ── Progress ────────────────────────────────────────────────────────────
    case "get_reading_progress":
      return safeCall(async () => {
        const { fileId } = z.object({ fileId: z.string().uuid() }).parse(args);
        const { data } = await api.get(`/progress/${fileId}`);
        return data;
      });

    // ── Infra ───────────────────────────────────────────────────────────────
    case "inspect_queue":
      return safeCall(async () => {
        const { data } = await api.get("/admin/queues");
        return data;
      });

    case "get_metrics":
      return safeCall(async () => {
        const { data } = await axios.get(`${API_URL}/metrics`);
        // Parsear só as linhas relevantes do formato Prometheus
        const lines = (data as string)
          .split("\n")
          .filter(
            (l) =>
              !l.startsWith("#") &&
              l.trim() !== "" &&
              (l.includes("torrentleaf_") ||
                l.includes("http_requests") ||
                l.includes("process_"))
          )
          .slice(0, 30);
        return { metrics: lines };
      });

    // ── Smoke Test ──────────────────────────────────────────────────────────
    case "simulate_reading_session":
      return safeCall(async () => {
        const { magnetURI, timeoutSeconds = 30 } = z
          .object({
            magnetURI: z.string().startsWith("magnet:"),
            timeoutSeconds: z.number().optional(),
          })
          .parse(args);

        const results: Record<string, unknown> = {};

        // 1. Adicionar torrent
        const { data: session } = await api.post("/torrents", { magnetURI });
        results.step1_add = { ok: true, id: session.id, status: session.status };

        // 2. Aguardar metadata (polling)
        const deadline = Date.now() + timeoutSeconds * 1000;
        let torrent = session;
        while (
          torrent.status === "fetching_metadata" &&
          Date.now() < deadline
        ) {
          await new Promise((r) => setTimeout(r, 2000));
          const { data } = await api.get(`/torrents/${session.id}`);
          torrent = data;
        }

        results.step2_metadata = {
          ok: torrent.status !== "fetching_metadata",
          status: torrent.status,
          filesFound: torrent.files?.length ?? 0,
          torrentName: torrent.name,
        };

        if (!torrent.files?.length) {
          results.conclusion = "⚠️ Metadata não chegou ou torrent sem arquivos";
          return results;
        }

        // 3. Verificar stream das primeiras 3 páginas do primeiro arquivo
        const firstFile = torrent.files[0];
        const streamChecks = await Promise.allSettled(
          [0, 1, 2].map((page) =>
            axios.head(
              `${API_URL}/api/v1/stream/${firstFile.id}/${page}`,
              {
                headers: { Range: "bytes=0-1023" },
                validateStatus: (s) => s < 500,
              }
            )
          )
        );

        results.step3_stream = streamChecks.map((r, i) => ({
          page: i,
          status: r.status === "fulfilled" ? r.value.status : "failed",
          rangeOk:
            r.status === "fulfilled" ? r.value.status === 206 : false,
        }));

        results.conclusion =
          streamChecks.every((r) => r.status === "fulfilled" && r.value.status === 206)
            ? "✅ Fluxo completo funcionando — stream com Range Requests OK"
            : "⚠️ Algumas páginas ainda não estão disponíveis (normal se torrent recém adicionado)";

        return results;
      });

    default:
      return err(`Tool desconhecida: ${name}`);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`TorrentLeaf MCP Server rodando — API: ${API_URL}`);
