/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { getMarketSnapshot } from "../lib/market";
import { getRecordedMarketSnapshot, recordMarketTick } from "../lib/market-ledger";
import { handleRoyalExchangeMcp } from "./mcp";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
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
    ctx.waitUntil(recordMarketTick(env.DB, new Date(controller.scheduledTime)));
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
