# Plancia Gaming

Il mio sito personale di videogiochi: notizie da tutte le principali testate italiane con le loro foto, offerte PC con confronto prezzi tra store, giochi gratis, calendario uscite, PC e hardware, handheld, tech e intelligenza artificiale, e una sezione **Per te** che segue i giochi che mi interessano e può mandare avvisi sul dispositivo.

Si aggiorna da solo **ogni 5 minuti** grazie a GitHub Actions e viene pubblicato gratis su GitHub Pages. Il tasto **Aggiorna ora** in alto fa partire un aggiornamento completo quando vuoi (va collegato GitHub una volta sola dalle impostazioni ⚙ del sito).

## Da dove arrivano i dati

| Cosa | Fonti |
|---|---|
| Notizie italiane | Multiplayer.it, Everyeye.it, IGN Italia, SpazioGames, Eurogamer.it, The Games Machine, Gamereactor, Nintendon, Nerd4Life, GameLegends, Gamesoul, GamingTalker, Lega Nerd, Tom's Hardware, Hardware Upgrade, HDblog, DDay.it, Wired Italia, SmartWorld, TuttoTech, AI4Business, IlSoftware.it |
| Notizie internazionali | IGN, GameSpot, VGC, PC Gamer, Eurogamer.net, Rock Paper Shotgun, Push Square, Pure Xbox, Nintendo Life, Gematsu, The Verge (si possono nascondere dalle impostazioni) |
| Video e trailer | Canali YouTube di PlayStation, Xbox, Nintendo, IGN, GameSpot |
| Offerte | Steam (prezzi italiani in euro), GOG, IsThereAnyDeal (facoltativo, molti altri store) |
| Giochi gratis | Epic Games Store, GamerPower |
| Uscite | Steam, RAWG (facoltativo), elenco curato in `data/releases-manual.json` |
| Saldi ed eventi | `data/events-manual.json` |

Le notizie uguali pubblicate da più testate vengono raggruppate in una sola card ("+N fonti"). Le notizie fuori tema delle testate di tecnologia (auto, elettrodomestici, spazio…) vengono escluse. Ogni notizia si apre sul sito originale.

## Primo avvio

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Actions → Aggiorna Plancia Gaming → Run workflow**.
3. Dopo un paio di minuti il sito è su `https://darkatom04.github.io/plancia-gaming/`.

## Chiavi facoltative (gratis) per avere ancora di più

Vanno in **Settings → Secrets and variables → Actions → New repository secret**.

- `ITAD_KEY`: chiave di [IsThereAnyDeal](https://isthereanydeal.com/apps/my/) (registra un'app). Aggiunge offerte da decine di store, storico prezzi e minimi storici.
- `RAWG_KEY`: chiave di [RAWG](https://rawg.io/apidocs). Aggiunge le uscite di tutte le console con le copertine.

## Modificare le fonti

Le testate sono in `config/sources.json`: basta aggiungere una riga con nome, sito e indirizzo del feed. Se l'indirizzo del feed è sbagliato, il raccoglitore lo cerca da solo nella home del sito.

## Provarlo sul computer

```bash
node scripts/build.mjs        # crea la cartella dist/
cd dist && python3 -m http.server 8000
```
