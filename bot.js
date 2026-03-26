const { Client, GatewayIntentBits } = require('discord.js');
const mysql = require('mysql2/promise'); // Ajout pour la BDD

const CONFIG = {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN || 'TON_BOT_TOKEN',
    GUILD_ID:      process.env.GUILD_ID      || 'TON_GUILD_ID',
    ON_DUTY_ROLE_ID: '1486827796117323856', // Ton ID de rôle
    // Configuration de la BDD (à remplir avec tes accès Alwaysdata ou autres)
    DB_CONFIG: {
        host: 'yy14998-001.eu.clouddb.ovh.net',
        user: 'yuki',
        password: 'dPVzFJ843M3bfX1TXHUvhzBwu8UF6VF',
        database: 'lsmotorcycle',
        port: 35357
    }
};

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// Variable pour ne pas traiter plusieurs fois le même log
let lastCheckedId = 0;

async function checkDutyStatus() {
    let connection;
    try {
        connection = await mysql.createConnection(CONFIG.DB_CONFIG);
        
        // On récupère les nouveaux logs de service statut 1
        // On se base sur la colonne 'status' et 'discord_id' de ta table duty_webhooks
        const [rows] = await connection.execute(
            'SELECT id, discord_id, status FROM duty_webhooks WHERE id > ? ORDER BY id ASC',
            [lastCheckedId]
        );

        if (rows.length === 0) return;

        const guild = await client.guilds.fetch(CONFIG.GUILD_ID);

        for (const row of rows) {
            lastCheckedId = row.id;
            
            if (!row.discord_id) continue;

            try {
                const member = await guild.members.fetch(row.discord_id);
                
                if (row.status == 1) {
                    // Ajout du rôle si statut = 1 (Prise de service)
                    await member.roles.add(CONFIG.ON_DUTY_ROLE_ID);
                    console.log(`Rôle ajouté à ${member.user.tag}`);
                } else if (row.status == 0) {
                    // Retrait du rôle si statut = 0 (Fin de service)
                    await member.roles.remove(CONFIG.ON_DUTY_ROLE_ID);
                    console.log(`Rôle retiré à ${member.user.tag}`);
                }
            } catch (err) {
                console.error(`Impossible de trouver le membre ${row.discord_id} sur Discord`);
            }
        }
    } catch (error) {
        console.error('Erreur BDD:', error);
    } finally {
        if (connection) await connection.end();
    }
}

client.once('ready', () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);
    
    // On initialise le lastCheckedId au dernier ID actuel pour ne pas spammer au démarrage
    // Puis on lance la vérification toutes les 30 secondes
    setInterval(checkDutyStatus, 30000); 
});

client.login(CONFIG.DISCORD_TOKEN);