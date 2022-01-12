import fs from "fs";

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

import {
  findFilesToProcess,
  findTranslationChunks,
  textToSpeech,
  createVideo,
  createAudioTrack,
  getOutputVideoFilename,
  getOutputAudioFilename,
  srtParserLineToTranslationChunk,
  correctSubtitlesShift,
} from "./convert";

const cliInterface = yargs(hideBin(process.argv), "")
  .usage("Usage: pnpm run start -- [options]")
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
  const filesToProcess = await findFilesToProcess(argv.input as string);
  for (const file of filesToProcess) {
    await correctSubtitlesShift(
      argv.input as string,
      argv.output as string,
      file
    );
  }
  for (const file of filesToProcess) {
    const outputVideoFile = getOutputVideoFilename(
      argv.input as string,
      argv.output as string,
      file
    );
    const outputAudioFile = getOutputAudioFilename(
      argv.input as string,
      argv.output as string,
      file
    );
    if (fs.existsSync(outputVideoFile)) {
      console.log(
        "Will skip file as it exists in the output folder",
        outputVideoFile
      );
    } else {
      if (fs.existsSync(outputAudioFile)) {
        console.log(
          "Will skip creating audio as it exists in the output folder",
          outputAudioFile
        );
      } else {
        const chunks = findTranslationChunks(file);
        for (const chunk of chunks) {
          await textToSpeech(
            chunk,
            file,
            argv.input as string,
            argv.output as string
          );
        }
        await createAudioTrack(
          chunks,
          file,
          argv.input as string,
          argv.output as string
        );
      }
      await createVideo(argv.input as string, argv.output as string, file);
    }
  }
})();
