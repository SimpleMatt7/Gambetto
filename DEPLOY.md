# Pubblicare Gambetto su un proprio server

Gambetto gira in un solo contenitore Docker. Serve un server Linux (va bene anche piccolo, x86 o ARM64) con Docker, un dominio e un reverse proxy che aggiunga HTTPS (nginx, Caddy, Traefik o il pannello di gestione del server).

Come funziona, una volta impostato:

1. modifichi il codice e lo mandi su GitHub (`git push`);
2. GitHub controlla che tutto funzioni e costruisce il contenitore;
3. il server scarica il contenitore nuovo e lo avvia al posto del vecchio.

Il database (account, progressi, partite) sta in un volume Docker sul server e non viene toccato dagli aggiornamenti.

Negli esempi il sito è `scacchi.example.com` e il repository è `UTENTE/gambetto`: sostituiscili con i tuoi.

---

## 1. GitHub

Fai un fork di questo repository, oppure caricalo in uno tuo. A ogni `git push` sul ramo `main` il flusso **Gambetto** (scheda *Actions*) esegue controlli e test, poi costruisce il contenitore e lo pubblica come `ghcr.io/UTENTE/gambetto:latest`.

Il contenitore viene costruito per ARM64. Se il tuo server è x86, in `.github/workflows/ci.yml` sostituisci `runs-on: ubuntu-24.04-arm` con `runs-on: ubuntu-latest` nel passo *Contenitore*.

Se il repository è pubblico, il server scarica il contenitore senza password. Se il download venisse rifiutato, controlla che il pacchetto sia pubblico: profilo GitHub → **Packages → gambetto → Package settings**.

## 2. Server

Servono solo due file: `docker-compose.yml` e `.env`. I comandi vanno eseguiti come `root` (o con un utente che possa usare Docker).

```bash
mkdir -p /opt/gambetto && cd /opt/gambetto
```

```bash
curl -fsSLO https://raw.githubusercontent.com/UTENTE/gambetto/main/docker-compose.yml
```

```bash
curl -fsSL https://raw.githubusercontent.com/UTENTE/gambetto/main/.env.example -o .env
```

Apri `.env` e controlla che `GAMBETTO_IMAGE` punti al tuo contenitore (nome utente **in minuscolo**). Le altre voci:

| Voce            | Significato                                                        |
| --------------- | ------------------------------------------------------------------ |
| `COOKIE_SECURE` | `1` sul sito pubblico: il cookie di sessione viaggia solo in HTTPS |
| `GAMBETTO_PORT` | porta locale su cui risponde il contenitore (predefinita `8787`)   |

Primo avvio:

```bash
cd /opt/gambetto && docker compose pull && docker compose up -d --no-build
```

Verifica:

```bash
curl http://127.0.0.1:8787/api/me
```

Deve restituire qualcosa come `{"user":null,"config":{...}}`. Il contenitore ascolta solo sulla macchina stessa: dall'esterno ci si arriva dal reverse proxy.

## 3. Dominio, HTTPS e reverse proxy

1. Crea un record DNS **A** che punti il tuo dominio all'indirizzo del server, e apri le porte 80 e 443.
2. Configura il reverse proxy con un certificato HTTPS (per esempio Let's Encrypt) e inoltra tutto a `http://127.0.0.1:8787`.

Con nginx, il blocco essenziale è questo. Le prime tre righe dopo `proxy_pass` servono alle partite online (WebSocket), le altre a far arrivare al server il dominio e l'indirizzo vero dei visitatori:

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
}
```

`Host` deve restare quello richiesto dal visitatore: il server lo usa per rifiutare le richieste provenienti da altri siti.

### Subito dopo

1. Crea l'account amministratore direttamente sul server, prima di far conoscere l'indirizzo. Il comando chiede la password due volte, senza mostrarla:

   ```bash
   cd /opt/gambetto && docker compose exec gambetto node server/cli.ts crea-admin NOME_UTENTE
   ```

   In alternativa, il primo account che si registra dal sito diventa amministratore.
2. Accedi dal sito e, dalla pagina del tuo account, apri il **Pannello admin → Impostazioni**: puoi indicare un contatto per la pagina Privacy e, quando chi deve iscriversi si è iscritto, chiudere le registrazioni.
3. Prova una partita online: se compare "Connessione persa", al proxy mancano le righe `Upgrade` e `Connection`.

## 4. Aggiornamento automatico (facoltativo)

Senza questa parte, dopo ogni `git push` aggiorni il server a mano (vedi *Manutenzione*).

Ci sono due modi. Il primo è il più semplice e non richiede né chiavi né porte aperte.

### Modo consigliato: il server controlla da solo

Un'operazione pianificata sul server, ogni cinque minuti, chiede a GitHub se c'è un contenitore più recente e in quel caso lo avvia. Se non c'è nulla di nuovo non succede niente: il sito non viene riavviato.

Il comando da pianificare (con cron, oppure dal pannello di gestione del server), eseguito come `root`:

```bash
cd /opt/gambetto && docker compose pull -q && docker compose up -d --no-build && docker image prune -f > /dev/null
```

Con cron, la riga corrispondente è:

```
*/5 * * * * cd /opt/gambetto && docker compose pull -q && docker compose up -d --no-build && docker image prune -f > /dev/null 2>&1
```

Dopo un `git push` il sito si aggiorna da solo entro pochi minuti dalla fine della pipeline.

### In alternativa: GitHub si collega al server in SSH

Aggiorna subito, senza attese, ma richiede una chiave SSH salvata tra i segreti di GitHub e la porta SSH raggiungibile da Internet.

Sul server, crea una chiave dedicata:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/gambetto_deploy -N "" -C "github-gambetto"
```

Poi autorizzala, ma solo per l'aggiornamento: con questa riga la chiave non apre un terminale, può soltanto scaricare e riavviare il contenitore.

```bash
echo "command=\"cd /opt/gambetto && docker compose pull && docker compose up -d --no-build && docker image prune -f\",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty $(cat ~/.ssh/gambetto_deploy.pub)" >> ~/.ssh/authorized_keys
```

```bash
cat ~/.ssh/gambetto_deploy
```

L'ultimo comando mostra la chiave **privata**: va copiata per intero, righe `BEGIN` e `END` comprese, e incollata solo nel segreto qui sotto.

Nel repository: **Settings → Secrets and variables → Actions**.

| Tipo     | Nome             | Valore                                    |
| -------- | ---------------- | ----------------------------------------- |
| Secret   | `VPS_HOST`       | indirizzo o nome del server               |
| Secret   | `VPS_USER`       | utente con cui hai creato la chiave       |
| Secret   | `VPS_SSH_KEY`    | la chiave privata                         |
| Secret   | `VPS_PORT`       | solo se la porta SSH non è la 22          |
| Variable | `DEPLOY_ENABLED` | `true`                                    |
| Variable | `DEPLOY_PATH`    | solo se la cartella non è `/opt/gambetto` |

L'utente deve poter usare Docker, e la porta SSH del server deve essere raggiungibile da Internet.

## Manutenzione

**Aggiornare** a mano, dopo che la pipeline ha finito:

```bash
cd /opt/gambetto && docker compose pull && docker compose up -d --no-build
```

**Tornare a una versione precedente**: nel file `.env` sostituisci `:latest` con `:` seguito dal codice del commit voluto, poi ripeti il comando di aggiornamento.

**Backup** del database, adatto a un'operazione pianificata notturna eseguita come root:

```bash
cd /opt/gambetto && mkdir -p backup && docker compose exec -T gambetto node --disable-warning=ExperimentalWarning -e "const {DatabaseSync}=require('node:sqlite');require('node:fs').rmSync('/data/backup.db',{force:true});new DatabaseSync('/data/gambetto.db').exec(\"VACUUM INTO '/data/backup.db'\")" 2>&1 && docker compose cp gambetto:/data/backup.db backup/gambetto-$(date +%F).db 2>&1 && gzip -f backup/gambetto-$(date +%F).db && find backup -name 'gambetto-*.db.gz' -mtime +14 -delete && ls -lh backup | tail -n 3
```

Il comando salva una copia compressa in `/opt/gambetto/backup` e cancella quelle più vecchie di 14 giorni. Il sito resta acceso mentre gira.

**Ripristino** di una copia (sostituisci la data; tutto ciò che è successo dopo quella copia va perso):

```bash
cd /opt/gambetto && gunzip -kf backup/gambetto-2026-01-31.db.gz && docker compose stop && docker compose cp backup/gambetto-2026-01-31.db gambetto:/data/gambetto.db && docker compose run --rm --no-deps -u root --entrypoint sh gambetto -c "chown node:node /data/gambetto.db && rm -f /data/gambetto.db-wal /data/gambetto.db-shm" && docker compose up -d --no-build
```

Le copie stanno sullo stesso server del sito: ogni tanto scaricane una altrove.

**Log**:

```bash
cd /opt/gambetto && docker compose logs -f --tail 100
```

**Se resti chiuso fuori** dal pannello admin:

```bash
cd /opt/gambetto && docker compose exec gambetto node server/cli.ts list
```

```bash
cd /opt/gambetto && docker compose exec gambetto node server/cli.ts passwd NOME_UTENTE
```

```bash
cd /opt/gambetto && docker compose exec gambetto node server/cli.ts admin NOME_UTENTE
```

## In locale

```bash
npm install && npm start
```

Compila l'app e avvia il server su http://localhost:8787, con il database nella cartella `data`.

Per provare lo stesso contenitore che andrà sul server:

```bash
docker compose up -d --build
```

Per provare una partita online da soli, creane una e fai entrare un avversario automatico (mosse a caso), indicando il codice che compare alla fine del link:

```bash
node scripts/dev-bot.ts CODICE_PARTITA
```

Gli stessi controlli che fa GitHub, da lanciare prima di un `git push`:

```bash
npx tsc --noEmit && npx tsc --noEmit -p tsconfig.server.json && npm run validate && npm run test:server
```
