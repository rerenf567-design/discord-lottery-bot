const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
require("dotenv").config();

// ★ TOKEN チェック
const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) {
  console.error("❌ DISCORD_BOT_TOKEN が設定されていません");
  process.exit(1);
}

// ★ 全角→半角（！→!）
function normalize(str) {
  return str.replace(/[！]/g, "!");
}

// ★ ENV から設定を読み込む
let settings = {
  lotteryChannelId: process.env.LOTTERY_CHANNEL_ID || null,
  logChannelId: process.env.LOG_CHANNEL_ID || null
};

// ★ ENV に保存する関数（Render API で更新する想定）
async function saveSettingToEnv(key, value) {
  console.log(`ENV 更新: ${key} = ${value}`);
  // Render API で更新する方式に後で差し替え可能
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// 抽選ID生成
function generateLotteryId() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, "0");

  const date =
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate());

  const time =
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds());

  const random = Math.floor(1000 + Math.random() * 9000);

  return `${date}-${time}-${random}`;
}

// 日付（YYYY/MM/DD）
function getDateString() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, "0");
  return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}`;
}

// 抽選処理本体（即抽選専用）
async function runLottery(msg, messageId, prizes) {
  const targetMessage = await msg.channel.messages.fetch(messageId);
  await targetMessage.fetch();

  const reactions = Array.from(targetMessage.reactions.cache.values());
  const lotteryId = generateLotteryId();
  const dateString = getDateString();

  const embed = new EmbedBuilder()
    .setColor("#FFB7C5")
    .setDescription(
      "──────────\n" +
      "　　本日の抽選結果です\n" +
      "──────────\n" +
      "忘れずに入札してください\n"
    )
    .setTimestamp();

  let logText = `抽選ID: ${lotteryId}\n日付: ${dateString}\n`;

  for (let i = 0; i < prizes.length; i++) {
    const prize = prizes[i];
    const reaction = reactions[i];

    if (!reaction) {
      embed.addFields({
        name: `【${prize.name}】`,
        value: "対応するリアクションがありません"
      });
      logText += `${prize.name}, 参加者なし\n`;
      continue;
    }

    const users = await reaction.users.fetch();
    const filtered = users.filter((u) => !u.bot);

    if (filtered.size === 0) {
      embed.addFields({
        name: `【${prize.name}】`,
        value: "参加者がいません"
      });
      logText += `${prize.name}, 参加者なし\n`;
      continue;
    }

    const winners = filtered.random(prize.count);
    let winnerList;
    let winnerNamesForLog = [];

    if (Array.isArray(winners)) {
      winnerList = winners
        .map((w) => {
          const member = msg.guild.members.cache.get(w.id);
          const name = member ? member.displayName : w.username;
          winnerNamesForLog.push(name);
          return `・${name} (<@${w.id}>)`;
        })
        .join("\n");
    } else {
      const member = msg.guild.members.cache.get(winners.id);
      const name = member ? member.displayName : winners.username;
      winnerList = `・${name} (<@${winners.id}>)`;
      winnerNamesForLog.push(name);
    }

    embed.addFields({
      name: `【${prize.name}】`,
      value: winnerList
    });

    logText += `${prize.name}, ${winnerNamesForLog.join(", ")}\n`;
  }

  const logChannel = settings.logChannelId
    ? msg.guild.channels.cache.get(settings.logChannelId)
    : msg.channel;

  const logMessage = await logChannel.send("```\n" + logText + "```");

  embed.addFields({
    name: "──────────\n　ログはこちら",
    value: `${logMessage.url}\n──────────`
  });

  msg.reply({ embeds: [embed] });
}

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  const content = normalize(msg.content);

  // 抽選準備チャンネル設定
  if (content === "!抽選チャンネル設定") {
    settings.lotteryChannelId = msg.channel.id;
    await saveSettingToEnv("LOTTERY_CHANNEL_ID", msg.channel.id);
    msg.reply("このチャンネルを抽選準備チャンネルに設定しました。");
    return;
  }

  // ログチャンネル設定
  if (content === "!抽選ログチャンネル設定") {
    settings.logChannelId = msg.channel.id;
    await saveSettingToEnv("LOG_CHANNEL_ID", msg.channel.id);
    msg.reply("このチャンネルを抽選ログチャンネルに設定しました。");
    return;
  }

  // ヘルプ
  if (content === "!抽選ヘルプ") {
    const helpEmbed = new EmbedBuilder()
      .setTitle("抽選Botの使い方")
      .setColor("#FFB7C5")
      .setDescription(
        "──────────\n" +
        "　抽選Botの使い方\n" +
        "──────────\n\n" +
        "◆ **抽選の実行**\n" +
        "`!抽選 <メッセージID> A賞:1 B賞:2`\n\n" +
        "例：\n" +
        "`!抽選 123456789012345678 A賞:1 B賞:2`\n\n" +
        "◆ **設定コマンド**\n" +
        "`!抽選チャンネル設定`\n" +
        "`!抽選ログチャンネル設定`\n\n" +
        "※ 抽選は設定した抽選チャンネルでのみ実行できます"
      );

    msg.reply({ embeds: [helpEmbed] });
    return;
  }

  if (!settings.lotteryChannelId) return;
  if (msg.channel.id !== settings.lotteryChannelId) return;

  // 即抽選
  if (content.startsWith("!抽選 ")) {
    const args = content.split(" ").slice(1);

    if (args.length < 2) {
      msg.reply("使い方: `!抽選 <メッセージID> 商品名:人数 商品名:人数 ...`");
      return;
    }

    const messageId = args[0];
    const prizeSettings = args.slice(1);

    const prizes = prizeSettings.map((p) => {
      const [name, count] = p.split(":");
      return { name, count: Number(count) };
    });

    await runLottery(msg, messageId, prizes);
    return;
  }
});

console.log("TOKEN length:", TOKEN?.length);
client.login(TOKEN);
