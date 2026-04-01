// ═══════════════════════════════════════════════════════════════════════════════
// CLASH ARENA — server/server.js
// Express + UnbelievaBoat Economy API + Coffres + Paris + Serve Vite Build
// Compatible Render.com (free tier)
// ═══════════════════════════════════════════════════════════════════════════════
import express from "express";
import cors    from "cors";
import dotenv  from "dotenv";
import fetch   from "node-fetch";
import { fileURLToPath } from "url";
import { dirname, join }  from "path";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3001; // Render injecte process.env.PORT

app.use(cors());
app.use(express.json());

// ── Servir le frontend Vite buildé (dossier public/ à la racine) ─────────────
// En production sur Render, le build Vite est dans /public
const publicDir = join(__dirname, "../public");
app.use(express.static(publicDir));

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════
const UNB_BASE  = "https://unbelievaboat.com/api/v1";
const UNB_TOKEN = process.env.UNB_API_TOKEN;  // Depuis https://unbelievaboat.com/api/docs
const GUILD_ID  = process.env.GUILD_ID;        // ID du serveur Discord cible

// ═══════════════════════════════════════════════════════════════════════════════
// CARTES
// ═══════════════════════════════════════════════════════════════════════════════
const CARDS_DB = {
  knight:        { id:"knight",        name:"Chevalier",       type:"troop",    rarity:"common", cost:3, attack:75,  defense:60,  speed:"moyen",      description:"Solide guerrier polyvalent.",             emoji:"⚔️",  color:"#C0C0C0" },
  archer:        { id:"archer",        name:"Archères",        type:"troop",    rarity:"common", cost:3, attack:55,  defense:30,  speed:"rapide",     description:"Duo d'archères à longue portée.",         emoji:"🏹",  color:"#7EC850" },
  giant:         { id:"giant",         name:"Géant",           type:"troop",    rarity:"rare",   cost:5, attack:100, defense:120, speed:"lent",       description:"Tank qui cible les tours.",               emoji:"🗿",  color:"#8B7355" },
  prince:        { id:"prince",        name:"Prince",          type:"troop",    rarity:"epic",   cost:5, attack:140, defense:70,  speed:"très rapide",description:"Charge dévastatrice.",                    emoji:"🤴",  color:"#9B59B6" },
  wizard:        { id:"wizard",        name:"Sorcier",         type:"troop",    rarity:"epic",   cost:5, attack:110, defense:50,  speed:"moyen",      description:"Boules de feu. Dégâts de zone.",          emoji:"🧙",  color:"#E74C3C" },
  minions:       { id:"minions",       name:"Sbires",          type:"troop",    rarity:"common", cost:3, attack:60,  defense:25,  speed:"rapide",     description:"Trio de créatures volantes.",             emoji:"👹",  color:"#3498DB" },
  pekka:         { id:"pekka",         name:"P.E.K.K.A",       type:"troop",    rarity:"epic",   cost:7, attack:180, defense:150, speed:"lent",       description:"Robot de destruction blindé.",            emoji:"🤖",  color:"#2C3E50" },
  skeleton_army: { id:"skeleton_army", name:"Armée Squelette", type:"troop",    rarity:"epic",   cost:3, attack:40,  defense:10,  speed:"rapide",     description:"15 squelettes. Submerge les tanks.",     emoji:"💀",  color:"#ECF0F1" },
  goblin:        { id:"goblin",        name:"Goblins",         type:"troop",    rarity:"common", cost:2, attack:65,  defense:20,  speed:"très rapide",description:"Petits et rapides. Bas coût.",            emoji:"👺",  color:"#27AE60" },
  dragon:        { id:"dragon",        name:"Bébé Dragon",     type:"troop",    rarity:"epic",   cost:4, attack:120, defense:80,  speed:"rapide",     description:"Vole et crache du feu.",                  emoji:"🐲",  color:"#E67E22" },
  fireball:      { id:"fireball",      name:"Boule de Feu",    type:"spell",    rarity:"rare",   cost:4, attack:90,  defense:0,   speed:"instant",    description:"Explosion de zone. Élimine les swarms.",  emoji:"🔥",  color:"#E67E22" },
  lightning:     { id:"lightning",     name:"Éclair",          type:"spell",    rarity:"epic",   cost:6, attack:200, defense:0,   speed:"instant",    description:"Frappe les 3 ennemis les + puissants.",  emoji:"⚡",  color:"#F1C40F" },
  freeze:        { id:"freeze",        name:"Gel",             type:"spell",    rarity:"epic",   cost:4, attack:0,   defense:0,   speed:"instant",    description:"Gèle tout pendant 4s.",                   emoji:"❄️",  color:"#85C1E9" },
  arrows:        { id:"arrows",        name:"Flèches",         type:"spell",    rarity:"common", cost:3, attack:50,  defense:0,   speed:"instant",    description:"Pluie de flèches sur les swarms.",        emoji:"🎯",  color:"#27AE60" },
  poison:        { id:"poison",        name:"Poison",          type:"spell",    rarity:"epic",   cost:4, attack:70,  defense:0,   speed:"instant",    description:"Zone empoisonnée persistante.",           emoji:"🧪",  color:"#8E44AD" },
  cannon:        { id:"cannon",        name:"Canon",           type:"building", rarity:"common", cost:3, attack:80,  defense:100, speed:"fixe",       description:"Tour défensive solide.",                  emoji:"💣",  color:"#7F8C8D" },
  inferno_tower: { id:"inferno_tower", name:"Tour Inferno",    type:"building", rarity:"rare",   cost:5, attack:200, defense:150, speed:"fixe",       description:"Dégâts cumulatifs. Détruit les tanks.",   emoji:"🌋",  color:"#E74C3C" },
  bomb_tower:    { id:"bomb_tower",    name:"Tour Bombe",      type:"building", rarity:"rare",   cost:4, attack:70,  defense:120, speed:"fixe",       description:"Bombes. Efficace sur les swarms.",        emoji:"💥",  color:"#E67E22" },
};

const ALL_CARDS = Object.keys(CARDS_DB);

// ═══════════════════════════════════════════════════════════════════════════════
// ÉTAT EN MÉMOIRE
// ═══════════════════════════════════════════════════════════════════════════════
const queue   = [];
const matches = new Map();
const players = new Map();

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
function genId() { return `${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }

function computeElo(wElo, lElo, k=32) {
  const exp = 1 / (1 + Math.pow(10,(lElo-wElo)/400));
  return { newWinner: Math.round(wElo + k*(1-exp)), newLoser: Math.round(lElo + k*(0-(1-exp))) };
}

function getRank(elo) {
  if (elo>=4000) return { name:"Champion", icon:"👑", color:"#FFD700" };
  if (elo>=3000) return { name:"Master",   icon:"💎", color:"#00BFFF" };
  if (elo>=2000) return { name:"Or",       icon:"🥇", color:"#FFA500" };
  if (elo>=1500) return { name:"Argent",   icon:"🥈", color:"#C0C0C0" };
  if (elo>=1200) return { name:"Bronze",   icon:"🥉", color:"#CD7F32" };
  return             { name:"Arène I",   icon:"⚔️", color:"#8B7355" };
}

function initPlayer(userId, username, avatar) {
  return {
    userId, username, avatar: avatar||null,
    elo:1200, wins:0, losses:0,
    deck:["knight","archer","fireball","arrows","giant","cannon","minions","wizard"],
    unlockedCards: ALL_CARDS, createdAt: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS UNBELIVABOAT
// ═══════════════════════════════════════════════════════════════════════════════

/** Headers pour toutes les requêtes UNB */
function unbHeaders() {
  return { Authorization: UNB_TOKEN, "Content-Type": "application/json" };
}

/** Récupère le solde d'un utilisateur */
async function getUnbBalance(userId) {
  if (!UNB_TOKEN || !GUILD_ID) return null;
  const res = await fetch(`${UNB_BASE}/guilds/${GUILD_ID}/users/${userId}`, {
    headers: unbHeaders(),
  });
  if (!res.ok) return null;
  return res.json(); // { user_id, cash, bank, total }
}

/**
 * Modifie le solde d'un utilisateur (delta positif = ajouter, négatif = retirer)
 * Utilise PATCH /users/:userId qui fait un delta relatif
 */
async function editUnbBalance(userId, cashDelta, reason = "Clash Arena") {
  if (!UNB_TOKEN || !GUILD_ID) return null;
  const res = await fetch(`${UNB_BASE}/guilds/${GUILD_ID}/users/${userId}`, {
    method: "PATCH",
    headers: unbHeaders(),
    body: JSON.stringify({ cash: cashDelta, reason }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("UNB balance error:", err);
    return null;
  }
  return res.json();
}

/**
 * Génère les récompenses d'un coffre selon son type
 */
function generateChestRewards(chestId) {
  const pools = {
    wood:    { cards: [1,2],  rarities: { common:100 },                 bonusCash: [50,150]   },
    silver:  { cards: [2,3],  rarities: { common:70, rare:30 },         bonusCash: [100,300]  },
    gold:    { cards: [3,4],  rarities: { common:40, rare:45, epic:15 },bonusCash: [200,600]  },
    magical: { cards: [4,5],  rarities: { common:20, rare:30, epic:50 },bonusCash: [500,1500] },
  };
  const pool = pools[chestId] || pools.wood;
  const rewards = [];

  // Nombre de cartes
  const nbCards = pool.cards[0] + Math.floor(Math.random() * (pool.cards[1] - pool.cards[0] + 1));

  for (let i = 0; i < nbCards; i++) {
    const roll = Math.random() * 100;
    let rarity = "common";
    let acc = 0;
    for (const [r, w] of Object.entries(pool.rarities)) {
      acc += w; if (roll < acc) { rarity = r; break; }
    }
    const candidates = ALL_CARDS.filter((id) => CARDS_DB[id].rarity === rarity);
    const picked     = CARDS_DB[candidates[Math.floor(Math.random() * candidates.length)]];
    const rarityLabel = { common:"🔵 Commune", rare:"🟣 Rare", epic:"🟡 Épique" }[rarity];
    rewards.push({
      emoji: picked.emoji, name: picked.name, value: rarityLabel,
    });
  }

  // Bonus de pièces
  const [min, max] = pool.bonusCash;
  const bonusCash  = min + Math.floor(Math.random() * (max - min + 1));
  rewards.push({ emoji: "🪙", name: "Pièces bonus", value: `+${bonusCash.toLocaleString()} coins` });

  return { rewards, bonusCash };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES AUTH
// ═══════════════════════════════════════════════════════════════════════════════
app.post("/api/token", async (req, res) => {
  try {
    const r = await fetch("https://discord.com/api/oauth2/token", {
      method:"POST", headers:{ "Content-Type":"application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     process.env.VITE_DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type:    "authorization_code",
        code:          req.body.code,
      }),
    });
    const { access_token } = await r.json();
    res.json({ access_token });
  } catch { res.status(500).json({ error:"Token exchange failed" }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES JOUEUR
// ═══════════════════════════════════════════════════════════════════════════════
app.post("/api/player/init", (req, res) => {
  const { userId, username, avatar } = req.body;
  if (!players.has(userId)) players.set(userId, initPlayer(userId, username, avatar));
  const p = players.get(userId);
  res.json({ ...p, rank: getRank(p.elo) });
});

app.get("/api/player/:userId", (req, res) => {
  const p = players.get(req.params.userId);
  if (!p) return res.status(404).json({ error:"Joueur inconnu" });
  res.json({ ...p, rank: getRank(p.elo) });
});

app.post("/api/player/:userId/deck", (req, res) => {
  const { deck } = req.body;
  const p = players.get(req.params.userId);
  if (!p) return res.status(404).json({ error:"Joueur inconnu" });
  if (!Array.isArray(deck) || deck.length !== 8) return res.status(400).json({ error:"Deck invalide" });
  if (deck.some((id) => !CARDS_DB[id])) return res.status(400).json({ error:"Carte inconnue" });
  p.deck = deck;
  res.json({ success:true, deck });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES CARTES
// ═══════════════════════════════════════════════════════════════════════════════
app.get("/api/cards",     (_req, res) => res.json(Object.values(CARDS_DB)));
app.get("/api/cards/:id", (req, res) => {
  const c = CARDS_DB[req.params.id];
  c ? res.json(c) : res.status(404).json({ error:"Carte introuvable" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES ÉCONOMIE UNBELIVABOAT
// ═══════════════════════════════════════════════════════════════════════════════

/** GET balance d'un joueur */
app.get("/api/economy/balance/:userId", async (req, res) => {
  const data = await getUnbBalance(req.params.userId);
  if (!data) return res.json({ cash: 0, bank: 0, total: 0, unavailable: true });
  res.json(data);
});

/** POST ouvrir un coffre : débite les pièces, génère les récompenses */
app.post("/api/economy/open-chest", async (req, res) => {
  const { userId, chestId, cost } = req.body;

  // Vérifier le solde si UNB disponible
  const balData = await getUnbBalance(userId);
  if (balData) {
    if (balData.cash < cost) {
      return res.status(400).json({ error: `Solde insuffisant (${balData.cash} < ${cost})` });
    }
    // Déduire le coût du coffre
    const deducted = await editUnbBalance(userId, -cost, `Clash Arena — Ouverture coffre ${chestId}`);
    if (!deducted) return res.status(500).json({ error:"Erreur lors du débit UNB" });

    const { rewards, bonusCash } = generateChestRewards(chestId);

    // Ajouter le bonus de pièces du coffre
    if (bonusCash > 0) await editUnbBalance(userId, bonusCash, `Clash Arena — Récompense coffre ${chestId}`);

    const updatedBal = await getUnbBalance(userId);
    return res.json({ rewards, newBalance: updatedBal?.cash ?? deducted.cash - cost + bonusCash });
  }

  // UNB non configuré : mode démo (pas de vrai débit)
  const { rewards, bonusCash } = generateChestRewards(chestId);
  res.json({ rewards, newBalance: 0, demo: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES FILE D'ATTENTE
// ═══════════════════════════════════════════════════════════════════════════════
app.post("/api/queue/join", async (req, res) => {
  const { userId, username, avatar, bet = 0 } = req.body;

  if (!players.has(userId)) players.set(userId, initPlayer(userId, username, avatar));

  if (queue.find((p) => p.userId === userId)) return res.json({ status:"already_in_queue" });
  for (const [matchId, m] of matches) {
    if (m.status !== "finished" && m.players.some((p) => p.userId === userId))
      return res.json({ status:"already_in_match", matchId });
  }

  // Vérifier le solde si mise
  if (bet > 0) {
    const bal = await getUnbBalance(userId);
    if (bal && bal.cash < bet) return res.status(400).json({ error:`Mise trop élevée (solde: ${bal.cash})` });
  }

  const pd = players.get(userId);
  queue.push({ userId, username, avatar, elo: pd.elo, deck: pd.deck, bet, joinedAt: Date.now() });

  if (queue.length >= 2) {
    const [p1, p2] = queue.splice(0, 2);
    // La mise effective = minimum des deux mises (l'adversaire doit pouvoir payer)
    const effectiveBet = Math.min(p1.bet || 0, p2.bet || 0);
    const matchId = `match_${genId()}`;
    matches.set(matchId, {
      players: [p1, p2],
      status: "in_progress",
      winner: null,
      bet: effectiveBet,
      towerHp: { [p1.userId]: 3000, [p2.userId]: 3000 },
      playedCards: [],
      startedAt: Date.now(),
    });
    const opponent = p1.userId === userId ? p2 : p1;
    return res.json({ status:"matched", matchId, opponent, bet: effectiveBet });
  }

  res.json({ status:"waiting" });
});

app.get("/api/queue/status/:userId", (req, res) => {
  const { userId } = req.params;
  for (const [matchId, m] of matches) {
    if (m.status !== "finished" && m.players.some((p) => p.userId === userId)) {
      const opponent = m.players.find((p) => p.userId !== userId);
      return res.json({ status:"matched", matchId, opponent, matchStatus: m.status, towerHp: m.towerHp, bet: m.bet });
    }
  }
  const inQ = queue.find((p) => p.userId === userId);
  if (inQ) return res.json({ status:"waiting", queueSize: queue.length });
  res.json({ status:"idle" });
});

app.post("/api/queue/leave", (req, res) => {
  const idx = queue.findIndex((p) => p.userId === req.body.userId);
  if (idx !== -1) queue.splice(idx, 1);
  res.json({ status:"left_queue" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES MATCH
// ═══════════════════════════════════════════════════════════════════════════════
app.post("/api/match/:matchId/play-card", (req, res) => {
  const match = matches.get(req.params.matchId);
  if (!match) return res.status(404).json({ error:"Match introuvable" });
  if (match.status !== "in_progress") return res.status(400).json({ error:"Match terminé" });

  const { userId, cardId } = req.body;
  const card = CARDS_DB[cardId];
  if (!card) return res.status(400).json({ error:"Carte invalide" });

  const player = players.get(userId);
  if (!player?.deck.includes(cardId)) return res.status(400).json({ error:"Carte non dans le deck" });

  const opponent = match.players.find((p) => p.userId !== userId);
  const dmg = Math.round(card.attack * (0.8 + Math.random() * 0.4));
  match.towerHp[opponent.userId] = Math.max(0, match.towerHp[opponent.userId] - dmg);

  const action = { playerId: userId, cardId, damage: dmg, towerHpAfter: match.towerHp[opponent.userId], timestamp: Date.now() };
  match.playedCards.push(action);

  if (match.towerHp[opponent.userId] <= 0) {
    match.status = "finished"; match.winner = userId; match.finishedAt = Date.now();
    const wr = players.get(userId); const lr = players.get(opponent.userId);
    if (wr && lr) {
      const { newWinner, newLoser } = computeElo(wr.elo, lr.elo);
      const wd = newWinner-wr.elo; const ld = newLoser-lr.elo;
      wr.elo = newWinner; wr.wins++; lr.elo = newLoser; lr.losses++;
      // Transfert de pièces via UNB (non bloquant)
      if (match.bet > 0) {
        editUnbBalance(opponent.userId, -match.bet, `Clash Arena — Défaite (mise: ${match.bet})`).catch(()=>{});
        editUnbBalance(userId,          +match.bet, `Clash Arena — Victoire (gain: ${match.bet})`).catch(()=>{});
        match.coinResult = { winner: userId, loser: opponent.userId, amount: match.bet };
      }
      return res.json({ action, matchOver:true, winner:userId, towerHp:match.towerHp,
        eloChanges:{ [userId]:{newElo:newWinner,diff:wd}, [opponent.userId]:{newElo:newLoser,diff:ld} },
        coinResult: match.coinResult||null });
    }
  }
  res.json({ action, matchOver:false, towerHp:match.towerHp });
});

app.get("/api/match/:matchId", (req, res) => {
  const m = matches.get(req.params.matchId);
  if (!m) return res.status(404).json({ error:"Match introuvable" });
  res.json({ ...m, playedCards: m.playedCards.slice(-10) });
});

app.post("/api/match/result", async (req, res) => {
  const { matchId, winnerId, loserId } = req.body;
  const match = matches.get(matchId);
  if (!match) return res.status(404).json({ error:"Match introuvable" });
  if (match.status === "finished") return res.json({ status:"already_finished" });

  match.status = "finished"; match.winner = winnerId; match.finishedAt = Date.now();
  const wr = players.get(winnerId); const lr = players.get(loserId);

  let coinResult = null;
  if (wr && lr) {
    const { newWinner, newLoser } = computeElo(wr.elo, lr.elo);
    wr.elo = newWinner; wr.wins++; lr.elo = newLoser; lr.losses++;

    // Transfert de pièces
    if (match.bet > 0) {
      await Promise.all([
        editUnbBalance(loserId,   -match.bet, `Clash Arena — Défaite (mise: ${match.bet})`),
        editUnbBalance(winnerId,  +match.bet, `Clash Arena — Victoire (gain: ${match.bet})`),
      ]);
      coinResult = { winner: winnerId, loser: loserId, amount: match.bet };
    }

    return res.json({
      status:"finished",
      winner: { userId:winnerId, newElo:newWinner },
      loser:  { userId:loserId,  newElo:newLoser  },
      coinResult,
    });
  }
  res.json({ status:"finished" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSEMENT
// ═══════════════════════════════════════════════════════════════════════════════
app.get("/api/leaderboard", (_req, res) => {
  const sorted = [...players.values()]
    .sort((a,b) => b.elo-a.elo).slice(0,20)
    .map((p) => ({ ...p, rank: getRank(p.elo) }));
  res.json(sorted);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SPA FALLBACK — Renvoie index.html pour toutes les autres routes (Vite SPA)
// ═══════════════════════════════════════════════════════════════════════════════
app.get("*", (_req, res) => {
  res.sendFile(join(publicDir, "index.html"), (err) => {
    if (err) res.status(200).send("Clash Arena — Server OK");
  });
});

app.listen(PORT, () => {
  console.log(`⚔️  Clash Arena server → http://localhost:${PORT}`);
  console.log(`   UNB API: ${UNB_TOKEN ? "✅ Configuré" : "⚠️  Non configuré (mode démo)"}`);
  console.log(`   Guild:   ${GUILD_ID  ? "✅ " + GUILD_ID : "⚠️  Non configuré"}`);
});
