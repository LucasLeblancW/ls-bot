const { Client, GatewayIntentBits } = require('discord.js');
const https = require('https');
const http  = require('http');

// ============================================================
// CONFIGURATION — À remplir avec tes vraies valeurs
// ============================================================
const CONFIG = {
    DISCORD_TOKEN:   process.env.DISCORD_TOKEN   || 'TON_BOT_TOKEN',
    CHANNEL_ID:      process.env.CHANNEL_ID       || 'ID_DU_CHANNEL_LOGS',
    WEBHOOK_URL:     process.env.WEBHOOK_URL       || 'https://ton-site.alwaysdata.net/dev/webhook.php',
    WEBHOOK_SECRET:  process.env.WEBHOOK_SECRET    || 'un_secret_optionnel',
};
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

client.once('ready', () => {
    console.log(`✅ Bot connecté : ${client.user.tag}`);
    console.log(`📡 Écoute du channel : ${CONFIG.CHANNEL_ID}`);
    console.log(`🔗 Webhook cible : ${CONFIG.WEBHOOK_URL}`);
});

client.on('messageCreate', async (message) => {
    // Ignore tout sauf le channel de logs
    if (message.channel.id !== CONFIG.CHANNEL_ID) return;
    // Ignore les messages du bot lui-même
    if (message.author.bot && message.author.id === client.user.id) return;

    try {
        const payload = parseDiscordLog(message);
        await sendToWebhook(payload);
        console.log(`📨 Log envoyé — type: ${payload.type} | auteur: ${message.author.tag}`);
    } catch (err) {
        console.error(`❌ Erreur envoi webhook:`, err.message);
    }
});

/**
 * Parse un message Discord de log FiveM
 * Gère les embeds et les messages texte brut
 */
function parseDiscordLog(message) {
    let type    = 'unknown';
    let details = {};
    let raw     = '';

    // ---- CAS 1 : Message avec embeds (format FiveM standard) ----
    if (message.embeds && message.embeds.length > 0) {
        const embed = message.embeds[0];

        // Le titre de l'embed = type de log (ex: "xaction - garage", "inventory - add")
        type = embed.title || embed.description || 'unknown';
        raw  = JSON.stringify({
            title:       embed.title,
            description: embed.description,
            fields:      embed.fields,
            timestamp:   embed.timestamp,
            color:       embed.color,
        });

        // Parse les fields de l'embed
        if (embed.fields) {
            embed.fields.forEach(field => {
                const key = field.name.toLowerCase().replace(/\s+/g, '_');
                // Nettoie la valeur : supprime le préfixe "key:value"
                let val = field.value || '';
                if (val.includes(':')) {
                    val = val.split(':').slice(1).join(':').trim();
                }
                details[key] = val;
            });
        }

        // Récupère aussi le contenu texte si présent
        if (embed.description) {
            details['description'] = embed.description;
        }

    // ---- CAS 2 : Message texte brut ----
    } else if (message.content) {
        raw  = message.content;
        type = 'text_log';
        details = { content: message.content };
    }

    return {
        type:          type,
        details:       details,
        raw_discord:   raw,
        discord_msg_id: message.id,
        channel_id:    message.channel.id,
        author_id:     message.author.id,
        author_tag:    message.author.tag,
        timestamp:     message.createdAt.toISOString(),
        secret:        CONFIG.WEBHOOK_SECRET,
    };
}

/**
 * Envoie le payload JSON à webhook.php
 */
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
        };

        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

client.login(CONFIG.DISCORD_TOKEN);