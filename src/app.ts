import { Hono } from 'hono';
import { createAdaptorServer } from '@hono/node-server';
import { Server as SocketIOServer } from 'socket.io';
import { connect as connectMQTT } from 'mqtt';
import 'dotenv/config';

const app = new Hono();
const server = createAdaptorServer(app);

const PORT = process.env.PORT || 8080;
const MQTT_URL = process.env.MQTT_URL || 'mqtt://10.0.0.2:1883';

const telemetryMap = new Map<string, any>();

const io = new SocketIOServer(server, {
  cors: { origin: '*' },
});

io.on('connection', socket => {
  socket.emit('telemetry', Object.fromEntries(telemetryMap));
});

const mqtt = connectMQTT(MQTT_URL);
mqtt.on('connect', () => {
  console.log('✅ Connected to MQTT:', MQTT_URL);
  mqtt.subscribe('tesla-fleet-telemetry/#', err => {
    err && console.error('❌ Failed to subscribe:', err);
  });
});

mqtt.on('message', (topic, message) => {
  const value = JSON.parse(message.toString());
  const [topicBase, vin, type, key] = topic.split('/');

  if (type === 'v') {
    io.emit('telemetry', { [key]: value });
    telemetryMap.set(key, value);
  }
  if (process.env.NODE_ENV === 'development') {
    console.log('📡', topic, value);
  }
});

app.get('/telemetry', c => {
  return c.json(Object.fromEntries(telemetryMap));
});

app.get('/health', c => {
  return c.body(null, 200);
});

server.listen(PORT, () => {
  console.log(`🌐 HTTP listening on port ${PORT}`);
});
