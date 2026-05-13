import { Hono } from 'hono';
import { createAdaptorServer } from '@hono/node-server';
import { Server as SocketIOServer } from 'socket.io';
import { connect as connectMQTT } from 'mqtt';
import 'dotenv/config';

const app = new Hono();
const server = createAdaptorServer(app);

const PORT = process.env.PORT || 8080;
const MQTT_URL = process.env.MQTT_URL || 'mqtt://10.0.0.2:1883';

const telemetryMap = new Map<string, Map<string, any>>();

const io = new SocketIOServer(server, {
  cors: { origin: '*' },
});

io.on('connection', socket => {
  socket.on('subscribe', (vin: string) => {
    socket.join(`vin:${vin}`);
    const snap = telemetryMap.get(vin);
    if (snap) socket.emit('snapshot', Object.fromEntries(snap));
  });
  socket.on('unsubscribe', (vin: string) => {
    socket.leave(`vin:${vin}`);
  });
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
  const [, vin, type, key] = topic.split('/');

  if (type === 'v') {
    let vinMap = telemetryMap.get(vin);
    if (!vinMap) {
      vinMap = new Map();
      telemetryMap.set(vin, vinMap);
    }
    vinMap.set(key, value);
    io.to(`vin:${vin}`).emit('telemetry', { [key]: value });
  }
  if (process.env.NODE_ENV === 'development') {
    console.log('📡', topic, value);
  }
});

app.get('/telemetry/:vin', c => {
  const m = telemetryMap.get(c.req.param('vin'));
  return c.json(m ? Object.fromEntries(m) : {});
});

app.get('/telemetry', c => {
  const out: Record<string, Record<string, any>> = {};
  for (const [vin, m] of telemetryMap) out[vin] = Object.fromEntries(m);
  return c.json(out);
});

app.get('/health', c => {
  return c.body('OK', 200);
});

server.listen(PORT, () => {
  console.log(`🌐 HTTP listening on port ${PORT}`);
});
