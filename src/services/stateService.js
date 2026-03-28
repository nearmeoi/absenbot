/**
 * User State Service
 * Manages temporary states for interactive flows (e.g. awaiting text input)
 */
import chalk from 'chalk';

// In-memory state storage
// Key: senderNumber, Value: { state: string, data: object, expires: number }
const userStates = new Map();

// Default timeout: 10 minutes
const DEFAULT_TIMEOUT = 10 * 60 * 1000;

/**
 * Set a state for a user
 * @param {string} userId - The sender number/ID
 * @param {string} state - State name (e.g. 'AWAITING_ACTIVITY')
 * @param {object} data - Optional metadata
 * @param {number} timeoutMs - Custom timeout in ms
 */
function setUserState(userId, state, data = {}, timeoutMs = DEFAULT_TIMEOUT) {
    const expires = Date.now() + timeoutMs;
    userStates.set(userId, { state, data, expires });
    console.log(chalk.blue(`[STATE] User ${userId} entered state: ${state} (expires in ${timeoutMs/1000}s)`));
}

/**
 * Get current state of a user
 * @param {string} userId 
 * @returns {object|null}
 */
function getUserState(userId) {
    const stateObj = userStates.get(userId);
    if (!stateObj) return null;

    // Check expiration
    if (Date.now() > stateObj.expires) {
        userStates.delete(userId);
        console.log(chalk.yellow(`[STATE] State expired for user ${userId}`));
        return null;
    }

    return stateObj;
}

/**
 * Clear user state
 * @param {string} userId 
 */
function clearUserState(userId) {
    userStates.delete(userId);
    console.log(chalk.gray(`[STATE] State cleared for user ${userId}`));
}

export {
    setUserState,
    getUserState,
    clearUserState
};
