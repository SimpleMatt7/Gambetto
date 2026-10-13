# Pubblicare Gambetto: GitHub → VPS (aaPanel + Docker)

Come funziona, una volta impostato:

1. modifichi il codice e lo mandi su GitHub (`git push`);
2. GitHub controlla che tutto funzioni e costruisce il contenitore Docker;
3. la VPS scarica il contenitore nuovo e lo avvia al posto del vecchio.

Il database (account, progressi, partite) sta in un volume Docker sulla VPS e non viene mai toccato dagli aggiornamenti.

Il sito è `https://scacchi.heptagram.it`, il repository è [SimpleMatt7/Gambetto](https://github.com/SimpleMatt7/Gambetto).

---

## Parte 1 — GitHub (una volta sola)

### 1.1 Il repository

Il repository pubblico esiste già: https://github.com/SimpleMatt7/Gambetto. Il codice è collegato con

```bash
git remote add origin https://github.com/SimpleMatt7/Gambetto.git
```

e ogni invio si fa con

```bash
git push
```

### 1.2 Controlla la pipeline

Nella scheda **Actions** del repository parte il flusso "Gambetto". Deve completare due passi: *Controlli e test* e *Contenitore*. Il terzo, *Aggiornamento della VPS*, resta saltato finché non lo abiliti (parte 4).

### 1.3 Rendi pubblico il contenitore

Il contenitore appena costruito nasce privato. Sul tuo profilo GitHub: **Packages → gambetto → Package settings → Change visibility → Public**. Si fa una volta sola, dopo la prima pipeline riuscita.

---

## Parte 2 — VPS (una volta sola)

### 2.1 Sottodominio

Nel pannello DNS di heptagram.it crea un record **A**:

| Nome    | Tipo | Valore                 |
| ------- | ---- | ---------------------- |
| scacchi | A    | indirizzo IP della VPS |

Su Oracle Cloud le porte **80** e **443** devono essere aperte sia nella *Security List* della rete sia nel firewall della macchina. Se sulla VPS hai già altri siti raggiungibili, è già a posto.

### 2.2 Docker

In aaPanel: **Docker** nel menu laterale → *Install*. Poi verifica dal terminale:

```bash
docker compose version
```

### 2.3 I due file che servono

Sulla VPS non serve il codice: bastano `docker-compose.yml` e un file `.env`.

```bash
mkdir -p /opt/gambetto && cd /opt/gambetto
```

```bash
curl -fsSLO https://raw.githubusercontent.com/SimpleMatt7/Gambetto/main/docker-compose.yml
```

```bash
curl -fsSL https://raw.githubusercontent.com/SimpleMatt7/Gambetto/main/.env.example -o .env
```

Il file `.env` è già pronto così com'è: punta al contenitore `ghcr.io/simplematt7/gambetto` e attiva il cookie sicuro.

### 2.4 Primo avvio

```bash
cd /opt/gambetto && docker compose pull && docker compose up -d --no-build
```

Controlla che risponda:

```bash
curl http://127.0.0.1:8787/api/me
```

Deve restituire qualcosa come `{"user":null,"config":{...}}`.

---

## Parte 3 — aaPanel: dominio, HTTPS e proxy (una volta sola)

1. **Website → Add site**: dominio `scacchi.heptagram.it`, senza database e senza PHP.
2. Apri il sito → **SSL → Let's Encrypt** → richiedi il certificato e attiva *Force HTTPS*.
3. Apri il sito → **Reverse proxy → Add reverse proxy**:
   - Target URL: `http://127.0.0.1:8787`
   - Sent domain: `$host` (è il valore predefinito: va lasciato così)

Apri la configurazione del reverse proxy e controlla che nel blocco `location` ci siano queste righe (servono alle partite online e a riconoscere l'indirizzo dei visitatori):

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_read_timeout 300s;
```

### Subito dopo

1. Apri `https://scacchi.heptagram.it` e **registrati immediatamente**: il primo account creato diventa amministratore.
2. Dalla pagina del tuo account apri il **Pannello admin → Impostazioni** e, se vuoi, metti un contatto per la pagina Privacy.
3. Quando gli amici si sono registrati, spegni **Registrazioni aperte**.
4. Prova una partita online con un amico: se compare "Connessione persa", mancano le righe `Upgrade`/`Connection` qui sopra.

---

## Parte 4 — Aggiornamento automatico (facoltativo)

Senza questa parte, dopo ogni `git push` aggiorni la VPS a mano con un comando (vedi "Aggiornare"). Con questa parte lo fa GitHub da solo.

### 4.1 Una chiave dedicata, sulla VPS

```bash
ssh-keygen -t ed25519 -f ~/.ssh/gambetto_deploy -N "" -C "github-gambetto"
```

```bash
cat ~/.ssh/gambetto_deploy.pub >> ~/.ssh/authorized_keys
```

```bash
cat ~/.ssh/gambetto_deploy
```

L'ultimo comando mostra la chiave **privata**: va copiata per intero, righe `BEGIN` e `END` comprese, e incollata solo nel segreto qui sotto. Non va scritta in chat, in email o in altri file.

### 4.2 Segreti e variabile, su GitHub

Nel repository: **Settings → Secrets and variables → Actions**.

Scheda **Secrets**:

| Nome          | Valore                                              |
| ------------- | --------------------------------------------------- |
| `VPS_HOST`    | indirizzo IP o nome della VPS                       |
| `VPS_USER`    | utente con cui hai creato la chiave (es. `root`)    |
| `VPS_SSH_KEY` | la chiave privata copiata al punto 4.1              |
| `VPS_PORT`    | solo se la porta SSH non è la 22                    |

Scheda **Variables**:

| Nome             | Valore |
| ---------------- | ------ |
| `DEPLOY_ENABLED` | `true` |
| `DEPLOY_PATH`    | solo se la cartella non è `/opt/gambetto` |

Su Oracle Cloud la porta SSH deve essere raggiungibile da Internet perché GitHub possa collegarsi.

---

## Manutenzione

**Aggiornare** a mano, dopo che la pipeline ha finito:

```bash
cd /opt/gambetto && docker compose pull && docker compose up -d --no-build
```

**Tornare a una versione precedente**: nel file `.env` sostituisci `:latest` con `:` seguito dal codice del commit che vuoi (lo vedi su GitHub), poi ripeti il comando di aggiornamento.

**Backup** del database in un file con la data di oggi:

```bash
cd /opt/gambetto && docker compose exec gambetto node -e "const {DatabaseSync}=require('node:sqlite');require('node:fs').rmSync('/data/backup.db',{force:true});new DatabaseSync('/data/gambetto.db').exec(\"VACUUM INTO '/data/backup.db'\")" && docker compose cp gambetto:/data/backup.db ./backup-$(date +%F).db
```

Per farlo ogni notte, aggiungi lo stesso comando in aaPanel → **Cron**.

**Vedere i log**:

```bash
cd /opt/gambetto && docker compose logs -f --tail 100
```

**Se resti chiuso fuori** dal pannello admin:

```bash
cd /opt/gambetto && docker compose exec gambetto node server/cli.ts list
```

```bash
cd /opt/gambetto && docker compose exec gambetto node server/cli.ts passwd NOME_UTENTE NUOVA_PASSWORD
```

```bash
cd /opt/gambetto && docker compose exec gambetto node server/cli.ts admin NOME_UTENTE
```

---

## In locale, sul tuo PC

**Con Docker, identico alla VPS.** Docker è installato dentro Ubuntu (WSL). Doppio clic su `Avvia Gambetto (Docker).bat`: costruisce il contenitore dai sorgenti, lo avvia e apre http://localhost:8787. La finestra va lasciata aperta, perché chiudendola WSL si spegne e con lui il contenitore. Per ripartire da un database vuoto:

```bash
wsl -d Ubuntu -u root -- docker compose down -v
```

**Senza Docker**, più rapido per l'uso di tutti i giorni: doppio clic su `Avvia Gambetto.bat`, oppure

```bash
npm start
```

Compila l'app e avvia il server su http://localhost:8787, con il database nella cartella `data`. I due modi usano database separati e la stessa porta: se ne tiene acceso uno alla volta.

Per provare una partita online da solo, creane una e poi fai entrare un avversario automatico (mosse a caso), mettendo il codice che vedi alla fine del link:

```bash
node scripts/dev-bot.ts CODICE_PARTITA
```

Gli stessi controlli che fa GitHub, da lanciare prima di un `git push`:

```bash
npx tsc --noEmit && npx tsc --noEmit -p tsconfig.server.json && npm run validate && npm run test:server
```
