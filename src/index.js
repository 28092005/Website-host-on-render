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

// Add health check route first
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

connectDB();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? true : 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Auth rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts, please try again later.'
});

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-this',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/mini_project'
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Body parsing middleware
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, "../public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

// Trust proxy for Render deployment
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/');
};

// Routes
app.get("/", (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/home');
  }
  res.render("login");
});

app.get("/signup", (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/home');
  }
  res.render("signup");
});

app.get("/home", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select('username');
    if (!user) {
      req.session.destroy();
      return res.redirect('/');
    }
    res.render("home", { username: user.username });
  } catch (error) {
    console.error('Home route error:', error.message);
    res.status(500).render('error', { 
      message: 'Server error occurred',
      backUrl: '/'
    });
  }
});

app.post("/signup", authLimiter, validateSignup, handleValidationErrors, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check for existing user
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      return res.status(400).render('error', {
        message: 'Email or username already registered',
        backUrl: '/signup'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();

    res.redirect("/");
  } catch (error) {
    console.error('Signup error:', error.message);
    res.status(500).render('error', {
      message: 'Registration failed. Please try again.',
      backUrl: '/signup'
    });
  }
});

app.post("/login", authLimiter, validateLogin, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).render('error', {
        message: 'Invalid email or password',
        backUrl: '/'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).render('error', {
        message: 'Invalid email or password',
        backUrl: '/'
      });
    }

    // Create session
    req.session.userId = user._id;
    res.redirect('/home');
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).render('error', {
      message: 'Login failed. Please try again.',
      backUrl: '/'
    });
  }
});

app.post('/logout', requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err.message);
    }
    res.redirect('/');
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).render('error', {
    message: 'Something went wrong. Please try again.',
    backUrl: '/'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', {
    message: 'Page not found',
    backUrl: '/'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`MongoDB URI configured: ${process.env.MONGODB_URI ? 'Yes' : 'No (using localhost)'}`);
  console.log(`Session secret configured: ${process.env.SESSION_SECRET ? 'Yes' : 'No (using fallback)'}`);
});
