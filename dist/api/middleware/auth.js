export function createAuthHook(apiKeys) {
    const keySet = new Set(apiKeys);
    return function authHook(request, reply, done) {
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
