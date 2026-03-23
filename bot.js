const { Client, GatewayIntentBits } = require('discord.js');
const https = require('https');
const http  = require('http');

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
    DISCORD_TOKEN:  process.env.DISCORD_TOKEN  || 'TON_BOT_TOKEN',
    CHANNEL_ID:     process.env.CHANNEL_ID      || 'ID_DU_CHANNEL_LOGS',
    WEBHOOK_URL:    process.env.WEBHOOK_URL      || 'https://ton-site.alwaysdata.net/dev/webhook.php',
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET   || 'un_secret_optionnel',
};
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// ============================================================
// FILE D'ATTENTE SÉQUENTIELLE
// Garantit que les messages sont traités UN PAR UN dans l'ordre
// d'arrivée, même si Discord les livre quasi-simultanément.
// ============================================================
let queue   = [];
let running = false;

async function processQueue() {
    if (running || queue.length === 0) return;
    running = true;

    while (queue.length > 0) {
        const message = queue.shift();
        try {
            const payload = parseDiscordLog(message);
            await sendToWebhook(payload);
            console.log(`📨 Envoyé — type: ${payload.type} | msg_id: ${message.id} | ts: ${payload.embed_timestamp || payload.timestamp}`);
        } catch (err) {
            console.error(`❌ Erreur envoi webhook:`, err.message);
        }
    }

    running = false;
}

// ============================================================

client.once('ready', () => {
    console.log(`✅ Bot connecté : ${client.user.tag}`);
    console.log(`📡 Écoute channel : ${CONFIG.CHANNEL_ID}`);
    console.log(`🔗 Webhook cible  : ${CONFIG.WEBHOOK_URL}`);
});

client.on('messageCreate', (message) => {
    if (message.channel.id !== CONFIG.CHANNEL_ID) return;
    if (message.author.bot && message.author.id === client.user.id) return;

    // On ajoute en file, puis on déclenche le traitement
    queue.push(message);
    processQueue();
});

// Reconnexion automatique en cas de perte de connexion
client.on('error', (err) => {
    console.error('❌ Erreur client Discord:', err.message);
});

client.on('warn', (info) => {
    console.warn('⚠️ Avertissement Discord:', info);
});

client.on('disconnect', () => {
    console.log('🔌 Déconnecté de Discord, tentative de reconnexion...');
});

// ============================================================
// PARSE DU MESSAGE DISCORD
// Utilise le timestamp de l'embed FiveM (embed.timestamp)
// pour respecter l'ordre réel des événements en jeu.
// ============================================================
function parseDiscordLog(message) {
    let type           = 'unknown';
    let details        = {};
    let raw            = '';
    let embed_timestamp = null;

    if (message.embeds && message.embeds.length > 0) {
        const embed = message.embeds[0];

        type = embed.title || embed.description || 'unknown';

        raw = JSON.stringify({
            title:       embed.title,
            description: embed.description,
            fields:      embed.fields,
            timestamp:   embed.timestamp,
            color:       embed.color,
        });

        // Timestamp de l'embed = quand l'événement s'est passé EN JEU
        // C'est plus fiable que message.createdAt pour l'ordre des logs
        if (embed.timestamp) {
            embed_timestamp = new Date(embed.timestamp).toISOString();
        }

        if (embed.fields) {
            embed.fields.forEach(field => {
                const key = field.name.toLowerCase().replace(/\s+/g, '_');
                let val = field.value || '';
                if (val.includes(':')) {
                    val = val.split(':').slice(1).join(':').trim();
                }
                details[key] = val;
            });
        }

        if (embed.description) {
            details['description'] = embed.description;
        }

    } else if (message.content) {
        raw  = message.content;
        type = 'text_log';
        details = { content: message.content };
    }

    return {
        type:            type,
        details:         details,
        raw_discord:     raw,
        discord_msg_id:  message.id,
        channel_id:      message.channel.id,
        author_id:       message.author.id,
        author_tag:      message.author.tag,
        // timestamp = moment de réception par Discord (ordre d'arrivée)
        timestamp:       message.createdAt.toISOString(),
        // embed_timestamp = timestamp FiveM (moment réel de l'événement)
        embed_timestamp: embed_timestamp,
        secret:          CONFIG.WEBHOOK_SECRET,
    };
}

// ============================================================
// ENVOI VERS WEBHOOK.PHP
// ============================================================
function sendToWebhook(payload) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const url  = new URL(CONFIG.WEBHOOK_URL);
        const lib  = url.protocol === 'https:' ? https : http;

        const options = {
            hostname: url.hostname,
            port:     url.port || (url.protocol === 'https:' ? 443 : 80),
            path:     url.pathname + url.search,
            method:   'POST',
            headers: {
                'Content-Type':   'application/json',
                'Content-Length': Buffer.byteLength(body),
                'X-Bot-Secret':   CONFIG.WEBHOOK_SECRET,
            },
            // Timeout 10s pour ne pas bloquer la file indéfiniment
            timeout: 10000,
        };

        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) resolve(data);
                else reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            });
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout 10s dépassé'));
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

client.login(CONFIG.DISCORD_TOKEN);