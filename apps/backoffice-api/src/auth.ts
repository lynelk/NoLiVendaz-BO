import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Principal } from "@nolivendaz/canonical-models";
import { withTenantContext } from "@nolivendaz/database";

interface JwtClaims {
  sub: string;
  tenant_id: string;
  email?: string;
  name?: string;
}

interface PermissionRow {
  code: string;
}

interface UserRow {
  id: string;
  tenant_id: string;
  email: string | null;
  display_name: string | null;
  is_platform_admin: boolean;
  status: string;
}

async function loadPrincipal(claims: JwtClaims): Promise<Principal> {
  return withTenantContext(
    {
      tenantId: claims.tenant_id,
      isPlatformAdmin: false,
      userId: claims.sub
    },
    async (client) => {
      const userResult = await client.query<UserRow>(
        `SELECT id, tenant_id, email, display_name, is_platform_admin, status
           FROM users
          WHERE id = $1 AND tenant_id = $2
          LIMIT 1`,
        [claims.sub, claims.tenant_id]
      );

      const user = userResult.rows[0];
      if (!user || user.status !== "ACTIVE") {
        throw new Error("AUTH_USER_NOT_ACTIVE");
      }

      const permissionResult = await client.query<PermissionRow>(
        `SELECT DISTINCT p.code
           FROM user_roles ur
           JOIN role_permissions rp ON rp.role_id = ur.role_id
           JOIN permissions p ON p.id = rp.permission_id
          WHERE ur.user_id = $1
          ORDER BY p.code`,
        [user.id]
      );

      const principal: Principal = {
        userId: user.id,
        tenantId: user.tenant_id,
        isPlatformAdmin: user.is_platform_admin,
        permissions: permissionResult.rows.map((row) => row.code)
      };

      const email = user.email ?? claims.email;
      const displayName = user.display_name ?? claims.name;
      if (email) principal.email = email;
      if (displayName) principal.displayName = displayName;

      return principal;
    }
  );
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.decorateRequest("principal", null);

  app.decorate(
    "authenticate",
    async function authenticate(request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify();
        const claims = request.user as JwtClaims;

        if (!claims.sub || !claims.tenant_id) {
          return reply.code(401).send({
            error: "INVALID_TOKEN",
            message: "Token must include sub and tenant_id claims."
          });
        }

        request.principal = await loadPrincipal(claims);
      } catch (error) {
        request.log.warn({ err: error }, "Authentication failed");
        return reply.code(401).send({
          error: "UNAUTHENTICATED",
          message: "A valid authenticated user is required."
        });
      }
    }
  );
}

export function requirePermission(permission: string) {
  return async function permissionGuard(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const principal = request.principal;

    if (!principal) {
      return reply.code(401).send({
        error: "UNAUTHENTICATED",
        message: "Authentication is required."
      });
    }

    if (
      !principal.isPlatformAdmin &&
      !principal.permissions.includes(permission)
    ) {
      return reply.code(403).send({
        error: "FORBIDDEN",
        message: `Missing required permission: ${permission}`
      });
    }
  };
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<unknown>;
  }
}
