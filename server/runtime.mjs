import { env } from "cloudflare:workers";
import { createApi } from "./api.mjs";
export const handle = (request) => createApi(env.DB)(request);
