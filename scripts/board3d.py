"""Scacchiere e pezzi 3D: scarica da Lichess le immagini mancanti e rigenera src/board3d.css.

    python scripts/board3d.py

Si può rilanciare quante volte si vuole: scarica solo ciò che manca. Per aggiungere uno stile basta una riga
in BOARDS o SETS qui sotto, più la voce corrispondente negli elenchi di src/App.tsx e nei tipi di src/lib/store.ts.
Le immagini sono di James Clarke, licenza MIT (vedi src/assets/3d/LICENZA.md).
"""
import io
import os
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://raw.githubusercontent.com/lichess-org/lila/master/public/images/staunton'
OUT = ROOT + '/src/assets/3d'

# nome usato nell'app → file su Lichess
BOARDS = {
    'legno-chiaro': 'Light-Wood',
    'palissandro': 'Rosewood',
    'legno-scuro': 'Woodi',
    'legno-vetro': 'Wood-Glass',
    'giada': 'Jade',
    'marmo': 'Marble',
    'vetro-verde': 'Green-Glass',
    'vetro': 'Glass',
    'blu': 'Classic-Blue',
    'blu-lucido': 'China-Blue',
    'verde-lucido': 'China-Green',
    'grigio-lucido': 'China-Grey',
    'scarlatto': 'China-Scarlet',
    'giallo': 'China-Yellow',
    'viola': 'Purple-Black',
    'cera': 'Wax',
    'oro-argento': 'Gold-Silver',
    'alluminio': 'Brushed-Aluminium',
    'bianco-nero': 'Black-White-Aluminium',
    'verniciato': 'Power-Coated',
}

# nome usato nell'app → (cartella su Lichess, ha le varianti specchiate di Alfiere e Cavallo)
SETS = {
    'classico': ('Staunton', False),
    'legno-chiaro': ('Wood', True),
    'legno': ('ModernWood', True),
    'metallo': ('Metal', True),
    'vetro': ('Glass', True),
    'giada': ('ModernJade', True),
    'essenziale': ('Basic', True),
    'rifinito': ('Trimmed', True),
    'rossoblu': ('RedVBlue', True),
    'sperimentale': ('Experimental', True),
}
TYPES = ['Pawn', 'Bishop', 'Knight', 'Rook', 'Queen', 'King']


def fetch(path):
    dest = f'{OUT}/{path}'
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if not os.path.exists(dest):
        with urllib.request.urlopen(f'{BASE}/{path}', timeout=60) as r, open(dest, 'wb') as f:
            f.write(r.read())
    return os.path.getsize(dest)


total = 0
for name in BOARDS.values():
    total += fetch(f'board/{name}.webp') + fetch(f'board/{name}.thumbnail.webp')
for folder, flips in SETS.values():
    for color in ('White', 'Black'):
        for kind in TYPES:
            total += fetch(f'piece/{folder}/{color}-{kind}.webp')
            if flips and kind in ('Bishop', 'Knight'):
                total += fetch(f'piece/{folder}/{color}-{kind}-Flipped.webp')
print(f'{len(BOARDS)} scacchiere e {len(SETS)} stili di pezzi: {total / 1024 / 1024:.1f} MB')

css = ["""/* Scacchiera 3D: generato da scripts/board3d.py, a partire dalle misure usate da Lichess. Non modificare a mano.
   La scacchiera è un'immagine in prospettiva; i pezzi sono figure più alte delle case, che si sovrappongono
   a quelle dietro. La griglia resta regolare, quindi mosse, frecce ed evidenziazioni funzionano come in 2D. */

.board-frame.is3d {
  padding: 0;
  border-radius: 0;
  background: none;
  box-shadow: none;
}

/* La griglia 3D è più bassa che larga; in alto serve spazio per i pezzi dell'ultima traversa, che sporgono. */
.board-frame.is3d .board-square {
  aspect-ratio: 512 / 464.5;
  margin-top: 8.5%;
  overflow: visible;
  border-radius: 0;
  box-shadow: none;
}

.is3d cg-board {
  background: none;
}

.is3d cg-board::before {
  content: '';
  position: absolute;
  left: 0;
  top: -0.7307%;
  width: 100%;
  height: 103.2%;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  filter: drop-shadow(0 26px 30px rgb(0 0 0 / calc(0.55 * var(--shadow-k))));
  pointer-events: none;
}

.is3d .board-host piece {
  width: 16.741%;
  height: 23.563%;
  left: -1.85%;
  top: -9.1%;
  filter: none;
}

.is3d cg-board piece.dragging {
  filter: drop-shadow(0 12px 10px rgb(0 0 0 / 0.35));
}

.is3d .board-host coords coord {
  color: rgb(255 255 255 / 0.85) !important;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.8);
}

.is3d cg-board square.last-move {
  background-color: rgba(246, 205, 96, 0.5);
}

/* Miniature per le scelte nelle impostazioni. */
.swatch i.thumb3d {
  background-color: rgb(var(--tint) / 0.08);
  background-size: 92% auto;
  background-repeat: no-repeat;
  background-position: center 40%;
}

.swatch i.thumb-board3d {
  background-size: cover;
  background-position: center;
}
"""]
for key, name in BOARDS.items():
    css.append(f".is3d.b3d-{key} cg-board::before {{\n  background-image: url('./assets/3d/board/{name}.webp');\n}}\n")
    css.append(f".thumb-board3d.b3d-{key} {{\n  background-image: url('./assets/3d/board/{name}.thumbnail.webp');\n}}\n")
for key, (folder, flips) in SETS.items():
    for color in ('White', 'Black'):
        for kind in TYPES:
            css.append(f".is3d.set-{key} .board-host piece.{kind.lower()}.{color.lower()} {{\n  background-image: url('./assets/3d/piece/{folder}/{color}-{kind}.webp');\n}}\n")
    if flips:
        # Alfieri e Cavalli hanno una variante specchiata, così guardano sempre dal lato giusto.
        for color, orientation in (('White', 'black'), ('Black', 'white')):
            for kind in ('Bishop', 'Knight'):
                css.append(f".is3d.set-{key} .board-host.orientation-{orientation} piece.{kind.lower()}.{color.lower()} {{\n  background-image: url('./assets/3d/piece/{folder}/{color}-{kind}-Flipped.webp');\n}}\n")
    css.append(f".thumb3d.set-{key} {{\n  background-image: url('./assets/3d/piece/{folder}/White-Knight.webp');\n}}\n")

io.open(ROOT + '/src/board3d.css', 'w', encoding='utf-8', newline='\n').write('\n'.join(css))
print('src/board3d.css rigenerato')
