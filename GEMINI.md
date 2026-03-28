# 🤖 MagangHub AbsenBot - Project Context

This project is a sophisticated WhatsApp bot designed to automate attendance reporting for the MagangHub (Kemnaker) platform. It leverages AI for content generation and browser automation as a fallback for API interactions.

## 🌟 Project Overview
- **Purpose:** Automate daily attendance reports, provide reminders, and ensure compliance with MagangHub requirements.
- **Core Stack:** Node.js (ESM), `@whiskeysockets/baileys` (WhatsApp), `puppeteer-core` (Browser Automation), `node-cron` (Scheduling), and `Groq AI` (Llama-3 for report generation).
- **Architecture:** Modular service-oriented architecture with a clear separation between messaging handlers, command logic, and core services.

## 📂 Key Directory Structure
- `src/app.js`: Main entry point for WhatsApp connection and socket management.
- `src/commands/`: Command handlers for user interactions (e.g., `!absen`, `!preview`, `!daftar`).
- `src/services/`: Core business logic:
    - `magang.js`: Hybrid engine (API + Puppeteer) for interacting with MagangHub.
    - `aiService.js`: Integration with Groq AI for generating and refining reports.
    - `scheduler.js`: Cron-based automation for reminders and emergency submissions.
    - `database.js`: Persistence layer using JSON files in the `data/` directory.
    - `secureAuth.js`: Express-based web server for secure credential handling during registration.
- `src/handlers/`: Event handlers, primarily `messageHandler.js` for routing incoming WhatsApp messages.
- `data/`: JSON storage for users, group settings, holidays, and scheduler configurations.

## 🛠 Building and Running
- **Installation:** `npm install`
- **Development:** `npm run dev` or `node index.js`
- **Production:** `npm start` (often managed via PM2, see `ecosystem.config.cjs`).
- **Deployment:** Use `bash deploy.sh` for automated setup and restarts.
- **Environment:** Requires a `.env` file (see `.env.example`). Key variables include `GROQ_API_KEY`, `PHONE_NUMBER` (for pairing), and `ADMIN_NUMBERS`.

## ⚙️ Development Conventions
- **Language:** JavaScript (ES Modules).
- **Data Persistence:** Uses `data/*.json` files. The `database.js` service uses an in-memory cache and a write queue to prevent race conditions. Always use `src/services/database.js` functions for data operations.
- **Error Handling:** Centralized through `src/services/errorReporter.js`.
- **UI/UX:** WhatsApp messages utilize "Interactive Message" overrides (see `src/app.js`) to provide buttons and lists where possible, with fallbacks for older clients.
- **Hybrid Interaction:** Priority is given to `apiService.js` (direct HTTP calls) for speed. If session-related errors occur, the system falls back to `puppeteer` via `src/services/magang.js` to refresh sessions or perform visual submissions.

## ⏰ Automation Logic
- **Reminders:** Scheduled at multiple intervals (Morning, Afternoon, Evening) to alert users who haven't submitted their reports.
- **Emergency Submit:** A critical feature triggered at **23:50 WIB** (or configurable) that auto-generates and submits reports for users to prevent attendance gaps.
- **Ramadan Features:** Dynamic scheduling for Sahur and Imsak reminders based on the user's location.

## ⚠️ Critical Notes
- **Security:** Credentials (Email/Password) are collected via a separate web portal (`secureAuth.js`) to keep them out of WhatsApp chat logs.
- **Puppeteer:** Optimized for resource-constrained environments (like Termux/VPS) with specific flags and a task queue (`BrowserQueue`) to ensure only one browser instance runs at a time.
- **Testing:** New features should be validated against the hybrid engine to ensure both API and Puppeteer fallbacks function correctly.
