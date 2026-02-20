const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Store connected users: { id: { ws, lat, lng, connectedAt } }
const users = new Map();

function broadcast(data, excludeId = null) {
  const message = JSON.stringify(data);
  users.forEach((user, id) => {
    if (id !== excludeId && user.ws.readyState === 1) {
      user.ws.send(message);
    }
  });
}

function getUsersList() {
  const list = [];
  users.forEach((user, id) => {
    list.push({
      id,
      lat: user.lat,
      lng: user.lng,
      connectedAt: user.connectedAt,
    });
  });
  return list;
}

wss.on('connection', (ws) => {
  const userId = uuidv4();
  const connectedAt = new Date().toISOString();

  users.set(userId, { ws, lat: null, lng: null, connectedAt });

  // Send the new user their ID and current users list
  ws.send(JSON.stringify({
    type: 'INIT',
    userId,
    users: getUsersList().filter(u => u.id !== userId),
  }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'UPDATE_LOCATION') {
        const { lat, lng } = msg;
        const user = users.get(userId);
        if (user) {
          user.lat = lat;
          user.lng = lng;
        }

        // Broadcast to everyone else
        broadcast({
          type: 'USER_UPDATED',
          user: { id: userId, lat, lng, connectedAt },
        }, userId);
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  });

  ws.on('close', () => {
    users.delete(userId);
    broadcast({ type: 'USER_LEFT', userId });
    console.log(`User disconnected: ${userId}. Total: ${users.size}`);
  });

  ws.on('error', (err) => {
    console.error(`WS error for ${userId}:`, err.message);
    users.delete(userId);
  });

  console.log(`User connected: ${userId}. Total: ${users.size}`);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', users: users.size });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
