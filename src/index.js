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
  });
});

/* ------------------------------ DATABASE ------------------------------ */
connectDB();

/* ----------------------------- SECURITY ----------------------------- */
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

/* ----------------------------- CORS ----------------------------- */
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

/* ----------------------------- RATE LIMITS ----------------------------- */
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
  })
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
});

/* ----------------------------- SESSION ----------------------------- */
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      ttl: 14 * 24 * 60 * 60, // 14 days
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

/* ----------------------------- CORE MIDDLEWARE ----------------------------- */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

/* ----------------------------- TRUST PROXY (REQUIRED BY RENDER) ----------------------------- */
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

/* ----------------------------- AUTH MIDDLEWARE ----------------------------- */
const requireAuth = (req, res, next) => {
  if (req.session?.userId) return next();
  res.redirect("/");
};

/* ----------------------------- ROUTES ----------------------------- */

// LOGIN PAGE
app.get("/", (req, res) => {
  if (req.session?.userId) return res.redirect("/home");
  res.render("login");
});

// SIGNUP PAGE
app.get("/signup", (req, res) => {
  if (req.session?.userId) return res.redirect("/home");
  res.render("signup");
});

// HOME (PROTECTED)
app.get("/home", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select("username");
    if (!user) {
      req.session.destroy();
      return res.redirect("/");
    }

    res.render("home", { username: user.username });
  } catch (error) {
    console.error("Home route error:", error);
    res.status(500).render("error", {
      message: "Server error occurred",
      backUrl: "/",
    });
  }
});

// SIGNUP
app.post("/signup", authLimiter, validateSignup, handleValidationErrors, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const existing = await User.findOne({
      $or: [{ username }, { email }],
    });

    if (existing) {
      return res.status(400).render("error", {
        message: "Email or username already registered",
        backUrl: "/signup",
      });
    }

    const hashed = await bcrypt.hash(password, 12);

    await new User({
      username,
      email,
      password: hashed,
    }).save();

    res.redirect("/");
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).render("error", {
      message: "Registration failed. Try again.",
      backUrl: "/signup",
    });
  }
});

// LOGIN
app.post("/login", authLimiter, validateLogin, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).render("error", {
        message: "Invalid email or password",
        backUrl: "/",
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).render("error", {
        message: "Invalid email or password",
        backUrl: "/",
      });
    }

    req.session.userId = user._id;

    res.redirect("/home");
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).render("error", {
      message: "Login failed. Try again.",
      backUrl: "/",
    });
  }
});

// LOGOUT
app.post("/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

/* ----------------------------- 404 ----------------------------- */
app.use((req, res) => {
  res.status(404).render("error", {
    message: "Page not found",
    backUrl: "/",
  });
});

/* ----------------------------- START SERVER ----------------------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
