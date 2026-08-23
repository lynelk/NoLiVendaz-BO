import type { Principal } from "@nolivendaz/canonical-models";
import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    principal: Principal | null;
  }
}
