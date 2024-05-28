require('dotenv').config();
const { Client, Intents, MessageEmbed } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

const client = new Client({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MEMBERS,
        Intents.FLAGS.GUILD_PRESENCES
    ]
});

const TOKEN = process.env.TOKEN;
let statusChannels = new Map(); // Map to store status channels for each guild
let memberStatuses = new Map(); // Map to store member statuses for each guild
let statusMessages = new Map(); // Map to store status messages for each guild
let currentPages = new Map(); // Map to store current page for each guild

client.once('ready', async () => {
    console.log('Bot is online!');
    await registerCommands();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName, guild, channel } = interaction;

    if (commandName === 'setstatuschannel') {
        if (guild) {
            statusChannels.set(guild.id, channel.id);
            console.log(`Status channel set for guild ${guild.id}: ${channel.id}`);
            await initializeStatusMessage(guild.id, channel.id);
            await interaction.reply(`Status channel set to <#${channel.id}> for guild ${guild.id}.`);
            await updateStatusMessage(guild.id);
        } else {
            await interaction.reply('This command can only be used in a server.');
        }
    }
});

client.on('presenceUpdate', async (oldPresence, newPresence) => {
    const guild = newPresence.guild;
    if (!guild) return;

    const member = newPresence.member;
    if (!member || member.user.bot) return;

    // Check if the guild has a status channel set
    const channelId = statusChannels.get(guild.id);
    console.log(`Received presence update for member ${member.displayName} in guild ${guild.id}, status channel set: ${channelId}`);
    if (channelId && member.guild.channels.cache.has(channelId)) {
        updateMemberStatus(guild.id, member);
        await updateStatusMessage(guild.id);
    }
});



client.on('guildMemberRemove', async member => {
    if (member.user.bot) return;

    const guildId = member.guild.id;
    const guildMemberStatuses = memberStatuses.get(guildId) || new Map();
    guildMemberStatuses.delete(member.id);
    memberStatuses.set(guildId, guildMemberStatuses);
    await updateStatusMessage(guildId);
});

async function registerCommands() {
    const commands = [
        {
            name: 'setstatuschannel',
            description: 'Set the channel for member status updates'
        }
    ];

    const rest = new REST({ version: '9' }).setToken(TOKEN);

    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
}

async function initializeStatusMessage(guildId, channelId) {
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
        console.error('Invalid channel ID!');
        return;
    }

    // Delete previous messages from the bot in the channel
    const fetchedMessages = await channel.messages.fetch({ limit: 100 });
    const botMessages = fetchedMessages.filter(msg => msg.author.id === client.user.id);
    if (botMessages.size > 0) {
        await channel.bulkDelete(botMessages);
    }

    // Create new status message
    const statusMessage = await channel.send('Initializing member status updates...');
    statusMessages.set(guildId, statusMessage);
    currentPages.set(guildId, 1);
}

async function updateStatusMessage(guildId) {
    const statusMessage = statusMessages.get(guildId);
    if (!statusMessage) return;

    const embedData = await generateEmbed(guildId);
    await statusMessage.edit({ embeds: [embedData] });
}

function updateMemberStatus(guildId, member) {
    const guildMemberStatuses = memberStatuses.get(guildId) || new Map();

    let statusEmoji = '';
    switch (member.presence.status) {
        case 'online':
            statusEmoji = '🟢 online';
            break;
        case 'idle':
            statusEmoji = '🟡 idle';
            break;
        case 'dnd':
            statusEmoji = '🔴 dnd';
            break;
        case 'offline':
            statusEmoji = '⚫️ offline';
            break;
        default:
            return;
    }

    const activity = member.presence.activities.find(activity => activity.type === 'PLAYING' || activity.type === 'WATCHING');
    if (activity) {
        statusEmoji += ` | ${activity.type === 'PLAYING' ? '🎮' : '📺'} ${activity.name}`;
    }

    guildMemberStatuses.set(member.id, {
        name: member.displayName,
        statusEmoji
    });
    memberStatuses.set(guildId, guildMemberStatuses);
}


async function generateEmbed(guildId) {
    const embed = new MessageEmbed()
        .setTitle('Member List')
        .setColor('#0099ff');

    const guildMemberStatuses = memberStatuses.get(guildId) || new Map();
    const memberStatusArray = Array.from(guildMemberStatuses.values());
    const maxMembersPerPage = 25;

    const memberCount = memberStatusArray.length;
    const totalPages = Math.ceil(memberCount / maxMembersPerPage);
    const currentPage = currentPages.get(guildId) || 1;

    const startIndex = (currentPage - 1) * maxMembersPerPage;
    const endIndex = Math.min(startIndex + maxMembersPerPage, memberStatusArray.length);

    let membersList = '';
    for (let i = startIndex; i < endIndex; i++) {
        const { name, statusEmoji } = memberStatusArray[i];
        membersList += `${statusEmoji} | ${name}\n`;
    }

    let description = membersList.trim() || 'No members to display.';
    embed.setDescription(description);
    embed.setFooter({ text: `Page ${currentPage}/${totalPages}` });

    currentPages.set(guildId, (currentPage % totalPages) + 1);

    return embed;
}


client.login(TOKEN);
