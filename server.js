const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(bodyParser.json());

const PORT = 3000;

// Keep track of connected WebSocket clients
let clients = [];

wss.on("connection", (ws) => {
  console.log("WebSocket client connected");

  clients.push(ws);

  ws.on("close", () => {
    console.log("WebSocket client disconnected");
    clients = clients.filter((client) => client !== ws);
  });
});

// Endpoint to receive temperature data
app.post("/temperature", (req, res) => {
  const { groupName, temperature } = req.body;

  if (!groupName || temperature === undefined) {
    return res.status(400).json({ error: "groupName and temperature are required" });
  }

  console.log(`Group ${groupName} sent: ${temperature}°C`);

  const payload = {
    groupName,
    temperature,
    timestamp: new Date().toISOString(),
  };

  // Broadcast to all connected WebSocket clients
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  });

  res.status(200).json({ message: "Temperature received and broadcasted" });
});

// Optional test route
app.get("/", (req, res) => {
  res.send("ESP32 Temperature WebSocket Server is running");
});

server.listen(PORT, () => {
  console.log(`HTTP & WebSocket server running at http://localhost:${PORT}`);
});
