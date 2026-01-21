import StreamingOutput from '../lib/streamer.js';
import type GitRepository from '../services/git.js';
import type LLMOrchestrator from '../services/llms.js';

export async function handlePrCommand(
  args: string[],
  repo: GitRepository,
  provider: LLMOrchestrator
): Promise<void> {
  const [subcommand, ...subArgs] = args;

  const streamer = new StreamingOutput(null);

  let context: string | undefined;

  if (subcommand?.toLowerCase() === "diff") {
    const branches = subArgs[0];
    console.log(subArgs[0], subArgs.length)

    if (!branches || !branches.includes('..')) {
      streamer.showError('Usage: pr diff <base>..<compare>');
      return;
    }

    context = repo.diff([], { revisionRange: subArgs[0], compact: true })
  } else if (!subcommand){
    context = repo.diff([], { upstream: true, compact: true })
  } else {
    console.log("command not reconized")
  }

  await handlePrMessageGeneration(provider, context)
}

async function handlePrMessageGeneration(
  provider: LLMOrchestrator,
  context: string | undefined
): Promise<void> {
  const message = await provider.generatePrMessage(context)

  console.log("final message: ", message)
}
