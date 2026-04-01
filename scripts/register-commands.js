// scripts/register-commands.js — exécuter une seule fois
import fetch  from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const APPLICATION_ID = process.env.VITE_DISCORD_CLIENT_ID;
const BOT_TOKEN      = process.env.DISCORD_BOT_TOKEN;

if (!APPLICATION_ID || !BOT_TOKEN) {
  console.error("❌  VITE_DISCORD_CLIENT_ID ou DISCORD_BOT_TOKEN manquant dans .env");
  process.exit(1);
}

const r = await fetch(
  `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`,
  {
    method:  "PUT",
    headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    body:    JSON.stringify([
      { type:1, name:"launch", description:"⚔️ Lancer Clash Arena 1v1", handler:2 },
    ]),
  }
);
console.log(r.ok ? "✅ Commande /launch enregistrée !" : "❌ " + await r.text());
