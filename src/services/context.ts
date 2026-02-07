import fs from 'fs';
import path from 'path';
import { getConfigDir } from '../utils/platform.js';

export interface SessionContext {
  title: string;
  description: string;
}

const CONFIG_DIR = getConfigDir();
const CONTEXT_PATH = path.join(CONFIG_DIR, 'context.json');
const CONFIG_ENCODING: BufferEncoding = 'utf-8';
const JSON_INDENT = 2;

const ensureConfigDir = () => {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
};

export function loadContext(): SessionContext | null {
  if (!fs.existsSync(CONTEXT_PATH)) {
    return null;
  }

  try {
    const data = fs.readFileSync(CONTEXT_PATH, CONFIG_ENCODING);
    return JSON.parse(data) as SessionContext;
  } catch {
    return null;
  }
}

export function saveContext(context: SessionContext): void {
  ensureConfigDir();
  const data = JSON.stringify(context, null, JSON_INDENT);
  fs.writeFileSync(CONTEXT_PATH, data, CONFIG_ENCODING);
}

export function clearContext(): boolean {
  if (fs.existsSync(CONTEXT_PATH)) {
    fs.unlinkSync(CONTEXT_PATH);
    return true;
  }
  return false;
}
