import StreamingOutput from '../lib/streamer.js';

export async function handlePrCommand(args, repo, provider) {
  const [subcommand, ...subArgs] = args;
  
  
  const streamer = new StreamingOutput();

  let context;

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

async function handlePrMessageGeneration(provider, context) {
  const message = await provider.generatePrMessage(context)

  console.log("final message: ", message)
}
