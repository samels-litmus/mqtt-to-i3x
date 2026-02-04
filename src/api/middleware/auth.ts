import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';

export function createAuthHook(apiKeys: string[]) {
  const keySet = new Set(apiKeys);

  return function authHook(
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction
  ): void {
    let token: string | undefined;

    // Check X-API-Key header first
    const apiKeyHeader = request.headers['x-api-key'];
    if (apiKeyHeader) {
      token = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
    }

    // Check Authorization header (Bearer or Token)
    if (!token) {
      const authHeader = request.headers.authorization;
      if (authHeader) {
        const parts = authHeader.split(' ');
        if (parts.length === 2) {
          const scheme = parts[0].toLowerCase();
          if (scheme === 'bearer' || scheme === 'token') {
            token = parts[1];
          }
        }
      }
    }

    if (!token) {
      reply.code(401).send({ error: 'Missing Authorization header or X-API-Key' });
      return;
    }

    if (!keySet.has(token)) {
      reply.code(403).send({ error: 'Invalid API key' });
      return;
    }

    done();
  };
}
