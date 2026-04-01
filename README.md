# ⚔️ Clash Arena 1v1 — Discord Activity

> Activité Discord 1v1 style Clash Royale avec **cartes**, **coffres**, **paris de pièces** via l'API UnbelievaBoat, hébergé sur **Render.com** (gratuit).

---

## 📁 Structure

```
clash-arena/
├── client/            ← Frontend Vite (buildé vers public/)
│   ├── main.js        ← Discord SDK + cartes + coffres + paris
│   ├── style.css      ← Thème médiéval complet
│   ├── index.html
│   └── vite.config.js ← Build → ../public
├── server/
│   └── server.js      ← Express + UNB API + cartes + matchs + sert le frontend
├── scripts/
│   └── register-commands.js
├── public/            ← Généré par `npm run build` (ignoré par Git)
├── render.yaml        ← Config déploiement Render
├── package.json       ← Scripts monorepo (build + start)
└── example.env
```

---

## 🚀 Déploiement sur Render (gratuit)

### 1. Préparer le dépôt GitHub

```bash
git init
git add .
git commit -m "initial: Clash Arena 1v1"
git remote add origin https://github.com/TON_COMPTE/clash-arena.git
git push -u origin main
```

### 2. Créer le service sur Render

1. Aller sur [render.com](https://render.com) → **New +** → **Web Service**
2. Connecter ton compte GitHub et sélectionner le dépôt
3. Configuration :

| Champ | Valeur |
|-------|--------|
| **Name** | `clash-arena` |
| **Branch** | `main` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |
| **Instance Type** | `Free` |

4. Cliquer **Create Web Service**
5. Render te donnera une URL type `https://clash-arena.onrender.com`

### 3. Configurer les variables d'environnement sur Render

Dans le dashboard Render → ton service → **Environment** :

| Variable | Valeur | Source |
|----------|--------|--------|
| `VITE_DISCORD_CLIENT_ID` | ton Client ID | Discord Dev Portal → OAuth2 |
| `DISCORD_CLIENT_SECRET` | ton Client Secret | Discord Dev Portal → OAuth2 |
| `DISCORD_BOT_TOKEN` | ton Bot Token | Discord Dev Portal → Bot |
| `UNB_API_TOKEN` | ton token UNB | https://unbelievaboat.com/api/docs |
| `GUILD_ID` | ID de ton serveur | Discord (Developer Mode activé) |

> ⚠️ `VITE_DISCORD_CLIENT_ID` doit être disponible **au moment du build** (Vite l'embarque dans le frontend). Render injecte les env vars avant le build — c'est automatique.

### 4. Configurer Discord Activity

1. [Discord Developer Portal](https://discord.com/developers/applications) → ton app
2. **Activities → URL Mappings** :
   - PREFIX: `/` → TARGET: `clash-arena.onrender.com` *(sans https://)*
3. **Activities → Settings** → activer **Enable Activities**
4. **OAuth2 → Redirects** → ajouter `https://127.0.0.1`

### 5. Enregistrer la commande /launch

```bash
cp example.env .env       # remplir les valeurs
npm install
node scripts/register-commands.js
```

### ⚠️ Note free tier Render

Le service gratuit **s'endort après 15 min d'inactivité** → premier lancement après inactivité = ~30s de cold start. Pour éviter ça : utiliser un service de "ping" gratuit ([cron-job.org](https://cron-job.org)) qui appelle ton URL toutes les 10 minutes.

---

## 🪙 Intégration UnbelievaBoat

### Obtenir le token API

1. Aller sur [unbelievaboat.com/api/docs](https://unbelievaboat.com/api/docs)
2. Se connecter avec Discord
3. Cliquer **"Generate Token"** → copier le token
4. Ajouter dans `.env` et dans Render Environment

### Ce que l'API fait

| Endpoint utilisé | Action |
|-----------------|--------|
| `GET /guilds/:guildId/users/:userId` | Récupère le solde (cash + bank) |
| `PATCH /guilds/:guildId/users/:userId` | Modifie le solde (delta relatif) |

### Fonctionnement des paris

1. Avant de rejoindre la file → sélectionner une mise (0, 100, 500, 1000, 5000 ou MAX)
2. L'adversaire doit aussi avoir défini une mise
3. La mise effective = `Math.min(miseJ1, miseJ2)`
4. En fin de match :
   - Vainqueur → **+mise** pièces (via UNB PATCH)
   - Perdant → **-mise** pièces (via UNB PATCH)
5. Si UNB non configuré → mode démo (aucun vrai débit)

### Fonctionnement des coffres

| Coffre | Coût | Récompenses |
|--------|------|-------------|
| 📦 Bois | 200 🪙 | 1-2 cartes communes + bonus pièces |
| 🎁 Argent | 500 🪙 | 2-3 cartes, 1 rare garantie + bonus |
| 🏆 Or | 1 500 🪙 | 3-4 cartes, 1-2 rares, chance épique + gros bonus |
| ✨ Magique | 4 000 🪙 | 5 cartes, 1 épique garantie + très gros bonus |

Le bonus de pièces d'un coffre est **automatiquement crédité** via l'API UNB.

---

## ⚔️ Gameplay

1. **Lobby** → choisir une mise → rejoindre la file
2. **Appariement** dès que 2 joueurs en file (polling 2s)
3. **Combat** : mana +1/s, jouer des cartes, infliger des dégâts
4. **Fin** : tour détruite, timeout 3min, ou déclaration manuelle
5. **ELO** mis à jour + transfert de pièces UNB

---

## 🃏 Cartes (18 au total)

**Troupes** : Chevalier, Archères, Géant, Prince, Sorcier, Sbires, P.E.K.K.A, Armée Squelette, Goblins, Bébé Dragon

**Sorts** : Boule de Feu, Éclair, Gel, Flèches, Poison

**Bâtiments** : Canon, Tour Inferno, Tour Bombe

---

## 🔧 Développement local

```bash
cp example.env .env      # remplir les valeurs

# Terminal 1 — Backend
npm install
npm run dev:server       # → http://localhost:3001

# Terminal 2 — Frontend
cd client && npm install && npm run dev  # → http://localhost:5173

# Terminal 3 — Tunnel
cloudflared tunnel --url http://localhost:5173
```
