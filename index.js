if (!process.env.DISCORD_TOKEN) require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const Parser = require("rss-parser");
const fs = require("fs");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const parser = new Parser();
const postedFile = "posted.json";

// ====== Persistencia local (ojo: en GitHub Actions no persiste entre runs) ======
function loadPosted() {
  if (!fs.existsSync(postedFile)) return {};
  try {
    return JSON.parse(fs.readFileSync(postedFile, "utf8"));
  } catch {
    return {};
  }
}
function savePosted(data) {
  fs.writeFileSync(postedFile, JSON.stringify(data, null, 2));
}
// ============================================================================

function storeFromLink(link = "") {
  const l = link.toLowerCase();
  if (l.includes("store.steampowered.com")) return "steam";
  if (l.includes("epicgames.com")) return "epic";
  if (l.includes("gog.com")) return "gog";
  if (l.includes("indiegala")) return "indiegala";
  if (l.includes("itch.io")) return "itch";
  return "other";
}

// Logos en PNG (Discord-friendly)
function storeLogoPng(store) {
  switch (store) {
    case "steam":
      return "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Steam_icon_logo.svg/512px-Steam_icon_logo.svg.png";
    case "epic":
      return "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Epic_Games_logo.svg/512px-Epic_Games_logo.svg.png";
    case "gog":
      return "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/GOG.com_logo.svg/512px-GOG.com_logo.svg.png";
    case "itch":
      return "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Itch.io_logo.svg/512px-Itch.io_logo.svg.png";
    case "indiegala":
      return "https://upload.wikimedia.org/wikipedia/commons/2/2d/IndieGala_logo.png";
    default:
      return "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Gamepad_icon.svg/512px-Gamepad_icon.svg.png";
  }
}

// Imagen “grande” del juego (si se puede). Si no, devuelve null.
function coverImage(item) {
  const enclosure = item?.enclosure?.url;
  if (enclosure && /^https?:\/\//i.test(enclosure)) return enclosure;

  const link = item?.link || "";
  if (!link) return null;

  // Steam → portada real del juego
  const steamMatch = link.match(/store\.steampowered\.com\/app\/(\d+)/);
  if (steamMatch) {
    const appId = steamMatch[1];
    return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
  }

  // Para otras stores, normalmente no hay un cover directo fiable sin API/scraping
  return null;
}

function buildEmbed(item) {
  const title = (item?.title || "Freebie").toString().trim();
  const url = item?.link || null;
  const descRaw = (item?.contentSnippet || item?.content || "").toString();
  const desc = descRaw.replace(/\s+/g, " ").slice(0, 280);

  const store = storeFromLink(url || "");
  const logo = storeLogoPng(store);
  const cover = coverImage(item);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc || "Gratis por tiempo limitado.")
    .setFooter({ text: "🔥 Freebies para la comunidad" })
    .setTimestamp(new Date())
    .setColor(0x00ffff) // cyan gamer (puedes cambiarlo si quieres)
    .addFields(
      { name: "Fuente", value: "IsThereAnyDeal – Giveaways", inline: true },
      { name: "Recomendado por", value: process.env.BRAND_NAME || "MoshikoGMR", inline: true }
    )
    .setThumbnail(logo);

  if (url) embed.setURL(url);

  // Imagen grande: si hay cover real, úsalo. Si no, usa el logo (queda chevere igual).
  embed.setImage(cover || logo);

  return embed;
}

async function checkFeedAndPost() {
  const channelId = process.env.CHANNEL_ID;
  const feedUrl = process.env.FEED_URL;

  if (!channelId || !feedUrl) {
    console.log("Falta CHANNEL_ID o FEED_URL");
    return;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.log("No pude acceder al canal. Revisa permisos o CHANNEL_ID.");
    return;
  }

  const posted = loadPosted();

  let feed;
  try {
    feed = await parser.parseURL(feedUrl);
  } catch (e) {
    console.log("Error leyendo RSS:", e.message);
    return;
  }

  const items = (feed.items || []).slice(0, 10).reverse();

  for (const item of items) {
    const key = item.guid || item.id || item.link || item.title;
    if (!key) continue;
    if (posted[key]) continue;

    const embed = buildEmbed(item);

    await channel.send({
      content: "🎁 **Nuevo freebie** (tiempo limitado)",
      embeds: [embed],
    });

    posted[key] = true;
    savePosted(posted);

    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log("Check OK:", new Date().toLocaleString());
}

client.once("ready", async () => {
  console.log(`Conectado como ${client.user.tag}`);

  try {
    await checkFeedAndPost();
  } catch (e) {
    console.error("Error en ejecución:", e);
  } finally {
    process.exit(0); // termina el job en GitHub Actions
  }
});

client.login(process.env.DISCORD_TOKEN);
