/**
 * Gemini CLI Service - Bridge to server-side Gemini CLI
 * Executes shell commands to call local 'gemini' tool
 */
const { exec } = require('child_process');
const chalk = require('chalk');

/**
 * Execute a prompt using the 'gemini' CLI installed on the server
 * @param {string} prompt - The prompt to send to gemini CLI
 * @returns {Promise<{success: boolean, output: string, error?: string}>}
 */
async function executeGeminiPrompt(prompt) {
    return new Promise((resolve) => {
        console.log(chalk.cyan(`[GEMINI-CLI] Executing: "${prompt}"`));
        
        // Escape prompt for shell safety
        const escapedPrompt = prompt.replace(/"/g, '\\"');
        
        // Command to run: gemini "the prompt"
        const command = `gemini "${escapedPrompt}"`;

        exec(command, { timeout: 60000 }, (error, stdout, stderr) => {
            if (error) {
                console.error(chalk.red(`[GEMINI-CLI] Error: ${error.message}`));
                return resolve({ 
                    success: false, 
                    output: stdout || '', 
                    error: stderr || error.message 
                });
            }
            
            resolve({ 
                success: true, 
                output: stdout.trim() 
            });
        });
    });
}

module.exports = {
    executeGeminiPrompt
};
