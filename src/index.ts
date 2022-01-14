import fs from "fs";

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

import { Converter } from "./converter";
import { ttsFunctions } from "./tts-functions";

const supportedTtsLanguages = ["est"] as const;
export type SupportedLanguages = typeof supportedTtsLanguages[number];

const cliInterface = yargs(hideBin(process.argv), "")
  .usage("Usage: pnpm run start -- [options]")
  .option("input", {
    nargs: 1,
    alias: "i",
    describe: "Input folder",
    demandOption: true,
  })
  .option("output", {
    nargs: 1,
    alias: "o",
    describe: "Output folder",
    demandOption: true,
  })
  .option("language", {
    choices: supportedTtsLanguages,
    nargs: 1,
    alias: "l",
    describe: "Language to generate text-to-speech for",
    demandOption: true,
  })
  .help("h")
  .alias("h", "help")
  .epilog("Elagu Eesti");

var argv = cliInterface.parseSync();

(async () => {
  const converter = new Converter(argv.input as string, argv.output as string);
  const filesToProcess = await converter.findFilesToProcess();
  for (const file of filesToProcess) {
    await converter.correctSubtitlesShift(file);
  }
  for (const file of filesToProcess) {
    const outputVideoFile = converter.getOutputVideoFilename(file);
    const outputAudioFile = converter.getOutputAudioFilename(file);
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
        const chunks = converter.findTranslationChunks(file);
        for (const c of chunks) {
          const fileToGenerate = converter.shouldCreateAudioChunkAt(c, file);
          if (fileToGenerate !== null) {
            await ttsFunctions[argv.l as SupportedLanguages](
              fileToGenerate,
              c,
              file
            );
          }
        }
        await converter.createAudioTrack(chunks, file);
      }
      await converter.createVideo(file);
    }
  }
})();
