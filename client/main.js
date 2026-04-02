// ═══════════════════════════════════════════════════════════════════════
// CLASH ARENA 1v1 — client/main.js  (version corrigée)
// ═══════════════════════════════════════════════════════════════════════
import { DiscordSDK } from "@discord/embedded-app-sdk";

const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

let auth          = null;
let currentPlayer = null;           // profil complet (deck, unlockedCards, elo…)
let balance       = { cash: null, bank: null, unavailable: false };
let currentMatch  = null;
let pollingId     = null;
let mana          = 5;
let manaInterval  = null;
let timerInterval = null;
let matchSeconds  = 0;
let activeTab     = "lobby";
let selectedBet   = 0;
let CARDS         = {};             // map id→card
let tooltipEl     = null;
// FIX deck rotation : index de la première carte affichée dans la main
let handStart     = 0;

// ═══════════════════════════════════════════════════════════════════════
// BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════════
(async function init() {
  await new Promise((r) => setTimeout(r, 2000));
  try {
    await setupDiscordSdk();
    document.getElementById("loading-screen").classList.add("fade-out");
    setTimeout(() => {
      document.getElementById("loading-screen").style.display = "none";
      document.getElementById("app").classList.remove("hidden");
    }, 600);
    await Promise.all([initPlayer(), fetchCards(), fetchBalance()]);
    renderMain();
    attachDelegation();
  } catch (err) {
    console.error("Init error:", err);
    document.querySelector(".loading-sub").textContent = "Erreur. Relance l'activité.";
  }
})();

// ═══════════════════════════════════════════════════════════════════════
// EVENT DELEGATION
// ═══════════════════════════════════════════════════════════════════════
function attachDelegation() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const a = el.dataset.action;
    const v = el.dataset.val ?? "";
    switch (a) {
      case "switch-tab":    switchTab(v); break;
      case "set-bet":       setBet(Number(v)); break;
      case "set-bet-max":   setBet(Math.floor((balance.cash || 0) * 0.9)); break;
      case "join-queue":    joinQueue(); break;
      case "leave-queue":   leaveQueue(); break;
      case "open-chest":    openChest(v); break;
      case "toggle-card":   toggleDeckCard(v); break;
      case "remove-slot":   removeDeckCard(Number(v)); break;
      case "save-deck":     saveDeck(); break;
      case "refresh-bal":   refreshBalance(); break;
      case "play-card":     playCard(v); break;
      case "hand-prev":     rotateHand(-1); break;
      case "hand-next":     rotateHand(+1); break;
      case "go-lobby":      goLobby(); break;
      case "close-overlay": el.closest(".chest-opening-overlay,.result-overlay")?.remove(); break;
    }
  });

  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-tooltip]");
    if (el) showTooltip(e, el.dataset.tooltip);
  });
  document.addEventListener("mouseout", (e) => {
    if (e.target.closest("[data-tooltip]")) hideTooltip();
  });

  document.addEventListener("input", (e) => {
    if (e.target.id === "bet-input") {
      const max = Math.floor((balance.cash || 0) * 0.9);
      selectedBet = Math.min(Math.max(0, parseInt(e.target.value) || 0), max);
      updateBetDisplay();
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
// AUTH
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

async function initPlayer() {
  const uid  = auth.user.id;
  const ava  = auth.user.avatar
    ? `https://cdn.discordapp.com/avatars/${uid}/${auth.user.avatar}.webp?size=64`
    : null;
  currentPlayer = await fetch("/api/player/init", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: uid, username: auth.user.username, avatar: ava }),
  }).then((r) => r.json());
}

async function fetchCards() {
  if (Object.keys(CARDS).length) return;
  const list = await fetch("/api/cards").then((r) => r.json());
  list.forEach((c) => (CARDS[c.id] = c));
}

async function fetchBalance() {
  if (!auth?.user?.id) return;
  try {
    const d = await fetch(`/api/economy/balance/${auth.user.id}`).then((r) => r.json());
    balance = d;
  } catch (e) { console.warn("Balance fetch failed:", e); }
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
      headers: { Authorization:`Bearer ${auth.access_token}`, "Content-Type":"application/json" },
    }).then((r) => r.json()).catch(() => []);
    const g = Array.isArray(guilds) && guilds.find((x) => x.id === discordSdk.guildId);
    if (g) { guildName = g.name; guildIcon = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.webp?size=64` : null; }
  }

  const rank   = currentPlayer.rank || { name:"Arène I", icon:"⚔️", color:"#8B7355" };
  const avaHtml = currentPlayer.avatar
    ? `<img src="${currentPlayer.avatar}" class="player-avatar" alt="Avatar">`
    : `<div class="player-avatar-ph">⚔️</div>`;

  // Affichage de la balance — gérer le mode démo
  const balCash = balance.unavailable || balance.cash === null
    ? `<span style="color:var(--cr-text-muted);font-size:12px">Non configuré</span>`
    : `<span id="bal-cash">${fmtNum(balance.cash)}</span>`;
  const balBank = balance.unavailable || balance.bank === null
    ? `<span style="color:var(--cr-text-muted);font-size:12px">—</span>`
    : `<span id="bal-bank">${fmtNum(balance.bank)}</span>`;

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

      <div class="balance-bar">
        <div class="balance-item">
          <div class="balance-label">Pièces (Cash)</div>
          <div class="balance-value">🪙 ${balCash}</div>
        </div>
        <div class="balance-divider"></div>
        <div class="balance-item">
          <div class="balance-label">Banque</div>
          <div class="balance-value">🏦 ${balBank}</div>
        </div>
        <button class="balance-refresh" data-action="refresh-bal" title="Actualiser">↻</button>
      </div>

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
            <div class="stat-item">🃏 <strong>${(currentPlayer.unlockedCards||[]).length}</strong> cartes</div>
          </div>
        </div>
      </div>

      <div class="tabs">
        ${[["lobby","⚔️","Lobby"],["chests","📦","Coffres"],["deck","🃏","Deck"],["rank","🏅","Top"]].map(([t,ic,lb])=>
          `<button class="tab-btn ${activeTab===t?"active":""}" data-action="switch-tab" data-val="${t}">
             <span class="tab-icon">${ic}</span>${lb}
           </button>`).join("")}
      </div>

      <div id="tab-lobby"  class="tab-content ${activeTab==="lobby" ?"active":""}"> ${renderLobby()} </div>
      <div id="tab-chests" class="tab-content ${activeTab==="chests"?"active":""}"> ${renderChests()} </div>
      <div id="tab-deck"   class="tab-content ${activeTab==="deck"  ?"active":""}"> ${renderDeck()} </div>
      <div id="tab-rank"   class="tab-content ${activeTab==="rank"  ?"active":""}">
        <div id="lb-container"><div class="status-banner pulse">Chargement…</div></div>
      </div>
    </div>`;

  if (activeTab === "rank") loadLeaderboard();
}

// ── Onglets ──────────────────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === tab));
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
  const el = document.getElementById(`tab-${tab}`);
  if (!el) return;
  el.classList.add("active");
  if (tab === "chests") el.innerHTML = renderChests();
  else if (tab === "deck")  el.innerHTML = renderDeck();
  else if (tab === "rank")  { el.innerHTML = `<div id="lb-container"><div class="status-banner pulse">Chargement…</div></div>`; loadLeaderboard(); }
}

// ═══════════════════════════════════════════════════════════════════════
// LOBBY + MISE
// ═══════════════════════════════════════════════════════════════════════
function renderLobby() {
  const maxBet  = Math.floor((balance.cash || 0) * 0.9);
  const presets = [0, 100, 500, 1000, 5000];
  const unbOk   = balance.cash !== null && !balance.unavailable;

  return `
    <div class="status-banner pulse" id="queue-status">Prêt à combattre ?</div>

    <div class="bet-selector">
      <div class="bet-title">💰 Mise en jeu${!unbOk ? ' <span style="font-size:10px;color:var(--cr-text-muted)">(UNB non configuré — gratuit uniquement)</span>' : ""}</div>
      <div class="bet-presets">
        ${presets.map((p) => `
          <div class="bet-preset ${selectedBet===p?"active":""}" data-action="set-bet" data-val="${p}"
               ${!unbOk && p > 0 ? "style=\"opacity:.3;pointer-events:none\"" : ""}>
            ${p === 0 ? "Gratuit" : "🪙" + p.toLocaleString()}
          </div>`).join("")}
        <div class="bet-preset ${!unbOk?"":""}${selectedBet===maxBet&&maxBet>0?"active":""}" 
             data-action="set-bet-max" ${!unbOk ? "style=\"opacity:.3;pointer-events:none\"" : ""}>MAX</div>
      </div>
      <div class="bet-custom-row">
        <input type="number" class="bet-input" id="bet-input"
               placeholder="Montant libre…" min="0" max="${maxBet}" step="50"
               value="${selectedBet > 0 ? selectedBet : ""}"
               ${!unbOk ? "disabled" : ""}>
        <button class="btn btn-coin btn-sm" data-action="set-bet-max" ${!unbOk ? "disabled" : ""}>MAX</button>
      </div>
      <div class="bet-info">
        Mise : <strong id="bet-display">${selectedBet > 0 ? "🪙 "+fmtNum(selectedBet) : "Gratuit"}</strong>
        · Gain potentiel : <strong id="bet-win-display">${selectedBet > 0 ? "🪙 "+fmtNum(selectedBet*2) : "—"}</strong>
      </div>
    </div>

    <button id="btn-join"  class="btn btn-primary btn-full" data-action="join-queue">⚔️ Rejoindre la file</button>
    <button id="btn-leave" class="btn btn-secondary btn-full hidden" data-action="leave-queue">🚪 Quitter la file</button>`;
}

function setBet(amount) {
  const max = Math.floor((balance.cash || 0) * 0.9);
  selectedBet = Math.min(Math.max(0, Math.floor(amount)), max);
  if (activeTab === "lobby") {
    const el = document.getElementById("tab-lobby");
    if (el) el.innerHTML = renderLobby();
  }
}
function updateBetDisplay() {
  const d = document.getElementById("bet-display");
  const w = document.getElementById("bet-win-display");
  if (d) d.textContent = selectedBet > 0 ? `🪙 ${fmtNum(selectedBet)}` : "Gratuit";
  if (w) w.textContent = selectedBet > 0 ? `🪙 ${fmtNum(selectedBet*2)}` : "—";
}
async function refreshBalance() {
  await fetchBalance();
  // Mettre à jour l'affichage sans re-render complet
  const cc = document.getElementById("bal-cash");
  const cb = document.getElementById("bal-bank");
  if (cc && balance.cash !== null) cc.textContent = fmtNum(balance.cash);
  if (cb && balance.bank !== null) cb.textContent = fmtNum(balance.bank);
  // Re-render lobby pour mettre à jour maxBet
  if (activeTab === "lobby") document.getElementById("tab-lobby").innerHTML = renderLobby();
  if (activeTab === "chests") document.getElementById("tab-chests").innerHTML = renderChests();
}

// ═══════════════════════════════════════════════════════════════════════
// COFFRES — FIX: mode démo affiché clairement, newBalance peut être null
// ═══════════════════════════════════════════════════════════════════════
function renderChests() {
  const chestDefs = [
    { id:"wood",    name:"Coffre en bois",   emoji:"📦", cost:200,  rarity:"wood",    desc:"1-2 cartes communes + bonus pièces" },
    { id:"silver",  name:"Coffre en argent", emoji:"🎁", cost:500,  rarity:"silver",  desc:"2-3 cartes, 1 rare garantie" },
    { id:"gold",    name:"Coffre en or",     emoji:"🏆", cost:1500, rarity:"gold",    desc:"3-4 cartes, épique possible" },
    { id:"magical", name:"Coffre magique",   emoji:"✨", cost:4000, rarity:"magical", desc:"5 cartes, 1 épique garantie" },
  ];
  const unbOk = balance.cash !== null && !balance.unavailable;
  return `
    <div class="section-title">📦 Coffres</div>
    ${unbOk
      ? `<p style="font-size:11px;color:var(--cr-text-muted);margin-bottom:10px;text-align:center">Solde : <strong style="color:var(--cr-coin)">🪙 ${fmtNum(balance.cash)}</strong> <button class="btn btn-coin btn-sm" style="padding:3px 8px;font-size:10px;margin-left:6px" data-action="refresh-bal">↻</button></p>`
      : `<p style="font-size:11px;color:#EF9A9A;margin-bottom:10px;text-align:center;background:rgba(239,154,154,.1);padding:8px;border-radius:8px">⚠️ UNB non configuré — ouverture en mode démo (aucun vrai débit)</p>`}
    <div class="chests-grid">
      ${chestDefs.map((ch) => `
        <div class="chest-card ${ch.rarity}" data-action="open-chest" data-val="${ch.id}">
          <span class="chest-emoji">${ch.emoji}</span>
          <div class="chest-name">${ch.name}</div>
          <div class="chest-cost">${unbOk ? `🪙 ${fmtNum(ch.cost)}` : "DEMO"}</div>
          <div class="chest-desc">${ch.desc}</div>
        </div>`).join("")}
    </div>`;
}

async function openChest(chestId) {
  const costs = { wood:200, silver:500, gold:1500, magical:4000 };
  const names = { wood:"📦 Coffre en bois", silver:"🎁 Coffre en argent", gold:"🏆 Coffre en or", magical:"✨ Coffre magique" };
  const emojis= { wood:"📦", silver:"🎁", gold:"🏆", magical:"✨" };
  const cost  = costs[chestId];
  if (!cost) return;

  // Vérification locale du solde avant d'appeler le serveur
  if (balance.cash !== null && (balance.cash || 0) < cost) {
    showAlert(`❌ Solde insuffisant ! Il te faut 🪙 ${fmtNum(cost)} (tu as 🪙 ${fmtNum(balance.cash)})`);
    return;
  }

  showAlert("📦 Ouverture en cours…");

  const res = await fetch("/api/economy/open-chest", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: currentPlayer.userId, chestId, cost }),
  }).then((r) => r.json()).catch(() => null);

  // Supprimer l'alerte "en cours"
  document.querySelectorAll(".ca-alert").forEach((e) => e.remove());

  if (!res || res.error) {
    showAlert(`❌ ${res?.error || "Erreur lors de l'ouverture."}`);
    return;
  }

  // Mettre à jour le solde local
  if (res.newBalance !== null && res.newBalance !== undefined) {
    balance.cash = res.newBalance;
    const el = document.getElementById("bal-cash");
    if (el) el.textContent = fmtNum(balance.cash);
  }

  // Mettre à jour les cartes débloquées
  if (res.newCards?.length) {
    currentPlayer.unlockedCards = [...new Set([...(currentPlayer.unlockedCards||[]), ...res.newCards])];
  }

  showChestAnimation(names[chestId], emojis[chestId], res.rewards, res.demo);
}

function showChestAnimation(name, emoji, rewards, demo) {
  document.querySelectorAll(".chest-opening-overlay").forEach((e) => e.remove());
  const overlay = document.createElement("div");
  overlay.className = "chest-opening-overlay";
  overlay.innerHTML = `
    <div class="chest-opening-box">
      <span class="chest-open-emoji">${emoji}</span>
      <div class="chest-open-title">${name} ouvert !${demo ? ' <span style="font-size:12px;color:var(--cr-text-muted)">(démo)</span>' : ""}</div>
      <div class="chest-rewards-list">
        ${(rewards||[]).map((r,i)=>`
          <div class="chest-reward-item" style="animation-delay:${i*.12}s">
            <span class="reward-emoji">${r.emoji}</span>
            <div class="reward-info">
              <div class="reward-name">${r.name}</div>
              <div class="reward-amount">${r.value}</div>
            </div>
          </div>`).join("")}
      </div>
      <button class="btn btn-gold btn-full" data-action="close-overlay">🎉 Super !</button>
    </div>`;
  document.body.appendChild(overlay);
}

// ═══════════════════════════════════════════════════════════════════════
// DECK EDITOR — FIX: affiche uniquement les cartes débloquées
// ═══════════════════════════════════════════════════════════════════════
function renderDeck() {
  const deck      = currentPlayer.deck || [];
  const unlocked  = new Set(currentPlayer.unlockedCards || []);

  const slotsHtml = Array.from({ length:8 }, (_, i) => {
    const c = CARDS[deck[i]];
    return c
      ? `<div class="deck-slot filled" data-action="remove-slot" data-val="${i}" title="Retirer ${c.name}">
           <span style="font-size:20px">${c.emoji}</span>
           <div class="slot-cost">${c.cost}</div>
           <div class="slot-x">✕</div>
         </div>`
      : `<div class="deck-slot"><span style="font-size:14px;opacity:.3">+</span></div>`;
  }).join("");

  const byType = { troop:[], spell:[], building:[] };
  Object.values(CARDS).forEach((c) => { if (byType[c.type]) byType[c.type].push(c); });

  const section = (lbl, icon, arr) => arr.length ? `
    <div style="margin-bottom:12px">
      <div style="font-size:10px;color:var(--cr-text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">${icon} ${lbl}</div>
      <div class="cards-grid">${arr.map((c) => cardTile(c, deck.includes(c.id), unlocked.has(c.id))).join("")}</div>
    </div>` : "";

  return `
    <div class="section-title">🃏 Mon Deck (${deck.length}/8)</div>
    <div class="deck-slots">${slotsHtml}</div>
    <p style="font-size:10px;color:var(--cr-text-muted);text-align:center;margin:4px 0">
      🔒 Les cartes grisées s'obtiennent en ouvrant des coffres
    </p>
    <div style="margin-top:10px">
      <div class="section-title" style="font-size:12px">📚 Ajouter une carte</div>
      ${section("Troupes","⚔️",byType.troop)}
      ${section("Sorts","✨",byType.spell)}
      ${section("Bâtiments","🏰",byType.building)}
    </div>
    <button class="btn btn-gold btn-full" data-action="save-deck" style="margin-top:8px">💾 Sauvegarder</button>`;
}

function cardTile(card, inDeck, isUnlocked) {
  return `<div class="card-item rarity-${card.rarity} ${inDeck?"in-deck":""} ${!isUnlocked?"locked":""}"
    ${isUnlocked ? `data-action="toggle-card" data-val="${card.id}"` : ""}
    data-tooltip="${card.id}">
    <div class="card-cost">${card.cost}</div>
    ${inDeck   ? `<div class="card-deck-badge">✓</div>` : ""}
    ${!isUnlocked ? `<div class="card-lock">🔒</div>` : ""}
    <span class="card-emoji" style="${!isUnlocked?"filter:grayscale(1);opacity:.5":""}">${card.emoji}</span>
    <div class="card-name">${card.name}</div>
    ${isUnlocked ? `<div class="card-atk">⚔️${card.attack}</div>` : ""}
    <div class="card-rarity-bar"></div>
  </div>`;
}

function toggleDeckCard(cardId) {
  const deck = [...(currentPlayer.deck||[])];
  const idx  = deck.indexOf(cardId);
  if (idx !== -1) deck.splice(idx, 1);
  else { if (deck.length >= 8) { showAlert("Deck plein (8/8) !"); return; } deck.push(cardId); }
  currentPlayer.deck = deck;
  document.getElementById("tab-deck").innerHTML = renderDeck();
}
function removeDeckCard(i) {
  currentPlayer.deck.splice(i, 1);
  document.getElementById("tab-deck").innerHTML = renderDeck();
}
async function saveDeck() {
  if ((currentPlayer.deck||[]).length !== 8) { showAlert("Le deck doit contenir exactement 8 cartes !"); return; }
  const r = await fetch(`/api/player/${currentPlayer.userId}/deck`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ deck: currentPlayer.deck }),
  }).then((r)=>r.json()).catch(()=>null);
  showAlert(r?.success ? "✅ Deck sauvegardé !" : `❌ ${r?.error || "Erreur sauvegarde."}`);
}

// ═══════════════════════════════════════════════════════════════════════
// FILE D'ATTENTE
// ═══════════════════════════════════════════════════════════════════════
async function joinQueue() {
  if (selectedBet > (balance.cash || 0) && balance.cash !== null) {
    showAlert(`❌ Mise trop élevée ! Tu as 🪙 ${fmtNum(balance.cash)}`); return;
  }
  setQStatus("🔍 Recherche d'un adversaire…", true);
  document.getElementById("btn-join")?.classList.add("hidden");
  document.getElementById("btn-leave")?.classList.remove("hidden");

  const res = await fetch("/api/queue/join", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ userId:currentPlayer.userId, username:currentPlayer.username, avatar:currentPlayer.avatar, bet:selectedBet }),
  }).then((r)=>r.json()).catch(()=>({status:"error"}));

  if (res.status === "matched") { startMatch(res.matchId, res.opponent, res.bet??0); }
  else if (res.status === "error" || res.error) {
    showAlert(res.error || "Erreur réseau.");
    document.getElementById("btn-join")?.classList.remove("hidden");
    document.getElementById("btn-leave")?.classList.add("hidden");
  } else {
    pollingId = setInterval(pollQueue, 2000);
  }
}
async function leaveQueue() {
  clearInterval(pollingId);
  await fetch("/api/queue/leave", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({userId:currentPlayer.userId}) });
  setQStatus("Prêt à combattre ?", false);
  document.getElementById("btn-join")?.classList.remove("hidden");
  document.getElementById("btn-leave")?.classList.add("hidden");
}
async function pollQueue() {
  const res = await fetch(`/api/queue/status/${currentPlayer.userId}`).then((r)=>r.json()).catch(()=>null);
  if (!res) return;
  if (res.status === "matched") { clearInterval(pollingId); startMatch(res.matchId, res.opponent, res.bet??0); }
  else if (res.status === "waiting") setQStatus(`🔍 En file… (${res.queueSize} guerrier(s))`, true);
}
function setQStatus(msg, pulse) {
  const el = document.getElementById("queue-status");
  if (el) { el.textContent = msg; el.className = "status-banner"+(pulse?" pulse":""); }
}

// ═══════════════════════════════════════════════════════════════════════
// ÉCRAN DE COMBAT
// ═══════════════════════════════════════════════════════════════════════
function startMatch(matchId, opponent, bet=0) {
  currentMatch = { matchId, opponent, myHp:3000, opponentHp:3000, bet, playedCards:[] };
  mana = 5; matchSeconds = 0; handStart = 0;
  renderBattle();
  manaInterval  = setInterval(() => { if (mana<10) { mana++; updateMana(); } }, 1000);
  timerInterval = setInterval(() => { matchSeconds++; updateTimer(); if (matchSeconds>=180) { clearInterval(timerInterval); handleTimeout(); } }, 1000);
  pollingId     = setInterval(pollMatch, 1800);
}

function renderBattle() {
  const opp    = currentMatch.opponent;
  const oppAva = opp.avatar  ? `<img src="${opp.avatar}" alt="${opp.username}">` : `<div class="f-ph">⚔️</div>`;
  const myAva  = currentPlayer.avatar ? `<img src="${currentPlayer.avatar}" alt="Toi">` : `<div class="f-ph">👑</div>`;
  const betBanner = currentMatch.bet>0
    ? `<div class="match-bet-banner">🎲 Mise : 🪙 ${fmtNum(currentMatch.bet)} · Gagnant remporte 🪙 ${fmtNum(currentMatch.bet*2)}</div>`
    : "";

  document.getElementById("app").innerHTML = `
    <div class="match-screen">

      <div class="fighters-bar">
        <div class="fighter-mini">${oppAva}<div class="fighter-name">${opp.username}</div><div class="fighter-elo">🏆 ${opp.elo||1200}</div></div>
        <div style="text-align:center">
          <div class="match-timer" id="match-timer">3:00</div>
          <div class="vs-text">VS</div>
        </div>
        <div class="fighter-mini">${myAva}<div class="fighter-name">${currentPlayer.username}</div><div class="fighter-elo">🏆 ${currentPlayer.elo}</div></div>
      </div>
      ${betBanner}

      <!-- Tours adversaire -->
      <div class="tower-zone">
        <div class="tower-card">
          <div class="tower-img" id="opp-twi">🏰</div>
          <div class="tower-hp-wrap"><div class="tower-hp" id="opp-hp" style="width:100%"></div></div>
          <div class="tower-hp-txt" id="opp-hp-txt">3000 HP</div>
          <div class="tower-owner">${opp.username}</div>
        </div>
        <div style="opacity:.25;font-size:18px;text-align:center">👑</div>
        <div style="opacity:.25;font-size:18px;text-align:center">👑</div>
      </div>

      <!-- Terrain -->
      <div class="arena-field">
        <!-- Zone des cartes jouées (animations) -->
        <div id="play-zone" style="flex:1;position:relative;overflow:hidden;"></div>
        <div class="arena-river">〰 Rivière 〰</div>
        <div style="flex:1;background:repeating-linear-gradient(90deg,rgba(46,125,50,.05) 0px,rgba(46,125,50,.05) 40px,transparent 40px,transparent 80px)"></div>
      </div>

      <!-- Tours joueur -->
      <div class="tower-zone">
        <div style="opacity:.25;font-size:18px;text-align:center">👑</div>
        <div style="opacity:.25;font-size:18px;text-align:center">👑</div>
        <div class="tower-card">
          <div class="tower-img" id="my-twi">🏰</div>
          <div class="tower-hp-wrap"><div class="tower-hp" id="my-hp" style="width:100%"></div></div>
          <div class="tower-hp-txt" id="my-hp-txt">3000 HP</div>
          <div class="tower-owner">Toi</div>
        </div>
      </div>

      <!-- Zone de jeu bas -->
      <div class="battle-area">
        <div class="battle-log" id="battle-log">
          <div class="battle-log-entry">⚔️ Le duel commence ! Détruisez la tour adverse.</div>
        </div>

        <!-- Mana -->
        <div class="mana-row">
          <div class="mana-label">💧 ${mana}/10</div>
          <div class="mana-pips" id="mana-pips">
            ${Array.from({length:10},(_,i)=>`<div class="mana-pip ${i<mana?"filled":""}" id="pip-${i}"></div>`).join("")}
          </div>
        </div>

        <!-- Main avec rotation -->
        <div class="hand-wrap">
          <button class="hand-nav" data-action="hand-prev">‹</button>
          <div class="hand-cards" id="hand-cards">${buildHand()}</div>
          <button class="hand-nav" data-action="hand-next">›</button>
        </div>
        <div style="text-align:center;font-size:10px;color:var(--cr-text-muted);margin-top:2px">
          Carte ${handStart+1}–${Math.min(handStart+4,(currentPlayer.deck||[]).length)} sur ${(currentPlayer.deck||[]).length} · Cliquez pour jouer
        </div>
      </div>
    </div>`;
}

// ── Main du joueur : 4 cartes visibles sur les 8, avec rotation ──────
function buildHand() {
  const deck = currentPlayer.deck || [];
  if (!deck.length) return `<div style="color:var(--cr-text-muted);font-size:12px;padding:8px">Deck vide</div>`;

  // Afficher 4 cartes à partir de handStart (cyclique)
  const shown = [];
  for (let i = 0; i < Math.min(4, deck.length); i++) {
    shown.push(deck[(handStart + i) % deck.length]);
  }

  return shown.map((id) => {
    const c = CARDS[id]; if (!c) return "";
    const off = mana < c.cost;
    return `<div class="hand-card ${off?"off":""}" data-action="play-card" data-val="${id}" data-tooltip="${id}">
      <div class="hc-cost">${c.cost}</div>
      <span class="card-emoji">${c.emoji}</span>
      <div class="card-name">${c.name}</div>
      ${off ? `<div style="font-size:8px;color:#EF9A9A">💧${c.cost}</div>` : ""}
    </div>`;
  }).join("");
}

function rotateHand(dir) {
  const deck = currentPlayer.deck || [];
  if (deck.length <= 4) return;
  handStart = ((handStart + dir) % deck.length + deck.length) % deck.length;
  const el = document.getElementById("hand-cards");
  if (el) el.innerHTML = buildHand();
  // Mettre à jour le compteur
  const info = document.querySelector(".hand-wrap + div");
  if (info) info.textContent = `Carte ${handStart+1}–${Math.min(handStart+4,deck.length)} sur ${deck.length} · Cliquez pour jouer`;
}

function updateMana() {
  for (let i=0;i<10;i++) {
    const p = document.getElementById(`pip-${i}`);
    if (p) p.classList.toggle("filled", i<mana);
  }
  const ml = document.querySelector(".mana-label");
  if (ml) ml.textContent = `💧 ${mana}/10`;
  const hc = document.getElementById("hand-cards");
  if (hc) hc.innerHTML = buildHand();
}

function updateTimer() {
  const el = document.getElementById("match-timer"); if (!el) return;
  const r  = Math.max(0, 180-matchSeconds);
  el.textContent = `${Math.floor(r/60)}:${(r%60).toString().padStart(2,"0")}`;
  el.classList.toggle("urgent", r<=30);
}

// ── Jouer une carte ──────────────────────────────────────────────────
async function playCard(cardId) {
  const c = CARDS[cardId];
  if (!c || mana<c.cost || !currentMatch) return;

  // FIX rotation : passer automatiquement à la carte suivante après avoir joué
  const deck = currentPlayer.deck||[];
  const playedIdx = deck.indexOf(cardId);
  if (playedIdx !== -1) {
    // Avancer handStart pour que la carte jouée soit remplacée par la suivante
    handStart = (playedIdx + 1) % deck.length;
  }

  mana -= c.cost;
  updateMana();

  const res = await fetch(`/api/match/${currentMatch.matchId}/play-card`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ userId:currentPlayer.userId, cardId }),
  }).then((r)=>r.json()).catch(()=>null);

  if (!res || res.error) { mana += c.cost; updateMana(); return; } // rembourser le mana si erreur

  // Mise à jour HP
  currentMatch.opponentHp = res.towerHp[currentMatch.opponent.userId];
  updateTowerHp("opp", currentMatch.opponentHp, 3000);

  // Animation carte jouée
  animateCardPlay(c, res.action.damage, true);
  addLog(`${c.emoji} Tu joues ${c.name} → 💥 ${res.action.damage} dégâts`, res.action.damage>=150);
  spawnDmgFloater(res.action.damage, res.action.damage>=150, true);

  if (res.matchOver) {
    clearTimers();
    await fetchBalance();
    endMatch(res.winner===currentPlayer.userId, res.eloChanges?.[currentPlayer.userId], res.coinResult);
  }
}

// ── Polling adversaire ───────────────────────────────────────────────
async function pollMatch() {
  if (!currentMatch) return;
  const res = await fetch(`/api/match/${currentMatch.matchId}`).then((r)=>r.json()).catch(()=>null);
  if (!res) return;

  const prevMyHp  = currentMatch.myHp;
  currentMatch.myHp       = res.towerHp?.[currentPlayer.userId]             ?? currentMatch.myHp;
  currentMatch.opponentHp = res.towerHp?.[currentMatch.opponent.userId]     ?? currentMatch.opponentHp;

  updateTowerHp("my",  currentMatch.myHp,       3000);
  updateTowerHp("opp", currentMatch.opponentHp, 3000);

  // Nouvelles actions adversaire
  const newActs = (res.playedCards||[]).filter(
    (a) => a.playerId !== currentPlayer.userId &&
           !currentMatch.playedCards.find((x) => x.timestamp===a.timestamp)
  );
  newActs.forEach((a) => {
    const c = CARDS[a.cardId];
    animateCardPlay(c||{emoji:"⚔️",name:a.cardId}, a.damage, false);
    addLog(`${c?.emoji||"⚔️"} ${currentMatch.opponent.username} joue ${c?.name||a.cardId} → 💥 ${a.damage} dégâts`, a.damage>=150);
    spawnDmgFloater(a.damage, a.damage>=150, false);
    currentMatch.playedCards.push(a);
  });

  if (res.status === "finished") {
    clearTimers();
    const upd = await fetch(`/api/player/${currentPlayer.userId}`).then((r)=>r.json()).catch(()=>null);
    if (upd) currentPlayer = upd;
    await fetchBalance();
    endMatch(res.winner===currentPlayer.userId, null, res.coinResult);
  }
}

// Fin de match par timeout : gagnant = celui qui a le plus de HP
async function handleTimeout() {
  clearTimers();
  const isWin = currentMatch.myHp > currentMatch.opponentHp;
  // Notifier le serveur du résultat via play-card n'est plus possible
  // On affiche juste le résultat (le polling de l'autre joueur le détectera)
  await fetchBalance();
  endMatch(isWin, null, null);
}

function clearTimers() {
  clearInterval(pollingId); clearInterval(manaInterval); clearInterval(timerInterval);
}

// ═══════════════════════════════════════════════════════════════════════
// ANIMATION CARTE JOUÉE — carte qui vole vers la tour
// ═══════════════════════════════════════════════════════════════════════
function animateCardPlay(card, damage, isMine) {
  const zone = document.getElementById("play-zone");
  if (!zone) return;

  const el = document.createElement("div");
  el.className = "card-play-anim";
  // Côté gauche si c'est nous (on attaque la tour du haut), droit si adversaire
  el.style.cssText = `
    position:absolute;
    bottom:${isMine ? "10%" : "auto"};
    top:${isMine ? "auto" : "10%"};
    left:${isMine ? "20%" : "60%"};
    font-size:32px;
    animation:${isMine ? "cardFlyUp" : "cardFlyDown"} 0.8s ease forwards;
    pointer-events:none;
    z-index:10;
    text-align:center;
  `;
  el.innerHTML = `${card.emoji}<div style="font-size:14px;font-weight:700;color:${isMine?"#FFD700":"#EF5350"};text-shadow:0 2px 4px rgba(0,0,0,.8)">-${damage}</div>`;
  zone.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

// ═══════════════════════════════════════════════════════════════════════
// RÉSULTAT — suppression des boutons J'ai gagné/J'ai perdu
// ═══════════════════════════════════════════════════════════════════════
function endMatch(isWin, eloData, coinResult) {
  clearTimers();
  const oldElo  = currentPlayer.elo;
  const newElo  = eloData?.newElo || oldElo;
  const eloDiff = newElo - oldElo;
  if (newElo !== oldElo) currentPlayer.elo = newElo;

  const overlay = document.createElement("div");
  overlay.className = "result-overlay";
  overlay.innerHTML = `
    <div class="result-card">
      <span class="result-icon">${isWin?"🏆":"💀"}</span>
      <div class="result-title ${isWin?"win":"lose"}">${isWin?"VICTOIRE !":"DÉFAITE…"}</div>
      <div class="result-stats">
        <div class="result-stat">
          <span>🏆 ELO</span>
          <span class="val">${newElo} <span class="${eloDiff>=0?"positive":"negative"}" style="font-size:11px">${eloDiff>=0?"+":""}${eloDiff}</span></span>
        </div>
        ${coinResult?.amount>0 ? `
        <div class="result-stat">
          <span>🪙 Pièces</span>
          <span class="val coin">${isWin?"+":"-"}${fmtNum(coinResult.amount)}</span>
        </div>` : ""}
        ${balance.cash!==null ? `
        <div class="result-stat">
          <span>💰 Solde</span>
          <span class="val coin">🪙 ${fmtNum(balance.cash)}</span>
        </div>` : ""}
      </div>
      <button class="btn btn-primary btn-full" data-action="go-lobby">
        ${isWin?"⚔️ Rejouer":"🔁 Revanche"}
      </button>
    </div>`;
  document.body.appendChild(overlay);
}

function goLobby() {
  document.querySelectorAll(".result-overlay").forEach((e)=>e.remove());
  currentMatch=null; mana=10; matchSeconds=0; handStart=0; activeTab="lobby";
  renderMain();
}

// ═══════════════════════════════════════════════════════════════════════
// CLASSEMENT
// ═══════════════════════════════════════════════════════════════════════
async function loadLeaderboard() {
  const list = await fetch("/api/leaderboard").then((r)=>r.json()).catch(()=>[]);
  const el   = document.getElementById("lb-container");
  if (!el) return;
  const medals=["🥇","🥈","🥉"];
  el.innerHTML = `
    <div class="section-title">🏅 Top Joueurs</div>
    <div class="leaderboard">
      ${list.map((p,i)=>{
        const ava = p.avatar ? `<img src="${p.avatar}" class="lb-avatar" alt="">` : `<div class="lb-avatar" style="background:var(--cr-bg3);display:flex;align-items:center;justify-content:center;font-size:12px">⚔️</div>`;
        return `<div class="lb-row ${p.userId===currentPlayer.userId?"is-me":""}">
          <div class="lb-rank ${i<3?"top":""}">${medals[i]||i+1}</div>
          ${ava}
          <div class="lb-name">${p.username}${p.userId===currentPlayer.userId?" (toi)":""}</div>
          <div>${p.rank?.icon||""}</div>
          <div class="lb-elo">${p.elo}</div>
        </div>`;
      }).join("")}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS UI
// ═══════════════════════════════════════════════════════════════════════
function updateTowerHp(side, current, max) {
  const pct   = Math.max(0, Math.min(100,(current/max)*100));
  const barEl = document.getElementById(`${side}-hp`);
  const txtEl = document.getElementById(`${side}-hp-txt`);
  const imgEl = document.getElementById(`${side}-twi`);
  if (barEl) { barEl.style.width=pct+"%"; barEl.className="tower-hp"+(pct<=25?" crit":pct<=50?" low":""); }
  if (txtEl) txtEl.textContent = `${current} HP`;
  if (imgEl && current<max) { imgEl.classList.add("damaged"); setTimeout(()=>imgEl.classList.remove("damaged"),400); }
}

function addLog(msg, isBig) {
  const log = document.getElementById("battle-log"); if (!log) return;
  const e   = document.createElement("div");
  e.className   = "battle-log-entry"+(isBig?" big":" hit");
  e.textContent = msg;
  log.appendChild(e); log.scrollTop=log.scrollHeight;
  while (log.children.length>25) log.removeChild(log.firstChild);
}

function spawnDmgFloater(dmg, isBig, isMine) {
  const el       = document.createElement("div");
  el.className   = "dmg-floater"+(isBig?" big":"");
  el.textContent = `-${dmg}`;
  el.style.left  = (25+Math.random()*50)+"%";
  el.style.top   = isMine ? "20%" : "55%";
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 1300);
}

function showTooltip(event, cardId) {
  hideTooltip();
  const c = CARDS[cardId]; if (!c) return;
  const rc={common:"#9E9E9E",rare:"#1976D2",epic:"#7B1FA2"};
  const rl={common:"Commune",rare:"Rare",epic:"Épique"};
  tooltipEl=document.createElement("div"); tooltipEl.className="card-tooltip";
  tooltipEl.innerHTML=`<span class="tt-emoji">${c.emoji}</span><div class="tt-name">${c.name}</div>
    <div style="text-align:center;margin-bottom:5px"><span style="color:${rc[c.rarity]};font-size:10px">${rl[c.rarity]}</span> · <span style="color:#64B5F6;font-size:10px">💧${c.cost}</span></div>
    <div class="tt-desc">${c.description}</div>
    <div class="tt-stats"><div class="tt-stat">⚔️ <span>${c.attack}</span></div><div class="tt-stat">🛡️ <span>${c.defense}</span></div><div class="tt-stat" style="grid-column:1/-1">🏃 <span>${c.speed}</span></div></div>`;
  document.body.appendChild(tooltipEl);
  const target=event.target.closest("[data-tooltip]");
  const r=target?target.getBoundingClientRect():{top:0,right:0,left:0};
  let top=r.top-10, left=r.right+8;
  if (left+180>window.innerWidth) left=r.left-188;
  if (top+220>window.innerHeight) top=window.innerHeight-230;
  tooltipEl.style.top=Math.max(8,top)+"px"; tooltipEl.style.left=Math.max(8,left)+"px";
}
function hideTooltip() { if (tooltipEl) { tooltipEl.remove(); tooltipEl=null; } }

function showAlert(msg) {
  document.querySelectorAll(".ca-alert").forEach((e)=>e.remove());
  const el=document.createElement("div"); el.className="ca-alert";
  el.style.cssText="position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1A0A2E;border:1px solid rgba(255,215,0,.4);border-radius:10px;padding:12px 20px;font-size:13px;color:#F0E6FF;z-index:9999;max-width:90vw;text-align:center";
  el.textContent=msg; document.body.appendChild(el);
  setTimeout(()=>el.remove(), 3000);
}

function fmtNum(n) { return (n??0).toLocaleString?.()??String(n??0); }
