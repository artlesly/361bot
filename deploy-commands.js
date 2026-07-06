require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const { BOT_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('ROLE DISCORD SERVER BOT ')
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

(async () => {
  try {
    console.log('กำลังลงทะเบียนคำสั่ง...');

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands },
    );

    console.log(' ลงทะเบียนคำสั่ง /setup สำเร็จ');
  } catch (error) {
    console.error(error);
  }
})();
