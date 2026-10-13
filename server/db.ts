import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const dir = process.env.DATA_DIR ?? './data';
mkdirSync(dir, { recursive: true });

export const db = new DatabaseSync(`${dir}/gambetto.db`);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY,
    username   TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass       TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'user',
    disabled   INTEGER NOT NULL DEFAULT 0,
    progress   TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token   TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS games (
    id           TEXT PRIMARY KEY,
    white_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    black_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status       TEXT NOT NULL DEFAULT 'waiting',
    result       TEXT,
    reason       TEXT,
    moves        TEXT NOT NULL DEFAULT '',
    time_base    INTEGER NOT NULL DEFAULT 0,
    time_inc     INTEGER NOT NULL DEFAULT 0,
    white_ms     INTEGER NOT NULL DEFAULT 0,
    black_ms     INTEGER NOT NULL DEFAULT 0,
    last_move_at INTEGER,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS games_white ON games(white_id);
  CREATE INDEX IF NOT EXISTS games_black ON games(black_id);
`);

export interface UserRow {
  id: number;
  username: string;
  pass: string;
  role: 'user' | 'admin';
  disabled: number;
  progress: string;
  created_at: number;
  last_seen: number;
}

export interface GameRow {
  id: string;
  white_id: number | null;
  black_id: number | null;
  status: 'waiting' | 'active' | 'finished';
  result: 'white' | 'black' | 'draw' | null;
  reason: string | null;
  moves: string;
  time_base: number;
  time_inc: number;
  white_ms: number;
  black_ms: number;
  last_move_at: number | null;
  created_at: number;
  updated_at: number;
}

type Param = string | number | null;

export const one = <T>(sql: string, ...params: Param[]) => db.prepare(sql).get(...params) as T | undefined;
export const all = <T>(sql: string, ...params: Param[]) => db.prepare(sql).all(...params) as T[];
export const run = (sql: string, ...params: Param[]) => db.prepare(sql).run(...params);
