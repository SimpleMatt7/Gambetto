# Gambetto

Scacchi, con stile: un'app web gratuita e senza pubblicità per giocare, imparare e sfidare gli amici.

- **Gioca** contro il computer su 8 livelli (motore Stockfish), con suggerimenti, annulla mossa e orologio.
- **Due giocatori** sullo stesso schermo, oppure **online** mandando un link, con arbitro e orologio lato server.
- **Impara** con 26 lezioni interattive in tre percorsi: base, intermedio, avanzato.
- **Aperture e trappole**: 17 aperture famose e 12 trappole da studiare, allenare a memoria e provare in partita.
- **Analisi a fine partita**: precisione, errori, mossa migliore, grafico del vantaggio.
- Tema scuro, chiaro o automatico; scacchiere 2D e 3D; installabile come app, utilizzabile anche senza rete.

## Com'è fatto

| Parte | Tecnologia |
| --- | --- |
| App | React, TypeScript, Vite |
| Scacchiera | [Chessground](https://github.com/lichess-org/chessground) |
| Regole | [chess.js](https://github.com/jhlywa/chess.js) |
| Motore | [Stockfish](https://stockfishchess.org) compilato per il browser ([stockfish.js](https://github.com/nmrugg/stockfish.js)) |
| Server | Node.js senza framework, SQLite integrato, WebSocket |

Il server (`server/`) serve l'app, gestisce account e progressi e fa da arbitro nelle partite online. Gira in un solo contenitore Docker.

## Avvio in locale

Serve Node.js 24 o successivo.

```bash
npm install
```

```bash
npm start
```

Poi apri http://localhost:8787. Il primo account registrato diventa amministratore.

Per lavorare sull'interfaccia con ricaricamento immediato, in due terminali:

```bash
npm run server
```

```bash
npm run dev
```

## Controlli

```bash
npx tsc --noEmit && npx tsc --noEmit -p tsconfig.server.json && npm run validate && npm run test:server
```

`validate` verifica che ogni mossa di lezioni, aperture e trappole sia legale; `test:server` prova account, permessi, arbitro e orologio su un server temporaneo.

## Pubblicazione

Vedi [DEPLOY.md](DEPLOY.md): GitHub costruisce il contenitore a ogni modifica e la VPS lo scarica.

## Licenze e ringraziamenti

Gambetto è software libero, distribuito con licenza [GPL v3 o successiva](LICENSE): è la stessa di Chessground e Stockfish, su cui si basa.

- Pezzi 2D di Colin M.L. Burnett (GPLv2+), dal pacchetto Chessground.
- Scacchiere e pezzi 3D di James Clarke (MIT), dal repository di [Lichess](https://github.com/lichess-org/lila): vedi `src/assets/3d/LICENZA.md`.
- Caratteri Fraunces e Manrope (SIL Open Font License).
