/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { getMarketSnapshot } from "../lib/market";
import { getRecordedMarketSnapshot } from "../lib/market-ledger";
import { activateMarketEraFromDeployment } from "../lib/market-era";
import { handleAssistantApi } from "./assistant-api";
import { handleAssistantV1 } from "./assistant-v1";
import { handleRoyalExchangeMcp } from "./mcp";
import { handleOpenApi } from "./openapi";
import { handleCompositeHistory } from "./composite-history";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  MARKET_RESET_BACKUP_SHA256?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (env.DB && env.MARKET_RESET_BACKUP_SHA256) {
      await activateMarketEraFromDeployment(env.DB, new Date(), env.MARKET_RESET_BACKUP_SHA256);
    }

    if (url.pathname === "/api/composite-history") return handleCompositeHistory(request, env);

    if (request.method === "GET" && url.pathname === "/api/market") {
      if (!env.DB) return Response.json(getMarketSnapshot(), { headers: marketHeaders("unavailable") });
      try {
        const snapshot = await getRecordedMarketSnapshot(env.DB, new Date());
        return Response.json(snapshot, { headers: marketHeaders("recorded-ledger") });
      } catch (error) {
        console.error("Royal Exchange ledger unavailable", error);
        return Response.json(getMarketSnapshot(), { headers: marketHeaders("unavailable") });
      }
    }

    if (url.pathname === "/api/assistant") {
      return handleAssistantApi(request, env);
    }

    if (url.pathname.startsWith("/api/v1/")) {
      return handleAssistantV1(request, env);
    }

    if (url.pathname === "/openapi.json") {
      return handleOpenApi(request);
    }

    if (url.pathname === "/mcp") {
      return handleRoyalExchangeMcp(request, env, ctx);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      await activateMarketEraFromDeployment(env.DB, new Date(), env.MARKET_RESET_BACKUP_SHA256);
      await getRecordedMarketSnapshot(env.DB, new Date(controller.scheduledTime));
    })());
  },
};

function marketHeaders(historyMode: "recorded-ledger" | "unavailable") {
  return {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": historyMode === "recorded-ledger" ? "public, max-age=20, stale-while-revalidate=20" : "no-store",
    "X-Royal-Exchange-Mode": "autonomous-wall-clock",
    "X-Royal-Exchange-Simulation": "true",
    "X-Royal-Exchange-History": historyMode,
  };
}

export default worker;
