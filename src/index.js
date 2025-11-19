require('dotenv').config();
const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const connectDB = require("./config");
const User = require("./models/User");
const { validateSignup, validateLogin, handleValidationErrors } = require('./middleware/validation');

const app = express();

/* ----------------------------- HEALTH CHECK ----------------------------- */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

/* ------------------------------ DATABASE ------------------------------ */
connectDB();

/* ----------------------------- SECURITY ----------------------------- */
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable strict CSP for Render
  })
);

/* ----------------------------- CORS ----------------------------- */
app.use(cors({
  origin: true, // allow all origins in production
  credentials: true,
}));

/* ----------------------------- RATE LIMITS ----------------------------- */
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
});

/* ----------------------------- SESSION ----------------------------- */
app.use(session({
  secret: process.env.SESSION_SECRET || "fallback-secret-change-this",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 14 * 24 * 60 * 60, // 14 days
    touchAfter: 24 * 3600,
  }),
  cookie: {
    secure: process.env.NODE_ENV === "production", // only over HTTPS
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 24 * 60 * 60 * 1000,
  }
}));

/* ----------------------------- CORE MIDDLEWARE ----------------------------- */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

/* ----------------------------- TRUST PROXY ----------------------------- */
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1); // required by Render for HTTPS cookies
}

/* ----------------------------- AUTH MIDDLEWARE ----------------------------- */
const requireAuth = (req, res, next) => {
  if (req.session?.userId) return next();
  res.redirect("/");
};

/* ----------------------------- ROUTES ----------------------------- */
app.get("/", (req, res) => {
  if (req.session?.userId) return res.redirect("/home");
  res.render("login");
});

app.get("/signup", (req, res) => {
  if (req.session?.userId) return res.redirect("/home");
  res.render("signup");
});

app.get("/home", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select("username");
    if (!user) {
      req.session.destroy();
      return res.redirect("/");
    }
    res.render("home", { username: user.username });
  } catch (err) {
    console.error("Home route error:", err);
    res.status(500).render("error", { message: "Server error occurred", backUrl: "/" });
  }
});

app.post("/signup", authLimiter, validateSignup, handleValidationErrors, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) {
      return res.status(400).render("error", { message: "Email or username already registered", backUrl: "/signup" });
    }

    const hashed = await bcrypt.hash(password, 12);
    await new User({ username, email, password: hashed }).save();

    res.redirect("/");
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).render("error", { message: "Registration failed. Try again.", backUrl: "/signup" });
  }
});

app.post("/login", authLimiter, validateLogin, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).render("error", { message: "Invalid email or password", backUrl: "/" });
    }

    req.session.userId = user._id;
    res.redirect("/home");
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).render("error", { message: "Login failed. Try again.", backUrl: "/" });
  }
});

app.post("/logout", requireAuth, (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

/* ----------------------------- 404 ----------------------------- */
app.use((req, res) => {
  res.status(404).render("error", { message: "Page not found", backUrl: "/" });
});

/* ----------------------------- START SERVER ----------------------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
