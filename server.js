import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Middleware setup
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Serve static files (uploads + frontend)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, ".")));

// ✅ PostgreSQL connection (Render + local support)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // ✅ Prefer DATABASE_URL on Render
  user: process.env.PGUSER || "postgres",
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "postgres",
  password: process.env.PGPASSWORD || "meghaj",
  port: process.env.PGPORT || 5432,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false } // ✅ Required for Render SSL
      : false,
});

// ✅ Test database connection
pool
  .connect()
  .then(() => console.log("✅ Connected to PostgreSQL database successfully"))
  .catch((err) =>
    console.error("❌ Database connection failed:", err.message)
  );

// ✅ Ensure uploads folder exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// ✅ Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

// ✅ API route to handle complaints
app.post("/api/complaints", upload.array("files", 5), async (req, res) => {
  try {
    const {
      fullname,
      phone,
      complaint_type,
      description,
      urgency,
      latitude,
      longitude,
    } = req.body;

    const serverBaseUrl =
      process.env.RENDER_EXTERNAL_URL ||
      `http://localhost:${process.env.PORT || 3000}`;

    const fileUrls = req.files.map(
      (file) => `${serverBaseUrl}/uploads/${file.filename}`
    );

    const query = `
      INSERT INTO pmc_data 
      (fullname, phone, complaint_type, description, urgency, latitude, longitude, file_urls) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    await pool.query(query, [
      fullname,
      phone,
      complaint_type,
      description,
      urgency,
      latitude || null,
      longitude || null,
      JSON.stringify(fileUrls),
    ]);

    res
      .status(200)
      .json({ success: true, message: "✅ Complaint submitted successfully!" });
  } catch (err) {
    console.error("❌ Error submitting complaint:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ Health check route
app.get("/api/status", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.status(200).json({
      success: true,
      message: "Backend & Database are running fine 🚀",
      time: result.rows[0].now,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Database not reachable",
      error: err.message,
    });
  }
});

// ✅ Serve main frontend page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ✅ Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
