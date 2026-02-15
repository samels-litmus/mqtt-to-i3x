# i3x-via-mqtt: System Architecture

## Core Purpose

**Extract any bytes from MQTT payloads → Encode/Decode → i3x Schema → Live Messaging API**

This application is a **protocol bridge** that:
1. Receives raw bytes from MQTT topics
2. Extracts and decodes data at byte/bit granularity
3. Places decoded values into i3x-compliant object schema
4. Serves values via i3x REST API with at-least-once delivery

**Key Constraints**:
- Last-known-value only (no history)
- Single canonical instance per object
- Read-only bridge (no write-back to MQTT)

---

## Data Pipeline Architecture

```
                              ┌──────────────────────────────────────────────────────────────┐
                              │                    DATA EXTRACTION PIPELINE                   │
                              │                                                              │
┌───────────────┐             │  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  MQTT Broker  │─────────────│─▶│   Byte      │───▶│   Codec     │───▶│   Schema        │  │
│  (raw bytes)  │             │  │   Extractor │    │   Decoder   │    │   Mapper        │  │
└───────────────┘             │  └─────────────┘    └─────────────┘    └────────┬────────┘  │
                              │       │                   │                     │           │
                              │  Extract bits/bytes   Decode to          Map to i3x       │
                              │  from payload         native types       ObjectValue       │
                              └──────────────────────────────────────────────────┼──────────┘
                                                                                 │
                                                                                 ▼
┌───────────────┐             ┌──────────────────────────────────────────────────────────────┐
│  i3x Clients  │◀────────────│                    LIVE MESSAGING LAYER                      │
│  (REST + SSE) │             │                                                              │
└───────────────┘             │  ┌─────────────────┐    ┌──────────────────────────────────┐ │
                              │  │   Object Store  │───▶│   Subscription Manager           │ │
                              │  │   (canonical)   │    │   - SSE streams                  │ │
                              │  │                 │    │   - Sync queues (at-least-once)  │ │
                              │  └─────────────────┘    └──────────────────────────────────┘ │
                              │                                                              │
                              │  ┌─────────────────────────────────────────────────────────┐ │
                              │  │   i3x REST API (Fastify)                                │ │
                              │  │   - Explore: /namespaces, /objecttypes, /objects        │ │
                              │  │   - Query: /objects/value                               │ │
                              │  │   - Subscribe: /subscriptions/*/stream, /*/sync         │ │
                              │  └─────────────────────────────────────────────────────────┘ │
                              └──────────────────────────────────────────────────────────────┘
```

---

## 1. Byte Extraction Layer

The first stage extracts raw data from MQTT payloads at bit-level granularity.

### Extraction Specification

```typescript
interface ByteExtraction {
  // Bit-level extraction (for packed sensor data)
  bitOffset?: number;         // Starting bit position (0-indexed)
  bitLength?: number;         // Number of bits to extract

  // Byte-level extraction
  byteOffset?: number;        // Starting byte position
  byteLength?: number;        // Number of bytes to extract

  // Endianness for multi-byte values
  endian?: 'big' | 'little';  // Default: big

  // If omitted, extract entire payload
}
```

### Extraction Examples

```yaml
# Extract bits 4-7 (4 bits) from byte 0 - a packed status nibble
extraction:
  bitOffset: 4
  bitLength: 4

# Extract bytes 2-5 as a 32-bit value, little-endian
extraction:
  byteOffset: 2
  byteLength: 4
  endian: little

# Extract entire payload (default)
extraction: {}
```

---

## 2. Codec Layer

Decodes extracted bytes into native JavaScript types.

### Built-in Codecs

| Codec | Input | Output | Use Case |
|-------|-------|--------|----------|
| `raw` | Buffer | Buffer | Pass-through for binary blobs |
| `utf8` | Buffer | string | Text payloads |
| `json` | Buffer | object | JSON-encoded payloads |
| `base64` | string | Buffer | Base64-encoded binary |
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

### Pluggable Codec Interface

```typescript
interface Codec {
  name: string;
  decode(input: Buffer, options?: Record<string, unknown>): unknown;
  // Optional: schema for protobuf, etc.
  schema?: unknown;
}

// Custom codec registration
registerCodec(codec: Codec): void;
```

### Codec Configuration

```yaml
# Decode 4 bytes as float32, big-endian
codec: float32

# Decode with protobuf schema
codec: protobuf
codecOptions:
  protoFile: "./schemas/sensor.proto"
  messageType: "SensorReading"

# Custom codec
codec: custom-modbus-register
```

---

## 3. Schema Mapping Layer

Maps decoded values into i3x ObjectValue structure.

### Mapping Rule Structure

```typescript
interface MappingRule {
  id: string;

  // Topic matching (mustache-style)
  topicPattern: string;           // e.g., "{namespace}/sensors/{type}/{id}"

  // Extraction specification
  extraction?: ByteExtraction;

  // Decoding specification
  codec: string;
  codecOptions?: Record<string, unknown>;

  // i3x mapping
  namespaceUri?: string;          // Override from topic capture
  objectTypeId?: string;          // Override from topic capture
  elementIdTemplate?: string;     // Template for elementId generation
  displayNameTemplate?: string;   // Template for displayName

  // Value extraction from decoded payload (JSONPath for objects)
  valueExtractor?: string;        // e.g., "$.temperature"
  timestampExtractor?: string;    // e.g., "$.timestamp"
  qualityExtractor?: string;      // e.g., "$.quality"
}
```

### Complete Mapping Example

```yaml
mappings:
  # JSON sensor payload
  - id: json-sensors
    topicPattern: "{site}/sensors/{sensorType}/{sensorId}"
    codec: json
    namespaceUri: "urn:factory:{site}"
    objectTypeId: "{sensorType}Sensor"
    elementIdTemplate: "{site}.{sensorType}.{sensorId}"
    displayNameTemplate: "{sensorType} Sensor {sensorId}"
    valueExtractor: "$.reading"
    timestampExtractor: "$.ts"

  # Binary packed sensor (16-bit temp at bytes 0-1, little-endian)
  - id: binary-temp
    topicPattern: "modbus/{deviceId}/registers"
    extraction:
      byteOffset: 0
      byteLength: 2
      endian: little
    codec: int16
    namespaceUri: "urn:modbus"
    objectTypeId: "TemperatureRegister"
    elementIdTemplate: "modbus.{deviceId}.temp"

  # Bit-packed status flags (bits 0-3 of byte 4)
  - id: status-flags
    topicPattern: "plc/{plcId}/status"
    extraction:
      bitOffset: 32  # byte 4, bit 0
      bitLength: 4
    codec: uint8
    objectTypeId: "StatusFlags"
    elementIdTemplate: "plc.{plcId}.flags"
```

---

## 4. Object Store (Canonical Repository)

Single source of truth for all i3x objects. **One instance per elementId, always replaced.**

### Core Data Models

```typescript
interface ObjectValue {
  elementId: string;
  value: unknown;             // Decoded, mapped value
  timestamp: string;          // RFC 3339 (from payload or receive time)
  quality?: string;           // OPC UA status code
}

interface ObjectInstance {
  elementId: string;
  displayName: string;
  typeId: string;
  parentId?: string;
  isComposition: boolean;
  namespaceUri: string;
}

interface ObjectType {
  elementId: string;
  displayName: string;
  namespaceUri: string;
  schema?: object;            // JSON Schema for validation
}

interface Namespace {
  uri: string;
  displayName: string;
}
```

### Store Operations

```typescript
class ObjectStore {
  // Canonical storage - one entry per elementId
  private values: Map<string, ObjectValue>;
  private instances: Map<string, ObjectInstance>;
  private types: Map<string, ObjectType>;
  private namespaces: Map<string, Namespace>;

  // Indices for efficient queries
  private byNamespace: Map<string, Set<string>>;
  private byType: Map<string, Set<string>>;

  // Core operation: upsert ALWAYS replaces
  upsert(elementId: string, value: ObjectValue, instance?: ObjectInstance): void {
    this.values.set(elementId, value);  // Replace, never append
    if (instance) {
      this.instances.set(elementId, instance);
      this.updateIndices(elementId, instance);
    }
    this.notifySubscribers(elementId, value);
  }

  // Read operations return references to canonical objects
  getValue(elementId: string): ObjectValue | undefined;
  getValues(elementIds: string[]): ObjectValue[];
}
```

---

## 5. Live Messaging API

### Delivery Guarantee: At-Least-Once

All value changes are queued per subscription until explicitly acknowledged via `/sync`.

```typescript
interface Subscription {
  subscriptionId: string;
  createdAt: string;
  monitoredItems: Set<string>;    // elementIds being watched
  maxDepth: number;

  // At-least-once delivery queue
  pendingQueue: ObjectValue[];    // Queued until sync drains
  queueHighWaterMark: number;     // Max queue size before dropping oldest
}

class SubscriptionManager {
  private subscriptions: Map<string, Subscription>;
  private sseConnections: Map<string, FastifyReply>;

  // Called by ObjectStore on value change
  notifyChange(elementId: string, value: ObjectValue): void {
    for (const [id, sub] of this.subscriptions) {
      if (sub.monitoredItems.has(elementId)) {
        // Always queue for at-least-once delivery
        sub.pendingQueue.push(value);

        // Also push to SSE if connected (best-effort real-time)
        const sse = this.sseConnections.get(id);
        if (sse) {
          sse.raw.write(`data: ${JSON.stringify(value)}\n\n`);
        }
      }
    }
  }

  // Drain and return queued updates
  sync(subscriptionId: string): ObjectValue[] {
    const sub = this.subscriptions.get(subscriptionId);
    const pending = sub.pendingQueue.splice(0);  // Drain queue
    return pending;
  }
}
```

### i3x API Endpoints

| Category | Endpoint | Method | Description |
|----------|----------|--------|-------------|
| **Explore** | `/namespaces` | GET | List all namespaces |
| | `/objecttypes` | GET | List object types (filter by namespace) |
| | `/objecttypes/query` | POST | Query types by elementIds |
| | `/relationshiptypes` | GET | List relationship types |
| | `/objects` | GET | List objects (filter by type/namespace) |
| | `/objects/list` | POST | Query objects by elementIds |
| | `/objects/related` | POST | Get related objects |
| **Query** | `/objects/value` | POST | Get last-known values |
| | `/objects/history` | POST | **501 Not Implemented** |
| **Update** | `/objects/{id}/value` | PUT | **501 Not Implemented** (read-only bridge) |
| **Subscribe** | `/subscriptions` | GET | List subscriptions |
| | `/subscriptions` | POST | Create subscription |
| | `/subscriptions/{id}` | GET | Get subscription details |
| | `/subscriptions/{id}` | DELETE | Delete subscription |
| | `/subscriptions/{id}/register` | POST | Add monitored items |
| | `/subscriptions/{id}/unregister` | POST | Remove monitored items |
| | `/subscriptions/{id}/stream` | GET | SSE real-time stream |
| | `/subscriptions/{id}/sync` | POST | Drain pending queue (at-least-once) |

---

## 6. MQTT Consumer

### Library
- **mqtt.js** (npm: `mqtt`) - Standard Node.js MQTT 3.1.1/5.0 client

### Configuration

```typescript
interface MqttConfig {
  brokerUrl: string;          // mqtt:// or mqtts://
  clientId?: string;
  username?: string;
  password?: string;
  clean?: boolean;
  keepalive?: number;
  reconnectPeriod?: number;
  protocolVersion?: 4 | 5;
  // TLS
  ca?: string;
  cert?: string;
  key?: string;
}
```

### Message Handler Flow

```typescript
mqttClient.on('message', (topic: string, payload: Buffer) => {
  // 1. Find matching mapping rule
  const rule = mappingEngine.match(topic);
  if (!rule) return;

  // 2. Extract bytes per rule
  const extracted = byteExtractor.extract(payload, rule.extraction);

  // 3. Decode via codec
  const decoded = codecRegistry.decode(rule.codec, extracted, rule.codecOptions);

  // 4. Map to i3x schema
  const { elementId, value, instance } = schemaMapper.map(rule, topic, decoded);

  // 5. Upsert to canonical store (triggers subscription notifications)
  objectStore.upsert(elementId, value, instance);
});
```

---

## 7. Configuration Structure

```yaml
server:
  port: 3000
  host: "0.0.0.0"

auth:
  apiKeys:
    - "your-api-key"

mqtt:
  brokerUrl: "mqtt://localhost:1883"
  protocolVersion: 5

namespaces:
  - uri: "urn:example:factory"
    displayName: "Factory"

objectTypes:
  - elementId: "TemperatureSensor"
    displayName: "Temperature Sensor"
    namespaceUri: "urn:example:factory"
    schema:
      type: number

codecs:
  # Register custom codecs
  custom:
    - name: "my-codec"
      module: "./codecs/my-codec.js"

mappings:
  - id: "temp-sensors"
    topicPattern: "{namespace}/temp/{id}"
    codec: float32
    extraction:
      byteOffset: 0
      byteLength: 4
    namespaceUri: "urn:example:factory"
    objectTypeId: "TemperatureSensor"
    elementIdTemplate: "temp.{id}"
```

---

## 8. Project Structure

```
i3x-via-mqtt/
├── src/
│   ├── index.ts                    # Entry point
│   ├── config/
│   │   └── loader.ts               # YAML config parser
│   ├── extraction/
│   │   └── byte-extractor.ts       # Bit/byte extraction
│   ├── codecs/
│   │   ├── registry.ts             # Codec registry
│   │   ├── builtin.ts              # Built-in codecs
│   │   └── types.ts                # Codec interface
│   ├── mapping/
│   │   ├── engine.ts               # Topic pattern matcher
│   │   ├── template.ts             # Mustache template parser
│   │   └── schema-mapper.ts        # i3x schema mapping
│   ├── mqtt/
│   │   ├── client.ts               # MQTT connection
│   │   └── handler.ts              # Message handler (pipeline orchestrator)
│   ├── store/
│   │   └── object-store.ts         # Canonical in-memory store
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
│           └── subscriptions.ts
├── config/
│   └── default.yaml
├── package.json
├── tsconfig.json
└── README.md
```

---

## Key Design Principles

1. **Canonical Single Instance**: Every elementId has exactly one value. Upsert replaces, never appends.

2. **Pipeline Composition**: Extract → Decode → Map → Store → Notify. Each stage is independent and testable.

3. **At-Least-Once Delivery**: Sync queues guarantee no missed updates. SSE provides best-effort real-time.

4. **Pluggable Codecs**: Built-in codecs cover common cases; custom codecs extend without core changes.

5. **Bit-Level Precision**: Industrial protocols pack data tightly. Extraction handles any granularity.

6. **Read-Only Bridge**: MQTT is the source of truth. i3x API is read-only (no write-back).

---

## Implementation Phases

### Phase 1: Extraction & Codec Foundation
- Byte/bit extractor
- Built-in codecs (numeric, json, base64, msgpack, protobuf)
- Codec registry with plugin support

### Phase 2: Mapping & Store
- Topic template matcher
- Schema mapper
- In-memory object store with indices

### Phase 3: MQTT Integration
- mqtt.js client with reconnection
- Message handler orchestrating pipeline

### Phase 4: i3x Explore API
- Fastify server with API key auth
- /namespaces, /objecttypes, /objects endpoints

### Phase 5: i3x Query & Subscribe API
- /objects/value endpoint
- Subscription CRUD
- SSE streaming
- Sync queue with at-least-once delivery

### Phase 6: Admin API
- Runtime ObjectType management
- Runtime mapping rule management

---

## Verification

1. **Unit Tests**: Byte extraction, each codec, template matching
2. **Integration Test**: Publish MQTT binary payload → verify i3x /objects/value response
3. **Subscription Test**: Subscribe → publish → verify SSE event and /sync response
4. **Compliance Check**: Compare response schemas against i3x.cesmii.net OpenAPI spec
