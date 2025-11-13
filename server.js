import express from "express";
import multer from "multer";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import fs from "fs";
import path from "path";
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
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });


app.get("/", (req, res) => {
  res.send("🚀 PMC Complaint Portal Backend is running!");
});

app.post("/api/complaints", upload.array("files", 5), async (req, res, next) => {
  try {
    console.log("📥 Received complaint:", req.body);
    console.log("📎 Files uploaded:", req.files);

    const { fullname, phone, complaint_type, description, urgency, latitude, longitude } = req.body;

    if (!fullname || !phone || !complaint_type || !description || !urgency) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const file_urls = (req.files && req.files.length > 0)
      ? req.files.map((file) => `/uploads/${file.filename}`)
      : [];

    const timestamp = new Date();

    const insertQuery = `
      INSERT INTO pmc_data (fullname, phone, complaint_type, description, urgency, latitude, longitude, timestamp, file_urls)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id;
    `;

    const values = [fullname, phone, complaint_type, description, urgency, latitude, longitude, timestamp, JSON.stringify(file_urls)];

    const result = await pool.query(insertQuery, values);
    console.log("✅ Complaint inserted with ID:", result.rows[0].id);

    res.status(200).json({ message: "Complaint submitted successfully!", id: result.rows[0].id });
  } catch (err) {
    console.error("❌ Error inserting complaint:", err);
    next(err);
  }
});
app.get("/api/complaints", async (req, res) => {
  try {
    const baseUrl = process.env.BASE_URL || "https://gist.aeronica.in";

    const result = await pool.query("SELECT * FROM pmc_data ORDER BY id DESC");
    
    const updatedRows = result.rows.map((item) => {
      let files = [];

      try {
        if (Array.isArray(item.file_urls)) {
          // Already an array
          files = item.file_urls;
        } else if (typeof item.file_urls === "string") {
          // Convert string → array
          files = JSON.parse(item.file_urls);
        } else {
          files = [];
        }
      } catch (e) {
        files = [];
      }

      // Convert /uploads/xxx → https://domain/uploads/xxx
      const fullUrls = files.map((p) => `${baseUrl}${p}`);

      return {
        ...item,
        file_urls: fullUrls
      };
    });

    res.json(updatedRows);
  } catch (err) {
    console.error("❌ Error in GET /api/complaints:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});




app.use((err, req, res, next) => {
  console.error("❌ Internal Server Error:", err);
  res.status(500).json({
    message: "Internal Server Error",
    error: err.message,
  });
});


app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
