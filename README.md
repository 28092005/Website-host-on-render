# Mini Project - Secure Authentication App

A secure Node.js authentication application with Express, MongoDB, and EJS.

## Features

- User registration and login
- Secure password hashing with bcrypt
- Session-based authentication
- Input validation and sanitization
- Rate limiting and security headers
- CSRF protection
- XSS protection

## Deployment on Render

### Prerequisites
1. MongoDB Atlas account with a cluster set up
2. Render account

### Environment Variables (Set in Render Dashboard)
```
NODE_ENV=production
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/mini_project
SESSION_SECRET=your-super-secure-random-string-here
```

### Deploy Steps
1. Push code to GitHub repository
2. Connect repository to Render
3. Set environment variables in Render dashboard
4. Deploy

### Local Development
1. Install dependencies: `npm install`
2. Copy `.env` file and update MongoDB URI
3. Start server: `npm start`
4. Visit: `http://localhost:3000`

## Security Features
- Helmet.js for security headers
- Express rate limiting
- Input validation with express-validator
- Secure session management
- Password hashing with bcrypt (rounds: 12)
- NoSQL injection prevention
- XSS protection