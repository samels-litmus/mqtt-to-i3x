# mqtt-to-i3x

A protocol bridge that transforms raw MQTT messages into i3x-compliant REST API endpoints with real-time subscriptions and at-least-once delivery guarantees.

## Overview

**i3x-via-mqtt** extracts binary data from MQTT payloads at bit-level granularity, decodes them through pluggable codecs, maps to structured i3x object schemas, and exposes values via a live messaging API.

```
MQTT Broker          Data Pipeline                              i3x Clients
    │                                                               │
    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐       │
    └──│   Byte      │──│   Codec     │──│   Schema        │──┐    │
       │   Extractor │  │   Decoder   │  │   Mapper        │  │    │
       └─────────────┘  └─────────────┘  └─────────────────┘  │    │
                                                               │    │
       ┌──────────────────────────────────────────────────────┘    │
       │                                                            │
       │  ┌─────────────────┐    ┌──────────────────────────────┐  │
       └──│   Object Store  │────│   Subscription Manager       │──┘
          │   (canonical)   │    │   - SSE streams              │
          │                 │    │   - Sync queues              │
          └─────────────────┘    └──────────────────────────────┘
                                              │
          ┌───────────────────────────────────┘
          │
          │  ┌─────────────────────────────────────────────────┐
          └──│   i3x REST API (Fastify)                        │
             │   - Explore: /namespaces, /objecttypes, /objects│
             │   - Query: /objects/value                       │
             │   - Subscribe: /subscriptions/*/stream, /*/sync │
             │   - Admin: /admin/objecttypes, /admin/mappings  │
             └─────────────────────────────────────────────────┘
```

### Key Characteristics

- **Last-known-value only** - No history storage; each elementId has exactly one current value
- **Single canonical instance** - Upsert replaces, never appends
- **Read-only bridge** - No write-back to MQTT
- **At-least-once delivery** - Sync queues guarantee no missed updates
- **Bit-level extraction** - Industrial protocols pack data tightly; extraction handles any granularity

## Installation

```bash
npm install
npm run build
```

## Quick Start

```typescript
import {
  createMqttClient,
  createMessageHandler,
  attachHandler,
  MappingEngine,
  SchemaMapper,
  ObjectStore,
  SubscriptionManager,
  registerBuiltinCodecs,
  createServer,
} from './src/index.js';

// 1. Register built-in codecs
registerBuiltinCodecs();

// 2. Configure mapping rules
const mappingEngine = new MappingEngine();
mappingEngine.addRule({
  id: 'temperature-sensors',
  topicPattern: '{site}/sensors/temp/{sensorId}',
  codec: 'float32',
  extraction: { byteOffset: 0, byteLength: 4, endian: 'big' },
  namespaceUri: 'urn:factory:{site}',
  objectTypeId: 'TemperatureSensor',
  elementIdTemplate: 'temp.{site}.{sensorId}',
  displayNameTemplate: 'Temperature {sensorId} @ {site}',
});

// 3. Initialize stores
const objectStore = new ObjectStore();
const subscriptionManager = new SubscriptionManager();
const schemaMapper = new SchemaMapper();

// 4. Wire up subscription notifications
objectStore.addChangeListener((elementId, value) => {
  subscriptionManager.notifyChange(elementId, value);
});

// 5. Create MQTT client and handler
const mqttClient = createMqttClient({
  brokerUrl: 'mqtt://localhost:1883',
  clientId: 'i3x-bridge',
});

const handler = createMessageHandler({
  mappingEngine,
  schemaMapper,
  objectStore,
});

attachHandler(mqttClient, handler);

// 6. Connect and subscribe
await mqttClient.connect();
mqttClient.subscribe('+/sensors/temp/+');

// 7. Start API server
const server = await createServer(
  { port: 3000, host: '0.0.0.0' },
  { apiKeys: ['your-api-key'] },
  objectStore,
  subscriptionManager,
  mappingEngine,
  mqttClient
);

await server.listen({ port: 3000, host: '0.0.0.0' });
```

## Configuration

### YAML Configuration File

```yaml
server:
  port: 3000
  host: "0.0.0.0"

auth:
  apiKeys:
    - "secret-key-1"
    - "secret-key-2"

mqtt:
  brokerUrl: "mqtt://localhost:1883"
  clientId: "i3x-bridge"
  username: "user"
  password: "pass"
  protocolVersion: 5
  clean: true
  keepalive: 60
  reconnectPeriod: 5000

namespaces:
  - uri: "urn:factory"
    displayName: "Factory Floor"
  - uri: "urn:warehouse"
    displayName: "Warehouse"

objectTypes:
  - elementId: "TemperatureSensor"
    displayName: "Temperature Sensor"
    namespaceUri: "urn:factory"
    schema:
      type: number
      minimum: -40
      maximum: 125

mappings:
  - id: "factory-temp"
    topicPattern: "{site}/sensors/temp/{sensorId}"
    codec: float32
    extraction:
      byteOffset: 0
      byteLength: 4
      endian: big
    namespaceUri: "urn:factory"
    objectTypeId: "TemperatureSensor"
    elementIdTemplate: "temp.{site}.{sensorId}"
    displayNameTemplate: "Temperature Sensor {sensorId} @ {site}"
```

Load with:
```typescript
import { loadConfig } from './src/config/loader.js';
const config = loadConfig('./config/default.yaml');
```

## Mapping Rules

Mapping rules define how MQTT messages are transformed into i3x objects.

### Topic Pattern Matching

Use `{paramName}` syntax to capture segments from MQTT topics:

```yaml
topicPattern: "{namespace}/sensors/{type}/{id}"
```

Matches: `factory-A/sensors/temp/sensor-01`
Captures: `{ namespace: "factory-A", type: "temp", id: "sensor-01" }`

### Byte Extraction

Extract specific bytes or bits from payloads:

```yaml
# Extract 4 bytes starting at offset 2, little-endian
extraction:
  byteOffset: 2
  byteLength: 4
  endian: little

# Extract 4 bits starting at bit 32 (byte 4, bit 0)
extraction:
  bitOffset: 32
  bitLength: 4
```

### Template Rendering

Use captured parameters in templates:

```yaml
namespaceUri: "urn:factory:{site}"
elementIdTemplate: "{site}.{type}.{id}"
displayNameTemplate: "{type} Sensor {id} at {site}"
```

### Value Extraction (JSONPath)

For JSON payloads, extract specific fields:

```yaml
codec: json
valueExtractor: "$.temperature"
timestampExtractor: "$.timestamp"
qualityExtractor: "$.status"
```

### Complete Mapping Rule Reference

```typescript
interface MappingRule {
  id: string;                      // Unique rule identifier
  topicPattern: string;            // MQTT topic with {params}

  // Extraction (optional - omit to use entire payload)
  extraction?: {
    bitOffset?: number;            // Starting bit position
    bitLength?: number;            // Number of bits
    byteOffset?: number;           // Starting byte position
    byteLength?: number;           // Number of bytes
    endian?: 'big' | 'little';     // Multi-byte order (default: big)
  };

  // Decoding
  codec: string;                   // Codec name (see Built-in Codecs)
  codecOptions?: Record<string, unknown>;

  // i3x Schema Mapping
  namespaceUri?: string;           // Template for namespace
  objectTypeId?: string;           // Template for type ID
  elementIdTemplate?: string;      // Template for element ID
  displayNameTemplate?: string;    // Template for display name

  // Value Extraction (for object payloads)
  valueExtractor?: string;         // JSONPath to value
  timestampExtractor?: string;     // JSONPath to timestamp
  qualityExtractor?: string;       // JSONPath to quality
}
```

## Built-in Codecs

| Codec | Input | Output | Description |
|-------|-------|--------|-------------|
| `raw` | Buffer | Buffer | Pass-through |
| `utf8` | Buffer | string | UTF-8 text |
| `json` | Buffer | any | JSON parsing |
| `base64` | Buffer | Buffer | Base64 decode |
| `uint8` | Buffer | number | Unsigned 8-bit integer |
| `int8` | Buffer | number | Signed 8-bit integer |
| `uint16` | Buffer | number | Unsigned 16-bit integer |
| `int16` | Buffer | number | Signed 16-bit integer |
| `uint32` | Buffer | number | Unsigned 32-bit integer |
| `int32` | Buffer | number | Signed 32-bit integer |
| `float32` | Buffer | number | IEEE 754 single-precision |
| `float64` | Buffer | number | IEEE 754 double-precision |
| `protobuf` | Buffer | object | Protocol Buffers (requires schema) |
| `msgpack` | Buffer | any | MessagePack binary JSON |

Numeric codecs respect the `endian` option from extraction (default: big-endian).

## API Reference

All endpoints require authentication via Bearer token:
```
Authorization: Bearer your-api-key
```

### Explore API

#### GET /namespaces
List all registered namespaces.

**Response:**
```json
{
  "namespaces": [
    { "uri": "urn:factory", "displayName": "Factory Floor" }
  ]
}
```

#### GET /objecttypes
List object types. Optional filter: `?namespaceUri=urn:factory`

**Response:**
```json
{
  "objectTypes": [
    {
      "elementId": "TemperatureSensor",
      "displayName": "Temperature Sensor",
      "namespaceUri": "urn:factory",
      "schema": { "type": "number" }
    }
  ]
}
```

#### POST /objecttypes/query
Batch fetch specific types.

**Request:**
```json
{ "elementIds": ["TemperatureSensor", "PressureSensor"] }
```

#### GET /objects
List object instances. Optional filters: `?namespaceUri=...&typeId=...`

**Response:**
```json
{
  "objects": [
    {
      "elementId": "temp.factory-A.sensor-01",
      "displayName": "Temperature Sensor sensor-01 @ factory-A",
      "typeId": "TemperatureSensor",
      "namespaceUri": "urn:factory",
      "isComposition": false
    }
  ]
}
```

#### POST /objects/list
Batch fetch specific instances.

**Request:**
```json
{ "elementIds": ["temp.factory-A.sensor-01"] }
```

### Query API

#### POST /objects/value
Get last-known values for specified elements.

**Request:**
```json
{ "elementIds": ["temp.factory-A.sensor-01", "temp.factory-A.sensor-02"] }
```

**Response:**
```json
{
  "values": [
    {
      "elementId": "temp.factory-A.sensor-01",
      "value": 23.5,
      "timestamp": "2026-02-02T10:30:45.123Z",
      "quality": null
    }
  ]
}
```

#### POST /objects/history
Returns 501 Not Implemented (history not supported in this bridge).

### Subscription API

#### POST /subscriptions
Create a new subscription.

**Request:**
```json
{
  "monitoredItems": ["temp.factory-A.sensor-01"],
  "maxDepth": 0,
  "queueHighWaterMark": 10000
}
```

**Response:**
```json
{
  "subscriptionId": "550e8400-e29b-41d4-a716-446655440000",
  "createdAt": "2026-02-02T10:30:45.123Z",
  "monitoredItems": ["temp.factory-A.sensor-01"],
  "maxDepth": 0,
  "pendingCount": 0
}
```

#### GET /subscriptions
List all subscriptions.

#### GET /subscriptions/{id}
Get subscription details.

#### DELETE /subscriptions/{id}
Delete a subscription.

#### POST /subscriptions/{id}/register
Add monitored items to subscription.

**Request:**
```json
{ "elementIds": ["temp.factory-A.sensor-02"] }
```

#### POST /subscriptions/{id}/unregister
Remove monitored items from subscription.

**Request:**
```json
{ "elementIds": ["temp.factory-A.sensor-01"] }
```

#### GET /subscriptions/{id}/stream
Server-Sent Events stream for real-time updates.

```bash
curl -N http://localhost:3000/subscriptions/{id}/stream \
  -H "Authorization: Bearer your-api-key"
```

**Event format:**
```
: connected

data: {"elementId":"temp.factory-A.sensor-01","value":23.5,"timestamp":"..."}

data: {"elementId":"temp.factory-A.sensor-01","value":24.1,"timestamp":"..."}
```

#### POST /subscriptions/{id}/sync
Drain pending queue (at-least-once delivery).

**Response:**
```json
{
  "values": [
    { "elementId": "...", "value": 23.5, "timestamp": "..." },
    { "elementId": "...", "value": 24.1, "timestamp": "..." }
  ]
}
```

### Admin API

#### POST /admin/objecttypes
Create a new object type at runtime.

**Request:**
```json
{
  "elementId": "PressureSensor",
  "displayName": "Pressure Sensor",
  "namespaceUri": "urn:factory",
  "schema": { "type": "number", "unit": "psi" }
}
```

#### GET /admin/objecttypes/{elementId}
Get a specific object type.

#### PUT /admin/objecttypes/{elementId}
Update an object type.

**Request:**
```json
{
  "displayName": "Updated Name",
  "schema": { "type": "number" }
}
```

#### DELETE /admin/objecttypes/{elementId}
Delete an object type (fails if instances reference it).

#### GET /admin/mappings
List all mapping rules.

#### POST /admin/mappings
Create a new mapping rule at runtime.

**Request:**
```json
{
  "id": "new-mapping",
  "topicPattern": "test/{device}/temp",
  "codec": "json",
  "namespaceUri": "urn:test",
  "objectTypeId": "TemperatureSensor",
  "elementIdTemplate": "test.{device}.temp",
  "valueExtractor": "$.value"
}
```

When created, automatically subscribes to the corresponding MQTT topic pattern.

#### GET /admin/mappings/{id}
Get a specific mapping rule.

#### PUT /admin/mappings/{id}
Update a mapping rule.

#### DELETE /admin/mappings/{id}
Delete a mapping rule.

## Subscription Delivery Guarantees

The subscription system provides two delivery mechanisms:

### SSE Stream (Best-Effort Real-Time)
- Immediate delivery when connected
- Lost if connection drops
- Use for real-time dashboards

### Sync Queue (At-Least-Once)
- Values queued until explicitly drained via `/sync`
- Survives connection drops
- Use for reliable data collection

**Recommended Pattern:**
1. Connect to SSE stream for real-time updates
2. Periodically call `/sync` to catch any missed updates
3. Process values from both sources

### High Water Mark
Default queue limit is 10,000 entries. When exceeded, oldest entries are dropped. Configure via `queueHighWaterMark` when creating subscriptions.

## Data Models

### ObjectValue
```typescript
interface ObjectValue {
  elementId: string;     // Unique identifier
  value: unknown;        // Decoded value (number, string, object, etc.)
  timestamp: string;     // RFC 3339 ISO timestamp
  quality?: string;      // OPC UA quality code (optional)
}
```

### ObjectInstance
```typescript
interface ObjectInstance {
  elementId: string;
  displayName: string;
  typeId: string;
  parentId?: string;
  isComposition: boolean;
  namespaceUri: string;
}
```

### ObjectType
```typescript
interface ObjectType {
  elementId: string;
  displayName: string;
  namespaceUri: string;
  schema?: object;       // JSON Schema for validation
}
```

### Namespace
```typescript
interface Namespace {
  uri: string;
  displayName: string;
}
```

## Example: End-to-End Flow

### 1. MQTT Message Arrives
```
Topic: factory-A/sensors/temp/sensor-01
Payload: [0x42, 0x1c, 0x00, 0x00]  (39.5 as float32 big-endian)
```

### 2. Mapping Rule Matches
```yaml
- id: factory-temp
  topicPattern: "{site}/sensors/temp/{sensorId}"
  codec: float32
  extraction: { byteOffset: 0, byteLength: 4, endian: big }
  namespaceUri: "urn:factory"
  objectTypeId: "TemperatureSensor"
  elementIdTemplate: "temp.{site}.{sensorId}"
```

Captures: `{ site: "factory-A", sensorId: "sensor-01" }`

### 3. Value Stored
```json
{
  "elementId": "temp.factory-A.sensor-01",
  "value": 39.5,
  "timestamp": "2026-02-02T10:30:45.123Z"
}
```

### 4. Subscriptions Notified
All subscriptions monitoring `temp.factory-A.sensor-01` receive the update via SSE and/or sync queue.

### 5. API Query
```bash
curl -X POST http://localhost:3000/objects/value \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"elementIds":["temp.factory-A.sensor-01"]}'
```

## Running Tests

```bash
# Build
npm run build

# Run integration test (requires MQTT broker)
npx tsx test-integration.ts
```

The integration test verifies:
- MQTT connection and message receipt
- Full extraction/decode/map pipeline
- All API endpoints (Explore, Query, Subscribe, Admin)
- Authentication enforcement
- Subscription lifecycle

## Project Structure

```
i3x-via-mqtt/
├── src/
│   ├── index.ts                    # Entry point & exports
│   ├── config/
│   │   └── loader.ts               # YAML config parser
│   ├── extraction/
│   │   └── byte-extractor.ts       # Bit/byte extraction
│   ├── codecs/
│   │   ├── types.ts                # Codec interface
│   │   ├── registry.ts             # Codec registry
│   │   └── builtin.ts              # Built-in codecs
│   ├── mapping/
│   │   ├── template.ts             # Topic pattern matching
│   │   ├── engine.ts               # Mapping rule engine
│   │   └── schema-mapper.ts        # i3x schema mapping
│   ├── store/
│   │   └── object-store.ts         # Canonical in-memory store
│   ├── mqtt/
│   │   ├── client.ts               # MQTT connection wrapper
│   │   └── handler.ts              # Message pipeline orchestrator
│   ├── subscriptions/
│   │   └── manager.ts              # SSE + sync queue management
│   └── api/
│       ├── server.ts               # Fastify setup
│       ├── middleware/
│       │   └── auth.ts             # API key validation
│       └── routes/
│           ├── namespaces.ts
│           ├── object-types.ts
│           ├── objects.ts
│           ├── values.ts
│           ├── subscriptions.ts
│           ├── admin-types.ts
│           └── admin-mappings.ts
├── test-integration.ts             # End-to-end test
├── package.json
└── tsconfig.json
```

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `fastify` | ^5.7.4 | HTTP server framework |
| `mqtt` | ^5.15.0 | MQTT client library |
| `yaml` | ^2.3.4 | Configuration parsing |

## License

MIT
