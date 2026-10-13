"""Seleziona i problemi tattici dall'archivio pubblico di Lichess (licenza CC0) e scrive src/data/puzzles.json.

    python3 scripts/puzzles.py percorso/lichess_db_puzzle.csv

L'archivio si scarica da https://database.lichess.org/#puzzles (file .csv.zst, da decomprimere con zstd).
Si tengono problemi molto giocati e ben valutati, distribuiti in modo uniforme per difficoltà.
"""
import csv
import json
import os
import random
import sys

SOURCE = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src', 'data', 'puzzles.json')

PER_BUCKET = 32          # problemi per ogni fascia di 100 punti
LOW, HIGH = 500, 2500    # fasce di difficoltà coperte
# Temi mostrati nell'app (gli altri vengono scartati dall'elenco, non il problema).
THEMES = {
    'fork', 'pin', 'skewer', 'discoveredAttack', 'doubleCheck', 'sacrifice', 'deflection', 'attraction', 'clearance',
    'interference', 'intermezzo', 'quietMove', 'xRayAttack', 'zugzwang', 'trappedPiece', 'hangingPiece', 'capturingDefender',
    'backRankMate', 'smotheredMate', 'mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'promotion', 'underPromotion', 'enPassant',
    'castling', 'exposedKing', 'kingsideAttack', 'queensideAttack', 'advancedPawn', 'endgame', 'middlegame', 'opening',
    'rookEndgame', 'pawnEndgame', 'queenEndgame', 'bishopEndgame', 'knightEndgame', 'defensiveMove',
}

random.seed(64)
buckets = {}
with open(SOURCE, newline='', encoding='utf-8') as f:
    for row in csv.DictReader(f):
        try:
            rating, deviation, popularity, plays = int(row['Rating']), int(row['RatingDeviation']), int(row['Popularity']), int(row['NbPlays'])
        except (ValueError, TypeError):
            continue
        moves = row['Moves'].split()
        # Problemi affidabili (molto giocati, valutazione stabile, graditi) e non troppo lunghi.
        # I problemi più facili sono giocati meno spesso: per loro la soglia è più bassa.
        enough = plays >= 3000 and popularity >= 92 if rating >= 1000 else plays >= 250 and popularity >= 85
        if not (LOW <= rating < HIGH and deviation <= 90 and enough and 2 <= len(moves) <= 8 and len(moves) % 2 == 0):
            continue
        themes = [t for t in row['Themes'].split() if t in THEMES]
        buckets.setdefault(rating // 100, []).append([row['PuzzleId'], row['FEN'], row['Moves'], rating, ' '.join(themes)])

chosen = []
for key in sorted(buckets):
    pool = buckets[key]
    random.shuffle(pool)
    chosen += pool[:PER_BUCKET]
    print(f'{key * 100}-{key * 100 + 99}: {min(len(pool), PER_BUCKET)} su {len(pool)}')
chosen.sort(key=lambda p: p[3])

with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    # Formato compatto: [id, posizione, mosse, difficoltà, temi]. La prima mossa è dell'avversario.
    f.write('[\n' + ',\n'.join(json.dumps(p, ensure_ascii=False, separators=(',', ':')) for p in chosen) + '\n]\n')
print(f'{len(chosen)} problemi scritti in {OUT} ({os.path.getsize(OUT) // 1024} KB)')
