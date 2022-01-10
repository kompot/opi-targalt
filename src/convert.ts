import fs from "fs";

import zx, { ProcessOutput } from "zx";
import klaw from "klaw";
import { once } from "events";
import srtParser2 from "srt-parser-2";
import dayjs from "dayjs";
import dayjsDuration from "dayjs/plugin/duration";

dayjs.extend(dayjsDuration);

type TranslationChunk = {
  text: string;
  start: plugin.Duration;
  end: plugin.Duration;
};

export const findAllSubtitlesFiles = async (
  inputFolder: string
): Promise<string[]> => {
  const sutitleTiles: string[] = [];
  const walker = klaw(inputFolder).on("data", item => {
    if (item.stats.isFile() && item.path.endsWith(".srt")) {
      sutitleTiles.push(item.path);
    }
  });

  await once(walker, "end");
  return sutitleTiles;
};

export const findTranslationChunks = (fileName: string): TranslationChunk[] => {
  const content = fs.readFileSync(fileName, "utf-8");
  var parser = new srtParser2();
  const subtitles = parser.fromSrt(content);

  return subtitles.map(s => {
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
  });
};

const periodFormat = "HH_mm_ss_SSS";

export const textToSpeech = (
  translation: TranslationChunk,
  outputFolder: string
): Promise<ProcessOutput | void> => {
  const request = JSON.stringify({
    text: translation.text,
    speaker: "mari",
    speed: 0.8,
  });
  const outputFileName =
    outputFolder +
    "/" +
    translation.start.format(periodFormat) +
    "-" +
    translation.end.format(periodFormat) +
    ".wav";
  if (fs.existsSync(outputFileName)) {
    return Promise.resolve();
  }

  return zx.$`curl \
    -X POST http://localhost:5000/text-to-speech/v2 \
    -H 'Content-Type: application/json' \
    -d ${request} \
    -o ${outputFileName}`;
};

export const createAudioTrack = async (
  translationChunks: TranslationChunk[]
): Promise<string> => {
  const audioInputs = translationChunks.flatMap(tc => {
    return [
      "-i",
      `./output/${tc.start.format(periodFormat)}-${tc.end.format(
        periodFormat
      )}.wav`,
    ];
  });

  // TODO speed up audio track so that it fits 500ms before start of the
  // next chunks
  // ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ./output/00_00_03_069-00_00_07_698.wav
  const audioMappings1 = translationChunks
    .map((tc, i) => {
      return `[${i + 1}]adelay=delays=${tc.start.asMilliseconds()}:all=1[s${
        i + 1
      }];`;
    })
    .join("");

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

  const resultFile = './output/result7.mp3';

  await zx.$`ffmpeg \
  -i ./input/FamousTvSeries.S01E02.mkv \
  ${audioInputs} \
  ${filterComplex} \
  -map [mixout] \
  ${resultFile}`;
  return resultFile;
};

export const createVideo = async () => {
  await zx.$`
    ffmpeg \
     -i ./input/FamousTvSeries.S01E02.mkv \
     -i ./output/result7.mp3 \
     -f srt -i ./input/FamousTvSeries.S01E02.srt \
     -map 1 -map 2 -map 0  \
     -metadata:s:a:0 language=est \
     -metadata:s:s:0 language=est \
     -c copy \
     ./output/result.mkv
     `;
};
