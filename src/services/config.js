
import fs from 'fs';
import os from 'os';
import path from 'path';
import { setup } from '../commands/setup.js';

const CONFIG_PATH = path.join(os.homedir(), '.config', 'coparrot', 'config.json');

export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {};
  }

  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading config file:', err.message);
    return {};
  }
}

export function saveConfig(data) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error saving config file:', err.message);
  }
}

export async function setupConfig() {
  // preferences example: { llm: "", model: "", apiKey: "", commitConvention: "", obs: "" }
  
  const preferences = await setup();

  // Optionally merge existing config
  const existingConfig = loadConfig();
  const newConfig = { ...existingConfig, ...preferences };

  saveConfig(newConfig);
  console.log('Configuration saved:', newConfig);
  return true;
}
