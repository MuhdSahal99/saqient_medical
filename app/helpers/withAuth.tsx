import superjson from "superjson";
import { getServerUserSession } from "./getServerUserSession";
import { User } from "./User";

// Wraps an endpoint handler: checks the session, enforces roles, serializes
// the result and turns thrown errors into JSON error responses.
// Throw `Object.assign(new Error("msg"), { status: 404 })` for a specific status.
export function withAuth(
  handler: (request: Request, user: User) => Promise<unknown>,
  options: { roles?: User["role"][] } = {}
) {
  return async (request: Request): Promise<Response> => {
    let user: User;
    try {
      user = (await getServerUserSession(request)).user;
    } catch {
      return new Response(superjson.stringify({ error: "Please sign in." }), { status: 401 });
    }
    if (options.roles && !options.roles.includes(user.role)) {
      return new Response(superjson.stringify({ error: "You do not have permission for this action." }), {
        status: 403,
      });
    }
    try {
      const result = await handler(request, user);
      return new Response(superjson.stringify(result));
    } catch (error) {
      const status = (error as { status?: number }).status ?? 400;
      const code = (error as { code?: string }).code;
      console.error("Endpoint error:", error);
      return new Response(
        superjson.stringify({
          error: error instanceof Error ? error.message : "Request failed",
          ...(code ? { code } : {}),
        }),
        { status }
      );
    }
  };
}