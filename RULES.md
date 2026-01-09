# Project Rules & Coding Conventions
*This file serves as a guide for AI Assistants working on this codebase.*

## 1. User Interaction & Messages
*   **Centralized Messaging:** NEVER hardcode user-facing strings in `messageHandler.js` or other logic files.
    *   **Right:** `getMessage('welcome_text')`
    *   **Wrong:** `sock.sendMessage(..., { text: "Hello world" })`
*   **Storage:** All text keys must be defined in `src/config/messages.json`.
*   **Privacy:** If a user triggers a long-response command (like `!absen` draft) in a **GROUP**, the bot MUST redirect the detailed response to **Private Chat** and only send a brief notification in the group.

## 2. Environment Isolation
*   **Dynamic Prefix:** Do NOT verify commands with hardcoded `!` or `.`.
    *   **Always Use:** `const { BOT_PREFIX } = require('../config/constants');`
*   **Checks:** Command validation should look like: `if (command === BOT_PREFIX + 'cek')`.

## 3. Draft & AI Logic
*   **Relaxed Revision:** In Private Chat, **ANY** text reply (that isn't a command) while a draft is pending should be treated as a revision request.
*   **Group Safety:** In Groups, free-text revision is ONLY allowed if the user **replies (quotes)** a message from the bot.

## 4. Architecture
*   **State:** Use `previewService.js` for ephemeral state (drafts).
*   **Logging:** Use `console.log` with `chalk` for high-level flow debugging (e.g. `[DEBUG] DATA SIAP KIRIM`).
