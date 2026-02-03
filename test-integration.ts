/**
 * Integration test for i3x-via-mqtt pipeline
 * Tests against live MQTT broker at virtualfactory.proveit.services
 * Covers all phases: Codecs, Mapping, MQTT, and API
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

// Test configuration
const mqttConfig: MqttConfig = {
  brokerUrl: 'mqtt://virtualfactory.proveit.services:1883',
  username: 'proveitreadonly',
  password: 'proveitreadonlypassword',
  clientId: `i3x-test-${Date.now()}`,
  clean: true,
  protocolVersion: 5,
};

// Generic mapping rule to capture any topic with JSON payload
const testMappings: MappingRule[] = [
  {
    id: 'catch-all-json',
    topicPattern: '{level1}/{level2}/{rest}',
    codec: 'json',
    namespaceUri: 'urn:proveit:{level1}',
    objectTypeId: '{level2}',
    elementIdTemplate: '{level1}.{level2}.{rest}',
    displayNameTemplate: '{level2} - {rest}',
  },
  {
    id: 'two-level',
    topicPattern: '{level1}/{level2}',
    codec: 'json',
    namespaceUri: 'urn:proveit:{level1}',
    objectTypeId: '{level2}',
    elementIdTemplate: '{level1}.{level2}',
    displayNameTemplate: '{level1}/{level2}',
  },
];

async function runTest() {
  console.log('='.repeat(60));
  console.log('i3x-via-mqtt Integration Test');
  console.log('='.repeat(60));
  console.log();

  // Phase 1: Register codecs
  console.log('[Phase 1] Registering built-in codecs...');
  registerBuiltinCodecs();
  console.log(`  ✓ Registered codecs: ${codecRegistry.list().join(', ')}`);
  console.log();

  // Phase 2: Set up mapping engine and store
  console.log('[Phase 2] Setting up mapping engine and object store...');
  const mappingEngine = new MappingEngine();
  mappingEngine.addRules(testMappings);
  console.log(`  ✓ Added ${testMappings.length} mapping rules`);
  console.log(`  ✓ Topic patterns: ${mappingEngine.getTopicPatterns().join(', ')}`);

  const schemaMapper = new SchemaMapper();
  const objectStore = new ObjectStore();

  // Add change listener to log updates
  const receivedUpdates: string[] = [];
  objectStore.addChangeListener((elementId, value) => {
    receivedUpdates.push(elementId);
    console.log(`  📥 Received: ${elementId} = ${JSON.stringify(value.value).slice(0, 80)}...`);
  });
  console.log('  ✓ Object store initialized with change listener');
  console.log();

  // Phase 3: Create MQTT client and message handler
  console.log('[Phase 3] Connecting to MQTT broker...');
  console.log(`  Broker: ${mqttConfig.brokerUrl}`);
  console.log(`  Username: ${mqttConfig.username}`);

  const client = createMqttClient(mqttConfig);
  const handler = createMessageHandler({ mappingEngine, schemaMapper, objectStore });
  attachHandler(client, handler);

  try {
    await client.connect();
    console.log(`  ✓ Connected! State: ${client.getState()}`);
  } catch (err) {
    console.error(`  ✗ Connection failed: ${err}`);
    process.exit(1);
  }

  // Subscribe to wildcard to discover available topics
  console.log();
  console.log('[Discovery] Subscribing to # (all topics)...');
  client.subscribe('#');
  console.log('  ✓ Subscribed to wildcard topic');
  console.log();

  // Wait for messages
  const testDuration = 10000; // 10 seconds
  console.log(`[Listening] Waiting ${testDuration / 1000}s for messages...`);
  console.log('-'.repeat(60));

  await new Promise((resolve) => setTimeout(resolve, testDuration));

  console.log('-'.repeat(60));
  console.log();

  // Report results
  const stats = handler.getStats();
  console.log('[Results]');
  console.log(`  Messages received: ${stats.received}`);
  console.log(`  Messages matched:  ${stats.matched}`);
  console.log(`  Messages processed: ${stats.processed}`);
  console.log(`  Errors: ${stats.errors}`);
  console.log();

  const storeStats = objectStore.stats();
  console.log('[Object Store]');
  console.log(`  Values stored: ${storeStats.values}`);
  console.log(`  Instances: ${storeStats.instances}`);
  console.log();

  if (storeStats.values > 0) {
    console.log('[Sample Data]');
    const instances = objectStore.getAllInstances().slice(0, 5);
    for (const inst of instances) {
      const value = objectStore.getValue(inst.elementId);
      console.log(`  ${inst.elementId}:`);
      console.log(`    Type: ${inst.typeId}`);
      console.log(`    Namespace: ${inst.namespaceUri}`);
      console.log(`    Value: ${JSON.stringify(value?.value).slice(0, 100)}`);
      console.log();
    }
  }

  // Disconnect
  console.log('[Cleanup] Disconnecting...');
  await client.disconnect();
  console.log('  ✓ Disconnected');
  console.log();

  // Phase 4: Test API endpoints
  console.log('[Phase 4] Testing i3x Explore API...');

  // Register a namespace and type for API testing
  objectStore.registerNamespace({ uri: 'urn:test:factory', displayName: 'Test Factory' });
  objectStore.registerType({
    elementId: 'TemperatureSensor',
    displayName: 'Temperature Sensor',
    namespaceUri: 'urn:test:factory',
    schema: { type: 'number' },
  });

  // Create subscription manager and wire up notifications
  const subscriptionManager = new SubscriptionManager();
  objectStore.addChangeListener((elementId, value) => {
    subscriptionManager.notifyChange(elementId, value);
  });

  const apiServer = await createServer(
    { port: 3001, host: '127.0.0.1' },
    { apiKeys: ['test-api-key'] },
    objectStore,
    subscriptionManager,
    mappingEngine  // Phase 6: Admin API needs mapping engine
  );

  await apiServer.listen({ port: 3001, host: '127.0.0.1' });
  console.log('  ✓ API server started on port 3001');

  // Test endpoints
  const baseUrl = 'http://127.0.0.1:3001';
  const headers = { Authorization: 'Bearer test-api-key' };

  let apiTestsPassed = 0;
  let apiTestsFailed = 0;

  // Test /namespaces
  try {
    const nsRes = await fetch(`${baseUrl}/namespaces`, { headers });
    const nsData = await nsRes.json() as { namespaces: unknown[] };
    if (nsRes.ok && Array.isArray(nsData.namespaces)) {
      console.log(`  ✓ GET /namespaces: ${nsData.namespaces.length} namespaces`);
      apiTestsPassed++;
    } else {
      console.log(`  ✗ GET /namespaces failed: ${nsRes.status}`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ GET /namespaces error: ${err}`);
    apiTestsFailed++;
  }

  // Test /objecttypes
  try {
    const typesRes = await fetch(`${baseUrl}/objecttypes`, { headers });
    const typesData = await typesRes.json() as { objectTypes: unknown[] };
    if (typesRes.ok && Array.isArray(typesData.objectTypes)) {
      console.log(`  ✓ GET /objecttypes: ${typesData.objectTypes.length} types`);
      apiTestsPassed++;
    } else {
      console.log(`  ✗ GET /objecttypes failed: ${typesRes.status}`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ GET /objecttypes error: ${err}`);
    apiTestsFailed++;
  }

  // Test /objecttypes with namespace filter
  try {
    const typesFilteredRes = await fetch(`${baseUrl}/objecttypes?namespaceUri=urn:test:factory`, { headers });
    const typesFilteredData = await typesFilteredRes.json() as { objectTypes: unknown[] };
    if (typesFilteredRes.ok && Array.isArray(typesFilteredData.objectTypes)) {
      console.log(`  ✓ GET /objecttypes?namespaceUri=...: ${typesFilteredData.objectTypes.length} types`);
      apiTestsPassed++;
    } else {
      console.log(`  ✗ GET /objecttypes?namespaceUri=... failed`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ GET /objecttypes?namespaceUri=... error: ${err}`);
    apiTestsFailed++;
  }

  // Test /objecttypes/query
  try {
    const queryRes = await fetch(`${baseUrl}/objecttypes/query`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ elementIds: ['TemperatureSensor', 'NonExistent'] }),
    });
    const queryData = await queryRes.json() as { objectTypes: unknown[] };
    if (queryRes.ok && Array.isArray(queryData.objectTypes)) {
      console.log(`  ✓ POST /objecttypes/query: ${queryData.objectTypes.length} types found`);
      apiTestsPassed++;
    } else {
      console.log(`  ✗ POST /objecttypes/query failed`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ POST /objecttypes/query error: ${err}`);
    apiTestsFailed++;
  }

  // Test /objects
  try {
    const objRes = await fetch(`${baseUrl}/objects`, { headers });
    const objData = await objRes.json() as { objects: unknown[] };
    if (objRes.ok && Array.isArray(objData.objects)) {
      console.log(`  ✓ GET /objects: ${objData.objects.length} objects`);
      apiTestsPassed++;
    } else {
      console.log(`  ✗ GET /objects failed: ${objRes.status}`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ GET /objects error: ${err}`);
    apiTestsFailed++;
  }

  // Test /objects/list
  try {
    const elementIds = objectStore.getAllInstances().slice(0, 3).map(i => i.elementId);
    const listRes = await fetch(`${baseUrl}/objects/list`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ elementIds }),
    });
    const listData = await listRes.json() as { objects: unknown[] };
    if (listRes.ok && Array.isArray(listData.objects)) {
      console.log(`  ✓ POST /objects/list: ${listData.objects.length} objects`);
      apiTestsPassed++;
    } else {
      console.log(`  ✗ POST /objects/list failed`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ POST /objects/list error: ${err}`);
    apiTestsFailed++;
  }

  // Test auth rejection (no token)
  try {
    const noAuthRes = await fetch(`${baseUrl}/namespaces`);
    if (noAuthRes.status === 401) {
      console.log('  ✓ Auth rejection: 401 without token');
      apiTestsPassed++;
    } else {
      console.log(`  ✗ Auth rejection: expected 401, got ${noAuthRes.status}`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ Auth rejection test error: ${err}`);
    apiTestsFailed++;
  }

  // Test auth rejection (bad token)
  try {
    const badAuthRes = await fetch(`${baseUrl}/namespaces`, {
      headers: { Authorization: 'Bearer wrong-key' },
    });
    if (badAuthRes.status === 403) {
      console.log('  ✓ Auth rejection: 403 with invalid token');
      apiTestsPassed++;
    } else {
      console.log(`  ✗ Auth rejection: expected 403, got ${badAuthRes.status}`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ Auth rejection test error: ${err}`);
    apiTestsFailed++;
  }

  console.log();
  console.log('[Phase 5] Testing i3x Query & Subscribe API...');

  // Test POST /objects/value
  try {
    const elementIds = objectStore.getAllInstances().slice(0, 3).map(i => i.elementId);
    const valueRes = await fetch(`${baseUrl}/objects/value`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ elementIds }),
    });
    const valueData = await valueRes.json() as { values: unknown[] };
    if (valueRes.ok && Array.isArray(valueData.values)) {
      console.log(`  ✓ POST /objects/value: ${valueData.values.length} values`);
      apiTestsPassed++;
    } else {
      console.log(`  ✗ POST /objects/value failed: ${valueRes.status}`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ POST /objects/value error: ${err}`);
    apiTestsFailed++;
  }

  // Test POST /objects/history (501 Not Implemented)
  try {
    const historyRes = await fetch(`${baseUrl}/objects/history`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ elementIds: ['test'] }),
    });
    if (historyRes.status === 501) {
      console.log('  ✓ POST /objects/history: 501 Not Implemented (expected)');
      apiTestsPassed++;
    } else {
      console.log(`  ✗ POST /objects/history: expected 501, got ${historyRes.status}`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ POST /objects/history error: ${err}`);
    apiTestsFailed++;
  }

  // Test subscription CRUD
  let subscriptionId = '';

  // POST /subscriptions - Create
  try {
    const createRes = await fetch(`${baseUrl}/subscriptions`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ monitoredItems: [], maxDepth: 0 }),
    });
    const createData = await createRes.json() as { subscriptionId: string; monitoredItems: string[] };
    if (createRes.status === 201 && createData.subscriptionId) {
      subscriptionId = createData.subscriptionId;
      console.log(`  ✓ POST /subscriptions: created ${subscriptionId.slice(0, 8)}...`);
      apiTestsPassed++;
    } else {
      console.log(`  ✗ POST /subscriptions failed: ${createRes.status}`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ POST /subscriptions error: ${err}`);
    apiTestsFailed++;
  }

  // GET /subscriptions - List
  try {
    const listRes = await fetch(`${baseUrl}/subscriptions`, { headers });
    const listData = await listRes.json() as { subscriptions: unknown[] };
    if (listRes.ok && Array.isArray(listData.subscriptions) && listData.subscriptions.length > 0) {
      console.log(`  ✓ GET /subscriptions: ${listData.subscriptions.length} subscriptions`);
      apiTestsPassed++;
    } else {
      console.log(`  ✗ GET /subscriptions failed or empty`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ GET /subscriptions error: ${err}`);
    apiTestsFailed++;
  }

  // GET /subscriptions/:id - Get details
  try {
    const getRes = await fetch(`${baseUrl}/subscriptions/${subscriptionId}`, { headers });
    const getData = await getRes.json() as { subscriptionId: string };
    if (getRes.ok && getData.subscriptionId === subscriptionId) {
      console.log(`  ✓ GET /subscriptions/:id: found subscription`);
      apiTestsPassed++;
    } else {
      console.log(`  ✗ GET /subscriptions/:id failed`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ GET /subscriptions/:id error: ${err}`);
    apiTestsFailed++;
  }

  // POST /subscriptions/:id/register - Add monitored items
  const testElementIds = objectStore.getAllInstances().slice(0, 2).map(i => i.elementId);
  try {
    const registerRes = await fetch(`${baseUrl}/subscriptions/${subscriptionId}/register`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ elementIds: testElementIds }),
    });
    const registerData = await registerRes.json() as { monitoredItems: string[] };
    if (registerRes.ok && registerData.monitoredItems?.length === testElementIds.length) {
      console.log(`  ✓ POST /subscriptions/:id/register: ${registerData.monitoredItems.length} items`);
      apiTestsPassed++;
    } else {
      console.log(`  ✗ POST /subscriptions/:id/register failed`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ POST /subscriptions/:id/register error: ${err}`);
    apiTestsFailed++;
  }

  // POST /subscriptions/:id/sync - Drain queue (should be empty initially)
  try {
    const syncRes = await fetch(`${baseUrl}/subscriptions/${subscriptionId}/sync`, {
      method: 'POST',
      headers,
    });
    const syncData = await syncRes.json() as { values: unknown[] };
    if (syncRes.ok && Array.isArray(syncData.values)) {
      console.log(`  ✓ POST /subscriptions/:id/sync: ${syncData.values.length} pending values`);
      apiTestsPassed++;
    } else {
      console.log(`  ✗ POST /subscriptions/:id/sync failed`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ POST /subscriptions/:id/sync error: ${err}`);
    apiTestsFailed++;
  }

  // POST /subscriptions/:id/unregister - Remove monitored items
  try {
    const unregisterRes = await fetch(`${baseUrl}/subscriptions/${subscriptionId}/unregister`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ elementIds: testElementIds.slice(0, 1) }),
    });
    const unregisterData = await unregisterRes.json() as { monitoredItems: string[] };
    if (unregisterRes.ok && unregisterData.monitoredItems?.length === testElementIds.length - 1) {
      console.log(`  ✓ POST /subscriptions/:id/unregister: now ${unregisterData.monitoredItems.length} items`);
      apiTestsPassed++;
    } else {
      console.log(`  ✗ POST /subscriptions/:id/unregister failed`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ POST /subscriptions/:id/unregister error: ${err}`);
    apiTestsFailed++;
  }

  // DELETE /subscriptions/:id - Delete subscription
  try {
    const deleteRes = await fetch(`${baseUrl}/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      headers,
    });
    if (deleteRes.status === 204) {
      console.log('  ✓ DELETE /subscriptions/:id: subscription deleted');
      apiTestsPassed++;
    } else {
      console.log(`  ✗ DELETE /subscriptions/:id: expected 204, got ${deleteRes.status}`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ DELETE /subscriptions/:id error: ${err}`);
    apiTestsFailed++;
  }

  // Verify deletion
  try {
    const verifyRes = await fetch(`${baseUrl}/subscriptions/${subscriptionId}`, { headers });
    if (verifyRes.status === 404) {
      console.log('  ✓ GET deleted subscription: 404 (expected)');
      apiTestsPassed++;
    } else {
      console.log(`  ✗ GET deleted subscription: expected 404, got ${verifyRes.status}`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ Verify deletion error: ${err}`);
    apiTestsFailed++;
  }

  console.log();
  console.log('[Phase 6] Testing Admin API...');

  // Test Admin ObjectType CRUD

  // POST /admin/objecttypes - Create new ObjectType
  try {
    const createTypeRes = await fetch(`${baseUrl}/admin/objecttypes`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        elementId: 'PressureSensor',
        displayName: 'Pressure Sensor',
        namespaceUri: 'urn:test:factory',
        schema: { type: 'number', unit: 'psi' },
      }),
    });
    const createTypeData = await createTypeRes.json() as { objectType: { elementId: string } };
    if (createTypeRes.status === 201 && createTypeData.objectType?.elementId === 'PressureSensor') {
      console.log('  ✓ POST /admin/objecttypes: created PressureSensor');
      apiTestsPassed++;
    } else {
      console.log(`  ✗ POST /admin/objecttypes failed: ${createTypeRes.status}`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ POST /admin/objecttypes error: ${err}`);
    apiTestsFailed++;
  }

  // POST /admin/objecttypes - Conflict (duplicate)
  try {
    const conflictRes = await fetch(`${baseUrl}/admin/objecttypes`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        elementId: 'PressureSensor',
        displayName: 'Duplicate',
        namespaceUri: 'urn:test:factory',
      }),
    });
    if (conflictRes.status === 409) {
      console.log('  ✓ POST /admin/objecttypes duplicate: 409 Conflict (expected)');
      apiTestsPassed++;
    } else {
      console.log(`  ✗ POST /admin/objecttypes duplicate: expected 409, got ${conflictRes.status}`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ POST /admin/objecttypes duplicate error: ${err}`);
    apiTestsFailed++;
  }

  // GET /admin/objecttypes/:elementId - Get specific type
  try {
    const getTypeRes = await fetch(`${baseUrl}/admin/objecttypes/PressureSensor`, { headers });
    const getTypeData = await getTypeRes.json() as { objectType: { elementId: string; displayName: string } };
    if (getTypeRes.ok && getTypeData.objectType?.elementId === 'PressureSensor') {
      console.log('  ✓ GET /admin/objecttypes/:elementId: found PressureSensor');
      apiTestsPassed++;
    } else {
      console.log(`  ✗ GET /admin/objecttypes/:elementId failed`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ GET /admin/objecttypes/:elementId error: ${err}`);
    apiTestsFailed++;
  }

  // PUT /admin/objecttypes/:elementId - Update type
  try {
    const updateTypeRes = await fetch(`${baseUrl}/admin/objecttypes/PressureSensor`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Pressure Sensor (Updated)',
        schema: { type: 'number', unit: 'bar' },
      }),
    });
    const updateTypeData = await updateTypeRes.json() as { objectType: { displayName: string } };
    if (updateTypeRes.ok && updateTypeData.objectType?.displayName === 'Pressure Sensor (Updated)') {
      console.log('  ✓ PUT /admin/objecttypes/:elementId: updated displayName');
      apiTestsPassed++;
    } else {
      console.log(`  ✗ PUT /admin/objecttypes/:elementId failed`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ PUT /admin/objecttypes/:elementId error: ${err}`);
    apiTestsFailed++;
  }

  // DELETE /admin/objecttypes/:elementId - Delete type
  try {
    const deleteTypeRes = await fetch(`${baseUrl}/admin/objecttypes/PressureSensor`, {
      method: 'DELETE',
      headers,
    });
    if (deleteTypeRes.status === 204) {
      console.log('  ✓ DELETE /admin/objecttypes/:elementId: deleted PressureSensor');
      apiTestsPassed++;
    } else {
      console.log(`  ✗ DELETE /admin/objecttypes/:elementId: expected 204, got ${deleteTypeRes.status}`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ DELETE /admin/objecttypes/:elementId error: ${err}`);
    apiTestsFailed++;
  }

  // Verify type deletion
  try {
    const verifyTypeRes = await fetch(`${baseUrl}/admin/objecttypes/PressureSensor`, { headers });
    if (verifyTypeRes.status === 404) {
      console.log('  ✓ GET deleted objecttype: 404 (expected)');
      apiTestsPassed++;
    } else {
      console.log(`  ✗ GET deleted objecttype: expected 404, got ${verifyTypeRes.status}`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ Verify type deletion error: ${err}`);
    apiTestsFailed++;
  }

  // Test Admin Mapping CRUD

  // GET /admin/mappings - List all mappings
  try {
    const listMappingsRes = await fetch(`${baseUrl}/admin/mappings`, { headers });
    const listMappingsData = await listMappingsRes.json() as { mappings: unknown[] };
    if (listMappingsRes.ok && Array.isArray(listMappingsData.mappings)) {
      console.log(`  ✓ GET /admin/mappings: ${listMappingsData.mappings.length} mappings`);
      apiTestsPassed++;
    } else {
      console.log(`  ✗ GET /admin/mappings failed`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ GET /admin/mappings error: ${err}`);
    apiTestsFailed++;
  }

  // POST /admin/mappings - Create new mapping
  try {
    const createMappingRes = await fetch(`${baseUrl}/admin/mappings`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'test-mapping',
        topicPattern: 'test/{device}/temperature',
        codec: 'json',
        namespaceUri: 'urn:test:factory',
        objectTypeId: 'TemperatureSensor',
        elementIdTemplate: 'test.{device}.temp',
        displayNameTemplate: 'Temperature {device}',
        valueExtractor: '$.value',
      }),
    });
    const createMappingData = await createMappingRes.json() as { mapping: { id: string } };
    if (createMappingRes.status === 201 && createMappingData.mapping?.id === 'test-mapping') {
      console.log('  ✓ POST /admin/mappings: created test-mapping');
      apiTestsPassed++;
    } else {
      console.log(`  ✗ POST /admin/mappings failed: ${createMappingRes.status}`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ POST /admin/mappings error: ${err}`);
    apiTestsFailed++;
  }

  // POST /admin/mappings - Conflict (duplicate)
  try {
    const conflictMappingRes = await fetch(`${baseUrl}/admin/mappings`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'test-mapping',
        topicPattern: 'another/pattern',
        codec: 'json',
      }),
    });
    if (conflictMappingRes.status === 409) {
      console.log('  ✓ POST /admin/mappings duplicate: 409 Conflict (expected)');
      apiTestsPassed++;
    } else {
      console.log(`  ✗ POST /admin/mappings duplicate: expected 409, got ${conflictMappingRes.status}`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ POST /admin/mappings duplicate error: ${err}`);
    apiTestsFailed++;
  }

  // GET /admin/mappings/:id - Get specific mapping
  try {
    const getMappingRes = await fetch(`${baseUrl}/admin/mappings/test-mapping`, { headers });
    const getMappingData = await getMappingRes.json() as { mapping: { id: string; topicPattern: string } };
    if (getMappingRes.ok && getMappingData.mapping?.id === 'test-mapping') {
      console.log('  ✓ GET /admin/mappings/:id: found test-mapping');
      apiTestsPassed++;
    } else {
      console.log(`  ✗ GET /admin/mappings/:id failed`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ GET /admin/mappings/:id error: ${err}`);
    apiTestsFailed++;
  }

  // PUT /admin/mappings/:id - Update mapping
  try {
    const updateMappingRes = await fetch(`${baseUrl}/admin/mappings/test-mapping`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topicPattern: 'test/{device}/temp-updated',
        valueExtractor: '$.reading',
      }),
    });
    const updateMappingData = await updateMappingRes.json() as { mapping: { topicPattern: string } };
    if (updateMappingRes.ok && updateMappingData.mapping?.topicPattern === 'test/{device}/temp-updated') {
      console.log('  ✓ PUT /admin/mappings/:id: updated topicPattern');
      apiTestsPassed++;
    } else {
      console.log(`  ✗ PUT /admin/mappings/:id failed`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ PUT /admin/mappings/:id error: ${err}`);
    apiTestsFailed++;
  }

  // DELETE /admin/mappings/:id - Delete mapping
  try {
    const deleteMappingRes = await fetch(`${baseUrl}/admin/mappings/test-mapping`, {
      method: 'DELETE',
      headers,
    });
    if (deleteMappingRes.status === 204) {
      console.log('  ✓ DELETE /admin/mappings/:id: deleted test-mapping');
      apiTestsPassed++;
    } else {
      console.log(`  ✗ DELETE /admin/mappings/:id: expected 204, got ${deleteMappingRes.status}`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ DELETE /admin/mappings/:id error: ${err}`);
    apiTestsFailed++;
  }

  // Verify mapping deletion
  try {
    const verifyMappingRes = await fetch(`${baseUrl}/admin/mappings/test-mapping`, { headers });
    if (verifyMappingRes.status === 404) {
      console.log('  ✓ GET deleted mapping: 404 (expected)');
      apiTestsPassed++;
    } else {
      console.log(`  ✗ GET deleted mapping: expected 404, got ${verifyMappingRes.status}`);
      apiTestsFailed++;
    }
  } catch (err) {
    console.log(`  ✗ Verify mapping deletion error: ${err}`);
    apiTestsFailed++;
  }

  await apiServer.close();
  console.log('  ✓ API server stopped');
  console.log();

  console.log('[API Results]');
  console.log(`  Tests passed: ${apiTestsPassed}`);
  console.log(`  Tests failed: ${apiTestsFailed}`);
  console.log();

  // Final verdict
  console.log('='.repeat(60));
  const pipelineOk = stats.received > 0 && stats.processed > 0;
  const apiOk = apiTestsFailed === 0;

  if (pipelineOk && apiOk) {
    console.log('✅ ALL TESTS PASSED: Full pipeline + API working');
  } else if (pipelineOk && !apiOk) {
    console.log('⚠️  PARTIAL: Pipeline OK but API tests failed');
  } else if (!pipelineOk && apiOk) {
    if (stats.received > 0 && stats.matched === 0) {
      console.log('⚠️  PARTIAL: API OK but no MQTT pattern matches');
      console.log('   (Topic patterns may need adjustment)');
    } else if (stats.received === 0) {
      console.log('⚠️  PARTIAL: API OK but no MQTT messages received');
      console.log('   (Broker may have no active publishers)');
    } else {
      console.log('⚠️  PARTIAL: API OK but MQTT processing errors');
    }
  } else {
    console.log('❌ TEST FAILED: Both pipeline and API have issues');
  }
  console.log('='.repeat(60));
}

runTest().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
