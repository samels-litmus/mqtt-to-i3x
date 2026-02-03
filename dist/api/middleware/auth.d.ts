import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
export declare function createAuthHook(apiKeys: string[]): (request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => void;
