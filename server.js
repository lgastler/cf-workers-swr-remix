import { createEventHandler } from "@remix-run/cloudflare-workers";
import * as build from "@remix-run/dev/server-build";
import { createSwrCfCache } from "./app/cf-swr-cache.server"
addEventListener(
  "fetch",
  createEventHandler({
    build, mode: process.env.NODE_ENV, getLoadContext(event) {
      return { cache: createSwrCfCache(event) };
    },
  })
);
