import express from "express";
import multer from "multer";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const { Pool } = pkg;

const pool = new Pool({
  user: process.env.PGUSER || "postgres",
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "PMC_COMPLAINTS",
  password: process.env.PGPASSWORD || "meghaj",
  port: process.env.PGPORT || 5432,
});

pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL database successfully"))
  .catch((err) => console.error("❌ Database connection failed:", err.message));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("📁 Created uploads directory at", uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname))
});
const upload = multer({ storage });

// -----------------------------
// 🔐 JWT AUTH MIDDLEWARE
// -----------------------------
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token)
    return res.status(401).json({ message: "No token provided. Unauthorized." });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token." });
  }
}

// -----------------------------
// 🔐 ADMIN LOGIN
// -----------------------------
app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM admin_users WHERE username=$1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Invalid username" });
    }

    const admin = result.rows[0];

    const isMatch = await bcrypt.compare(password, admin.password_hash);

    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect password" });
    }

    // Generate JWT Token
    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({ message: "Login successful", token });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// -----------------------------
// PUBLIC ROUTES
// -----------------------------
app.get("/", (req, res) => {
  res.send("🚀 PMC Complaint Portal Backend is running!");
});

// Submit complaint
app.post("/api/complaints", upload.array("files", 5), async (req, res, next) => {
  try {
    const { fullname, phone, complaint_type, description, urgency, latitude, longitude } = req.body;

    const file_urls = (req.files || []).map((file) => `/uploads/${file.filename}`);

    const timestamp = new Date();

    const result = await pool.query(
      `INSERT INTO pmc_data (fullname, phone, complaint_type, description, urgency, latitude, longitude, timestamp, file_urls)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [fullname, phone, complaint_type, description, urgency, latitude, longitude, timestamp, JSON.stringify(file_urls)]
    );

    res.json({ message: "Complaint submitted successfully!", id: result.rows[0].id });

  } catch (err) {
    console.error("❌ Error inserting complaint:", err);
    next(err);
  }
});

// -----------------------------
// 🔐 PROTECTED ADMIN ROUTE — VIEW COMPLAINTS
// -----------------------------
app.get("/api/admin/complaints", verifyToken, async (req, res) => {
  try {
    const baseUrl = process.env.BASE_URL || "https://gist.aeronica.in";

    const result = await pool.query("SELECT * FROM pmc_data ORDER BY id DESC");

    const updated = result.rows.map((row) => {
      const files = typeof row.file_urls === "string" ? JSON.parse(row.file_urls) : row.file_urls;
      return {
        ...row,
        file_urls: files.map((f) => baseUrl + f)
      };
    });

    res.json(updated);

  } catch (err) {
    console.error("Error fetching complaints:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Error Handler
app.use((err, req, res, next) => {
  res.status(500).json({ message: "Internal Server Error", error: err.message });
});

app.listen(port, () =>
  console.log(`🚀 Server running on port ${port}`)
);
