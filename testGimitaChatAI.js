/**
 * Test Gimita ChatAI API
 * Testing the new Gimita ChatAI API with various models
 */

require('dotenv').config();
const { callGimitaChatAI } = require('./src/services/aiService');
const chalk = require('chalk');
const fs = require('fs');

async function testGimitaChatAI() {
    console.log(chalk.blue('🔄 Testing Gimita ChatAI API with Various Models'));
    console.log(chalk.blue('===============================================\n'));
    
    // Test different models
    const models = ['deepseek-v3', 'deepseek-r1', 'llama-v3p1-8b-instruct', 'mistral-nemo-instruct-2407'];
    
    for (const model of models) {
        console.log(chalk.cyan(`Testing model: ${model}...`));
        
        try {
            const startTime = Date.now();
            const result = await callGimitaChatAI("Hai, ini adalah tes dari bot absensi MagangHub. Bisakah kamu jelaskan apa itu laporan magang?", model);
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            
            if (result.success) {
                console.log(chalk.green(`✅ Success (in ${totalTime}ms):`));
                console.log(chalk.yellow(`Response from ${model}:`), result.content.substring(0, 200) + '...');
            } else {
                console.log(chalk.red(`❌ Failed: ${result.error}`));
            }
        } catch (error) {
            console.log(chalk.red(`❌ Error with ${model}: ${error.message}`));
        }
        
        // Add delay between requests to avoid rate limiting
        console.log(chalk.gray('Waiting 1 second before next request...'));
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Test with a prompt similar to what we use for attendance reports
    console.log(chalk.cyan('\nTesting with attendance report prompt...'));
    
    const attendancePrompt = `Buatkan contoh laporan magang harian dalam format: AKTIVITAS: [isi], PEMBELAJARAN: [isi], KENDALA: [isi]. Panjang masing-masing bagian antara 100-170 karakter.`;
    
    try {
        const startTime = Date.now();
        const result = await callGimitaChatAI(attendancePrompt, 'deepseek-v3');
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        
        if (result.success) {
            console.log(chalk.green(`✅ Success (in ${totalTime}ms):`));
            console.log(chalk.yellow('Attendance Report Example:'));
            console.log(result.content);
        } else {
            console.log(chalk.red(`❌ Failed: ${result.error}`));
        }
    } catch (error) {
        console.log(chalk.red(`❌ Error: ${error.message}`));
    }
    
    console.log(chalk.yellow('\n🔧 NEW FEATURE ADDED:'));
    console.log(chalk.white('- callGimitaChatAI() function added to support multiple models'));
    console.log(chalk.white('- Includes rate limit handling (HTTP 429)'));
    console.log(chalk.white('- Supports various models like deepseek-v3, llama-v3p1-8b-instruct, etc.'));
    console.log(chalk.white('- Can be used as additional fallback option in AI service'));
    
    // Save results
    const results = {
        timestamp: new Date().toISOString(),
        testDescription: "Gimita ChatAI API test with various models",
        testedModels: models,
        attendanceReportTest: "Completed",
        newFunction: "callGimitaChatAI(prompt, model = 'deepseek-v3')"
    };
    
    fs.writeFileSync('gimita_chatai_test.json', JSON.stringify(results, null, 2));
    console.log(chalk.blue('\n💾 Test results saved to gimita_chatai_test.json'));
}

// Run the test
testGimitaChatAI()
    .then(() => console.log(chalk.blue('\n✅ Gimita ChatAI test completed!')))
    .catch(error => console.error(chalk.red('\n❌ Error in Gimita ChatAI test:'), error));