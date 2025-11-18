const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const bcrypt = require("bcryptjs");
const connectDB = require("./config");
const User = require("./models/User");

const app = express();
connectDB(); // ✅ Connect to MongoDB

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

// Routes
app.get("/", (req, res) => {
  res.render("login");
});

app.get("/signup", (req, res) => {
  res.render("signup");
});

app.post("/signup", async (req, res) => {
  try {
    const { username, email, password, confirm } = req.body;
    if (password !== confirm) {
      return res.send("❌ Passwords do not match!");
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.send("⚠️ Email already registered!");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();

    res.redirect("/"); // Redirect to login after signup
  } catch (error) {
    console.error(error);
    res.send("❌ Error signing up!");
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.send("❌ User not found!");

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.send("❌ Invalid credentials!");

    res.render("home", { username: user.username }); // ✅ show home page
  } catch (error) {
    console.error(error);
    res.send("❌ Error logging in!");
  }
});

const PORT = 3000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
