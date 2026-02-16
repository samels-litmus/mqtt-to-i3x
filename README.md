# MQTT-to-i3X

A protocol bridge that transforms raw MQTT messages into i3X-compliant HTTP/S endpoints delivering CESMII SMProfile object models with real-time subscriptions.

## Overview

**MQTT-to-i3X** extracts binary data from MQTT payloads, decodes them through pluggable codecs, maps to structured i3X object schemas, and exposes values via a live messaging API.

```
MQTT Broker          Data Pipeline                              i3X Clients
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
          └──│   i3X REST API (Fastify)                        │
             │   - Explore: /namespaces, /objecttypes, /objects│
             │   - Query: /objects/value, /relationships       │
             │   - Subscribe: /subscriptions/*/stream, /*/sync │
             │   - Admin: /admin/objecttypes, /admin/mappings  │
             └─────────────────────────────────────────────────┘
```

## Quick Start

1. Edit `config.yaml` with your MQTT broker connection, i3X namespace configuration, and SM Profile object mapping rules
2. Run the server:

```bash
# Development (auto-reloads on file changes)
npm run dev

# Production
npm run build
npm start
```

By default the server loads `./config.yaml`. Pass a different config file as an argument:

```bash
# Dev
npx tsx src/server.ts ./my-config.yaml

# Production
node dist/server.js ./my-config.yaml
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
  clientId: "mqtt-to-i3x"
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

The server loads this file automatically at startup (see [Quick Start](#quick-start)).

## Mapping Rules

Mapping rules define how MQTT messages are transformed into i3X objects. NOTE: see /helpers for resources to assist AI-generation of Mapping Rules.

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

  // i3X Schema Mapping
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

#### POST /objects/related
Get objects related to a given element, with optional depth traversal.

**Request:**
```json
{
  "elementId": "temp.factory-A.sensor-01",
  "relationshipTypeId": "HasComponent",
  "depth": 2,
  "includeMetadata": true
}
```
- `elementId` — starting element (required)
- `relationshipTypeId` — filter to a specific relationship type (optional, omit for all types)
- `depth` — recursion depth, 0 = direct relatives only (default: 0)
- `includeMetadata` — include `typeId` and `isComposition` in response (default: false)

#### GET /relationshiptypes
List all relationship types. Optional filter: `?namespaceUri=...`

Built-in types: `HasParent`, `HasChildren`, `HasComponent`, `ComponentOf`.

#### POST /relationshiptypes/query
Batch fetch specific relationship types.

**Request:**
```json
{ "elementIds": ["HasComponent", "HasParent"] }
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

## Development

```bash
# Install dependencies
npm install

# Run in dev mode (auto-reloads on changes)
npm run dev

# Type-check without emitting
npx tsc --noEmit

# Build for production
npm run build

# Run production build
npm start
```

## Visualizer

Open `helpers/examples/EXAMPLE-i3X-server-visualizer.html` in a browser while the server is running to get an interactive force-directed graph of the entire object store. It connects to `http://localhost:3000` and renders all namespaces, object types, instances, and their relationships on a canvas.

- Click a namespace node to expand its children
- Click any container to drill deeper into the hierarchy
- Double-click a leaf node to open a detail overlay with its current value, properties, and relationships
- Use the search box to filter nodes by name or element ID
- "Expand All" progressively opens every level

No build step required — it's a standalone HTML file.

## Project Structure

```
mqtt-to-i3x/
├── config.yaml                      # Runtime configuration
├── helpers/
│   └── examples/
│       ├── EXAMPLE-config.yaml      # Example configuration
│       └── EXAMPLE-i3X-server-visualizer.html  # Interactive object store visualizer
├── src/
│   ├── server.ts                    # Entry point (dev & production)
│   ├── index.ts                     # Library re-exports
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
│   │   └── schema-mapper.ts        # i3X schema mapping
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
├── dist/                            # Compiled output (npm run build)
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
