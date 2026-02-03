import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';

export function createAuthHook(apiKeys: string[]) {
  const keySet = new Set(apiKeys);

  return function authHook(
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction
  ): void {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      reply.code(401).send({ error: 'Missing Authorization header' });
      return;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      reply.code(401).send({ error: 'Invalid Authorization header format' });
      return;
    }

    const token = parts[1];
    if (!keySet.has(token)) {
      reply.code(403).send({ error: 'Invalid API key' });
      return;
    }

    done();
  };
}
