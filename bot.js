const makeWASocket = require("@whiskeysockets/baileys").default;
const { useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage } = require("@whiskeysockets/baileys");
const fs = require("fs");
const { exec } = require("child_process");

const tempFolder = "U:/WA/temp"; // Folder sementara untuk gambar stiker

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        version: version,
        printQRInTerminal: true,
        syncFullHistory: true,
    });

    sock.ev.on("creds.update", saveCreds);
    
    sock.ev.on("connection.update", (update) => {
        const { connection } = update;
        if (connection === "close") {
            console.log("🔴 Bot terputus, mencoba kembali...");
            setTimeout(() => startBot(), 5000);
        } else if (connection === "open") {
            console.log("✅ Bot WhatsApp terhubung!");
        }
    });

    sock.ev.on("messages.upsert", async (msg) => {
        try {
            const message = msg.messages[0];
            if (!message.message || message.key.fromMe) return;

            const remoteJid = message.key.remoteJid;
            const sender = message.key.participant || message.key.remoteJid;
            const textMessage = message.message.conversation || message.message.extendedTextMessage?.text || "";

            console.log(`📩 Pesan diterima: ${textMessage}`);

            // 📌 Command: .tagall (Mention semua orang)
            if (textMessage === ".tagall") {
                const groupMetadata = await sock.groupMetadata(remoteJid);
                const participants = groupMetadata.participants.map(p => p.id);
                
                let tagMessage = "👥 *Mention Semua Member:*\n";
                tagMessage += participants.map(p => `@${p.split("@")[0]}`).join(" ");
                
                await sock.sendMessage(remoteJid, {
                    text: tagMessage,
                    mentions: participants
                });

                console.log("✅ Tagall berhasil dikirim!");
            }

            // 📌 Command: .hidetag .tagall (Mention Semua Tanpa Terlihat)
            if (textMessage.includes(".hidetag") && textMessage.includes(".tagall")) {
                const groupMetadata = await sock.groupMetadata(remoteJid);
                const participants = groupMetadata.participants.map(p => p.id);
                
                let customText = textMessage.split(".hidetag .tagall")[0].trim();
                if (!customText) customText = "📢 Info Penting:";

                await sock.sendMessage(remoteJid, {
                    text: customText,
                    mentions: participants
                });

                // Hapus perintah setelah 3 detik agar hanya pengirim yang tahu
                setTimeout(async () => {
                    await sock.sendMessage(remoteJid, { delete: message.key });
                    console.log("🗑️ Perintah .hidetag .tagall dihapus!");
                }, 3000);
            }

            // 📌 Command: .s (Buat Stiker dari Gambar)
            if (message.message.imageMessage && textMessage === ".s") {
                const mediaMessage = message.message.imageMessage;
                const stream = await downloadContentFromMessage(mediaMessage, "image");
                let buffer = Buffer.from([]);

                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }

                if (!fs.existsSync(tempFolder)) {
                    fs.mkdirSync(tempFolder, { recursive: true });
                }

                const filePath = `${tempFolder}/input.jpg`;
                const outputSticker = `${tempFolder}/output.webp`;
                fs.writeFileSync(filePath, buffer);

                exec(`ffmpeg -i "${filePath}" -vf "scale=512:512:force_original_aspect_ratio=decrease" -c:v libwebp -lossless 1 -preset default -loop 0 -an -vsync 0 "${outputSticker}"`, async (error) => {
                    if (!error) {
                        const stickerBuffer = fs.readFileSync(outputSticker);
                        await sock.sendMessage(remoteJid, { sticker: stickerBuffer });
                        console.log("✅ Stiker berhasil dikirim!");
                    } else {
                        console.error("❌ Gagal membuat stiker:", error);
                    }
                });
            }

        } catch (error) {
            console.error("❌ Error:", error);
        }
    });
}

startBot();
