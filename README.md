# L'Ascension Terminal — Déploiement Railway

## Ce que fait ce serveur
- WebSocket TwelveData en temps réel (prix XAU/USD + BTC/USD)
- API REST pour les indicateurs (RSI, MM20, MM50, MM200)
- Graphique en chandeliers temps réel (LightweightCharts)
- Proxy des données pour éviter les problèmes CORS

## Déploiement sur Railway (5 minutes)

### 1. Crée un compte sur railway.app

### 2. Nouveau projet
- Clique "New Project"
- Choisis "Deploy from GitHub repo" OU "Empty project"
- Si empty : clique "Add a service" → "Empty service"

### 3. Upload les fichiers
- Va dans ton service → Settings → Source
- Ou utilise Railway CLI :
  ```
  npm install -g @railway/cli
  railway login
  railway init
  railway up
  ```

### 4. Configure la variable d'environnement
- Dans ton service Railway → Variables
- Ajoute : TWELVEDATA_KEY = ta_clé_api

### 5. Deploy
- Railway deploy automatiquement
- Tu obtiens une URL comme : https://ascension-terminal.up.railway.app

### 6. Accède au terminal
- Ouvre l'URL dans ton navigateur
- Le terminal se connecte automatiquement
- Mets le lien dans ton Discord !

## Structure des fichiers
```
ascension-terminal/
├── server.js          # Serveur Node.js + WebSocket
├── package.json       # Dépendances
├── railway.toml       # Config Railway
├── .env.example       # Variables d'environnement
└── public/
    └── index.html     # Terminal frontend
```
