import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { connect as connectMQTT } from 'mqtt';
import 'dotenv/config';

const app = express();
const server = createServer(app);

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
  console.log('📡', topic, message);
  const [_, vin, type, key] = topic.split('/');

  if (type === 'v') {
    telemetryMap.set(`${vin}.${key}`, message);
    io.emit('telemetry', { key: `${vin}.${key}`, value: message });
  }
});

server.listen(PORT, () => {
  console.log(`🌐 HTTP listening on port ${PORT}`);
});
