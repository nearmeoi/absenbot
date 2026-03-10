const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const { reportError } = require('../services/errorReporter');

module.exports = {
    name: ['topdf', 'pdf'],
    description: 'Ubah dokumen Word (.docx/.doc) menjadi PDF dengan hasil presisi',
    async execute(sock, msg, context) {
        const { sender } = context;
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

        try {
            // 1. Identify Document
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const targetMsg = quotedMsg ? quotedMsg : msg.message;
            const docMsg = targetMsg.documentMessage || targetMsg.documentWithCaptionMessage?.message?.documentMessage;

            if (!docMsg) {
                return await sock.sendMessage(sender, { text: '⚠️ Silakan kirim file Word (.docx) dengan caption *!topdf* atau reply file tersebut.' }, { quoted: msg });
            }

            // Support both .doc and .docx
            const isWord = docMsg.fileName?.endsWith('.docx') || docMsg.fileName?.endsWith('.doc') || docMsg.mimetype?.includes('word');
            if (!isWord) {
                return await sock.sendMessage(sender, { text: '⚠️ Format file tidak didukung. Kirim file *.doc* atau *.docx*.' }, { quoted: msg });
            }

            // 2. Download
            const msgToDownload = quotedMsg ? {
                key: { ...msg.key, id: msg.message.extendedTextMessage.contextInfo.stanzaId },
                message: quotedMsg
            } : msg;

            const buffer = await downloadMediaMessage(msgToDownload, 'buffer', {}, { logger: console });
            if (!buffer) throw new Error('Gagal mengunduh dokumen.');

            const timestamp = Date.now();
            const fileName = docMsg.fileName || `document_${timestamp}.docx`;
            const inputPath = path.join(tempDir, `in_${timestamp}_${fileName}`);
            
            fs.writeFileSync(inputPath, buffer);

            // 3. Convert using LibreOffice (soffice)
            // --headless: run without UI
            // --convert-to pdf: target format
            // --outdir: where to save
            const convertCommand = `soffice --headless --convert-to pdf --outdir "${tempDir}" "${inputPath}"`;
            
            await execPromise(convertCommand);

            // LibreOffice names the output file same as input but with .pdf extension
            const baseFileName = path.basename(inputPath, path.extname(inputPath));
            const outputPath = path.join(tempDir, `${baseFileName}.pdf`);

            if (!fs.existsSync(outputPath)) {
                throw new Error('LibreOffice gagal menghasilkan file PDF.');
            }

            // 4. Send PDF
            await sock.sendMessage(sender, {
                document: fs.readFileSync(outputPath),
                fileName: fileName.replace(/\.(docx|doc)$/i, '.pdf'),
                mimetype: 'application/pdf',
                caption: '✅ Konversi Word ke PDF Berhasil (100% Precision)\nBy @Neardev'
            }, { quoted: msg });

            // 5. Cleanup
            // Remove both input and output files
            try {
                fs.unlinkSync(inputPath);
                fs.unlinkSync(outputPath);
            } catch (e) { }

        } catch (error) {
            console.error('[TOPDF] Error:', error);
            reportError(error, 'topdfCommand', { sender: sender });
            await sock.sendMessage(sender, { text: `❌ Gagal mengonversi ke PDF: ${error.message}` }, { quoted: msg });
        }
    }
};