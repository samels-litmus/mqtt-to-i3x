export async function registerAdminMappingsRoutes(fastify, _opts) {
    // GET /admin/mappings - List all mapping rules
    fastify.get('/admin/mappings', async (request) => {
        const engine = request.apiContext.mappingEngine;
        const rules = engine.listRules();
        return rules.map((r) => ({
            id: r.id,
            topicPattern: r.topicPattern,
            codec: r.codec,
            extraction: r.extraction,
            codecOptions: r.codecOptions,
            namespaceUri: r.namespaceUri,
            objectTypeId: r.objectTypeId,
            elementIdTemplate: r.elementIdTemplate,
            displayNameTemplate: r.displayNameTemplate,
            valueExtractor: r.valueExtractor,
            timestampExtractor: r.timestampExtractor,
            qualityExtractor: r.qualityExtractor,
        }));
    });
    // POST /admin/mappings - Create a new mapping rule
    fastify.post('/admin/mappings', async (request, reply) => {
        const engine = request.apiContext.mappingEngine;
        const body = request.body;
        if (!body.id || typeof body.id !== 'string') {
            return reply.code(400).send({ error: 'id is required and must be a string' });
        }
        if (!body.topicPattern || typeof body.topicPattern !== 'string') {
            return reply.code(400).send({ error: 'topicPattern is required and must be a string' });
        }
        if (!body.codec || typeof body.codec !== 'string') {
            return reply.code(400).send({ error: 'codec is required and must be a string' });
        }
        const existing = engine.getRule(body.id);
        if (existing) {
            return reply.code(409).send({ error: `Mapping rule '${body.id}' already exists` });
        }
        const rule = {
            id: body.id,
            topicPattern: body.topicPattern,
            codec: body.codec,
            extraction: body.extraction,
            codecOptions: body.codecOptions,
            namespaceUri: body.namespaceUri,
            objectTypeId: body.objectTypeId,
            elementIdTemplate: body.elementIdTemplate,
            displayNameTemplate: body.displayNameTemplate,
            valueExtractor: body.valueExtractor,
            timestampExtractor: body.timestampExtractor,
            qualityExtractor: body.qualityExtractor,
        };
        engine.addRule(rule);
        // Re-subscribe MQTT client if available
        const mqttClient = request.apiContext.mqttClient;
        if (mqttClient && mqttClient.getState() === 'connected') {
            // Convert template pattern to MQTT wildcard
            const mqttTopic = rule.topicPattern.replace(/\{[^}]+\}/g, '+');
            mqttClient.subscribe(mqttTopic);
        }
        return reply.code(201).send({
            mapping: {
                id: rule.id,
                topicPattern: rule.topicPattern,
                codec: rule.codec,
                extraction: rule.extraction,
                codecOptions: rule.codecOptions,
                namespaceUri: rule.namespaceUri,
                objectTypeId: rule.objectTypeId,
                elementIdTemplate: rule.elementIdTemplate,
                displayNameTemplate: rule.displayNameTemplate,
                valueExtractor: rule.valueExtractor,
                timestampExtractor: rule.timestampExtractor,
                qualityExtractor: rule.qualityExtractor,
            },
        });
    });
    // GET /admin/mappings/:id - Get a specific mapping rule
    fastify.get('/admin/mappings/:id', async (request, reply) => {
        const engine = request.apiContext.mappingEngine;
        const { id } = request.params;
        const rule = engine.getRule(id);
        if (!rule) {
            return reply.code(404).send({ error: `Mapping rule '${id}' not found` });
        }
        return {
            mapping: {
                id: rule.id,
                topicPattern: rule.topicPattern,
                codec: rule.codec,
                extraction: rule.extraction,
                codecOptions: rule.codecOptions,
                namespaceUri: rule.namespaceUri,
                objectTypeId: rule.objectTypeId,
                elementIdTemplate: rule.elementIdTemplate,
                displayNameTemplate: rule.displayNameTemplate,
                valueExtractor: rule.valueExtractor,
                timestampExtractor: rule.timestampExtractor,
                qualityExtractor: rule.qualityExtractor,
            },
        };
    });
    // PUT /admin/mappings/:id - Update a mapping rule
    fastify.put('/admin/mappings/:id', async (request, reply) => {
        const engine = request.apiContext.mappingEngine;
        const { id } = request.params;
        const body = request.body;
        const existing = engine.getRule(id);
        if (!existing) {
            return reply.code(404).send({ error: `Mapping rule '${id}' not found` });
        }
        // Remove old rule and add updated one
        engine.removeRule(id);
        const updated = {
            id,
            topicPattern: body.topicPattern ?? existing.topicPattern,
            codec: body.codec ?? existing.codec,
            extraction: body.extraction !== undefined ? body.extraction : existing.extraction,
            codecOptions: body.codecOptions !== undefined ? body.codecOptions : existing.codecOptions,
            namespaceUri: body.namespaceUri !== undefined ? body.namespaceUri : existing.namespaceUri,
            objectTypeId: body.objectTypeId !== undefined ? body.objectTypeId : existing.objectTypeId,
            elementIdTemplate: body.elementIdTemplate !== undefined ? body.elementIdTemplate : existing.elementIdTemplate,
            displayNameTemplate: body.displayNameTemplate !== undefined ? body.displayNameTemplate : existing.displayNameTemplate,
            valueExtractor: body.valueExtractor !== undefined ? body.valueExtractor : existing.valueExtractor,
            timestampExtractor: body.timestampExtractor !== undefined ? body.timestampExtractor : existing.timestampExtractor,
            qualityExtractor: body.qualityExtractor !== undefined ? body.qualityExtractor : existing.qualityExtractor,
        };
        engine.addRule(updated);
        return {
            mapping: {
                id: updated.id,
                topicPattern: updated.topicPattern,
                codec: updated.codec,
                extraction: updated.extraction,
                codecOptions: updated.codecOptions,
                namespaceUri: updated.namespaceUri,
                objectTypeId: updated.objectTypeId,
                elementIdTemplate: updated.elementIdTemplate,
                displayNameTemplate: updated.displayNameTemplate,
                valueExtractor: updated.valueExtractor,
                timestampExtractor: updated.timestampExtractor,
                qualityExtractor: updated.qualityExtractor,
            },
        };
    });
    // DELETE /admin/mappings/:id - Delete a mapping rule
    fastify.delete('/admin/mappings/:id', async (request, reply) => {
        const engine = request.apiContext.mappingEngine;
        const { id } = request.params;
        const existing = engine.getRule(id);
        if (!existing) {
            return reply.code(404).send({ error: `Mapping rule '${id}' not found` });
        }
        engine.removeRule(id);
        return reply.code(204).send();
    });
}
