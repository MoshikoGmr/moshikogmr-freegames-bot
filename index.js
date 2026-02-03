require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const Parser = require("rss-parser");
const fs = require("fs");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const parser = new Parser();
const postedFile = "posted.json";

// Cargar ya-publicados (para no repetir)
function loadPosted() {
  if (!fs.existsSync(postedFile)) return {};
  try { return JSON.parse(fs.readFileSync(postedFile, "utf8")); }
  catch { return {}; }
}
function savePosted(data) {
  fs.writeFileSync(postedFile, JSON.stringify(data, null, 2));
}
function getImageFromLink(link) {
  if (!link) return null;

  // Steam → portada oficial
  const steamMatch = link.match(/store\.steampowered\.com\/app\/(\d+)/);
  if (steamMatch) {
    const appId = steamMatch[1];
    return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
  }

  // IndieGala → imagen limpia genérica
  if (link.includes("indiegala")) {
    return "https://www.indiegala.com/themes/images/indiegala_logo.png";
  }

  // Itch.io → icono oficial
  if (link.includes("itch.io")) {
    return "https://static.itch.io/images/app-icon.png";
  }

  // Fallback gamer (puedes cambiarla luego por una tuya)
  return "https://i.imgur.com/8ZQZQZQ.png";
}

function buildEmbed(item) {
  const title = item.title?.trim() || "Free game";
  const url = item.link;
  const desc = (item.contentSnippet || item.content || "").toString().slice(0, 300);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setURL(url)
    .setDescription(desc || "Gratis por tiempo limitado.")
    .addFields(
      { name: "Fuente", value: "IsThereAnyDeal – Giveaways", inline: true },
      { name: "Recomendado por", value: process.env.BRAND_NAME || "MoshikoGMR", inline: true }
    )
    .setFooter({ text: "🔥 Freebies para la comunidad" });

  // Si el RSS trae imagen (a veces sí), intenta usarla
 const image = getImageFromLink(item.link);
if (image) embed.setImage(image);


  return embed;
}

async function checkFeedAndPost() {
  const channelId = process.env.CHANNEL_ID;
  const feedUrl = process.env.FEED_URL;

  if (!channelId || !feedUrl) {
    console.log("Falta CHANNEL_ID o FEED_URL en .env");
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

  // Publicar del más viejo al más nuevo (para que quede ordenado)
  const items = (feed.items || []).slice(0, 10).reverse();

  for (const item of items) {
    const key = item.guid || item.id || item.link || item.title;
    if (!key) continue;

    if (posted[key]) continue; // ya publicado

    const embed = buildEmbed(item);

    await channel.send({
      content: "🎁 **Nuevo freebie** (tiempo limitado)",
      embeds: [embed],
    });

    posted[key] = true;
    savePosted(posted);

    // mini pausa para no spamear
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log("Check OK:", new Date().toLocaleString());
}

client.once("ready", () => {
  console.log(`Conectado como ${client.user.tag}`);

  // Corre apenas arranca
  checkFeedAndPost();

  client.once("ready", async () => {
  console.log(`Conectado como ${client.user.tag}`);

  try {
    await checkFeedAndPost();
  } catch (e) {
    console.error("Error en ejecución:", e);
  } finally {
    process.exit(0); // <- CLAVE: termina el job
  }
});

});

client.login(process.env.DISCORD_TOKEN);

