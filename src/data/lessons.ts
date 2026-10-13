export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export interface Step {
  /** Testo della spiegazione. Supporta **grassetto**. */
  text: string;
  fen?: string;
  /** Mosse SAN giocate dalla posizione `fen` per arrivare a quella mostrata. */
  pre?: string;
  /** Frecce, es. 'e2e4'. */
  arrows?: string[];
  /** Case evidenziate. */
  squares?: string[];
  orientation?: 'white' | 'black';
  /** Esercizio: mosse alternate tu / avversario. Le tue possono avere alternative 'e4|d4'. */
  line?: string[];
  /** L'ultima mossa dell'esercizio accetta qualsiasi scacco matto. */
  anyMate?: boolean;
  success?: string;
  hint?: string;
  expect?: 'mate' | 'stalemate';
}

export interface Lesson {
  id: string;
  title: string;
  summary: string;
  icon: string;
  steps: Step[];
}

export interface Course {
  id: 'base' | 'intermedio' | 'avanzato';
  title: string;
  tagline: string;
  description: string;
  lessons: Lesson[];
}

const base: Lesson[] = [
  {
    id: 'scacchiera',
    title: 'La scacchiera',
    summary: 'Case, colonne, traverse e lo scopo del gioco.',
    icon: '▦',
    steps: [
      {
        text: 'Benvenuto! Gli scacchi si giocano su una scacchiera di **64 case**, 32 chiare e 32 scure. Ogni giocatore parte con 16 pezzi: il Bianco muove sempre per primo.',
      },
      {
        text: 'Le colonne verticali hanno una lettera (**a–h**), le traverse orizzontali un numero (**1–8**). Ogni casa ha un nome: questa è la casa **e4**, il cuore della scacchiera.',
        squares: ['e4'],
      },
      {
        text: 'Regola d\'oro per sistemare la scacchiera: la casa nell\'angolo in basso a destra dev\'essere **chiara**. E la Donna va sempre sulla casa del suo colore: Donna bianca su casa chiara (**d1**), Donna nera su casa scura (**d8**).',
        squares: ['h1', 'd1', 'd8'],
      },
      {
        text: 'Lo scopo del gioco è dare **scacco matto**: attaccare il Re avversario in modo che non possa più salvarsi. Il Re non viene mai catturato davvero: la partita finisce un attimo prima.',
        squares: ['e1', 'e8'],
      },
      {
        text: 'Le quattro case centrali (**d4, e4, d5, e5**) sono le più importanti: un pezzo al centro controlla più case e arriva ovunque in fretta. Ricordatelo, ci torneremo!',
        squares: ['d4', 'e4', 'd5', 'e5'],
      },
    ],
  },
  {
    id: 'pedone',
    title: 'Il Pedone',
    summary: 'Piccolo ma pieno di ambizione.',
    icon: '♟',
    steps: [
      {
        text: 'Il **Pedone** avanza di una casa alla volta, sempre in avanti e mai indietro. Solo alla sua **prima mossa** può scegliere di avanzare di due case.',
        fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',
        arrows: ['e2e3', 'e2e4'],
      },
      {
        text: 'Prova tu: spingi il Pedone di **due case**, da e2 a e4.',
        fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',
        line: ['e4'],
        hint: 'Trascina il Pedone in e4 (oppure toccalo e poi tocca la casa).',
        success: 'Perfetto! È la mossa d\'apertura più giocata della storia.',
      },
      {
        text: 'Il Pedone è l\'unico pezzo che **cattura in modo diverso da come muove**: cattura in diagonale, di una casa in avanti. Se ha un pezzo davanti, è bloccato.',
        fen: '4k3/8/8/3p1p2/4P3/8/8/4K3 w - - 0 1',
        arrows: ['e4d5', 'e4f5'],
      },
      {
        text: 'Cattura il Pedone nero in **d5**.',
        fen: '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1',
        line: ['exd5'],
        hint: 'Il Pedone cattura in diagonale: e4 prende in d5.',
        success: 'Ottimo! Hai catturato il tuo primo pezzo.',
      },
    ],
  },
  {
    id: 'torre',
    title: 'La Torre',
    summary: 'Linee rette, potenza pura.',
    icon: '♜',
    steps: [
      {
        text: 'La **Torre** si muove in linea retta: in orizzontale o in verticale, di quante case vuole, finché non incontra un altro pezzo. Non può saltare.',
        fen: '4k3/8/8/8/3R4/8/8/4K3 w - - 0 1',
        squares: ['d1', 'd2', 'd3', 'd5', 'd6', 'd7', 'd8', 'a4', 'b4', 'c4', 'e4', 'f4', 'g4', 'h4'],
      },
      {
        text: 'Cattura il Pedone in **d5** con la Torre.',
        fen: '4k3/8/8/3p4/8/8/8/3RK3 w - - 0 1',
        line: ['Rxd5'],
        hint: 'La Torre sale lungo la colonna d.',
        success: 'Bravo! La Torre ama le colonne aperte.',
      },
    ],
  },
  {
    id: 'alfiere',
    title: 'L\'Alfiere',
    summary: 'Il signore delle diagonali.',
    icon: '♝',
    steps: [
      {
        text: 'L\'**Alfiere** si muove solo in **diagonale**, di quante case vuole. Resta per sempre sulle case del colore da cui è partito: per questo ne hai due, uno "chiaro" e uno "scuro".',
        fen: '1k6/8/8/8/3B4/8/8/4K3 w - - 0 1',
        squares: ['a1', 'b2', 'c3', 'e5', 'f6', 'g7', 'h8', 'a7', 'b6', 'c5', 'e3', 'f2', 'g1'],
      },
      {
        text: 'Cattura il Pedone in **g6**.',
        fen: '1k6/8/6p1/8/8/8/2B5/4K3 w - - 0 1',
        line: ['Bxg6'],
        hint: 'Segui la diagonale c2–g6.',
        success: 'Esatto! Da lontano, in un colpo solo.',
      },
    ],
  },
  {
    id: 'donna',
    title: 'La Donna',
    summary: 'Il pezzo più forte della scacchiera.',
    icon: '♛',
    steps: [
      {
        text: 'La **Donna** unisce Torre e Alfiere: si muove in orizzontale, verticale e diagonale, di quante case vuole. È il pezzo più potente: non perderla alla leggera!',
        fen: '1k6/8/8/8/3Q4/8/8/4K3 w - - 0 1',
        arrows: ['d4d8', 'd4d1', 'd4a4', 'd4h4', 'd4a1', 'd4h8', 'd4a7', 'd4g1'],
      },
      {
        text: 'Cattura il Pedone in **h5** con la Donna.',
        fen: '1k6/8/8/7p/8/8/8/3QK3 w - - 0 1',
        line: ['Qxh5'],
        hint: 'La Donna parte da d1 e sale in diagonale fino a h5.',
        success: 'Benissimo!',
      },
    ],
  },
  {
    id: 'cavallo',
    title: 'Il Cavallo',
    summary: 'L\'unico pezzo che salta.',
    icon: '♞',
    steps: [
      {
        text: 'Il **Cavallo** muove a **"L"**: due case in una direzione e una di lato. È l\'unico pezzo che può **saltare** sopra gli altri, e ogni volta atterra su una casa di colore opposto.',
        fen: '1k6/8/8/8/4N3/8/8/4K3 w - - 0 1',
        squares: ['d6', 'f6', 'c5', 'g5', 'c3', 'g3', 'd2', 'f2'],
      },
      {
        text: 'Cattura il Pedone in **d5** con il Cavallo.',
        fen: '1k6/8/8/3p4/8/4N3/8/4K3 w - - 0 1',
        line: ['Nxd5'],
        hint: 'Da e3: due case in su, una a sinistra.',
        success: 'Salto perfetto! Al centro il Cavallo controlla fino a 8 case.',
      },
    ],
  },
  {
    id: 're',
    title: 'Il Re',
    summary: 'Lento, ma è lui la partita.',
    icon: '♚',
    steps: [
      {
        text: 'Il **Re** si muove di **una sola casa** in qualsiasi direzione. Non può mai andare su una casa attaccata da un pezzo avversario.',
        fen: '7k/8/8/8/3K4/8/8/8 w - - 0 1',
        squares: ['c3', 'd3', 'e3', 'c4', 'e4', 'c5', 'd5', 'e5'],
      },
      {
        text: 'Il Pedone nero ti sta dando scacco! Nessuno lo difende: **catturalo con il Re**.',
        fen: '7k/8/8/8/8/8/3p4/4K3 w - - 0 1',
        line: ['Kxd2'],
        hint: 'Il Re può catturare un pezzo vicino, se non è difeso.',
        success: 'Giusto! Anche il Re sa farsi rispettare.',
      },
    ],
  },
  {
    id: 'scacco-matto',
    title: 'Scacco, matto e stallo',
    summary: 'Come si vince (e come si pareggia per sbaglio).',
    icon: '♔',
    steps: [
      {
        text: 'Quando un pezzo attacca il Re avversario, è **scacco**. Chi è sotto scacco deve rimediare subito, in uno di tre modi: **spostare** il Re, **interporre** un pezzo, oppure **catturare** chi dà scacco.',
        fen: '4k3/8/8/8/8/8/8/4RK2 b - - 0 1',
        arrows: ['e1e8'],
      },
      {
        text: 'Se non c\'è nessun rimedio, è **scacco matto** e la partita finisce. Qui il Re nero è chiuso dai suoi stessi Pedoni: dai matto con la Torre!',
        fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
        line: ['Ra8'],
        expect: 'mate',
        hint: 'Porta la Torre sull\'ottava traversa.',
        success: 'Scacco matto! Questo si chiama "matto del corridoio".',
      },
      {
        text: 'Attenzione allo **stallo**: se chi deve muovere **non è sotto scacco** ma non ha nessuna mossa legale, la partita è **patta**. Qui tocca al Nero: il suo Re non è attaccato, ma non può muoversi da nessuna parte. Mezzo punto regalato!',
        fen: '7k/5Q2/8/8/8/8/8/K7 b - - 0 1',
        squares: ['g8', 'g7', 'h7'],
        expect: 'stalemate',
      },
    ],
  },
  {
    id: 'arrocco',
    title: 'L\'arrocco',
    summary: 'Metti il Re al sicuro in una mossa.',
    icon: '♖',
    steps: [
      {
        text: 'L\'**arrocco** è l\'unica mossa in cui muovi due pezzi insieme: il Re si sposta di **due case** verso una Torre, e la Torre gli salta accanto dall\'altro lato. Serve a mettere il Re al sicuro e ad attivare la Torre.',
        fen: '4k3/8/8/8/8/8/5PPP/4K2R w K - 0 1',
        arrows: ['e1g1', 'h1f1'],
      },
      {
        text: 'Puoi arroccare solo se: Re e Torre **non si sono mai mossi**, non ci sono pezzi tra loro, il Re **non è sotto scacco** e non attraversa né raggiunge case attaccate. Prova l\'**arrocco corto**: sposta il Re di due case verso destra.',
        fen: '4k3/8/8/8/8/8/5PPP/4K2R w K - 0 1',
        line: ['O-O'],
        hint: 'Trascina il Re da e1 a g1.',
        success: 'Fatto! Il Re è al riparo dietro i suoi Pedoni.',
      },
      {
        text: 'Ora l\'**arrocco lungo**, dal lato di Donna: il Re va in c1 e la Torre in d1.',
        fen: '4k3/8/8/8/8/8/PPP5/R3K3 w Q - 0 1',
        line: ['O-O-O'],
        hint: 'Trascina il Re da e1 a c1.',
        success: 'Perfetto! Regola pratica: arrocca presto, quasi sempre entro le prime 10 mosse.',
      },
    ],
  },
  {
    id: 'en-passant',
    title: 'La presa en passant',
    summary: 'La mossa che sorprende tutti i principianti.',
    icon: '⚡',
    steps: [
      {
        text: 'Regola speciale: se un Pedone avversario avanza di **due case** e si ferma accanto a un tuo Pedone, puoi catturarlo **come se fosse avanzato di una sola casa**. Si chiama presa **en passant** ("al passaggio") e va fatta **subito**, alla mossa successiva, altrimenti il diritto si perde.',
        fen: '4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1',
        pre: 'd5',
        arrows: ['e5d6'],
      },
      {
        text: 'Il Nero ha appena giocato d7–d5. Cattura **en passant**: il tuo Pedone va in d6 e quello nero sparisce.',
        fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1',
        line: ['exd6'],
        hint: 'Muovi il Pedone da e5 a d6, in diagonale.',
        success: 'Magia! Ora la conosci: usala per stupire gli amici.',
      },
    ],
  },
  {
    id: 'promozione',
    title: 'La promozione',
    summary: 'Quando un Pedone diventa Donna.',
    icon: '♕',
    steps: [
      {
        text: 'Un Pedone che raggiunge l\'**ultima traversa** viene **promosso**: si trasforma in Donna, Torre, Alfiere o Cavallo, a tua scelta. Quasi sempre si sceglie la Donna.',
        fen: '8/4P3/8/8/8/8/k7/4K3 w - - 0 1',
        arrows: ['e7e8'],
      },
      {
        text: 'Spingi il Pedone in **e8** e promuovilo a **Donna**.',
        fen: '8/4P3/8/8/8/8/k7/4K3 w - - 0 1',
        line: ['e8=Q'],
        hint: 'Avanza in e8 e scegli la Donna.',
        success: 'Una nuova Donna! Ecco perché i Pedoni avanzati valgono oro.',
      },
    ],
  },
  {
    id: 'valore',
    title: 'Il valore dei pezzi',
    summary: 'Quanto vale ogni pezzo e cosa conviene scambiare.',
    icon: '⚖',
    steps: [
      {
        text: 'Per capire se uno scambio conviene, ogni pezzo ha un valore indicativo: **Pedone 1**, **Cavallo 3**, **Alfiere 3**, **Torre 5**, **Donna 9**. Il Re non ha prezzo: perderlo significa perdere la partita.',
      },
      {
        text: 'La tua Torre può catturare due pezzi diversi. Qual è la cattura migliore?',
        fen: '1k6/8/4q3/8/4R1n1/8/8/4K3 w - - 0 1',
        line: ['Rxe6'],
        hint: 'Un Cavallo vale 3, una Donna vale 9...',
        success: 'Esatto: 9 punti contro 3. Prima di ogni cattura, fai il conto!',
      },
      {
        text: 'Attenzione però: i punti sono solo una guida. Conta anche la **posizione**: un Cavallo piazzato al centro può valere più di una Torre chiusa in un angolo. Hai completato il corso base: sei pronto per giocare la tua prima partita!',
        fen: START_FEN,
      },
    ],
  },
];

const intermedio: Lesson[] = [
  {
    id: 'principi-apertura',
    title: 'I principi d\'apertura',
    summary: 'Tre regole per iniziare bene ogni partita.',
    icon: '①',
    steps: [
      {
        text: 'Non serve imparare a memoria cento aperture. Bastano **tre principi**: 1) controlla il **centro**, 2) **sviluppa** i pezzi, 3) metti il **Re al sicuro**.',
      },
      {
        text: '**Primo principio: il centro.** Apri con un Pedone centrale: occupa spazio e libera Alfiere e Donna.',
        line: ['e4|d4'],
        hint: 'Spingi di due case il Pedone di Re o di Donna.',
        success: 'Ottima scelta. Chi controlla il centro, comanda la partita.',
      },
      {
        text: '**Secondo principio: lo sviluppo.** Porta fuori Cavalli e Alfieri, verso il centro, senza muovere due volte lo stesso pezzo. Qui entrambi hanno sviluppato Cavalli e Alfieri in sole tre mosse.',
        pre: 'e4 e5 Nf3 Nc6 Bc4 Bc5',
        arrows: ['g1f3', 'f1c4', 'b8c6', 'f8c5'],
      },
      {
        text: '**Terzo principio: la sicurezza del Re.** La strada è libera: arrocca!',
        pre: 'e4 e5 Nf3 Nc6 Bc4 Bc5',
        line: ['O-O'],
        hint: 'Muovi il Re di due case verso la Torre in h1.',
        success: 'Re al sicuro, Torre in gioco. In quattro mosse hai una posizione da manuale.',
      },
      {
        text: 'Errori tipici da evitare: portare fuori la **Donna troppo presto** (verrà inseguita dai pezzi avversari), muovere troppi **Pedoni laterali** e andare a caccia di Pedoni lasciando il Re al centro.',
        pre: 'e4 e5 Qh5 Nc6 Bc4 g6 Qf3 Nf6',
        arrows: ['g7g6', 'g8f6'],
      },
    ],
  },
  {
    id: 'forchetta',
    title: 'La forchetta',
    summary: 'Un pezzo, due bersagli.',
    icon: '⑂',
    steps: [
      {
        text: 'La **forchetta** (o attacco doppio) è quando un tuo pezzo ne attacca **due insieme**: l\'avversario può salvarne solo uno. Il Cavallo è il re delle forchette.',
        fen: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1',
        arrows: ['d5c7'],
        squares: ['a8', 'e8'],
      },
      {
        text: 'Trova la forchetta di Cavallo che attacca **Re e Torre**, poi incassa il premio.',
        fen: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1',
        line: ['Nc7', 'Kf7', 'Nxa8'],
        hint: 'Cerca una casa da cui il Cavallo dà scacco e intanto guarda la Torre.',
        success: 'Forchetta reale! Il Re deve scappare e la Torre è tua.',
      },
      {
        text: 'Anche l\'umile Pedone sa fare la forchetta. Attacca **Torre e Cavallo** in un colpo.',
        fen: '4k3/8/8/2r1n3/8/3P4/8/4K3 w - - 0 1',
        line: ['d4'],
        hint: 'Un Pedone attacca le due case diagonali davanti a sé.',
        success: 'Con un Pedone da 1 punto ne minacci 8. Niente male!',
      },
    ],
  },
  {
    id: 'inchiodatura',
    title: 'L\'inchiodatura',
    summary: 'Blocca un pezzo davanti a uno più prezioso.',
    icon: '📌',
    steps: [
      {
        text: 'Un pezzo è **inchiodato** quando non può muoversi senza esporre un pezzo più importante che sta dietro di lui. Se dietro c\'è il **Re**, l\'inchiodatura è assoluta: il pezzo non può proprio muoversi.',
        fen: '4k3/8/2r5/1B6/8/8/8/4K3 b - - 0 1',
        arrows: ['b5e8'],
        squares: ['c6'],
      },
      {
        text: 'Inchioda la Torre nera al suo Re con l\'Alfiere, poi catturala.',
        fen: '4k3/8/2r5/8/8/8/8/4KB2 w - - 0 1',
        line: ['Bb5', 'Kd7', 'Bxc6'],
        hint: 'Metti l\'Alfiere sulla diagonale che passa per la Torre e arriva al Re.',
        success: 'Hai scambiato un Alfiere (3) per una Torre (5): si dice "guadagnare la qualità".',
      },
    ],
  },
  {
    id: 'infilata',
    title: 'L\'infilata',
    summary: 'L\'inchiodatura al contrario.',
    icon: '➶',
    steps: [
      {
        text: 'Nell\'**infilata** attacchi il pezzo **più prezioso**, che è davanti: quando si sposta, catturi quello dietro. È come un\'inchiodatura rovesciata.',
        fen: '3q4/8/8/3k4/8/8/6K1/3R4 b - - 0 1',
        arrows: ['d1d8'],
      },
      {
        text: 'Dai scacco al Re con la Torre e vinci la Donna che sta alle sue spalle.',
        fen: '3q4/8/8/3k4/8/8/6K1/7R w - - 0 1',
        line: ['Rd1', 'Ke6', 'Rxd8'],
        hint: 'Porta la Torre sulla stessa colonna di Re e Donna.',
        success: 'Infilata riuscita! Donna catturata.',
      },
    ],
  },
  {
    id: 'scoperta',
    title: 'L\'attacco di scoperta',
    summary: 'Sposti un pezzo, ne attacca un altro.',
    icon: '✦',
    steps: [
      {
        text: 'Nell\'**attacco di scoperta** muovi un pezzo che stava "coprendo" la linea di un altro. Se il pezzo che si sposta dà anche **scacco**, l\'avversario non ha tempo di difendere il resto.',
        fen: '4k3/8/8/3q4/8/3B4/8/3RK3 w - - 0 1',
        arrows: ['d1d5'],
        squares: ['d3'],
      },
      {
        text: 'L\'Alfiere copre la Torre. Spostalo **dando scacco**: la Torre attaccherà la Donna.',
        fen: '4k3/8/8/3q4/8/3B4/8/3RK3 w - - 0 1',
        line: ['Bg6', 'Ke7', 'Rxd5'],
        hint: 'Cerca lo scacco di Alfiere da una casa che la Donna non può catturare.',
        success: 'Scoperta micidiale: il Nero ha dovuto pensare al Re e ha perso la Donna.',
      },
    ],
  },
  {
    id: 'corridoio',
    title: 'Il matto del corridoio',
    summary: 'Il matto più frequente tra i dilettanti.',
    icon: '▭',
    steps: [
      {
        text: 'Dopo l\'arrocco il Re sta dietro tre Pedoni: sicuro, ma senza via di fuga. Se una Torre o una Donna avversaria arriva sull\'ultima traversa ed è indifesa, è **matto del corridoio**.',
        fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
        arrows: ['d1d8'],
      },
      {
        text: 'Dai matto in una mossa.',
        fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
        line: ['Rd8'],
        expect: 'mate',
        hint: 'L\'ottava traversa è sguarnita.',
        success: 'Matto! Per evitarlo nelle tue partite, apri una "finestrella" al Re spingendo un Pedone (per esempio h3).',
      },
    ],
  },
  {
    id: 'matto-donna',
    title: 'Matto di Re e Donna',
    summary: 'Il finale che devi saper vincere a occhi chiusi.',
    icon: '♛',
    steps: [
      {
        text: 'Con Re e Donna contro Re solo si vince sempre. Il metodo: usa la Donna per **restringere la gabbia** attorno al Re avversario, spingendolo verso il bordo; poi avvicina il **tuo Re**; infine dai matto con la Donna protetta dal Re.',
        fen: '7k/8/5K2/8/8/8/6Q1/8 w - - 0 1',
        squares: ['g8', 'g7', 'h7'],
      },
      {
        text: 'Il Re nero è all\'angolo e il tuo Re è vicino. Dai **matto in una mossa**.',
        fen: '7k/8/5K2/8/8/8/6Q1/8 w - - 0 1',
        line: ['Qg7'],
        anyMate: true,
        expect: 'mate',
        hint: 'La Donna deve arrivare accanto al Re nero, su una casa protetta dal tuo Re.',
        success: 'Matto! Occhio però allo stallo: lascia sempre una casa al Re avversario finché non sei pronto a chiudere.',
      },
    ],
  },
  {
    id: 'scala',
    title: 'Il matto della scala',
    summary: 'Due Torri che salgono un gradino alla volta.',
    icon: '☰',
    steps: [
      {
        text: 'Con due Torri (o Torre e Donna) il matto è facilissimo: una Torre **taglia** una traversa al Re, l\'altra dà scacco su quella successiva. Un gradino alla volta, il Re viene spinto fino al bordo.',
        fen: '6k1/R7/8/8/8/8/8/1R4K1 w - - 0 1',
        arrows: ['a7h7', 'b1b8'],
      },
      {
        text: 'La Torre in a7 chiude la settima traversa. Sali l\'ultimo gradino e dai matto.',
        fen: '6k1/R7/8/8/8/8/8/1R4K1 w - - 0 1',
        line: ['Rb8'],
        expect: 'mate',
        hint: 'L\'altra Torre va sull\'ottava traversa.',
        success: 'Scala completata. Scacco matto!',
      },
    ],
  },
];

const avanzato: Lesson[] = [
  {
    id: 'opposizione',
    title: 'L\'opposizione',
    summary: 'Il segreto dei finali di Re e Pedone.',
    icon: '⇅',
    steps: [
      {
        text: 'Nei finali il Re diventa un pezzo d\'attacco. Due Re sono in **opposizione** quando si fronteggiano con una sola casa in mezzo: chi **non** deve muovere "ha l\'opposizione" e costringe l\'altro a cedere il passo.',
        fen: '4k3/8/4K3/4P3/8/8/8/8 b - - 0 1',
        squares: ['e7'],
      },
      {
        text: 'Qui spingere subito il Pedone porterebbe alla patta per stallo. La mossa vincente è prendere l\'opposizione con il **Re davanti al Pedone**. Poi accompagna il Pedone fino alla promozione.',
        fen: '4k3/8/3K4/4P3/8/8/8/8 w - - 0 1',
        line: ['Ke6', 'Kd8', 'Kf7', 'Kd7', 'e6', 'Kd8', 'e7', 'Kd7', 'e8=Q'],
        hint: 'Prima il Re, poi il Pedone: il Re deve controllare la casa di promozione.',
        success: 'Finale vinto! Regola da ricordare: Re in sesta traversa davanti al proprio Pedone = vittoria.',
      },
    ],
  },
  {
    id: 'quadrato',
    title: 'La regola del quadrato',
    summary: 'Il Re fa in tempo a fermare il Pedone?',
    icon: '◰',
    steps: [
      {
        text: 'Per sapere se un Re raggiunge un Pedone passato senza contare le mosse, disegna un **quadrato** che ha per lato il percorso del Pedone fino alla promozione. Se il Re avversario, muovendo, **entra nel quadrato**, lo ferma. Altrimenti il Pedone promuove.',
        fen: '8/8/8/7k/P7/8/8/K7 w - - 0 1',
        squares: ['a4', 'a8', 'e8', 'e4'],
      },
      {
        text: 'Tocca a te e il Re nero è fuori dal quadrato: non può più raggiungerti. Corri a promozione!',
        fen: '8/8/8/7k/P7/8/8/K7 w - - 0 1',
        line: ['a5', 'Kg6', 'a6', 'Kf7', 'a7', 'Ke7', 'a8=Q'],
        hint: 'Spingi il Pedone senza esitare, a ogni mossa.',
        success: 'Promosso! Il Re nero è arrivato con una mossa di ritardo.',
      },
    ],
  },
  {
    id: 'lucena',
    title: 'La posizione di Lucena',
    summary: 'Costruire "il ponte" nei finali di Torre.',
    icon: '⌒',
    steps: [
      {
        text: 'I finali di Torre sono i più frequenti. Nella **posizione di Lucena** il tuo Pedone è in settima, ma il tuo Re gli sta davanti e la Torre nera lo tempesta di scacchi. La soluzione, nota da oltre 500 anni, è **costruire un ponte** con la Torre.',
        fen: '3K4/3P2k1/8/8/8/8/2r5/5R2 w - - 0 1',
        arrows: ['f1f4'],
      },
      {
        text: 'Porta la Torre in **quarta traversa**, fai uscire il Re e, quando arrivano gli scacchi, avvicinati alla Torre nera finché la tua Torre potrà **interporsi**.',
        fen: '3K4/3P2k1/8/8/8/8/2r5/5R2 w - - 0 1',
        line: ['Rf4', 'Rc1', 'Ke7', 'Re1', 'Kd6', 'Rd1', 'Ke6', 'Re1', 'Kd5', 'Rd1', 'Rd4'],
        hint: 'Torre in f4, poi il Re esce dal lato opposto al Re nero e scende verso la quinta traversa. Alla fine la Torre para lo scacco.',
        success: 'Ponte costruito! Gli scacchi sono finiti e il Pedone promuove.',
      },
    ],
  },
  {
    id: 'dono-greco',
    title: 'Il dono greco',
    summary: 'Il sacrificio d\'Alfiere in h7.',
    icon: '🎁',
    steps: [
      {
        text: 'Il **dono greco** è il sacrificio d\'attacco più famoso: l\'Alfiere si immola in **h7** per strappare il Re dal suo rifugio. Servono tre ingredienti: Alfiere puntato su h7, Cavallo pronto a saltare in g5 e Donna che può arrivare in h5.',
        fen: 'rnbq1rk1/pp3ppp/4p3/2bpP3/8/2PB1N2/PP3PPP/RNBQK2R w KQ - 0 1',
        arrows: ['d3h7', 'f3g5', 'd1h5'],
      },
      {
        text: 'Esegui il sacrificio e porta i pezzi all\'attacco del Re.',
        fen: 'rnbq1rk1/pp3ppp/4p3/2bpP3/8/2PB1N2/PP3PPP/RNBQK2R w KQ - 0 1',
        line: ['Bxh7', 'Kxh7', 'Ng5', 'Kg8', 'Qh5'],
        hint: 'Alfiere prende h7 con scacco, poi scacco di Cavallo in g5, poi la Donna entra in h5.',
        success: 'Attacco decisivo: minacci matto in h7. Se il Nero libera f8 con la Torre, segue Dxf7+ e la caccia al Re continua fino al matto.',
      },
    ],
  },
  {
    id: 'matto-affogato',
    title: 'Il matto affogato',
    summary: 'Il Cavallo dà matto a un Re soffocato dai suoi pezzi.',
    icon: '♘',
    steps: [
      {
        text: 'Nel **matto affogato** il Re è circondato dai propri pezzi e un Cavallo gli dà scacco: non potendo né scappare né interporre, è matto. La combinazione più bella per arrivarci è l\'"**eredità di Philidor**", con un **sacrificio di Donna**.',
        fen: '2r4k/6pp/8/4N3/8/1Q6/8/6K1 w - - 0 1',
        arrows: ['e5f7', 'b3g8'],
      },
      {
        text: 'Scacco di Cavallo, **scacco doppio**, sacrificio di Donna e matto. Riesci a trovare tutta la sequenza?',
        fen: '2r4k/6pp/8/4N3/8/1Q6/8/6K1 w - - 0 1',
        line: ['Nf7', 'Kg8', 'Nh6', 'Kh8', 'Qg8', 'Rxg8', 'Nf7'],
        expect: 'mate',
        hint: 'Cf7+, poi Ch6++ (scacco doppio di Cavallo e Donna), poi la Donna si sacrifica in g8 e il Cavallo torna in f7.',
        success: 'Capolavoro! La Torre ha dovuto catturare la Donna e ha murato vivo il suo Re.',
      },
    ],
  },
  {
    id: 'struttura-pedonale',
    title: 'La struttura pedonale',
    summary: 'I Pedoni sono l\'anima degli scacchi.',
    icon: '⛰',
    steps: [
      {
        text: '"I Pedoni sono l\'anima degli scacchi" diceva Philidor. Non possono tornare indietro: ogni spinta cambia la posizione per sempre. Impara a riconoscere le **debolezze** nella struttura.',
        fen: '4k3/pp3ppp/8/3p4/8/2P2P2/PP3P1P/4K3 w - - 0 1',
      },
      {
        text: 'Un Pedone **isolato** non ha Pedoni amici sulle colonne vicine: nessuno può difenderlo, quindi devono pensarci i pezzi. La casa davanti a lui è un avamposto perfetto per un Cavallo avversario.',
        fen: '4k3/pp3ppp/8/3p4/8/2P2P2/PP3P1P/4K3 w - - 0 1',
        squares: ['d5', 'd4'],
      },
      {
        text: 'I Pedoni **doppiati** stanno sulla stessa colonna: si intralciano e non si difendono a vicenda. Non sempre sono un male (aprono colonne per le Torri), ma nel finale pesano.',
        fen: '4k3/pp3ppp/8/3p4/8/2P2P2/PP3P1P/4K3 w - - 0 1',
        squares: ['f2', 'f3'],
      },
      {
        text: 'Un Pedone **passato** non ha Pedoni avversari davanti a sé né sulle colonne vicine: nessun Pedone potrà fermarlo. "Il Pedone passato è un criminale: va tenuto sotto chiave", diceva Nimzowitsch. Se è tuo, spingilo; se è dell\'avversario, **bloccalo**.',
        fen: '4k3/5ppp/8/3P4/8/8/5PPP/4K3 w - - 0 1',
        arrows: ['d5d8'],
      },
    ],
  },
];

export const COURSES: Course[] = [
  {
    id: 'base',
    title: 'Base',
    tagline: 'Da zero alla prima partita',
    description: 'Le regole, i movimenti dei pezzi e le mosse speciali. Non serve sapere nulla.',
    lessons: base,
  },
  {
    id: 'intermedio',
    title: 'Intermedio',
    tagline: 'Tattica e matti fondamentali',
    description: 'Forchette, inchiodature, scoperte e i matti che decidono le partite.',
    lessons: intermedio,
  },
  {
    id: 'avanzato',
    title: 'Avanzato',
    tagline: 'Finali e combinazioni',
    description: 'Opposizione, finali di Torre, sacrifici celebri e strategia dei Pedoni.',
    lessons: avanzato,
  },
];
