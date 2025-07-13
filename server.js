const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = 3000;

// ✅ Connect to MongoDB
mongoose.connect("mongodb+srv://kevianto:Kevianto@kevian-cluster.dxidl.mongodb.net/telemedic", {
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
  temperature: Number, // ✅ NEW
  timestamp: {
    type: Date,
    default: Date.now,
  },
});
const ECG = mongoose.model("ECG", ecgSchema);

// ✅ Patient Schema
const patientSchema = new mongoose.Schema({
  name: String,
  age: Number,
  gender: String,
  patientCode: String, // 6-digit code
  createdAt: {
    type: Date,
    default: Date.now,
  },
});
const Patient = mongoose.model("Patient", patientSchema);

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

// ✅ POST /ecg: Receive ECG + Temp + Save & Broadcast
app.post("/ecg", async (req, res) => {
  const { ecg, bpm, rr, hrv, temperature } = req.body;

  if ([ecg, bpm, rr, hrv, temperature].some((v) => v === undefined)) {
    return res.status(400).json({ error: "Missing one or more data fields" });
  }

  try {
    const newReading = new ECG({ ecg, bpm, rr, hrv, temperature });
    await newReading.save();

    // Limit to latest 100
    const totalCount = await ECG.countDocuments();
    if (totalCount > 100) {
      const excess = totalCount - 100;
      const oldest = await ECG.find().sort({ timestamp: 1 }).limit(excess);
      const idsToDelete = oldest.map(doc => doc._id);
      await ECG.deleteMany({ _id: { $in: idsToDelete } });
    }

    // WebSocket broadcast
    const payload = {
      ecg,
      bpm,
      rr,
      hrv,
      temperature,
      timestamp: new Date().toISOString(),
    };

    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(payload));
      }
    });

    res.status(200).json({ message: "Data saved and broadcasted" });
  } catch (error) {
    console.error("Error saving data:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ GET latest 100 ECG entries
app.get("/ecg/latest", async (req, res) => {
  try {
    const latest = await ECG.find().sort({ timestamp: -1 }).limit(100);
    res.json(latest.reverse());
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch ECG data" });
  }
});

// ✅ POST /patient: Register new patient
app.post("/patient", async (req, res) => {
  const { name, age, gender } = req.body;
  if (!name || !age || !gender) {
    return res.status(400).json({ error: "Missing patient fields" });
  }

  // Generate unique 6-digit code (e.g., last 6 of UUID)
  const patientCode = uuidv4().replace(/-/g, "").slice(0, 6).toUpperCase();

  try {
    const newPatient = new Patient({ name, age, gender, patientCode });
    await newPatient.save();

    res.status(201).json({ message: "Patient registered", patientCode });
  } catch (error) {
    console.error("Error saving patient:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Test route
app.get("/", (req, res) => {
  res.send("ECG WebSocket Server is running");
});

// ✅ Start server
server.listen(PORT, () => {
  console.log(`HTTP & WebSocket server running at http://localhost:${PORT}`);
});
