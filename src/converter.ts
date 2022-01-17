import fs from "fs";
import path from "path";

import zx from "zx";
import klaw from "klaw";
import { once } from "events";
import srtParser2, { Line } from "srt-parser-2";
import dayjs from "dayjs";
import dayjsDuration from "dayjs/plugin/duration";

dayjs.extend(dayjsDuration);

export type TranslationChunk = {
  text: string;
  start: plugin.Duration;
  end: plugin.Duration;
};

export type InputVideoWithSrt = {
  videoPath: string;
  subtitlesPath: string;
};

const supportedSubtitlesExtension = "srt";
// TODO make this configurable?
const supportedVideoExtensions = ["mkv", "mp4"];

export class Converter {
  private inputFolder: string;
  private outputFolder: string;

  constructor(inputFolder: string, outputFolder: string) {
    this.inputFolder = inputFolder;
    this.outputFolder = outputFolder;
  }

  public findFilesToProcess = async (): Promise<InputVideoWithSrt[]> => {
    const sutitleTiles: InputVideoWithSrt[] = [];
    const walker = klaw(this.inputFolder).on("data", item => {
      if (
        item.stats.isFile() &&
        item.path.endsWith("." + supportedSubtitlesExtension)
      ) {
        const videoPathWithoutExt = item.path.substring(
          0,
          item.path.length - 4
        );
        const subtitlesPath = item.path;
        const videoPathExtension = supportedVideoExtensions.find(ext => {
          return fs.existsSync(videoPathWithoutExt + "." + ext);
        });
        if (videoPathExtension === undefined) {
          console.error("Unable to find video file for", subtitlesPath);
        } else {
          sutitleTiles.push({
            subtitlesPath: subtitlesPath,
            videoPath: videoPathWithoutExt + "." + videoPathExtension,
          });
        }
      }
    });

    await once(walker, "end");
    return sutitleTiles;
  };

  public async correctSubtitlesShift(file: InputVideoWithSrt) {
    // TODO should store `_shifted` in TMP folder and not run this twice all!
    const outputTmpFolder = getOutputFolder(
      "tmp",
      this.inputFolder,
      this.outputFolder,
      file
    );
    if (!fs.existsSync(outputTmpFolder)) {
      fs.mkdirSync(outputTmpFolder, { recursive: true });
    }

    const originalSubtitlePath = path.join(
      outputTmpFolder,
      `original_subtitle_${baseSubtitleLang}.srt`
    );

    // TODO do not run if exists
    // TODO english
    await zx.$`ffmpeg -y -i ${file.videoPath} -map "0:m:language:eng" -map "-0:v" -map "-0:a" ${originalSubtitlePath}`;

    var parser = new srtParser2();

    const our = parser.fromSrt(fs.readFileSync(file.subtitlesPath, "utf-8"));
    const original = parser.fromSrt(
      fs.readFileSync(originalSubtitlePath, "utf-8")
    );
    const shift = calculateSubtitlesShift(
      original.map(srtParserLineToTranslationChunk),
      our.map(srtParserLineToTranslationChunk)
    );
    console.log("Found best shift is ", shift);
    if (shift === 0) {
      console.log(
        "Will not shift subtitles as they seem to be aligned good enough"
      );
    } else {
      console.log("Will shift subtitles by", shift);
      const offset = String(shift) + "ms";
      const ext = path.extname(file.subtitlesPath);
      const shiftedSrtFileName =
        file.subtitlesPath.substring(0, file.subtitlesPath.lastIndexOf(ext)) +
        "_shifted." +
        supportedSubtitlesExtension;
      await zx.$`ffmpeg -y -itsoffset ${offset} -i ${file.subtitlesPath} -c copy ${shiftedSrtFileName}`;
      await zx.$`mv ${shiftedSrtFileName} ${file.subtitlesPath}`;
    }
  }

  public getOutputVideoFilename(file: InputVideoWithSrt): string {
    return path.join(
      getOutputFolder("root", this.inputFolder, this.outputFolder, file),
      path.basename(file.videoPath)
    );
  }

  public getOutputAudioFilename(file: InputVideoWithSrt): string {
    return path.join(
      getOutputFolder("tmp", this.inputFolder, this.outputFolder, file),
      "audio-tts.mp3"
    );
  }

  public findTranslationChunks = (
    file: InputVideoWithSrt
  ): TranslationChunk[] => {
    const content = fs.readFileSync(file.subtitlesPath, "utf-8");
    var parser = new srtParser2();
    const subtitles = parser.fromSrt(content);

    return subtitles.map(srtParserLineToTranslationChunk);
  };

  /**
   *
   * @param translation
   * @param file
   * @returns
   */
  public shouldCreateAudioChunkAt = (
    translation: TranslationChunk,
    file: InputVideoWithSrt
  ): string | null => {
    const outputAudioFolder = getOutputFolder(
      "tmp",
      this.inputFolder,
      this.outputFolder,
      file
    );

    // TODO this is performed on every chunk, fix
    if (!fs.existsSync(outputAudioFolder)) {
      fs.mkdirSync(outputAudioFolder, { recursive: true });
    }

    const outputFileName = getOutputAudioChunkFilename(
      this.inputFolder,
      this.outputFolder,
      translation,
      file
    );

    if (fs.existsSync(outputFileName)) {
      return null;
    }
    return outputFileName;
  };

  public createAudioTrack = async (
    translationChunks: TranslationChunk[],
    file: InputVideoWithSrt
  ): Promise<void> => {
    const outputAudioFolder = getOutputFolder(
      "tmp",
      this.inputFolder,
      this.outputFolder,
      file
    );

    const audioInputs = translationChunks.flatMap(tc => {
      const outputAudioChunkFilename = getOutputAudioChunkFilename(
        this.inputFolder,
        this.outputFolder,
        tc,
        file
      );
      return ["-i", outputAudioChunkFilename];
    });

    let audioMappings1 = "";

    for (var i = 0; i < translationChunks.length; i++) {
      const tc = translationChunks[i];
      const nextChunkStartInMs =
        i === translationChunks.length - 1
          ? Infinity
          : translationChunks[i + 1].start.asMilliseconds();
      const outputAudioChunkFilename = getOutputAudioChunkFilename(
        this.inputFolder,
        this.outputFolder,
        tc,
        file
      );

      let speedUpSetting = await increaseSpeedSetting(
        outputAudioChunkFilename,
        nextChunkStartInMs,
        tc
      );

      audioMappings1 += `[${
        i + 1
      }]${speedUpSetting}adelay=delays=${tc.start.asMilliseconds()}:all=1[s${
        i + 1
      }];`;
    }

    const audioMappings2 = translationChunks
      .map((tc, i) => {
        return `[s${i + 1}]`;
      })
      .join("");

    // TODO customize ENG here
    const filterComplex = [
      "-filter_complex",
      "[0:m:language:eng]volume=0.4[originalEng];" +
        audioMappings1 +
        audioMappings2 +
        // TODO should also include `dropout_transition` option?
        // http://ffmpeg.org/ffmpeg-filters.html#amix
        "[originalEng]amix=normalize=false:inputs=" +
        (translationChunks.length + 1) +
        "[mixout]",
    ];

    const resultAudioFile = this.getOutputAudioFilename(file);

    const out = zx.$`ffmpeg \
    -i ${file.videoPath} \
    ${audioInputs} \
    ${filterComplex} \
    -map [mixout] \
    ${resultAudioFile}`;

    await out;
  };

  public createVideo = async (file: InputVideoWithSrt) => {
    const outputVideoFile = this.getOutputVideoFilename(file);
    const audioTrackFile = this.getOutputAudioFilename(file);
    await zx.$`
      ffmpeg \
       -i ${file.videoPath} \
       -i ${audioTrackFile} \
       -f srt -i ${file.subtitlesPath} \
       -map 1 -map 2 -map 0  \
       -metadata:s:a:0 language=est \
       -metadata:s:s:0 language=est \
       -c copy \
       ${outputVideoFile}
       `;
  };
}

const srtParserLineToTranslationChunk = (s: Line): TranslationChunk => {
  return {
    text: s.text,
    start: dayjs.duration({
      hours: parseInt(s.startTime.substring(0, 2), 10),
      minutes: parseInt(s.startTime.substring(3, 5), 10),
      seconds: parseInt(s.startTime.substring(6, 8), 10),
      milliseconds: parseInt(s.startTime.substring(9), 10),
    }),
    end: dayjs.duration({
      hours: parseInt(s.endTime.substring(0, 2), 10),
      minutes: parseInt(s.endTime.substring(3, 5), 10),
      seconds: parseInt(s.endTime.substring(6, 8), 10),
      milliseconds: parseInt(s.endTime.substring(9), 10),
    }),
  };
};

const periodFormat = "HH_mm_ss_SSS";


function findSpeedUpFactor(
  actualDuration: number,
  targetDuration: number,
  multiplier: number = 1
): string {
  if (actualDuration < targetDuration || multiplier >= 1.3) {
    return multiplier.toFixed(2);
  }
  const mlt = multiplier + 0.05;
  return findSpeedUpFactor(actualDuration / mlt, targetDuration, mlt);
}

// delay to make more gaps between sentences
const pauseDelay = 500;
/**
 * Calculates whether speeding up is required in order to fit within time constraints.
 * Target is to make it fit 500ms before next chunk starts
 */
async function increaseSpeedSetting(
  outputAudioChunkFilename: string,
  nextChunkStartInMs: number,
  translationChunk: TranslationChunk
) {
  const out =
    await zx.$`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${outputAudioChunkFilename}`;

  const inputChunkDurationInMs = Math.floor(parseFloat(out.stdout) * 1000);

  const shouldFitIn =
    nextChunkStartInMs - translationChunk.start.asMilliseconds() - pauseDelay;
  let doesFit = shouldFitIn > inputChunkDurationInMs;
  let speedUpSetting = "";

  if (!doesFit) {
    const speedUpFactor = findSpeedUpFactor(
      inputChunkDurationInMs,
      shouldFitIn
    );
    speedUpSetting = "atempo=" + speedUpFactor + ",";
  }
  return speedUpSetting;
}

function getOutputAudioChunkFilename(
  inputFolder: string,
  outputFolder: string,
  translation: TranslationChunk,
  file: InputVideoWithSrt
): string {
  const audioChunkName =
    translation.start.format(periodFormat) +
    "-" +
    translation.end.format(periodFormat) +
    ".wav";
  return path.join(
    getOutputFolder("tmp", inputFolder, outputFolder, file),
    audioChunkName
  );
}

function getOutputFolder(
  type: "tmp" | "root",
  inputFolder: string,
  outputFolder: string,
  file: InputVideoWithSrt
) {
  const root = path.join(
    outputFolder,
    path.relative(inputFolder, path.dirname(file.subtitlesPath))
  );
  if (type === "root") {
    return root;
  }
  return path.join(
    root,
    "tmp_" + path.basename(file.videoPath, path.extname(file.videoPath))
  );
}

const howManyOfNewSubtitleAreWithinOf100msOfOld = (
  originalSubtitles: TranslationChunk[],
  subtitlesToEmbed: TranslationChunk[],
  shift: number
): number => {
  const x = subtitlesToEmbed.filter(chunkToEmbed =>
    originalSubtitles.find(
      chunkOriginal =>
        chunkToEmbed.start.asMilliseconds() + shift - 50 <
          chunkOriginal.start.asMilliseconds() &&
        chunkToEmbed.start.asMilliseconds() + shift + 50 >
          chunkOriginal.start.asMilliseconds()
    )
  );
  console.log(
    "At shift",
    shift,
    "it's",
    x.length,
    "of",
    subtitlesToEmbed.length
  );
  return x.length;
};

const range = (start: number, stop: number, step: number) =>
  Array.from({ length: (stop - start) / step + 1 }, (_, i) => start + i * step);

const rangeToCheck = range(-2000, 2000, 50);

function calculateSubtitlesShift(
  originalSubtitles: TranslationChunk[],
  subtitlesToEmbed: TranslationChunk[]
): number {
  let bestHitCount = 0;
  let bestShift = 0;
  let anyMatch = false;
  rangeToCheck.forEach(shift => {
    const hitCount = howManyOfNewSubtitleAreWithinOf100msOfOld(
      originalSubtitles,
      subtitlesToEmbed,
      shift
    );
    // if it's less then 10% then probably something is wrong and we
    // just leave everything as it is
    const minimumThreshold = hitCount > subtitlesToEmbed.length * 0.1;
    if (hitCount > bestHitCount && minimumThreshold) {
      bestShift = shift;
      bestHitCount = hitCount;
      anyMatch = true;
    }
  });
  if (!anyMatch) {
    console.log('No match found, will leave subtitle shift at 0');
  }
  return bestShift;
}

// TODO customize eng here and replace all occurences of English everywhere
const baseSubtitleLang = "eng";
