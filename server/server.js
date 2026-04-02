// ═══════════════════════════════════════════════════════════════════════════════
// CLASH ARENA — server/server.js  (version corrigée)
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
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const publicDir = join(__dirname, "../public");
app.use(express.static(publicDir));

// ── Config UNB ────────────────────────────────────────────────────────────────
const UNB_BASE  = "https://unbelievaboat.com/api/v1";
const UNB_TOKEN = process.env.UNB_API_TOKEN || "";
const GUILD_ID  = process.env.GUILD_ID      || "";

// ═══════════════════════════════════════════════════════════════════════════════
// CARTES — seules 8 cartes de base débloquées, les autres s'obtiennent via coffres
// ═══════════════════════════════════════════════════════════════════════════════
const CARDS_DB = {
  knight:        { id:"knight",        name:"Chevalier",       type:"troop",    rarity:"common", cost:3, attack:75,  defense:60,  speed:"moyen",       description:"Solide guerrier polyvalent.",            emoji:"⚔️" },
  archer:        { id:"archer",        name:"Archères",        type:"troop",    rarity:"common", cost:3, attack:55,  defense:30,  speed:"rapide",      description:"Duo d'archères à longue portée.",        emoji:"🏹" },
  giant:         { id:"giant",         name:"Géant",           type:"troop",    rarity:"rare",   cost:5, attack:100, defense:120, speed:"lent",        description:"Tank qui cible les tours.",              emoji:"🗿" },
  prince:        { id:"prince",        name:"Prince",          type:"troop",    rarity:"epic",   cost:5, attack:140, defense:70,  speed:"très rapide", description:"Charge dévastatrice.",                   emoji:"🤴" },
  wizard:        { id:"wizard",        name:"Sorcier",         type:"troop",    rarity:"epic",   cost:5, attack:110, defense:50,  speed:"moyen",       description:"Boules de feu. Dégâts de zone.",         emoji:"🧙" },
  minions:       { id:"minions",       name:"Sbires",          type:"troop",    rarity:"common", cost:3, attack:60,  defense:25,  speed:"rapide",      description:"Trio de créatures volantes.",            emoji:"👹" },
  pekka:         { id:"pekka",         name:"P.E.K.K.A",       type:"troop",    rarity:"epic",   cost:7, attack:180, defense:150, speed:"lent",        description:"Robot de destruction blindé.",           emoji:"🤖" },
  skeleton_army: { id:"skeleton_army", name:"Armée Squelette", type:"troop",    rarity:"epic",   cost:3, attack:40,  defense:10,  speed:"rapide",      description:"15 squelettes. Submerge les tanks.",    emoji:"💀" },
  goblin:        { id:"goblin",        name:"Goblins",         type:"troop",    rarity:"common", cost:2, attack:65,  defense:20,  speed:"très rapide", description:"Petits et rapides. Bas coût.",           emoji:"👺" },
  dragon:        { id:"dragon",        name:"Bébé Dragon",     type:"troop",    rarity:"epic",   cost:4, attack:120, defense:80,  speed:"rapide",      description:"Vole et crache du feu.",                 emoji:"🐲" },
  fireball:      { id:"fireball",      name:"Boule de Feu",    type:"spell",    rarity:"rare",   cost:4, attack:90,  defense:0,   speed:"instant",     description:"Explosion de zone.",                     emoji:"🔥" },
  lightning:     { id:"lightning",     name:"Éclair",          type:"spell",    rarity:"epic",   cost:6, attack:200, defense:0,   speed:"instant",     description:"Frappe les 3 plus puissants.",           emoji:"⚡" },
  freeze:        { id:"freeze",        name:"Gel",             type:"spell",    rarity:"epic",   cost:4, attack:0,   defense:0,   speed:"instant",     description:"Gèle tout pendant 4s.",                  emoji:"❄️" },
  arrows:        { id:"arrows",        name:"Flèches",         type:"spell",    rarity:"common", cost:3, attack:50,  defense:0,   speed:"instant",     description:"Pluie de flèches sur les swarms.",       emoji:"🎯" },
  poison:        { id:"poison",        name:"Poison",          type:"spell",    rarity:"epic",   cost:4, attack:70,  defense:0,   speed:"instant",     description:"Zone empoisonnée persistante.",          emoji:"🧪" },
  cannon:        { id:"cannon",        name:"Canon",           type:"building", rarity:"common", cost:3, attack:80,  defense:100, speed:"fixe",        description:"Tour défensive solide.",                 emoji:"💣" },
  inferno_tower: { id:"inferno_tower", name:"Tour Inferno",    type:"building", rarity:"rare",   cost:5, attack:200, defense:150, speed:"fixe",        description:"Dégâts cumulatifs. Détruit les tanks.",  emoji:"🌋" },
  bomb_tower:    { id:"bomb_tower",    name:"Tour Bombe",      type:"building", rarity:"rare",   cost:4, attack:70,  defense:120, speed:"fixe",        description:"Bombes. Efficace sur les swarms.",       emoji:"💥" },
};

const ALL_CARDS    = Object.keys(CARDS_DB);
// Cartes débloquées par défaut au démarrage (les basiques seulement)
const STARTER_CARDS = ["knight","archer","arrows","goblin","cannon","minions","fireball","bomb_tower"];

// ═══════════════════════════════════════════════════════════════════════════════
// ÉTAT EN MÉMOIRE
// ═══════════════════════════════════════════════════════════════════════════════
const queue   = [];
const matches = new Map();
const players = new Map();

// ── Helpers joueur ────────────────────────────────────────────────────────────
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
    elo: 1200, wins: 0, losses: 0,
    // Deck de départ = les 8 cartes starter seulement
    deck: [...STARTER_CARDS],
    // Cartes débloquées = seulement les starters au départ
    unlockedCards: [...STARTER_CARDS],
    createdAt: Date.now(),
  };
}

// ── Helpers UNB ───────────────────────────────────────────────────────────────
// FIX : l'API UNB attend "Authorization: <token>" (pas "Bearer")
function unbHeaders() {
  return { "Authorization": UNB_TOKEN, "Content-Type": "application/json" };
}

async function getUnbBalance(userId) {
  if (!UNB_TOKEN || !GUILD_ID) return null;
  try {
    const res = await fetch(`${UNB_BASE}/guilds/${GUILD_ID}/users/${userId}`, {
      headers: unbHeaders(),
    });
    if (!res.ok) { console.error("UNB get balance error:", res.status, await res.text()); return null; }
    return res.json();
  } catch (e) { console.error("UNB get balance exception:", e); return null; }
}

// FIX : delta positif = ajouter, delta négatif = retirer
// L'API UNB PATCH attend { cash: <delta> } — c'est bien un delta relatif, pas un SET
async function editUnbBalance(userId, cashDelta, reason = "Clash Arena") {
  if (!UNB_TOKEN || !GUILD_ID) return null;
  try {
    const body = JSON.stringify({ cash: cashDelta, reason });
    const res  = await fetch(`${UNB_BASE}/guilds/${GUILD_ID}/users/${userId}`, {
      method: "PATCH", headers: unbHeaders(), body,
    });
    if (!res.ok) { console.error("UNB edit balance error:", res.status, await res.text()); return null; }
    return res.json();
  } catch (e) { console.error("UNB edit balance exception:", e); return null; }
}

// ── Génération récompenses coffre ─────────────────────────────────────────────
const CHEST_POOLS = {
  wood:    { cardRange:[1,2], rarities:{ common:100 },                  bonusCash:[50,150]   },
  silver:  { cardRange:[2,3], rarities:{ common:70, rare:30 },          bonusCash:[100,300]  },
  gold:    { cardRange:[3,4], rarities:{ common:40, rare:45, epic:15 }, bonusCash:[200,600]  },
  magical: { cardRange:[4,5], rarities:{ common:20, rare:30, epic:50 }, bonusCash:[500,1500] },
};

function generateChestRewards(chestId, player) {
  const pool = CHEST_POOLS[chestId];
  if (!pool) return { rewards:[], bonusCash:0, newCards:[] };

  const [min, max] = pool.cardRange;
  const nbCards    = min + Math.floor(Math.random() * (max - min + 1));
  const rewards    = [];
  const newCards   = []; // cartes nouvellement débloquées

  for (let i = 0; i < nbCards; i++) {
    // Tirer une rareté
    const roll = Math.random() * 100;
    let rarity = "common", acc = 0;
    for (const [r, w] of Object.entries(pool.rarities)) {
      acc += w; if (roll < acc) { rarity = r; break; }
    }

    // Tirer une carte de cette rareté parmi TOUTES les cartes du jeu
    const candidates = ALL_CARDS.filter((id) => CARDS_DB[id].rarity === rarity);
    const cardId     = candidates[Math.floor(Math.random() * candidates.length)];
    const card       = CARDS_DB[cardId];
    const rarityLabel = { common:"🔵 Commune", rare:"🟣 Rare", epic:"🟡 Épique" }[rarity];

    const isNew = !player.unlockedCards.includes(cardId);
    if (isNew) { player.unlockedCards.push(cardId); newCards.push(cardId); }

    rewards.push({
      emoji: card.emoji,
      name:  card.name + (isNew ? " ✨ NOUVEAU" : ""),
      value: rarityLabel,
    });
  }

  // Bonus de pièces
  const bonusCash = pool.bonusCash[0] + Math.floor(Math.random() * (pool.bonusCash[1] - pool.bonusCash[0] + 1));
  rewards.push({ emoji:"🪙", name:"Pièces bonus", value:`+${bonusCash.toLocaleString()}` });

  return { rewards, bonusCash, newCards };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES AUTH
// ═══════════════════════════════════════════════════════════════════════════════
app.post("/api/token", async (req, res) => {
  try {
    const r = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     process.env.VITE_DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type:    "authorization_code",
        code:          req.body.code,
      }),
    });
    const data = await r.json();
    if (!data.access_token) { console.error("Token error:", data); return res.status(400).json({ error:"Token failed" }); }
    res.json({ access_token: data.access_token });
  } catch (e) { console.error("Token exception:", e); res.status(500).json({ error:"Server error" }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES JOUEUR
// ═══════════════════════════════════════════════════════════════════════════════
app.post("/api/player/init", (req, res) => {
  const { userId, username, avatar } = req.body;
  if (!userId) return res.status(400).json({ error:"userId requis" });
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
  if (!Array.isArray(deck) || deck.length !== 8)
    return res.status(400).json({ error:"Deck invalide (8 cartes requises)" });
  // Vérifier que toutes les cartes sont débloquées par ce joueur
  const locked = deck.filter((id) => !p.unlockedCards.includes(id));
  if (locked.length) return res.status(400).json({ error:`Cartes non débloquées : ${locked.join(", ")}` });
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
// ROUTES ÉCONOMIE
// ═══════════════════════════════════════════════════════════════════════════════
app.get("/api/economy/balance/:userId", async (req, res) => {
  const data = await getUnbBalance(req.params.userId);
  // FIX : si UNB indispo, retourner null explicitement plutôt que 0
  if (!data) return res.json({ cash: null, bank: null, total: null, unavailable: true });
  res.json(data);
});

app.post("/api/economy/open-chest", async (req, res) => {
  const { userId, chestId, cost } = req.body;
  if (!CHEST_POOLS[chestId]) return res.status(400).json({ error:"Coffre invalide" });

  const player = players.get(userId);
  if (!player) return res.status(404).json({ error:"Joueur inconnu" });

  const balData = await getUnbBalance(userId);

  if (balData) {
    // Mode UNB actif
    if (balData.cash < cost) {
      return res.status(400).json({ error:`Solde insuffisant : tu as ${balData.cash} pièces, il te faut ${cost}.` });
    }
    // Débiter le coffre
    const deducted = await editUnbBalance(userId, -cost, `Clash Arena — Coffre ${chestId}`);
    if (!deducted) return res.status(500).json({ error:"Erreur débit UNB. Réessaie." });

    const { rewards, bonusCash, newCards } = generateChestRewards(chestId, player);

    // Créditer le bonus pièces
    let finalBalance = deducted.cash;
    if (bonusCash > 0) {
      const credited = await editUnbBalance(userId, bonusCash, `Clash Arena — Récompense coffre ${chestId}`);
      if (credited) finalBalance = credited.cash;
    }

    return res.json({ rewards, newBalance: finalBalance, newCards, demo: false });
  }

  // Mode démo (UNB non configuré) — on génère quand même les récompenses
  const { rewards, bonusCash, newCards } = generateChestRewards(chestId, player);
  res.json({ rewards, newBalance: null, newCards, demo: true, bonusCash });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES FILE D'ATTENTE
// ═══════════════════════════════════════════════════════════════════════════════
app.post("/api/queue/join", async (req, res) => {
  const { userId, username, avatar, bet = 0 } = req.body;
  if (!userId) return res.status(400).json({ error:"userId requis" });

  if (!players.has(userId)) players.set(userId, initPlayer(userId, username, avatar));

  // Déjà en file ?
  if (queue.find((p) => p.userId === userId)) return res.json({ status:"already_in_queue" });
  // Déjà en match ?
  for (const [matchId, m] of matches) {
    if (m.status !== "finished" && m.players.some((p) => p.userId === userId))
      return res.json({ status:"already_in_match", matchId });
  }

  // Vérifier le solde si mise
  if (bet > 0) {
    const bal = await getUnbBalance(userId);
    if (bal && bal.cash < bet)
      return res.status(400).json({ error:`Mise trop élevée (tu as ${bal.cash} pièces)` });
  }

  const pd = players.get(userId);
  queue.push({ userId, username, avatar, elo: pd.elo, deck: pd.deck, bet, joinedAt: Date.now() });

  if (queue.length >= 2) {
    const [p1, p2] = queue.splice(0, 2);
    const effectiveBet = Math.min(p1.bet || 0, p2.bet || 0);
    const matchId      = `match_${genId()}`;

    matches.set(matchId, {
      players:     [p1, p2],
      status:      "in_progress",
      winner:      null,
      bet:         effectiveBet,
      towerHp:     { [p1.userId]: 3000, [p2.userId]: 3000 },
      playedCards: [],
      coinResult:  null,
      startedAt:   Date.now(),
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
      return res.json({ status:"matched", matchId, opponent, towerHp: m.towerHp, bet: m.bet });
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
// ROUTES MATCH — jouer une carte
// FIN DE MATCH uniquement par destruction de tour (plus de /result manuel)
// ═══════════════════════════════════════════════════════════════════════════════
app.post("/api/match/:matchId/play-card", async (req, res) => {
  const match = matches.get(req.params.matchId);
  if (!match) return res.status(404).json({ error:"Match introuvable" });
  if (match.status !== "in_progress") return res.status(400).json({ error:"Match déjà terminé" });

  const { userId, cardId } = req.body;
  const card   = CARDS_DB[cardId];
  if (!card) return res.status(400).json({ error:"Carte invalide" });

  const player = players.get(userId);
  if (!player) return res.status(404).json({ error:"Joueur introuvable" });
  if (!player.deck.includes(cardId)) return res.status(400).json({ error:"Carte pas dans le deck" });

  const opponentEntry = match.players.find((p) => p.userId !== userId);
  if (!opponentEntry) return res.status(400).json({ error:"Adversaire introuvable" });

  // Calcul des dégâts avec variation aléatoire ±20%
  const dmg = Math.max(1, Math.round(card.attack * (0.8 + Math.random() * 0.4)));
  match.towerHp[opponentEntry.userId] = Math.max(0, match.towerHp[opponentEntry.userId] - dmg);

  const action = {
    playerId:     userId,
    cardId,
    cardEmoji:    card.emoji,
    cardName:     card.name,
    damage:       dmg,
    remainingHp:  match.towerHp[opponentEntry.userId],
    timestamp:    Date.now(),
  };
  match.playedCards.push(action);

  // ── Vérifier fin de match ─────────────────────────────────────────────────
  if (match.towerHp[opponentEntry.userId] <= 0) {
    match.status     = "finished";
    match.winner     = userId;
    match.finishedAt = Date.now();

    const wr = players.get(userId);
    const lr = players.get(opponentEntry.userId);
    let eloChanges = {};
    if (wr && lr) {
      const { newWinner, newLoser } = computeElo(wr.elo, lr.elo);
      eloChanges = {
        [userId]:              { newElo: newWinner, diff: newWinner - wr.elo },
        [opponentEntry.userId]:{ newElo: newLoser,  diff: newLoser  - lr.elo },
      };
      wr.elo = newWinner; wr.wins++;
      lr.elo = newLoser;  lr.losses++;
    }

    // Transfert de pièces UNB (awaité pour avoir le résultat)
    if (match.bet > 0) {
      await Promise.all([
        editUnbBalance(opponentEntry.userId, -match.bet, `Clash Arena — Défaite mise ${match.bet}`),
        editUnbBalance(userId,               +match.bet, `Clash Arena — Victoire mise ${match.bet}`),
      ]);
      match.coinResult = { winner: userId, loser: opponentEntry.userId, amount: match.bet };
    }

    return res.json({
      action, matchOver: true, winner: userId,
      towerHp: match.towerHp, eloChanges,
      coinResult: match.coinResult || null,
    });
  }

  res.json({ action, matchOver: false, towerHp: match.towerHp });
});

// Polling état du match (pour l'adversaire)
app.get("/api/match/:matchId", (req, res) => {
  const m = matches.get(req.params.matchId);
  if (!m) return res.status(404).json({ error:"Match introuvable" });
  // Renvoyer les 20 dernières actions pour le polling adversaire
  res.json({
    status:      m.status,
    winner:      m.winner,
    towerHp:     m.towerHp,
    bet:         m.bet,
    coinResult:  m.coinResult,
    playedCards: m.playedCards.slice(-20),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSEMENT
// ═══════════════════════════════════════════════════════════════════════════════
app.get("/api/leaderboard", (_req, res) => {
  const sorted = [...players.values()]
    .sort((a, b) => b.elo - a.elo)
    .slice(0, 20)
    .map((p) => ({ userId:p.userId, username:p.username, avatar:p.avatar, elo:p.elo, wins:p.wins, losses:p.losses, rank:getRank(p.elo) }));
  res.json(sorted);
});

// SPA fallback
app.get("*", (_req, res) => {
  res.sendFile(join(publicDir, "index.html"), (err) => {
    if (err) res.status(200).send("Clash Arena OK");
  });
});

app.listen(PORT, () => {
  console.log(`⚔️  Clash Arena → http://localhost:${PORT}`);
  console.log(`   UNB: ${UNB_TOKEN ? "✅ " + UNB_TOKEN.slice(0,8)+"…" : "⚠️  non configuré (mode démo)"}`);
  console.log(`   Guild: ${GUILD_ID || "⚠️  non configuré"}`);
});
