# Hyper-Detailed Atomic Task Plan: Add TLS to REST API

## Overview
Add HTTPS support to the Fastify REST API server. MQTT TLS already works.

---

## Files to Modify (in order)

### 1. `src/config/loader.ts`

**Task 1.1:** Add TLS fields to `AppConfig.server` interface

- **Line 51-52** - Extend the inline server type:
```typescript
// BEFORE:
server: { port: number; host: string };

// AFTER:
server: {
  port: number;
  host: string;
  tls?: {
    key: string;   // Path to PEM key file
    cert: string;  // Path to PEM cert file
    ca?: string;   // Optional CA cert path
  };
};
```

---

### 2. `src/api/server.ts`

**Task 2.1:** Update `ServerConfig` interface (lines 15-18)

```typescript
// BEFORE:
export interface ServerConfig {
  port: number;
  host: string;
}

// AFTER:
export interface ServerConfig {
  port: number;
  host: string;
  tls?: {
    key: string;
    cert: string;
    ca?: string;
  };
}
```

**Task 2.2:** Import `readFileSync` from `fs` (add at top)

```typescript
import { readFileSync } from 'fs';
```

**Task 2.3:** Modify `createServer` function (lines 37-47)

- Change parameter name from `_config` to `config` (line 38)
- Build Fastify options conditionally based on TLS config

```typescript
// BEFORE (lines 45-47):
const fastify = Fastify({
  logger: true,
});

// AFTER:
const httpsOptions = config.tls ? {
  https: {
    key: readFileSync(config.tls.key),
    cert: readFileSync(config.tls.cert),
    ...(config.tls.ca && { ca: readFileSync(config.tls.ca) }),
  },
} : {};

const fastify = Fastify({
  logger: true,
  ...httpsOptions,
});
```

---

### 3. `config.yaml` (optional - add example)

**Task 3.1:** Add commented TLS example to server section

```yaml
server:
  port: 3000
  host: "0.0.0.0"
  # Uncomment for HTTPS:
  # tls:
  #   key: "/path/to/server.key"
  #   cert: "/path/to/server.crt"
  #   ca: "/path/to/ca.crt"  # Optional
```

---

## Execution Checklist

| # | File | Change | Lines |
|---|------|--------|-------|
| 1.1 | src/config/loader.ts | Add tls to server type | ~51 |
| 2.1 | src/api/server.ts | Update ServerConfig interface | 15-18 |
| 2.2 | src/api/server.ts | Add fs import | 1 |
| 2.3 | src/api/server.ts | Add httpsOptions, modify Fastify() | 45-47 |
| 3.1 | config.yaml | Add commented TLS example | ~8-12 |

---

## Validation

After changes, server will:
- Start HTTP when no `tls` config present (current behavior)
- Start HTTPS when `tls.key` and `tls.cert` paths provided
- Log protocol in Fastify startup message

Test with:
```bash
# Generate test certs
openssl req -x509 -newkey rsa:4096 -keyout test.key -out test.crt -days 365 -nodes -subj "/CN=localhost"

# Add to config.yaml:
# tls:
#   key: "test.key"
#   cert: "test.crt"

# Verify
curl -k https://localhost:3000/namespaces
```
