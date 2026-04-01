// ═══════════════════════════════════════════════════════════════════════
// CLASH ARENA 1v1 — client/main.js
// Discord Embedded App SDK + Cartes + Coffres + Paris UnbelievaBoat
// ═══════════════════════════════════════════════════════════════════════
import { DiscordSDK } from "@discord/embedded-app-sdk";

const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

// ── État global ──────────────────────────────────────────────────────
let auth          = null;
let currentPlayer = null;
let balance       = { cash: 0, bank: 0 };
let currentMatch  = null;
let pollingId     = null;
let mana          = 5;
let manaInterval  = null;
let timerInterval = null;
let matchSeconds  = 0;
let activeTab     = "lobby";
let selectedBet   = 0;
let CARDS         = {};

// ── Bootstrap ────────────────────────────────────────────────────────
(async function init() {
  await new Promise((r) => setTimeout(r, 2200));
  try {
    await setupDiscordSdk();
    document.getElementById("loading-screen").classList.add("fade-out");
    setTimeout(() => {
      document.getElementById("loading-screen").style.display = "none";
      document.getElementById("app").classList.remove("hidden");
    }, 600);
    await Promise.all([initPlayer(), fetchCards(), fetchBalance()]);
    renderMain();
  } catch (err) {
    console.error("Init error:", err);
    document.querySelector(".loading-sub").textContent = "Erreur. Relance l'activité.";
  }
})();

// ═══════════════════════════════════════════════════════════════════════
// AUTH DISCORD SDK (étapes 5–7 du tutoriel)
// ═══════════════════════════════════════════════════════════════════════
async function setupDiscordSdk() {
  await discordSdk.ready();
  const { code } = await discordSdk.commands.authorize({
    client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
    response_type: "code", state: "", prompt: "none",
    scope: ["identify", "guilds", "applications.commands"],
  });
  const { access_token } = await fetch("/api/token", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  }).then((r) => r.json());
  auth = await discordSdk.commands.authenticate({ access_token });
  if (!auth) throw new Error("Authenticate failed");
}

// ── Profil joueur ────────────────────────────────────────────────────
async function initPlayer() {
  const uid  = auth.user.id;
  const uname = auth.user.username;
  const ava  = auth.user.avatar
    ? `https://cdn.discordapp.com/avatars/${uid}/${auth.user.avatar}.webp?size=64`
    : null;
  currentPlayer = await fetch("/api/player/init", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: uid, username: uname, avatar: ava }),
  }).then((r) => r.json());
}

// ── Cartes ───────────────────────────────────────────────────────────
async function fetchCards() {
  if (Object.keys(CARDS).length) return;
  const list = await fetch("/api/cards").then((r) => r.json());
  list.forEach((c) => (CARDS[c.id] = c));
}

// ── Balance UnbelievaBoat ────────────────────────────────────────────
async function fetchBalance() {
  try {
    const data = await fetch(`/api/economy/balance/${auth.user.id}`)
      .then((r) => r.json());
    if (data.cash !== undefined) balance = data;
  } catch (e) {
    console.warn("Balance fetch failed:", e);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// RENDU PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════
async function renderMain() {
  let channelName = "Arène";
  if (discordSdk.channelId && discordSdk.guildId) {
    const ch = await discordSdk.commands.getChannel({ channel_id: discordSdk.channelId }).catch(() => null);
    if (ch?.name) channelName = ch.name;
  }
  let guildIcon = null, guildName = "";
  if (discordSdk.guildId && auth?.access_token) {
    const guilds = await fetch("https://discord.com/api/v10/users/@me/guilds", {
      headers: { Authorization: `Bearer ${auth.access_token}`, "Content-Type": "application/json" },
    }).then((r) => r.json()).catch(() => []);
    const g = guilds.find?.((x) => x.id === discordSdk.guildId);
    if (g) { guildName = g.name; guildIcon = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.webp?size=64` : null; }
  }

  const rank = currentPlayer.rank || { name: "Arène I", icon: "⚔️", color: "#8B7355" };
  const avaHtml = currentPlayer.avatar
    ? `<img src="${currentPlayer.avatar}" class="player-avatar" alt="Avatar">`
    : `<div class="player-avatar-ph">⚔️</div>`;

  document.getElementById("app").innerHTML = `
    <div class="screen">

      <div class="arena-header">
        <div class="header-guild">
          ${guildIcon ? `<img src="${guildIcon}" width="30" height="30" alt="">` : ""}
          <div>
            <div class="guild-name">${guildName || "Discord"}</div>
            <div class="channel-name">⚔️ ${channelName}</div>
          </div>
        </div>
        <div class="arena-logo">⚔️ CLASH<br>ARENA</div>
      </div>

      <!-- Balance UnbelievaBoat -->
      <div class="balance-bar" id="balance-bar">
        <div class="balance-item">
          <div class="balance-label">Pièces (Cash)</div>
          <div class="balance-value">🪙 <span id="bal-cash">${balance.cash?.toLocaleString?.() ?? 0}</span></div>
        </div>
        <div class="balance-divider"></div>
        <div class="balance-item">
          <div class="balance-label">Banque</div>
          <div class="balance-value">🏦 <span id="bal-bank">${balance.bank?.toLocaleString?.() ?? 0}</span></div>
        </div>
        <button class="balance-refresh" onclick="refreshBalance()" title="Actualiser">↻</button>
      </div>

      <!-- Profil joueur -->
      <div class="player-card">
        ${avaHtml}
        <div class="player-info">
          <div class="player-username">${currentPlayer.username}</div>
          <div class="player-elo-row">
            <div class="player-elo">🏆 ${currentPlayer.elo}</div>
            <div class="rank-badge" style="color:${rank.color}">${rank.icon} ${rank.name}</div>
          </div>
          <div class="player-stats">
            <div class="stat-item">✅ <strong>${currentPlayer.wins}</strong> V</div>
            <div class="stat-item">💀 <strong>${currentPlayer.losses}</strong> D</div>
          </div>
        </div>
      </div>

      <!-- Navigation onglets -->
      <div class="tabs">
        <button class="tab-btn ${activeTab==="lobby"?"active":""}" onclick="switchTab('lobby')"><span class="tab-icon">⚔️</span>Lobby</button>
        <button class="tab-btn ${activeTab==="chests"?"active":""}" onclick="switchTab('chests')"><span class="tab-icon">📦</span>Coffres</button>
        <button class="tab-btn ${activeTab==="deck"?"active":""}" onclick="switchTab('deck')"><span class="tab-icon">🃏</span>Deck</button>
        <button class="tab-btn ${activeTab==="rank"?"active":""}" onclick="switchTab('rank')"><span class="tab-icon">🏅</span>Top</button>
      </div>

      <!-- LOBBY -->
      <div id="tab-lobby" class="tab-content ${activeTab==="lobby"?"active":""}">
        ${renderLobbyContent()}
      </div>

      <!-- COFFRES -->
      <div id="tab-chests" class="tab-content ${activeTab==="chests"?"active":""}">
        ${renderChestsContent()}
      </div>

      <!-- DECK -->
      <div id="tab-deck" class="tab-content ${activeTab==="deck"?"active":""}">
        ${renderDeckEditor()}
      </div>

      <!-- CLASSEMENT -->
      <div id="tab-rank" class="tab-content ${activeTab==="rank"?"active":""}">
        <div id="lb-container"><div class="status-banner pulse">Chargement…</div></div>
      </div>

    </div>`;

  if (activeTab === "rank") loadLeaderboard();
}

// ═══════════════════════════════════════════════════════════════════════
// LOBBY + SÉLECTEUR DE MISE
// ═══════════════════════════════════════════════════════════════════════
function renderLobbyContent() {
  const presets = [100, 500, 1000, 5000, "MAX"];
  const maxBet  = Math.floor(balance.cash * 0.9); // max 90% du cash

  return `
    <div class="status-banner pulse" id="queue-status">Prêt à combattre ?</div>

    <!-- Sélecteur de mise -->
    <div class="bet-selector">
      <div class="bet-title">💰 Mise en jeu</div>
      <div class="bet-presets">
        <div class="bet-preset" onclick="setBet(0)">Gratuit</div>
        ${presets.map((p) => {
          const v = p === "MAX" ? maxBet : p;
          return `<div class="bet-preset" onclick="setBet(${v})">${p === "MAX" ? "MAX" : "🪙" + p}</div>`;
        }).join("")}
      </div>
      <div class="bet-custom-row">
        <input type="number" class="bet-input" id="bet-input" placeholder="Montant personnalisé…"
               min="0" max="${maxBet}" step="50"
               oninput="setBetFromInput(this.value)">
        <button class="btn btn-coin btn-sm" onclick="setBet(maxBet)">MAX</button>
      </div>
      <div class="bet-info" id="bet-info">
        Mise actuelle : <strong id="bet-display">Gratuit</strong>
        · Gain potentiel : <strong id="bet-win-display">—</strong>
      </div>
    </div>

    <button id="btn-join" class="btn btn-primary btn-full" onclick="joinQueue()">⚔️ Rejoindre la file</button>
    <button id="btn-leave" class="btn btn-secondary btn-full hidden" onclick="leaveQueue()">🚪 Quitter la file</button>
  `;
}

window.setBet = function(amount) {
  const maxBet = Math.floor(balance.cash * 0.9);
  selectedBet  = Math.min(Math.max(0, Math.floor(amount)), maxBet);
  const inp = document.getElementById("bet-input");
  if (inp) inp.value = selectedBet || "";
  updateBetDisplay();
  // Highlight preset
  document.querySelectorAll(".bet-preset").forEach((b) => b.classList.remove("active"));
};
window.setBetFromInput = function(v) {
  const maxBet = Math.floor(balance.cash * 0.9);
  selectedBet  = Math.min(Math.max(0, parseInt(v) || 0), maxBet);
  updateBetDisplay();
};
function updateBetDisplay() {
  const d = document.getElementById("bet-display");
  const w = document.getElementById("bet-win-display");
  if (d) d.textContent = selectedBet > 0 ? `🪙 ${selectedBet.toLocaleString()}` : "Gratuit";
  if (w) w.textContent = selectedBet > 0 ? `🪙 ${(selectedBet * 2).toLocaleString()}` : "—";
}

window.refreshBalance = async function() {
  await fetchBalance();
  const c = document.getElementById("bal-cash");
  const b = document.getElementById("bal-bank");
  if (c) c.textContent = balance.cash?.toLocaleString?.() ?? 0;
  if (b) b.textContent = balance.bank?.toLocaleString?.() ?? 0;
};

// ═══════════════════════════════════════════════════════════════════════
// COFFRES
// ═══════════════════════════════════════════════════════════════════════
function renderChestsContent() {
  const chests = [
    { id: "wood",    name: "Coffre en bois",   emoji: "📦", cost: 200,  rarity: "wood",    desc: "Contient quelques cartes communes.", rewards: "1-2 cartes communes" },
    { id: "silver",  name: "Coffre en argent", emoji: "🎁", cost: 500,  rarity: "silver",  desc: "Cartes communes et rares.", rewards: "2-3 cartes, 1 rare garantie" },
    { id: "gold",    name: "Coffre en or",     emoji: "🏆", cost: 1500, rarity: "gold",    desc: "Cartes rares garanties.", rewards: "3-4 cartes, 1-2 rares, chance épique" },
    { id: "magical", name: "Coffre magique",   emoji: "✨", cost: 4000, rarity: "magical", desc: "Épique garantie. Trésor rare.", rewards: "5 cartes, 1 épique garantie" },
  ];

  return `
    <div class="section-title">📦 Coffres</div>
    <p style="font-size:12px;color:var(--cr-text-muted);margin-bottom:10px;text-align:center">
      Dépensez vos pièces <strong style="color:var(--cr-coin)">UnbelievaBoat</strong> pour ouvrir des coffres et débloquer des cartes.
    </p>
    <div class="chests-grid">
      ${chests.map((ch) => `
        <div class="chest-card ${ch.rarity}" onclick="openChest('${ch.id}','${ch.name}','${ch.emoji}',${ch.cost})">
          <span class="chest-emoji">${ch.emoji}</span>
          <div class="chest-name">${ch.name}</div>
          <div class="chest-cost">🪙 ${ch.cost.toLocaleString()}</div>
          <div class="chest-desc">${ch.desc}</div>
          <div class="chest-rewards"><div>🎯 ${ch.rewards}</div></div>
        </div>`).join("")}
    </div>
    <div style="margin-top:12px;padding:10px;background:rgba(255,193,7,.06);border:1px solid rgba(255,193,7,.15);border-radius:10px;font-size:11px;color:var(--cr-text-muted);text-align:center">
      Solde actuel : <strong style="color:var(--cr-coin)">🪙 ${balance.cash?.toLocaleString?.() ?? 0}</strong> pièces
    </div>`;
}

window.openChest = async function(chestId, name, emoji, cost) {
  if (balance.cash < cost) {
    showAlert(`❌ Solde insuffisant ! Il te faut 🪙 ${cost.toLocaleString()} (tu as 🪙 ${balance.cash?.toLocaleString?.() ?? 0})`);
    return;
  }

  // Appel serveur : déduire les pièces + générer les récompenses
  const res = await fetch("/api/economy/open-chest", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: currentPlayer.userId, chestId, cost }),
  }).then((r) => r.json()).catch(() => null);

  if (!res || res.error) {
    showAlert(res?.error || "Erreur lors de l'ouverture du coffre.");
    return;
  }

  // Mettre à jour le solde local
  balance.cash = res.newBalance;
  const bc = document.getElementById("bal-cash");
  if (bc) bc.textContent = balance.cash?.toLocaleString?.() ?? 0;

  // Afficher l'animation d'ouverture
  showChestOpenAnimation(name, emoji, res.rewards);
};

function showChestOpenAnimation(name, emoji, rewards) {
  const overlay = document.createElement("div");
  overlay.className = "chest-opening-overlay";

  const rewardItems = rewards.map((r, i) => `
    <div class="chest-reward-item" style="animation-delay:${i * 0.12}s">
      <span class="reward-emoji">${r.emoji}</span>
      <div class="reward-info">
        <div class="reward-name">${r.name}</div>
        <div class="reward-amount">${r.value}</div>
      </div>
    </div>`).join("");

  overlay.innerHTML = `
    <div class="chest-opening-box">
      <span class="chest-open-emoji">${emoji}</span>
      <div class="chest-open-title">${name} ouvert !</div>
      <div class="chest-rewards-list">${rewardItems}</div>
      <button class="btn btn-gold btn-full" onclick="this.closest('.chest-opening-overlay').remove()">
        🎉 Super !
      </button>
    </div>`;

  document.body.appendChild(overlay);
}

// ═══════════════════════════════════════════════════════════════════════
// DECK EDITOR
// ═══════════════════════════════════════════════════════════════════════
function renderDeckEditor() {
  const deck = currentPlayer.deck || [];
  const slotsHtml = Array.from({ length: 8 }, (_, i) => {
    const c = CARDS[deck[i]];
    return c
      ? `<div class="deck-slot filled" onclick="removeDeckCard(${i})" title="${c.name}">
           <span style="font-size:20px">${c.emoji}</span>
           <div class="slot-cost">${c.cost}</div>
           <div class="slot-x">✕</div>
         </div>`
      : `<div class="deck-slot"><span style="font-size:16px;opacity:.3">+</span></div>`;
  }).join("");

  const byType = { troop: [], spell: [], building: [] };
  Object.values(CARDS).forEach((c) => { if (byType[c.type]) byType[c.type].push(c); });

  const sec = (lbl, icon, arr) => arr.length ? `
    <div style="margin-bottom:12px">
      <div style="font-size:11px;color:var(--cr-text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">${icon} ${lbl}</div>
      <div class="cards-grid">${arr.map((c) => smallCard(c, deck.includes(c.id))).join("")}</div>
    </div>` : "";

  return `
    <div class="section-title">🃏 Mon Deck</div>
    <div class="deck-slots">${slotsHtml}</div>
    <div style="font-size:11px;color:var(--cr-text-muted);text-align:center;margin:4px 0">${deck.length}/8 cartes</div>
    <div style="margin-top:10px">
      <div class="section-title">📚 Ajouter</div>
      ${sec("Troupes","⚔️",byType.troop)}
      ${sec("Sorts","✨",byType.spell)}
      ${sec("Bâtiments","🏰",byType.building)}
    </div>
    <button class="btn btn-gold btn-full" onclick="saveDeck()" style="margin-top:6px">💾 Sauvegarder</button>`;
}

function smallCard(card, inDeck) {
  return `<div class="card-item rarity-${card.rarity} ${inDeck?"in-deck":""}"
    onclick="toggleDeckCard('${card.id}')"
    onmouseenter="showTooltip(event,'${card.id}')" onmouseleave="hideTooltip()">
    <div class="card-cost">${card.cost}</div>
    ${inDeck?"<div class=\"card-deck-badge\">✓</div>":""}
    <span class="card-emoji">${card.emoji}</span>
    <div class="card-name">${card.name}</div>
    <div class="card-atk">⚔️${card.attack}</div>
    <div class="card-rarity-bar"></div>
  </div>`;
}

window.toggleDeckCard = function(id) {
  const deck = [...(currentPlayer.deck || [])];
  const idx  = deck.indexOf(id);
  if (idx !== -1) deck.splice(idx, 1);
  else { if (deck.length >= 8) { showAlert("Deck plein (8/8) !"); return; } deck.push(id); }
  currentPlayer.deck = deck;
  document.getElementById("tab-deck").innerHTML = renderDeckEditor();
};
window.removeDeckCard = function(i) {
  currentPlayer.deck.splice(i, 1);
  document.getElementById("tab-deck").innerHTML = renderDeckEditor();
};
window.saveDeck = async function() {
  if (currentPlayer.deck.length !== 8) { showAlert("Le deck doit avoir exactement 8 cartes !"); return; }
  const r = await fetch(`/api/player/${currentPlayer.userId}/deck`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deck: currentPlayer.deck }),
  }).then((r) => r.json());
  if (r.success) showAlert("✅ Deck sauvegardé !");
};

// ═══════════════════════════════════════════════════════════════════════
// FILE D'ATTENTE + PARI
// ═══════════════════════════════════════════════════════════════════════
window.joinQueue = async function() {
  if (selectedBet > balance.cash) {
    showAlert(`❌ Mise trop élevée ! Tu as seulement 🪙 ${balance.cash?.toLocaleString?.() ?? 0}`);
    return;
  }

  setQStatus("🔍 Recherche d'un adversaire…", true);
  document.getElementById("btn-join").classList.add("hidden");
  document.getElementById("btn-leave").classList.remove("hidden");

  const res = await fetch("/api/queue/join", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: currentPlayer.userId, username: currentPlayer.username,
      avatar: currentPlayer.avatar, bet: selectedBet,
    }),
  }).then((r) => r.json());

  if (res.status === "matched") startMatch(res.matchId, res.opponent, res.bet);
  else pollingId = setInterval(pollQueue, 2000);
};

window.leaveQueue = async function() {
  clearInterval(pollingId);
  await fetch("/api/queue/leave", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: currentPlayer.userId }),
  });
  setQStatus("Prêt à combattre ?", false);
  document.getElementById("btn-join").classList.remove("hidden");
  document.getElementById("btn-leave").classList.add("hidden");
};

async function pollQueue() {
  const res = await fetch(`/api/queue/status/${currentPlayer.userId}`).then((r) => r.json());
  if (res.status === "matched") { clearInterval(pollingId); startMatch(res.matchId, res.opponent, res.bet); }
  else if (res.status === "waiting") setQStatus(`🔍 En file… (${res.queueSize} guerrier(s))`, true);
}

function setQStatus(msg, pulse) {
  const el = document.getElementById("queue-status");
  if (el) { el.textContent = msg; el.className = "status-banner" + (pulse ? " pulse" : ""); }
}

// ═══════════════════════════════════════════════════════════════════════
// ÉCRAN DE COMBAT
// ═══════════════════════════════════════════════════════════════════════
function startMatch(matchId, opponent, bet = 0) {
  currentMatch = { matchId, opponent, myHp: 3000, opponentHp: 3000, bet, playedCards: [] };
  mana = 5; matchSeconds = 0;
  renderBattleScreen();
  manaInterval  = setInterval(() => { if (mana < 10) { mana++; updateMana(); } }, 1000);
  timerInterval = setInterval(() => { matchSeconds++; updateTimer(); if (matchSeconds >= 180) { clearInterval(timerInterval); autoEnd(); } }, 1000);
  pollingId = setInterval(pollMatch, 1800);
}

function renderBattleScreen() {
  const opp = currentMatch.opponent;
  const oppAva  = opp.avatar  ? `<img src="${opp.avatar}" alt="${opp.username}">` : `<div class="f-ph">⚔️</div>`;
  const myAva   = currentPlayer.avatar ? `<img src="${currentPlayer.avatar}" alt="Toi">` : `<div class="f-ph">👑</div>`;
  const betLine = currentMatch.bet > 0 ? `<div class="match-bet-banner">⚔️ Match misé — 🪙 ${currentMatch.bet.toLocaleString()} en jeu · Gagnant remporte 🪙 ${(currentMatch.bet * 2).toLocaleString()}</div>` : "";

  document.getElementById("app").innerHTML = `
    <div class="match-screen">
      <div class="fighters-bar">
        <div class="fighter-mini">${oppAva}<div class="fighter-name">${opp.username}</div><div class="fighter-elo">🏆 ${opp.elo || 1200}</div></div>
        <div><div class="match-timer" id="match-timer">3:00</div><div class="vs-text">VS</div></div>
        <div class="fighter-mini">${myAva}<div class="fighter-name">${currentPlayer.username}</div><div class="fighter-elo">🏆 ${currentPlayer.elo}</div></div>
      </div>
      ${betLine}
      <div class="tower-zone">
        <div class="tower-card">
          <div class="tower-img" id="opp-twi">🏰</div>
          <div class="tower-hp-wrap"><div class="tower-hp" id="opp-hp" style="width:100%"></div></div>
          <div class="tower-hp-txt" id="opp-hp-txt">3000</div>
          <div class="tower-owner">${opp.username}</div>
        </div>
        <div style="opacity:.3;font-size:10px;text-align:center">👑<br>Roi</div>
        <div style="opacity:.3;font-size:10px;text-align:center">👑<br>Roi</div>
      </div>
      <div class="arena-field">
        <div class="arena-grass"></div>
        <div class="arena-river">〰 Rivière 〰</div>
        <div class="arena-grass"></div>
      </div>
      <div class="tower-zone">
        <div style="opacity:.3;font-size:10px;text-align:center">👑<br>Roi</div>
        <div style="opacity:.3;font-size:10px;text-align:center">👑<br>Roi</div>
        <div class="tower-card">
          <div class="tower-img" id="my-twi">🏰</div>
          <div class="tower-hp-wrap"><div class="tower-hp" id="my-hp" style="width:100%"></div></div>
          <div class="tower-hp-txt" id="my-hp-txt">3000</div>
          <div class="tower-owner">Toi</div>
        </div>
      </div>
      <div class="battle-area">
        <div class="battle-log" id="battle-log"><div class="battle-log-entry">⚔️ Le duel commence ! Jouez vos cartes.</div></div>
        <div class="mana-row">
          <div class="mana-label">💧</div>
          <div class="mana-pips" id="mana-pips">${Array.from({length:10},(_,i)=>`<div class="mana-pip ${i<mana?"filled":""}" id="pip-${i}"></div>`).join("")}</div>
        </div>
        <div class="hand-cards" id="hand-cards">${buildHand()}</div>
        <div class="btn-row" style="margin-top:4px">
          <button class="btn btn-win" onclick="declareResult('win')">🏆 J'ai gagné</button>
          <button class="btn btn-lose" onclick="declareResult('lose')">💀 J'ai perdu</button>
        </div>
      </div>
    </div>`;
}

function buildHand() {
  return (currentPlayer.deck || []).slice(0, 4).map((id) => {
    const c = CARDS[id]; if (!c) return "";
    return `<div class="hand-card ${mana < c.cost ? "off" : ""}"
      onclick="playCard('${id}')"
      onmouseenter="showTooltip(event,'${id}')" onmouseleave="hideTooltip()">
      <div class="hc-cost">${c.cost}</div>
      <span class="card-emoji">${c.emoji}</span>
      <div class="card-name">${c.name}</div>
    </div>`;
  }).join("");
}

function updateMana() {
  for (let i = 0; i < 10; i++) { const p = document.getElementById(`pip-${i}`); if (p) p.classList.toggle("filled", i < mana); }
  const hc = document.getElementById("hand-cards"); if (hc) hc.innerHTML = buildHand();
}
function updateTimer() {
  const el = document.getElementById("match-timer"); if (!el) return;
  const r = Math.max(0, 180 - matchSeconds);
  el.textContent = `${Math.floor(r/60)}:${(r%60).toString().padStart(2,"0")}`;
  el.classList.toggle("urgent", r <= 30);
}

// ── Jouer une carte ──────────────────────────────────────────────────
window.playCard = async function(cardId) {
  const c = CARDS[cardId]; if (!c || mana < c.cost || !currentMatch) return;
  mana -= c.cost; updateMana();

  const res = await fetch(`/api/match/${currentMatch.matchId}/play-card`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: currentPlayer.userId, cardId }),
  }).then((r) => r.json()).catch(() => null);

  if (!res || res.error) return;

  currentMatch.opponentHp = res.towerHp[currentMatch.opponent.userId];
  updateTowerHp("opp", currentMatch.opponentHp, 3000);
  addLog(`${c.emoji} ${c.name} → ${res.action.damage} dégâts !`, res.action.damage >= 150);
  spawnDmgFloater(res.action.damage, res.action.damage >= 150, true);

  if (res.matchOver) endMatch(res.winner === currentPlayer.userId, res.eloChanges?.[currentPlayer.userId], res.coinResult);
};

// ── Polling état match ───────────────────────────────────────────────
async function pollMatch() {
  if (!currentMatch) return;
  const res = await fetch(`/api/match/${currentMatch.matchId}`).then((r) => r.json()).catch(() => null);
  if (!res) return;

  currentMatch.myHp       = res.towerHp[currentPlayer.userId];
  currentMatch.opponentHp = res.towerHp[currentMatch.opponent.userId];
  updateTowerHp("my",  currentMatch.myHp,       3000);
  updateTowerHp("opp", currentMatch.opponentHp, 3000);

  // Nouvelles actions adversaire
  const newActs = res.playedCards.filter(
    (a) => a.playerId !== currentPlayer.userId && !currentMatch.playedCards.find((x) => x.timestamp === a.timestamp)
  );
  newActs.forEach((a) => {
    const c = CARDS[a.cardId];
    addLog(`${c?.emoji||"⚔️"} ${currentMatch.opponent.username} joue ${c?.name||a.cardId} → ${a.damage}`, a.damage >= 150);
    spawnDmgFloater(a.damage, a.damage >= 150, false);
    currentMatch.playedCards.push(a);
  });

  if (res.status === "finished") {
    clearTimers();
    const updatedPlayer = await fetch(`/api/player/${currentPlayer.userId}`).then((r) => r.json()).catch(() => null);
    if (updatedPlayer) currentPlayer = updatedPlayer;
    await fetchBalance();
    endMatch(res.winner === currentPlayer.userId, null, res.coinResult);
  }
}

async function autoEnd() { clearTimers(); await declareResultApi(currentMatch.myHp > currentMatch.opponentHp); }
window.declareResult = async function(outcome) {
  document.querySelectorAll(".btn-win,.btn-lose").forEach((b) => (b.disabled = true));
  await declareResultApi(outcome === "win");
};
async function declareResultApi(isWin) {
  const myId  = currentPlayer.userId;
  const oppId = currentMatch.opponent.userId;
  const res   = await fetch("/api/match/result", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matchId: currentMatch.matchId, winnerId: isWin ? myId : oppId, loserId: isWin ? oppId : myId }),
  }).then((r) => r.json());
  clearTimers();
  await fetchBalance();
  endMatch(isWin, isWin ? res.winner : res.loser, res.coinResult);
}

function clearTimers() { clearInterval(pollingId); clearInterval(manaInterval); clearInterval(timerInterval); }

// ═══════════════════════════════════════════════════════════════════════
// RÉSULTAT
// ═══════════════════════════════════════════════════════════════════════
function endMatch(isWin, eloData, coinResult) {
  clearTimers();
  const oldElo = currentPlayer.elo;
  const newElo = eloData?.newElo || oldElo;
  const eloDiff = newElo - oldElo;
  if (newElo !== oldElo) currentPlayer.elo = newElo;

  const coinText = coinResult?.amount > 0
    ? (isWin ? `+${coinResult.amount.toLocaleString()}` : `-${coinResult.amount.toLocaleString()}`)
    : null;

  const overlay = document.createElement("div");
  overlay.className = "result-overlay";
  overlay.innerHTML = `
    <div class="result-card">
      <span class="result-icon">${isWin ? "🏆" : "💀"}</span>
      <div class="result-title ${isWin?"win":"lose"}">${isWin ? "VICTOIRE !" : "DÉFAITE…"}</div>
      <div class="result-stats">
        <div class="result-stat">
          <span>🏆 ELO</span>
          <span class="val">${newElo} <span class="${eloDiff>=0?"positive":"negative"}" style="font-size:11px">${eloDiff>=0?"+":""}${eloDiff}</span></span>
        </div>
        ${coinText ? `<div class="result-stat">
          <span>🪙 Pièces gagnées/perdues</span>
          <span class="val coin">${coinText}</span>
        </div>` : ""}
        ${balance.cash !== undefined ? `<div class="result-stat">
          <span>💰 Nouveau solde</span>
          <span class="val coin">🪙 ${balance.cash?.toLocaleString?.() ?? 0}</span>
        </div>` : ""}
      </div>
      <button class="btn btn-primary btn-full" onclick="goLobby()">
        ${isWin ? "⚔️ Rejouer" : "🔁 Revanche"}
      </button>
    </div>`;
  document.body.appendChild(overlay);
}

window.goLobby = function() {
  document.querySelectorAll(".result-overlay").forEach((e) => e.remove());
  currentMatch = null; mana = 10; matchSeconds = 0; activeTab = "lobby";
  renderMain();
};

// ═══════════════════════════════════════════════════════════════════════
// CLASSEMENT
// ═══════════════════════════════════════════════════════════════════════
async function loadLeaderboard() {
  const list = await fetch("/api/leaderboard").then((r) => r.json());
  const el   = document.getElementById("lb-container");
  if (!el) return;
  const medals = ["🥇","🥈","🥉"];
  el.innerHTML = `
    <div class="section-title">🏅 Top Joueurs</div>
    <div class="leaderboard">
      ${list.map((p, i) => {
        const ava = p.avatar
          ? `<img src="${p.avatar}" class="lb-avatar" alt="${p.username}">`
          : `<div class="lb-avatar" style="background:var(--cr-bg3);display:flex;align-items:center;justify-content:center;font-size:12px">⚔️</div>`;
        return `<div class="lb-row ${p.userId===currentPlayer.userId?"is-me":""}">
          <div class="lb-rank ${i<3?"top":""}">${medals[i]||i+1}</div>
          ${ava}
          <div class="lb-name">${p.username}${p.userId===currentPlayer.userId?" (toi)":""}</div>
          <div class="lb-elo">${p.elo}</div>
          <div>${p.rank?.icon||""}</div>
        </div>`;
      }).join("")}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS UI
// ═══════════════════════════════════════════════════════════════════════
window.switchTab = function(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach((b, i) => {
    b.classList.toggle("active", ["lobby","chests","deck","rank"][i] === tab);
  });
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
  const el = document.getElementById(`tab-${tab}`); if (el) el.classList.add("active");
  if (tab === "rank") loadLeaderboard();
};

function updateTowerHp(side, current, max) {
  const pct   = Math.max(0, Math.min(100, (current/max)*100));
  const barEl = document.getElementById(`${side}-hp`);
  const txtEl = document.getElementById(`${side}-hp-txt`);
  const imgEl = document.getElementById(`${side}-twi`);
  if (barEl) { barEl.style.width = pct+"%"; barEl.className = "tower-hp"+(pct<=25?" crit":pct<=50?" low":""); }
  if (txtEl) txtEl.textContent = current;
  if (imgEl && current < max) { imgEl.classList.add("damaged"); setTimeout(()=>imgEl.classList.remove("damaged"),400); }
}

function addLog(msg, isBig) {
  const log = document.getElementById("battle-log"); if (!log) return;
  const e = document.createElement("div"); e.className = "battle-log-entry"+(isBig?" big":" hit"); e.textContent = msg;
  log.appendChild(e); log.scrollTop = log.scrollHeight;
  while (log.children.length > 20) log.removeChild(log.firstChild);
}

function spawnDmgFloater(dmg, isBig, isMine) {
  const el = document.createElement("div"); el.className = "dmg-floater"+(isBig?" big":"");
  el.textContent = `-${dmg}`; el.style.left = (30+Math.random()*40)+"%"; el.style.top = isMine?"25%":"65%";
  document.body.appendChild(el); setTimeout(()=>el.remove(), 1300);
}

let tooltipEl = null;
window.showTooltip = function(event, cardId) {
  hideTooltip(); const c = CARDS[cardId]; if (!c) return;
  const rc = {common:"#9E9E9E",rare:"#1976D2",epic:"#7B1FA2"};
  const rl = {common:"Commune",rare:"Rare",epic:"Épique"};
  tooltipEl = document.createElement("div"); tooltipEl.className = "card-tooltip";
  tooltipEl.innerHTML = `<span class="tt-emoji">${c.emoji}</span><div class="tt-name">${c.name}</div>
    <div style="text-align:center;margin-bottom:5px"><span style="color:${rc[c.rarity]};font-size:10px">${rl[c.rarity]}</span> · <span style="color:#64B5F6;font-size:10px">💧${c.cost}</span></div>
    <div class="tt-desc">${c.description}</div>
    <div class="tt-stats"><div class="tt-stat">⚔️ <span>${c.attack}</span></div><div class="tt-stat">🛡️ <span>${c.defense}</span></div><div class="tt-stat" style="grid-column:1/-1">🏃 <span>${c.speed}</span></div></div>`;
  document.body.appendChild(tooltipEl);
  const r = event.currentTarget.getBoundingClientRect();
  let top = r.top-10, left = r.right+8;
  if (left+180>window.innerWidth) left = r.left-188;
  if (top+220>window.innerHeight) top = window.innerHeight-230;
  tooltipEl.style.top = Math.max(8,top)+"px"; tooltipEl.style.left = Math.max(8,left)+"px";
};
window.hideTooltip = function() { if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; } };

function showAlert(msg) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1A0A2E;border:1px solid rgba(255,215,0,.4);border-radius:10px;padding:12px 20px;font-size:13px;color:#F0E6FF;z-index:999;max-width:300px;text-align:center;animation:fadeIn .3s ease";
  el.textContent = msg; document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
