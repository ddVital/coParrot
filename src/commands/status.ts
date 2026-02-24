import i18n from '../services/i18n.js';
import type GitRepository from '../services/git.js';
import type StreamingOutput from '../lib/streamer.js';

export function gitStatus(repo: GitRepository, streamer: StreamingOutput): void {
  const changes = repo.getDetailedStatus();
  if (changes.length === 0) {
    streamer.showNothing(i18n.t('git.status.clean'));
  } else {
    streamer.showGitInfo(changes);
  }
}
