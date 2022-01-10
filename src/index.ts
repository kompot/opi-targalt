import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

import {
  findAllSubtitlesFiles,
  findTranslationChunks,
  textToSpeech,
  createVideo,
  createAudioTrack,
} from "./convert";

const cliInterface = yargs(hideBin(process.argv), "")
  .usage("Usage: pnpm run start -- <command> [options]")
  .command(
    ["make-audio", "ma"],
    "Parses all found subtitles and generates audio track from it"
  )
  .command(["make-video", "mv"], "Embeds audio track into video tracks")
  .demandCommand(1, 2, "Specify a command")
  // .example("$0 count -f foo.js", "count the lines in the given file")
  .demandOption("i")
  .alias("i", "input")
  .nargs("i", 1)
  .describe("i", "Input folder")
  .demandOption("o")
  .alias("o", "output")
  .nargs("o", 1)
  .describe("o", "Output folder")
  .help("h")
  .alias("h", "help")
  .epilog("Elagu Eesti");

var argv = cliInterface.parseSync();

(async () => {
  // await main()
  const commands = argv._;
  console.log("Doing these actions: " + commands);
  // TODO share these with config above
  if (commands.includes("ma") || commands.includes("make-audio")) {
    const subtitleFiles = await findAllSubtitlesFiles(argv.input as string);
    subtitleFiles.forEach(async subtitleFile => {
      const chunks = findTranslationChunks(subtitleFile);
      for (const chunk of chunks) {
        await textToSpeech(chunk, argv.output as string);
      }
      await createAudioTrack(chunks);
    });
  }
  if (commands.includes("mv") || commands.includes("make-video")) {
    await createVideo();
  }
})();
