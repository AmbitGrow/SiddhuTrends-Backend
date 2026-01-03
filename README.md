
# SiddhuTrends Backend

This repository contains the backend service for the SiddhuTrends application.
It provides REST APIs, authentication, Redis-based caching, and database integration.

---

## Tech Stack

* Node.js
* Express.js
* Redis
* MongoDB / PostgreSQL
* JWT Authentication

---

## Prerequisites

Before running this project, make sure the following software is installed on your system.

### Node.js

* Version: 18 or higher
* Download from: [https://nodejs.org/](https://nodejs.org/)

Verify installation:

```
node -v
npm -v
```

---

### Git

Download from: [https://git-scm.com/](https://git-scm.com/)

Verify installation:

```
git --version
```

---

### Redis

Redis is required for caching and background processes.

Installation steps for Windows and Linux are provided below.

---

## Project Setup

### Step 1: Clone the Repository

```
git clone https://github.com/AmbitGrow/SiddhuTrends-Backend.git
cd SiddhuTrends-Backend
```

---

### Step 2: Install Dependencies

```
npm install
```

---

### Step 3: Environment Configuration

Create a `.env` file in the project root directory.

```
PORT=5000
NODE_ENV=production
CLIENT_URL=http://localhost:5173

MONGO_URI=mongodb+srv://smanishwar6_db_user:rrBS0fGRP2vHu6RK@cluster0.xs6h3bb.mongodb.net/?appName=Cluster0

UPSTASH_REDIS_URL=redis://127.0.0.1:6379

ACCESS_TOKEN_SECRET=sdfaehfu8r32aw783k4jkjk@!kjhwer
REFRESH_TOKEN_SECRET=2eoi3n@oweuf89a7Ln3uaksduhfa-w


# mongodb+srv://smanishwar6_db_user:<db_password>@cluster0.ziuuaup.mongodb.net/?appName=Cluster0

# rrBS0fGRP2vHu6RK


```

Important:

* Do NOT commit the `.env` file
* Redis must be running before starting the server

---

## Redis Setup

---

### Redis on Windows

#### Option 1: Using WSL (Recommended)

1. Install WSL:

```
wsl --install
```

2. Install Ubuntu from Microsoft Store

3. Open Ubuntu terminal and run:

```
sudo apt update
sudo apt install redis-server
```

4. Start Redis:

```
sudo service redis-server start
```

5. Verify Redis:

```
redis-cli ping
```

Expected output:

```
PONG
```

---

#### Option 2: Native Redis for Windows

Download Redis from:
[https://github.com/tporadowski/redis/releases](https://github.com/tporadowski/redis/releases)

Install Redis and ensure it runs on:

```
127.0.0.1:6379
```

Note: This option is not recommended for production.

---

### Redis on Linux (Ubuntu)

Install Redis:

```
sudo apt update
sudo apt install redis-server
```

Start Redis:

```
sudo service redis-server start
```

Enable Redis on system startup:

```
sudo systemctl enable redis-server
```

Verify Redis:

```
redis-cli ping
```

---

## Running the Application

### Development Mode

```
npm run dev
```

### Production Mode

```
npm start
```

The server will run on:

```
http://localhost:5000
```

---

## Available NPM Scripts

```
npm run dev     - Run application using nodemon
npm start       - Start application normally
npm test        - Run tests (if configured)
```

---

## Project Structure

```
src/
├── config/         Configuration files (DB, Redis, Env)
├── controllers/    API controllers
├── routes/         API routes
├── middlewares/    Authentication & error handling
├── services/       Business logic
├── utils/          Utility helpers
├── app.js          Express application setup
└── server.js       Application entry point
```

---

## Common Issues

### Redis Connection Error

* Ensure Redis server is running
* Check Redis configuration in `.env`
* Test Redis using:

```
redis-cli ping
```

---

### Port Already in Use

Change the port number in `.env`:

```
PORT=5001
```

---

## Git Workflow (Recommended)

```
git checkout -b feature/your-feature-name
git add .
git commit -m "feat: short description"
git push -u origin feature/your-feature-name
```

---

## Notes for Team Members

* Always pull the latest changes from `develop`
* Never commit `.env` files
* Ensure Redis is running before starting the backend
* Follow branch naming conventions (`feature/*`, `bugfix/*`)

---

Happy Coding 🚀

---


