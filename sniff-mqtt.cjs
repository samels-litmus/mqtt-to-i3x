// Quick MQTT sniffer to capture live messages from the ProveIT broker
const mqtt = require("mqtt");

const client = mqtt.connect("mqtt://virtualfactory.proveit.services:1883", {
  username: "proveitreadonly",
  password: "proveitreadonlypassword",
  clientId: "sniffer-" + Date.now(),
  clean: true,
  protocolVersion: 5,
});

const seen = new Map(); // topic -> { count, lastPayload, payloads: [] }

client.on("connect", () => {
  console.log("Connected to broker, subscribing to #...");
  client.subscribe("#", (err) => {
    if (err) console.error("Subscribe error:", err);
    else console.log("Subscribed to all topics (#)");
  });
});

client.on("message", (topic, message) => {
  let payload;
  try {
    payload = JSON.parse(message.toString());
  } catch {
    payload = message.toString().substring(0, 200);
  }

  if (!seen.has(topic)) {
    seen.set(topic, { count: 0, payloads: [] });
  }
  const entry = seen.get(topic);
  entry.count++;
  entry.lastPayload = payload;
  if (entry.payloads.length < 3) {
    entry.payloads.push(payload);
  }
});

// After 15 seconds, dump summary and exit
setTimeout(() => {
  console.log("\n=== MQTT MESSAGE SUMMARY (15 seconds) ===\n");
  console.log(`Total unique topics: ${seen.size}\n`);

  // Group by first segment
  const groups = new Map();
  for (const [topic, data] of seen) {
    const firstSeg = topic.split("/")[0];
    if (!groups.has(firstSeg)) groups.set(firstSeg, []);
    groups.get(firstSeg).push({ topic, ...data });
  }

  for (const [group, entries] of groups) {
    console.log(`\n--- Group: ${group} (${entries.length} topics) ---`);
    for (const e of entries.sort((a, b) => a.topic.localeCompare(b.topic))) {
      console.log(`\nTopic: ${e.topic}`);
      console.log(`  Messages received: ${e.count}`);
      console.log(`  Sample payload: ${JSON.stringify(e.lastPayload, null, 2)}`);
      if (e.payloads.length > 1) {
        console.log(`  Earlier payloads:`);
        for (const p of e.payloads.slice(0, 2)) {
          console.log(`    ${JSON.stringify(p)}`);
        }
      }
    }
  }

  client.end();
  process.exit(0);
}, 15000);
