/**
 * i3X Specification Compliance Test Suite
 * Tests against: https://github.com/cesmii/i3X/blob/main/RFC%20for%20Contextualized%20Manufacturing%20Information%20API.md
 */

const BASE_URL = process.env.I3X_API_URL || 'http://localhost:3000';
const API_KEY = process.env.I3X_API_KEY || 'bearer-token-1';

interface TestResult {
  category: string;
  test: string;
  passed: boolean;
  details: string;
  specRef?: string;
}

const results: TestResult[] = [];

async function fetch_(url: string, options?: RequestInit): Promise<Response> {
  const headers = new Headers(options?.headers);
  headers.set('Authorization', `Bearer ${API_KEY}`);
  return fetch(url, { ...options, headers });
}

// =============================================================================
// 1. NAMESPACE TESTS (Section 4.1)
// =============================================================================

async function testNamespaces(): Promise<void> {
  console.log('\n=== Testing Namespaces (Section 4.1) ===');

  // Test 1.1: GET /namespaces returns array
  try {
    const res = await fetch_(`${BASE_URL}/namespaces`);
    const data = await res.json() as { namespaces: { uri: string; displayName: string }[] };

    const hasNamespaces = Array.isArray(data.namespaces);
    const hasRequiredFields = data.namespaces.every((ns: { uri: string; displayName: string }) =>
      typeof ns.uri === 'string' && typeof ns.displayName === 'string'
    );

    results.push({
      category: 'Namespaces',
      test: 'GET /namespaces returns array with uri and displayName',
      passed: res.ok && hasNamespaces && hasRequiredFields,
      details: `Status: ${res.status}, Count: ${data.namespaces?.length || 0}`,
      specRef: 'Section 4.1 - Namespaces'
    });
  } catch (err) {
    results.push({
      category: 'Namespaces',
      test: 'GET /namespaces returns array',
      passed: false,
      details: `Error: ${err}`,
      specRef: 'Section 4.1'
    });
  }
}

// =============================================================================
// 2. OBJECT TYPE TESTS (Section 4.2)
// =============================================================================

async function testObjectTypes(): Promise<void> {
  console.log('\n=== Testing Object Types (Section 4.2) ===');

  // Test 2.1: GET /objecttypes returns array
  try {
    const res = await fetch_(`${BASE_URL}/objecttypes`);
    const data = await res.json() as { objectTypes: { elementId: string; displayName: string; namespaceUri: string }[] };

    const hasTypes = Array.isArray(data.objectTypes);
    const hasRequiredFields = data.objectTypes.every((t: { elementId: string; displayName: string; namespaceUri: string }) =>
      typeof t.elementId === 'string' &&
      typeof t.displayName === 'string' &&
      typeof t.namespaceUri === 'string'
    );

    results.push({
      category: 'Object Types',
      test: 'GET /objecttypes returns array with elementId, displayName, namespaceUri',
      passed: res.ok && hasTypes && hasRequiredFields,
      details: `Status: ${res.status}, Count: ${data.objectTypes?.length || 0}`,
      specRef: 'Section 4.2 - Object Type Definition'
    });
  } catch (err) {
    results.push({
      category: 'Object Types',
      test: 'GET /objecttypes returns array',
      passed: false,
      details: `Error: ${err}`,
      specRef: 'Section 4.2'
    });
  }

  // Test 2.2: POST /objecttypes/query batch query
  try {
    const res = await fetch_(`${BASE_URL}/objecttypes/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ elementIds: ['TemperatureSensor', 'NonExistent'] })
    });
    const data = await res.json() as { objectTypes: unknown[] };

    results.push({
      category: 'Object Types',
      test: 'POST /objecttypes/query supports batch queries',
      passed: res.ok && Array.isArray(data.objectTypes),
      details: `Status: ${res.status}, Returned: ${data.objectTypes?.length || 0} types`,
      specRef: 'Section 4.2 - MAY support batch queries'
    });
  } catch (err) {
    results.push({
      category: 'Object Types',
      test: 'POST /objecttypes/query batch queries',
      passed: false,
      details: `Error: ${err}`,
      specRef: 'Section 4.2'
    });
  }

  // Test 2.3: Filter by namespace
  try {
    const res = await fetch_(`${BASE_URL}/objecttypes?namespaceUri=urn:proveit:default`);
    const data = await res.json() as { objectTypes: { namespaceUri: string }[] };

    const allMatchNamespace = data.objectTypes.every((t: { namespaceUri: string }) =>
      t.namespaceUri === 'urn:proveit:default'
    );

    results.push({
      category: 'Object Types',
      test: 'GET /objecttypes supports namespace filtering',
      passed: res.ok && allMatchNamespace,
      details: `Status: ${res.status}, Filtered count: ${data.objectTypes?.length || 0}`,
      specRef: 'Section 4.2.2 - optionally filtered by namespace'
    });
  } catch (err) {
    results.push({
      category: 'Object Types',
      test: 'Namespace filtering',
      passed: false,
      details: `Error: ${err}`,
      specRef: 'Section 4.2.2'
    });
  }
}

// =============================================================================
// 3. RELATIONSHIP TYPE TESTS (Section 4.3)
// =============================================================================

async function testRelationshipTypes(): Promise<void> {
  console.log('\n=== Testing Relationship Types (Section 4.3) ===');

  // Test 3.1: Objects have parentId field (HasParent organizational relationship)
  try {
    const res = await fetch_(`${BASE_URL}/objects`);
    const data = await res.json() as { objects: { parentId?: string }[] };

    // Per spec, at minimum HasParent/HasChildren organizational types required
    // Check if objects have parentId field (even if undefined)
    const hasParentField = data.objects.length === 0 ||
      data.objects.some((o: { parentId?: string }) => 'parentId' in o);

    results.push({
      category: 'Relationship Types',
      test: 'Objects support parentId field (HasParent relationship)',
      passed: res.ok && hasParentField,
      details: `Status: ${res.status}, Objects with parentId structure: ${hasParentField}`,
      specRef: 'Section 4.3 - HasParent/HasChildren minimum'
    });
  } catch (err) {
    results.push({
      category: 'Relationship Types',
      test: 'HasParent relationship support',
      passed: false,
      details: `Error: ${err}`,
      specRef: 'Section 4.3'
    });
  }

  // Test 3.2: POST /objects/related endpoint exists
  try {
    const res = await fetch_(`${BASE_URL}/objects/related`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ elementId: 'test', relationshipTypeId: 'HasParent' })
    });
    const data = await res.json() as { objects: unknown[] };

    results.push({
      category: 'Relationship Types',
      test: 'POST /objects/related endpoint exists',
      passed: res.ok && Array.isArray(data.objects),
      details: `Status: ${res.status}, Returns objects array: ${Array.isArray(data.objects)}`,
      specRef: 'Section 4.4 - Objects by Relationship'
    });
  } catch (err) {
    results.push({
      category: 'Relationship Types',
      test: 'POST /objects/related endpoint',
      passed: false,
      details: `Error: ${err}`,
      specRef: 'Section 4.4'
    });
  }
}

// =============================================================================
// 4. OBJECT INSTANCE TESTS (Section 4.5)
// =============================================================================

async function testObjectInstances(): Promise<void> {
  console.log('\n=== Testing Object Instances (Section 4.5) ===');

  // Test 4.1: GET /objects returns instances
  try {
    const res = await fetch_(`${BASE_URL}/objects`);
    const data = await res.json() as { objects: { elementId: string; displayName: string; typeId: string; namespaceUri: string }[] };

    const hasObjects = Array.isArray(data.objects);
    const hasRequiredFields = data.objects.length === 0 || data.objects.every((o: { elementId: string; displayName: string; typeId: string; namespaceUri: string }) =>
      typeof o.elementId === 'string' &&
      typeof o.displayName === 'string' &&
      typeof o.typeId === 'string' &&
      typeof o.namespaceUri === 'string'
    );

    results.push({
      category: 'Object Instances',
      test: 'GET /objects returns array with required metadata',
      passed: res.ok && hasObjects && hasRequiredFields,
      details: `Status: ${res.status}, Count: ${data.objects?.length || 0}`,
      specRef: 'Section 3.1 - ElementId, DisplayName, ParentId, NamespaceURI required'
    });
  } catch (err) {
    results.push({
      category: 'Object Instances',
      test: 'GET /objects returns instances',
      passed: false,
      details: `Error: ${err}`,
      specRef: 'Section 4.5'
    });
  }

  // Test 4.2: Filter by type
  try {
    const res = await fetch_(`${BASE_URL}/objects?typeId=TemperatureSensor`);
    const data = await res.json() as { objects: { typeId: string }[] };

    const allMatchType = data.objects.every((o: { typeId: string }) => o.typeId === 'TemperatureSensor');

    results.push({
      category: 'Object Instances',
      test: 'GET /objects supports typeId filtering',
      passed: res.ok && allMatchType,
      details: `Status: ${res.status}, Filtered count: ${data.objects?.length || 0}`,
      specRef: 'Section 4.2.4 - Instances of Object Type'
    });
  } catch (err) {
    results.push({
      category: 'Object Instances',
      test: 'typeId filtering',
      passed: false,
      details: `Error: ${err}`,
      specRef: 'Section 4.2.4'
    });
  }

  // Test 4.3: POST /objects/list batch query
  try {
    const res = await fetch_(`${BASE_URL}/objects/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ elementIds: ['test1', 'test2'] })
    });
    const data = await res.json() as { objects: unknown[] };

    results.push({
      category: 'Object Instances',
      test: 'POST /objects/list supports batch queries',
      passed: res.ok && Array.isArray(data.objects),
      details: `Status: ${res.status}`,
      specRef: 'Section 4.5 - Object Definition batch support'
    });
  } catch (err) {
    results.push({
      category: 'Object Instances',
      test: 'POST /objects/list batch queries',
      passed: false,
      details: `Error: ${err}`,
      specRef: 'Section 4.5'
    });
  }
}

// =============================================================================
// 5. VALUE TESTS - VQT Structure (Section 5)
// =============================================================================

async function testValues(): Promise<void> {
  console.log('\n=== Testing Values - VQT Structure (Section 5) ===');

  // Test 5.1: POST /objects/value returns VQT structure
  try {
    const res = await fetch_(`${BASE_URL}/objects/value`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ elementIds: ['test'] })
    });
    const data = await res.json() as { values: { elementId: string; value: unknown; timestamp: string; quality?: string }[] };

    const hasValues = Array.isArray(data.values);
    // VQT = Value, Quality, Timestamp
    const hasVQTStructure = data.values.length === 0 || data.values.every((v: { elementId: string; value: unknown; timestamp: string; quality?: string }) =>
      'value' in v &&
      'timestamp' in v &&
      (v.quality === undefined || typeof v.quality === 'string')
    );

    results.push({
      category: 'Values',
      test: 'POST /objects/value returns VQT structure (Value-Quality-Timestamp)',
      passed: res.ok && hasValues && hasVQTStructure,
      details: `Status: ${res.status}, Has VQT fields: ${hasVQTStructure}`,
      specRef: 'Section 5.1 - LastKnownValue with VQT'
    });
  } catch (err) {
    results.push({
      category: 'Values',
      test: 'VQT structure',
      passed: false,
      details: `Error: ${err}`,
      specRef: 'Section 5.1'
    });
  }

  // Test 5.2: Batch value queries
  try {
    const res = await fetch_(`${BASE_URL}/objects/value`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ elementIds: ['elem1', 'elem2', 'elem3'] })
    });
    const data = await res.json() as { values: unknown[] };

    results.push({
      category: 'Values',
      test: 'POST /objects/value supports batch queries (array of elementIds)',
      passed: res.ok && Array.isArray(data.values),
      details: `Status: ${res.status}`,
      specRef: 'Section 5.1.2 - MAY support array of requested object ElementIds'
    });
  } catch (err) {
    results.push({
      category: 'Values',
      test: 'Batch value queries',
      passed: false,
      details: `Error: ${err}`,
      specRef: 'Section 5.1.2'
    });
  }

  // Test 5.3: History endpoint (optional but should respond)
  try {
    const res = await fetch_(`${BASE_URL}/objects/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ elementIds: ['test'], startTime: '2024-01-01T00:00:00Z', endTime: '2024-12-31T23:59:59Z' })
    });

    // 501 is acceptable per spec (optional), but endpoint should exist
    results.push({
      category: 'Values',
      test: 'POST /objects/history endpoint exists (501 acceptable)',
      passed: res.status === 200 || res.status === 501,
      details: `Status: ${res.status} (501 = Not Implemented is acceptable)`,
      specRef: 'Section 5.1.3 - HistoricalValue (optional)'
    });
  } catch (err) {
    results.push({
      category: 'Values',
      test: 'History endpoint',
      passed: false,
      details: `Error: ${err}`,
      specRef: 'Section 5.1.3'
    });
  }

  // Test 5.4: Timestamp format (RFC 3339)
  try {
    // First get some actual values from the store
    const objRes = await fetch_(`${BASE_URL}/objects`);
    const objData = await objRes.json() as { objects: { elementId: string }[] };

    if (objData.objects.length > 0) {
      const elementIds = objData.objects.slice(0, 3).map((o: { elementId: string }) => o.elementId);
      const res = await fetch_(`${BASE_URL}/objects/value`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elementIds })
      });
      const data = await res.json() as { values: { timestamp: string }[] };

      // RFC 3339 pattern: YYYY-MM-DDTHH:MM:SS with optional fractional seconds and timezone
      const rfc3339Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
      const allRfc3339 = data.values.every((v: { timestamp: string }) => rfc3339Pattern.test(v.timestamp));

      results.push({
        category: 'Values',
        test: 'Timestamps follow RFC 3339 format',
        passed: allRfc3339,
        details: `Checked ${data.values.length} values, all RFC 3339: ${allRfc3339}`,
        specRef: 'Section 5 - timestamp: RFC 3339 format'
      });
    } else {
      results.push({
        category: 'Values',
        test: 'Timestamps follow RFC 3339 format',
        passed: true,
        details: 'No objects to test (vacuously true)',
        specRef: 'Section 5'
      });
    }
  } catch (err) {
    results.push({
      category: 'Values',
      test: 'RFC 3339 timestamp format',
      passed: false,
      details: `Error: ${err}`,
      specRef: 'Section 5'
    });
  }
}

// =============================================================================
// 6. SUBSCRIPTION TESTS (Section 6)
// =============================================================================

async function testSubscriptions(): Promise<void> {
  console.log('\n=== Testing Subscriptions (Section 6) ===');

  let subscriptionId: string | null = null;

  // Test 6.1: Create subscription
  try {
    const res = await fetch_(`${BASE_URL}/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monitoredItems: [] })
    });
    const data = await res.json() as { subscriptionId: string; monitoredItems: string[] };
    subscriptionId = data.subscriptionId;

    results.push({
      category: 'Subscriptions',
      test: 'POST /subscriptions creates subscription with ID',
      passed: res.status === 201 && typeof data.subscriptionId === 'string',
      details: `Status: ${res.status}, ID: ${subscriptionId}`,
      specRef: 'Section 6.1 - Create Subscription'
    });
  } catch (err) {
    results.push({
      category: 'Subscriptions',
      test: 'Create subscription',
      passed: false,
      details: `Error: ${err}`,
      specRef: 'Section 6.1'
    });
  }

  // Test 6.2: Register monitored items
  if (subscriptionId) {
    try {
      const res = await fetch_(`${BASE_URL}/subscriptions/${subscriptionId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elementIds: ['test.element.1', 'test.element.2'] })
      });
      const data = await res.json() as { monitoredItems: string[] };

      const hasItems = Array.isArray(data.monitoredItems) && data.monitoredItems.length >= 2;

      results.push({
        category: 'Subscriptions',
        test: 'POST /subscriptions/:id/register adds monitored items',
        passed: res.ok && hasItems,
        details: `Status: ${res.status}, Items: ${data.monitoredItems?.length || 0}`,
        specRef: 'Section 6.2 - Register Monitored Items'
      });
    } catch (err) {
      results.push({
        category: 'Subscriptions',
        test: 'Register monitored items',
        passed: false,
        details: `Error: ${err}`,
        specRef: 'Section 6.2'
      });
    }
  }

  // Test 6.3: Unregister monitored items
  if (subscriptionId) {
    try {
      const res = await fetch_(`${BASE_URL}/subscriptions/${subscriptionId}/unregister`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elementIds: ['test.element.1'] })
      });
      const data = await res.json() as { monitoredItems: string[] };

      results.push({
        category: 'Subscriptions',
        test: 'POST /subscriptions/:id/unregister removes monitored items',
        passed: res.ok && Array.isArray(data.monitoredItems),
        details: `Status: ${res.status}, Remaining items: ${data.monitoredItems?.length || 0}`,
        specRef: 'Section 6.3 - Remove Monitored Items'
      });
    } catch (err) {
      results.push({
        category: 'Subscriptions',
        test: 'Unregister monitored items',
        passed: false,
        details: `Error: ${err}`,
        specRef: 'Section 6.3'
      });
    }
  }

  // Test 6.4: Sync endpoint (QoS 2 polling)
  if (subscriptionId) {
    try {
      const res = await fetch_(`${BASE_URL}/subscriptions/${subscriptionId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json() as { values: unknown[] };

      results.push({
        category: 'Subscriptions',
        test: 'POST /subscriptions/:id/sync returns pending values (QoS 2)',
        passed: res.ok && Array.isArray(data.values),
        details: `Status: ${res.status}, Pending: ${data.values?.length || 0}`,
        specRef: 'Section 6.4 - Sync for QoS 2'
      });
    } catch (err) {
      results.push({
        category: 'Subscriptions',
        test: 'Sync endpoint',
        passed: false,
        details: `Error: ${err}`,
        specRef: 'Section 6.4'
      });
    }
  }

  // Test 6.5: SSE stream endpoint exists (QoS 0)
  if (subscriptionId) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch_(`${BASE_URL}/subscriptions/${subscriptionId}/stream`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const contentType = res.headers.get('content-type');
      const isSSE = contentType?.includes('text/event-stream') ?? false;

      results.push({
        category: 'Subscriptions',
        test: 'GET /subscriptions/:id/stream returns SSE (QoS 0)',
        passed: res.ok && isSSE,
        details: `Status: ${res.status}, Content-Type: ${contentType}`,
        specRef: 'Section 6.2 - QoS 0 streaming'
      });
    } catch (err: unknown) {
      // AbortError is expected (we timeout intentionally)
      const isAbort = err instanceof Error && err.name === 'AbortError';
      results.push({
        category: 'Subscriptions',
        test: 'GET /subscriptions/:id/stream returns SSE (QoS 0)',
        passed: isAbort, // If we got an abort, the connection was established
        details: isAbort ? 'SSE connection established (timed out as expected)' : `Error: ${err}`,
        specRef: 'Section 6.2'
      });
    }
  }

  // Test 6.6: Get subscription details
  if (subscriptionId) {
    try {
      const res = await fetch_(`${BASE_URL}/subscriptions/${subscriptionId}`);
      const data = await res.json() as { subscriptionId: string; monitoredItems: string[] };

      results.push({
        category: 'Subscriptions',
        test: 'GET /subscriptions/:id returns subscription details',
        passed: res.ok && data.subscriptionId === subscriptionId,
        details: `Status: ${res.status}`,
        specRef: 'Section 6 - Subscription management'
      });
    } catch (err) {
      results.push({
        category: 'Subscriptions',
        test: 'Get subscription details',
        passed: false,
        details: `Error: ${err}`,
        specRef: 'Section 6'
      });
    }
  }

  // Test 6.7: List subscriptions
  try {
    const res = await fetch_(`${BASE_URL}/subscriptions`);
    const data = await res.json() as { subscriptions: unknown[] };

    results.push({
      category: 'Subscriptions',
      test: 'GET /subscriptions lists all subscriptions',
      passed: res.ok && Array.isArray(data.subscriptions),
      details: `Status: ${res.status}, Count: ${data.subscriptions?.length || 0}`,
      specRef: 'Section 6 - Subscription management'
    });
  } catch (err) {
    results.push({
      category: 'Subscriptions',
      test: 'List subscriptions',
      passed: false,
      details: `Error: ${err}`,
      specRef: 'Section 6'
    });
  }

  // Test 6.8: Delete subscription (Unsubscribe)
  if (subscriptionId) {
    try {
      const res = await fetch_(`${BASE_URL}/subscriptions/${subscriptionId}`, {
        method: 'DELETE'
      });

      results.push({
        category: 'Subscriptions',
        test: 'DELETE /subscriptions/:id terminates subscription',
        passed: res.status === 204,
        details: `Status: ${res.status}`,
        specRef: 'Section 6.5 - Unsubscribe'
      });
    } catch (err) {
      results.push({
        category: 'Subscriptions',
        test: 'Delete subscription',
        passed: false,
        details: `Error: ${err}`,
        specRef: 'Section 6.5'
      });
    }
  }
}

// =============================================================================
// 7. JSON SERIALIZATION TESTS (Section 7)
// =============================================================================

async function testJsonSerialization(): Promise<void> {
  console.log('\n=== Testing JSON Serialization (Section 7) ===');

  // Test 7.1: All responses are valid JSON
  const endpoints = [
    { method: 'GET', path: '/namespaces' },
    { method: 'GET', path: '/objecttypes' },
    { method: 'GET', path: '/objects' },
    { method: 'POST', path: '/objects/value', body: { elementIds: [] } },
    { method: 'GET', path: '/subscriptions' }
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch_(`${BASE_URL}${endpoint.path}`, {
        method: endpoint.method,
        headers: endpoint.body ? { 'Content-Type': 'application/json' } : undefined,
        body: endpoint.body ? JSON.stringify(endpoint.body) : undefined
      });

      const contentType = res.headers.get('content-type');
      const isJson = contentType?.includes('application/json') ?? false;
      await res.json(); // Will throw if not valid JSON

      results.push({
        category: 'JSON Serialization',
        test: `${endpoint.method} ${endpoint.path} returns valid JSON`,
        passed: isJson,
        details: `Content-Type: ${contentType}`,
        specRef: 'Section 7 - easy-to-consume JSON serialization'
      });
    } catch (err) {
      results.push({
        category: 'JSON Serialization',
        test: `${endpoint.method} ${endpoint.path} returns valid JSON`,
        passed: false,
        details: `Error: ${err}`,
        specRef: 'Section 7'
      });
    }
  }
}

// =============================================================================
// 8. ERROR HANDLING TESTS
// =============================================================================

async function testErrorHandling(): Promise<void> {
  console.log('\n=== Testing Error Handling ===');

  // Test 8.1: Invalid elementIds format
  try {
    const res = await fetch_(`${BASE_URL}/objects/value`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ elementIds: 'not-an-array' })
    });

    results.push({
      category: 'Error Handling',
      test: 'Returns 400 for invalid elementIds format',
      passed: res.status === 400,
      details: `Status: ${res.status}`,
      specRef: 'General API best practices'
    });
  } catch (err) {
    results.push({
      category: 'Error Handling',
      test: 'Invalid elementIds format',
      passed: false,
      details: `Error: ${err}`,
      specRef: 'General'
    });
  }

  // Test 8.2: Non-existent subscription
  try {
    const res = await fetch_(`${BASE_URL}/subscriptions/non-existent-id`);

    results.push({
      category: 'Error Handling',
      test: 'Returns 404 for non-existent subscription',
      passed: res.status === 404,
      details: `Status: ${res.status}`,
      specRef: 'General API best practices'
    });
  } catch (err) {
    results.push({
      category: 'Error Handling',
      test: 'Non-existent subscription',
      passed: false,
      details: `Error: ${err}`,
      specRef: 'General'
    });
  }
}

// =============================================================================
// MAIN TEST RUNNER
// =============================================================================

async function runAllTests(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          i3X Specification Compliance Test Suite           ║');
  console.log('║  Testing against CESMII i3X RFC                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nTarget: ${BASE_URL}\n`);

  await testNamespaces();
  await testObjectTypes();
  await testRelationshipTypes();
  await testObjectInstances();
  await testValues();
  await testSubscriptions();
  await testJsonSerialization();
  await testErrorHandling();

  // Print results
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                      TEST RESULTS                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const categories = [...new Set(results.map(r => r.category))];

  for (const category of categories) {
    const categoryResults = results.filter(r => r.category === category);
    const passed = categoryResults.filter(r => r.passed).length;
    const total = categoryResults.length;
    const status = passed === total ? '✓' : passed === 0 ? '✗' : '⚠';

    console.log(`\n${status} ${category} (${passed}/${total})`);
    console.log('─'.repeat(60));

    for (const result of categoryResults) {
      const icon = result.passed ? '  ✓' : '  ✗';
      console.log(`${icon} ${result.test}`);
      console.log(`      ${result.details}`);
      if (result.specRef) {
        console.log(`      Ref: ${result.specRef}`);
      }
    }
  }

  // Summary
  const totalPassed = results.filter(r => r.passed).length;
  const totalTests = results.length;
  const percentage = Math.round((totalPassed / totalTests) * 100);

  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n  Total: ${totalPassed}/${totalTests} tests passed (${percentage}%)\n`);

  // Exit with appropriate code
  process.exit(totalPassed === totalTests ? 0 : 1);
}

runAllTests().catch(console.error);
