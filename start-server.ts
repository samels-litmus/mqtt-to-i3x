/**
 * i3x-via-mqtt Server Startup
 * Connects to MQTT broker and starts the i3x REST API
 */

import { createMqttClient, createMessageHandler, attachHandler } from './src/mqtt/index.js';
import { MappingEngine } from './src/mapping/engine.js';
import { SchemaMapper } from './src/mapping/schema-mapper.js';
import { ObjectStore } from './src/store/object-store.js';
import { codecRegistry } from './src/codecs/registry.js';
import { registerBuiltinCodecs } from './src/codecs/builtin.js';
import { MqttConfig, MappingRule } from './src/config/loader.js';
import { createServer } from './src/api/server.js';
import { SubscriptionManager } from './src/subscriptions/manager.js';

// Configuration
const mqttConfig: MqttConfig = {
  brokerUrl: 'mqtt://virtualfactory.proveit.services:1883',
  username: 'proveitreadonly',
  password: 'proveitreadonlypassword',
  clientId: `i3x-server-${Date.now()}`,
  clean: true,
  protocolVersion: 5,
};

const serverConfig = {
  port: 3000,
  host: '0.0.0.0',
};

const authConfig = {
  apiKeys: ['test-api-key'],  // Change in production!
};

// Mapping rules to capture data from the broker
const mappings: MappingRule[] = [
  {
    id: 'enterprise-three-level',
    topicPattern: '{enterprise}/{system}/{tag}',
    codec: 'json',
    namespaceUri: 'urn:proveit:{enterprise}',
    objectTypeId: '{system}',
    elementIdTemplate: '{enterprise}.{system}.{tag}',
    displayNameTemplate: '{tag}',
  },
  {
    id: 'enterprise-two-level',
    topicPattern: '{enterprise}/{tag}',
    codec: 'json',
    namespaceUri: 'urn:proveit:{enterprise}',
    objectTypeId: 'GenericTag',
    elementIdTemplate: '{enterprise}.{tag}',
    displayNameTemplate: '{tag}',
  },
];

async function main() {
  console.log('='.repeat(60));
  console.log('i3x-via-mqtt Server');
  console.log('='.repeat(60));
  console.log();

  // 1. Register built-in codecs
  console.log('[1/6] Registering codecs...');
  registerBuiltinCodecs();
  console.log(`  Codecs: ${codecRegistry.list().join(', ')}`);

  // 2. Set up mapping engine
  console.log('[2/6] Setting up mapping engine...');
  const mappingEngine = new MappingEngine();
  mappingEngine.addRules(mappings);
  console.log(`  Rules: ${mappings.length}`);

  // 3. Initialize stores
  console.log('[3/6] Initializing stores...');
  const objectStore = new ObjectStore();
  const subscriptionManager = new SubscriptionManager();
  const schemaMapper = new SchemaMapper();

  // Wire up subscription notifications
  objectStore.addChangeListener((elementId, value) => {
    subscriptionManager.notifyChange(elementId, value);
  });

  // Register a default namespace
  objectStore.registerNamespace({
    uri: 'urn:proveit:default',
    displayName: 'ProveIt Default',
  });

  console.log('  ObjectStore and SubscriptionManager ready');

  // 4. Connect to MQTT
  console.log('[4/6] Connecting to MQTT broker...');
  console.log(`  Broker: ${mqttConfig.brokerUrl}`);
  console.log(`  Username: ${mqttConfig.username}`);

  const mqttClient = createMqttClient(mqttConfig);
  const handler = createMessageHandler({
    mappingEngine,
    schemaMapper,
    objectStore,
  });
  attachHandler(mqttClient, handler);

  try {
    await mqttClient.connect();
    console.log('  Connected!');
  } catch (err) {
    console.error(`  Connection failed: ${err}`);
    process.exit(1);
  }

  // Subscribe to all topics
  console.log('[5/6] Subscribing to topics...');
  mqttClient.subscribe('#');
  console.log('  Subscribed to # (all topics)');

  // 5. Start API server
  console.log('[6/6] Starting API server...');
  const server = await createServer(
    serverConfig,
    authConfig,
    objectStore,
    subscriptionManager,
    mappingEngine,
    mqttClient
  );

  await server.listen({ port: serverConfig.port, host: serverConfig.host });
  console.log();
  console.log('='.repeat(60));
  console.log(`Server running at http://${serverConfig.host}:${serverConfig.port}`);
  console.log(`API Key: ${authConfig.apiKeys[0]}`);
  console.log('='.repeat(60));
  console.log();
  console.log('Endpoints:');
  console.log('  GET  /namespaces');
  console.log('  GET  /objecttypes');
  console.log('  GET  /objects');
  console.log('  POST /objects/value');
  console.log('  POST /subscriptions');
  console.log('  GET  /subscriptions/{id}/stream  (SSE)');
  console.log('  POST /subscriptions/{id}/sync');
  console.log('  GET  /admin/mappings');
  console.log('  POST /admin/mappings');
  console.log();
  console.log('Press Ctrl+C to stop');

  // Log stats periodically
  setInterval(() => {
    const stats = handler.getStats();
    const storeStats = objectStore.stats();
    console.log(`[Stats] MQTT: ${stats.received} recv, ${stats.processed} proc | Store: ${storeStats.values} values, ${storeStats.instances} instances`);
  }, 10000);

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await mqttClient.disconnect();
    await server.close();
    console.log('Goodbye!');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
