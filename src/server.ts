/**
 * MQTT-to-I3X Server Startup
 * Loads configuration from YAML file and starts the server
 */

import { createMqttClient, createMessageHandler, attachHandler } from './mqtt/index.js';
import { MappingEngine } from './mapping/engine.js';
import { SchemaMapper } from './mapping/schema-mapper.js';
import { ObjectStore } from './store/object-store.js';
import { codecRegistry } from './codecs/registry.js';
import { registerBuiltinCodecs } from './codecs/builtin.js';
import { loadConfig, AppConfig } from './config/loader.js';
import { createServer } from './api/server.js';
import { SubscriptionManager } from './subscriptions/manager.js';

function printUsage() {
  console.log(`
Usage: mqtt-to-i3x [config-file]

Arguments:
  config-file   Path to YAML configuration file (default: ./config.yaml)

Examples:
  mqtt-to-i3x                     # Uses ./config.yaml
  mqtt-to-i3x my-config.yaml`)
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const configPath = args[0] || './config.yaml';

  console.log('='.repeat(60));
  console.log('MQTT-to-I3X Server');
  console.log('='.repeat(60));
  console.log();

  // 1. Load configuration
  console.log('[1/7] Loading configuration...');
  console.log(`  File: ${configPath}`);

  let config: AppConfig;
  try {
    config = loadConfig(configPath);
    console.log('  Configuration loaded successfully');
  } catch (err) {
    console.error(`  ERROR: Failed to load configuration: ${err}`);
    console.error('  Make sure the config file exists and is valid YAML');
    process.exit(1);
  }

  // 2. Register built-in codecs
  console.log('[2/7] Registering codecs...');
  registerBuiltinCodecs();
  console.log(`  Built-in codecs: ${codecRegistry.list().join(', ')}`);

  // 3. Set up mapping engine
  console.log('[3/7] Setting up mapping engine...');
  const mappingEngine = new MappingEngine();
  mappingEngine.addRules(config.mappings);
  console.log(`  Rules loaded: ${config.mappings.length}`);
  for (const rule of config.mappings) {
    console.log(`    - ${rule.id}: ${rule.topicPattern}`);
  }

  // 4. Initialize stores
  console.log('[4/7] Initializing stores...');
  const objectStore = new ObjectStore();
  const subscriptionManager = new SubscriptionManager();
  const schemaMapper = new SchemaMapper();

  // Wire up subscription notifications
  objectStore.addChangeListener((elementId, value) => {
    subscriptionManager.notifyChange(elementId, value);
  });

  // Register namespaces from config
  for (const ns of config.namespaces) {
    objectStore.registerNamespace(ns);
    console.log(`  Namespace: ${ns.uri} (${ns.displayName})`);
  }

  // Register object types from config
  for (const objType of config.objectTypes) {
    objectStore.registerType({
      elementId: objType.elementId,
      displayName: objType.displayName,
      namespaceUri: objType.namespaceUri,
      schema: objType.schema,
    });
    console.log(`  ObjectType: ${objType.elementId}`);
  }

  console.log('  ObjectStore and SubscriptionManager ready');

  // 5. Connect to MQTT
  console.log('[5/7] Connecting to MQTT broker...');
  console.log(`  Broker: ${config.mqtt.brokerUrl}`);
  if (config.mqtt.username) {
    console.log(`  Username: ${config.mqtt.username}`);
  }

  const mqttConfig = {
    ...config.mqtt,
    clientId: `${config.mqtt.clientId || 'mqtt-to-i3x'}-${Date.now()}`,
  };

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

  // 6. Subscribe to topics based on mapping rules
  console.log('[6/7] Subscribing to topics...');

  // Subscribe to all topics to capture everything
  mqttClient.subscribe('#');
  console.log('  Subscribed to # (all topics)');

  // 7. Start API server
  console.log('[7/7] Starting API server...');
  const server = await createServer(
    config.server,
    config.auth,
    objectStore,
    subscriptionManager,
    mappingEngine,
    mqttClient
  );

  await server.listen({ port: config.server.port, host: config.server.host });
  const protocol = config.server.tls ? 'https' : 'http';
  console.log();
  console.log('='.repeat(60));
  console.log(`Server running at ${protocol}://${config.server.host}:${config.server.port}`);
  console.log(`API Keys: ${config.auth.apiKeys.length} configured`);
  console.log('='.repeat(60));
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
