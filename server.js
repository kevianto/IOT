const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;

// ✅ Connect to MongoDB
mongoose.connect("mongodb+srv://kevianto:Kevianto@kevian-cluster.dxidl.mongodb.net/telemedic ", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));

// ✅ ECG Schema
const ecgSchema = new mongoose.Schema({
  ecg: Number,
  bpm: Number,
  rr: Number,
  hrv: Number,
  timestamp: {
    type: Date,
    default: Date.now,
  },
});
const ECG = mongoose.model("ECG", ecgSchema);

// ✅ Middleware
app.use(cors({
  origin: ["http://localhost:5173"],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(bodyParser.json());

// ✅ WebSocket Clients
let clients = [];
wss.on("connection", (ws) => {
  console.log("WebSocket client connected");
  clients.push(ws);

  ws.on("close", () => {
    console.log("WebSocket client disconnected");
    clients = clients.filter((client) => client !== ws);
  });
});

// ✅ POST /ecg: Receive ECG + Save & Broadcast
app.post("/ecg", async (req, res) => {
  const { ecg, bpm, rr, hrv } = req.body;

  if (ecg === undefined || bpm === undefined || rr === undefined || hrv === undefined) {
    return res.status(400).json({ error: "Missing ECG data fields" });
  }

  try {
    // Save to MongoDB
    const newReading = new ECG({ ecg, bpm, rr, hrv });
    await newReading.save();

    // Limit to latest 100 documents
    const totalCount = await ECG.countDocuments();
    if (totalCount > 100) {
      const excess = totalCount - 100;
      const oldest = await ECG.find().sort({ timestamp: 1 }).limit(excess);
      const idsToDelete = oldest.map(doc => doc._id);
      await ECG.deleteMany({ _id: { $in: idsToDelete } });
    }

    // Broadcast to WebSocket clients
    const payload = {
      ecg,
      bpm,
      rr,
      hrv,
      timestamp: new Date().toISOString(),
    };

    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(payload));
      }
    });

    res.status(200).json({ message: "ECG data saved and broadcasted" });
  } catch (error) {
    console.error("Error saving ECG:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ GET latest 100 entries (optional route)
app.get("/ecg/latest", async (req, res) => {
  try {
    const latest = await ECG.find().sort({ timestamp: -1 }).limit(100);
    res.json(latest.reverse()); // return oldest to newest
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch ECG data" });
  }
});

// ✅ Test route
app.get("/", (req, res) => {
  res.send("ECG WebSocket Server is running");
});

// ✅ Start Server
server.listen(PORT, () => {
  console.log(`HTTP & WebSocket server running at http://localhost:${PORT}`);
});
