require('dotenv').config();
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  Events,
  PermissionsBitField,
} = require('discord.js');
const {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');

// ---------- ตั้งค่าจาก .env ----------
const {
  BOT_TOKEN,
  ROLE_ID,
  ADMIN_CHANNEL_ID,
  SETUP_IMAGE_URL,
  CREDIT_TEXT,
  CREDIT_ICON_URL,
  PORT,
  ALLOWED_USER_IDS,
  VOICE_CHANNEL_ID,       // ห้องเสียงที่ต้องการให้บอทเข้าไปอยู่ตลอด (โชว์ตัวในห้อง TALK)
  RANDOM_MESSAGES,        // ข้อความสุ่ม คั่นด้วย | เช่น "ข้อความ1|ข้อความ2|ข้อความ3"
  RANDOM_IMAGES,          // รูปสุ่ม คั่นด้วย , เช่น "url1,url2,url3"
  ROTATE_INTERVAL_MINUTES, // ทุกกี่นาทีให้สุ่มข้อความ/รูปใหม่ (default 10 นาที)
} = process.env;

// แปลง ALLOWED_USER_IDS (คั่นด้วยจุลภาค) ให้เป็น array ของ user id ที่อนุญาตให้ใช้คำสั่ง /setup
const allowedUserIds = (ALLOWED_USER_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

// แปลงข้อความสุ่ม / รูปสุ่มจาก .env เป็น array (ถ้าไม่ตั้งค่าไว้ จะมีค่า default ให้ 1 ตัว)
const randomMessages = (RANDOM_MESSAGES || 'หากพบปัญหาในการใช้งาน PRISSANA GANG [verify] กรุณาติดต่อ kids')
  .split('|')
  .map((m) => m.trim())
  .filter(Boolean);

const randomImages = (RANDOM_IMAGES || SETUP_IMAGE_URL || '')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

const rotateIntervalMs = (Number(ROTATE_INTERVAL_MINUTES) > 0 ? Number(ROTATE_INTERVAL_MINUTES) : 10) * 60 * 1000;

function pickRandom(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------- เว็บเซิร์ฟเวอร์เล็กๆ ไว้ให้โฮสต์ ping เพื่อให้บอทออนไลน์ตลอด ----------
const app = express();
app.get('/', (req, res) => {
  res.send('Discord Role Bot กำลังทำงานอยู่');
});
app.listen(PORT || 3000, () => {
  console.log(`เว็บเซิร์ฟเวอร์รันที่พอร์ต ${PORT || 3000}`);
});

// ---------- ตั้งค่าบอท ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates, // จำเป็นสำหรับเข้าห้องเสียง
  ],
});

const BUTTON_ID = 'request_role_button';
const MODAL_ID = 'request_role_modal';
const NAME_INPUT_ID = 'request_role_name_input';
const FB_INPUT_ID = 'request_role_fb_input';
const APPROVE_PREFIX = 'approve_request_';
const DENY_PREFIX = 'deny_request_';

// เก็บ reference ของข้อความ setup ล่าสุดที่ส่งไปแต่ละช่อง เพื่อไว้แก้ไขข้อความ/รูปแบบสุ่มเรื่อยๆ
const activeSetupMessages = new Map(); // channelId -> messageId

client.once(Events.ClientReady, async (c) => {
  console.log(`ล็อกอินสำเร็จในชื่อ ${c.user.tag}`);

  // ---------- เข้าห้องเสียงอัตโนมัติตอนบอทออนไลน์ ----------
  if (VOICE_CHANNEL_ID) {
    await joinConfiguredVoiceChannel();
  }

  // ---------- เริ่มระบบสุ่มข้อความ/รูปในข้อความ setup ที่ส่งไปแล้ว ----------
  setInterval(rotateAllActiveSetupMessages, rotateIntervalMs);
});

// ---------- ฟังก์ชันเข้าห้องเสียงพร้อม reconnect อัตโนมัติถ้าหลุด ----------
async function joinConfiguredVoiceChannel() {
  try {
    const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
    if (!channel || !channel.isVoiceBased()) {
      console.error('VOICE_CHANNEL_ID ที่ตั้งไว้ไม่ใช่ห้องเสียง หรือหาไม่เจอ');
      return;
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 15_000).catch(() => {});
    console.log(`เข้าห้องเสียง ${channel.name} แล้ว`);

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.log('หลุดจากห้องเสียง กำลังพยายามเชื่อมต่อใหม่...');
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        setTimeout(() => joinConfiguredVoiceChannel(), 5_000);
      }
    });
  } catch (err) {
    console.error('เข้าห้องเสียงไม่สำเร็จ:', err);
  }
}

// ---------- ฟังก์ชันสร้าง Embed + ปุ่ม สำหรับส่งลงช่องขอรับยศ (สุ่มข้อความ/รูปทุกครั้งที่เรียก) ----------
function buildRequestMessage() {
  const description = pickRandom(randomMessages);
  const image = pickRandom(randomImages);

  const embed = new EmbedBuilder()
    .setTitle('PRISSANA GANG [verify]')
    .setDescription('```' + description + '```')
    .setColor(0x5865f2);

  if (image) {
    embed.setImage(image);
  }

  if (CREDIT_TEXT) {
    embed.setFooter({
      text: CREDIT_TEXT,
      iconURL: CREDIT_ICON_URL || undefined,
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_ID)
      .setLabel('verify')
      .setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [row] };
}

// ---------- สุ่มข้อความ/รูปใหม่ให้ข้อความ setup ที่เคยส่งไปแล้วทุกช่อง (เรียกซ้ำเรื่อยๆ ตามรอบเวลา) ----------
async function rotateAllActiveSetupMessages() {
  for (const [channelId, messageId] of activeSetupMessages.entries()) {
    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        activeSetupMessages.delete(channelId);
        continue;
      }
      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (!message) {
        activeSetupMessages.delete(channelId);
        continue;
      }
      await message.edit({ ...buildRequestMessage() });
    } catch (err) {
      console.error(`สุ่มข้อความใหม่ในช่อง ${channelId} ไม่สำเร็จ:`, err);
    }
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // 1) คำสั่ง /setup -> ส่งข้อความปุ่มลงช่องนี้ (ส่งแยกเป็นข้อความปกติ ไม่ให้ขึ้นป้าย "ใช้แล้ว /setup")
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
      if (allowedUserIds.length > 0 && !allowedUserIds.includes(interaction.user.id)) {
        await interaction.reply({ content: 'คุณไม่มีสิทธิ์ใช้คำสั่งนี้', ephemeral: true });
        return;
      }

      await interaction.reply({ content: 'ส่งข้อความเรียบร้อยแล้ว', ephemeral: true });
      const sentMessage = await interaction.channel.send({ ...buildRequestMessage() });

      // จำข้อความนี้ไว้ เพื่อให้ระบบสุ่มข้อความ/รูปคอยอัปเดตให้เรื่อยๆ
      activeSetupMessages.set(interaction.channel.id, sentMessage.id);
      return;
    }

    // 2) กดปุ่ม "รับยศ" -> เด้ง Modal ให้กรอกข้อมูล
    if (interaction.isButton() && interaction.customId === BUTTON_ID) {
      const modal = new ModalBuilder()
        .setCustomId(MODAL_ID)
        .setTitle('PRISSANA GANG by. [kids]');

      const nameInput = new TextInputBuilder()
        .setCustomId(NAME_INPUT_ID)
        .setLabel('name lastname')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('name lastname ')
        .setRequired(true)
        .setMaxLength(100);

      const fbInput = new TextInputBuilder()
        .setCustomId(FB_INPUT_ID)
        .setLabel('link facebook profile')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://www.facebook.com/yourprofile')
        .setRequired(true)
        .setMaxLength(300);

      const nameRow = new ActionRowBuilder().addComponents(nameInput);
      const fbRow = new ActionRowBuilder().addComponents(fbInput);
      modal.addComponents(nameRow, fbRow);

      await interaction.showModal(modal);
      return;
    }

    // 3) หลังผู้ใช้กด Submit ใน Modal -> ส่งคำขอไปช่องแอดมิน
    if (interaction.isModalSubmit() && interaction.customId === MODAL_ID) {
      const nameValue = interaction.fields.getTextInputValue(NAME_INPUT_ID).trim();
      const fbValue = interaction.fields.getTextInputValue(FB_INPUT_ID).trim();

      if (!ADMIN_CHANNEL_ID) {
        await interaction.reply({ content: 'ระบบยังไม่ได้ตั้งค่าช่องแอดมิน กรุณาติดต่อผู้ดูแลเซิร์ฟเวอร์', ephemeral: true });
        return;
      }

      const adminChannel = await interaction.guild.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
      if (!adminChannel) {
        await interaction.reply({ content: 'ไม่พบช่องแอดมิน กรุณาติดต่อผู้ดูแลเซิร์ฟเวอร์', ephemeral: true });
        return;
      }

      const requestEmbed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle('คำขอรับยศใหม่')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          { name: 'ผู้ขอ', value: `<@${interaction.user.id}> (${interaction.user.tag})` },
          { name: 'ชื่อ', value: nameValue },
          { name: 'ลิงก์เฟซบุ๊ก', value: fbValue },
          { name: 'สถานะ', value: 'รอการตรวจสอบ' },
        )
        .setTimestamp();

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${APPROVE_PREFIX}${interaction.user.id}`)
          .setLabel('อนุมัติ')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`${DENY_PREFIX}${interaction.user.id}`)
          .setLabel('ปฏิเสธ')
          .setStyle(ButtonStyle.Danger),
      );

      await adminChannel.send({ embeds: [requestEmbed], components: [actionRow] });

      const confirmEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('ส่งคำขอเรียบร้อยแล้ว')
        .setDescription('คำขอของคุณถูกส่งให้แอดมินตรวจสอบแล้ว กรุณารอผลการอนุมัติ\nเมื่อแอดมินตัดสินใจแล้ว บอทจะทักไปแจ้งผลทางข้อความส่วนตัว (DM)');

      await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });
      return;
    }

    // 4) แอดมินกดปุ่ม อนุมัติ / ปฏิเสธ ในช่องแอดมิน
    if (interaction.isButton() && (interaction.customId.startsWith(APPROVE_PREFIX) || interaction.customId.startsWith(DENY_PREFIX))) {
      // เช็คสิทธิ์ผู้กด ต้องมีสิทธิ์ Manage Roles ถึงจะกดได้
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        await interaction.reply({ content: 'คุณไม่มีสิทธิ์กดปุ่มนี้', ephemeral: true });
        return;
      }

      const isApprove = interaction.customId.startsWith(APPROVE_PREFIX);
      const targetUserId = interaction.customId.replace(isApprove ? APPROVE_PREFIX : DENY_PREFIX, '');

      const targetUser = await client.users.fetch(targetUserId).catch(() => null);

      if (isApprove) {
        // มอบยศให้ผู้ขอ
        try {
          const targetMember = await interaction.guild.members.fetch(targetUserId);
          if (ROLE_ID) {
            await targetMember.roles.add(ROLE_ID);
          }
        } catch (err) {
          console.error('เกิดข้อผิดพลาดตอนมอบยศ:', err);
        }

        // DM แจ้งผู้ใช้ว่าอนุมัติแล้ว
        if (targetUser) {
          const successEmbed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('คำขอของคุณได้รับการอนุมัติ')
            .setDescription('```คำขอรับยศของคุณในเซิร์ฟเวอร์ **' + interaction.guild.name + '** ได้รับการอนุมัติแล้ว ขอให้โชคดี :)```')
            .addFields({ name: 'อนุมัติโดย', value: `${interaction.user.tag}` });
          await targetUser.send({ embeds: [successEmbed] }).catch(() => {});
        }

        // อัปเดตข้อความในช่องแอดมิน
        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).spliceFields(3, 1, {
          name: 'สถานะ',
          value: `อนุมัติแล้วโดย <@${interaction.user.id}>`,
        });
        await interaction.update({ embeds: [updatedEmbed], components: [] });
      } else {
        // DM แจ้งผู้ใช้ว่าไม่ผ่านการอนุมัติ
        if (targetUser) {
          const denyEmbed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('คำขอของคุณไม่ผ่านการอนุมัติจากแอดมิน')
            .setDescription('```กรุณาตรวจสอบข้อมูลและลองส่งใหม่อีกครั้ง ขอให้โชคดี :)```')
            .addFields({ name: 'ปฏิเสธโดย', value: `${interaction.user.tag}` });
          await targetUser.send({ embeds: [denyEmbed] }).catch(() => {});
        }

        // อัปเดตข้อความในช่องแอดมิน
        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).spliceFields(3, 1, {
          name: 'สถานะ',
          value: `ปฏิเสธแล้วโดย <@${interaction.user.id}>`,
        });
        await interaction.update({ embeds: [updatedEmbed], components: [] });
      }
      return;
    }
  } catch (err) {
    console.error('เกิดข้อผิดพลาดใน interaction:', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง', ephemeral: true }).catch(() => {});
    }
  }
});

client.login(BOT_TOKEN);
