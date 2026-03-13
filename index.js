const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");
require("dotenv").config();

const TOKEN = process.env.DISCORD_BOT_TOKEN;

// 設定ファイル読み込み
let settings = {
  lotteryChannelId: null,
  logChannelId: null
};

const SETTINGS_FILE = "./settings.json";

// 設定ファイル読み込み（存在しなければ作成）
if (fs.existsSync(SETTINGS_FILE)) {
  settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
} else {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// 設定保存関数
function saveSettings() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
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

  // ★ かわいい抽選発表デザイン
  const embed = new EmbedBuilder()
    .setColor("#FFB7C5") // かわいいピンク
    .setDescription(
      "──────────\n" +
      "　　本日の抽選結果です\n" +
      "──────────\n" +
      "忘れずに入札してください\n"
    )
    .setTimestamp();

  // ★ ログ（抽選IDと日付はログにのみ残す）
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

  // ★ ログ送信先
  const logChannel = settings.logChannelId
    ? msg.guild.channels.cache.get(settings.logChannelId)
    : msg.channel;

  // ★ ログ送信（リンク取得のため await）
  const logMessage = await logChannel.send("```\n" + logText + "```");

  // ★ Embed の一番下にログへのリンクを追加
  embed.addFields({
    name: "──────────\n　ログはこちら",
    value: `${logMessage.url}\n──────────`
  });

  // ★ Embed を返信
  msg.reply({ embeds: [embed] });
}

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  // 抽選準備チャンネル設定
  if (msg.content === "!抽選チャンネル設定") {
    settings.lotteryChannelId = msg.channel.id;
    saveSettings();
    msg.reply("このチャンネルを抽選準備チャンネルに設定しました。");
    return;
  }

  // ログチャンネル設定
  if (msg.content === "!抽選ログチャンネル設定") {
    settings.logChannelId = msg.channel.id;
    saveSettings();
    msg.reply("このチャンネルを抽選ログチャンネルに設定しました。");
    return;
  }

  // ヘルプコマンド（かわいい版）
  if (msg.content === "!抽選ヘルプ") {
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

  // 抽選準備チャンネルが未設定なら無視
  if (!settings.lotteryChannelId) return;

  // 抽選準備チャンネル以外は無視
  if (msg.channel.id !== settings.lotteryChannelId) return;

  // 即抽選方式
  if (msg.content.startsWith("!抽選 ")) {
    const args = msg.content.split(" ").slice(1);

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

client.login(TOKEN);