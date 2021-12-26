import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

import zx from 'zx';

var argv = yargs(hideBin(process.argv))
  .usage("Usage: pnpm run start <command> [options]")
  .command("count", "Count the lines in a file")
  .example("$0 count -f foo.js", "count the lines in the given file")
  .alias("f", "file")
  .nargs("f", 1)
  .describe("f", "Load a file")
  .help("h")
  .alias("h", "help")
  .epilog("Elagu Eesti")
  .parseSync();

console.log("----argv.file", argv.f);

export const main = async () => {
  const b = await zx.$`
    ffmpeg \
     -i ./input/FamousTvSeries.S01E02/00:00:03,069-00:00:07,698.mp3 \
     -i ./input/FamousTvSeries.S01E02/00:00:07,865-00:00:11,327.mp3 \
     -i ./input/FamousTvSeries.S01E02.mkv \
     -filter_complex " \
        [0]adelay=3069|3069[s0]; \
        [1]adelay=7865|7865[s1]; \
        [2:m:language:eng]volume=0.2[originalEng]; \
        [s0][s1][originalEng]amix=3[mixout] \
     " \
     -map 2:v -map [mixout] -c:v copy result.mkv
     `
  console.log('------1', b)
};
