import fs from "fs";
import path from "path";

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

type InputVideoWithSrt = {
  videoPath: string;
  subtitlesPath: string;
};

const supportedSubtitlesExtension = ["srt"];
// TODO make this configurable?
const supportedVideoExtensions = ["mkv", "mp4"];

export const findFilesToProcess = async (
  inputFolder: string
): Promise<InputVideoWithSrt[]> => {
  const sutitleTiles: InputVideoWithSrt[] = [];
  const walker = klaw(inputFolder).on("data", item => {
    if (
      item.stats.isFile() &&
      item.path.endsWith("." + supportedSubtitlesExtension)
    ) {
      const videoPathWithoutExt = item.path.substring(0, item.path.length - 4);
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

export const findTranslationChunks = (
  file: InputVideoWithSrt
): TranslationChunk[] => {
  const content = fs.readFileSync(file.subtitlesPath, "utf-8");
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
  file: InputVideoWithSrt,
  inputFolder: string,
  outputFolder: string,
  retryCount: number = 0
): Promise<ProcessOutput | void> => {
  const request = JSON.stringify({
    text: translation.text,
    speaker: "mari",
    speed: 1,
  });
  const outputAudioFolder = getOutputFolder(
    "audio",
    inputFolder,
    outputFolder,
    file
  );

  if (!fs.existsSync(outputAudioFolder)) {
    fs.mkdirSync(outputAudioFolder, { recursive: true });
  }

  const outputFileName =
    outputAudioFolder +
    path.sep +
    translation.start.format(periodFormat) +
    "-" +
    translation.end.format(periodFormat) +
    ".wav";

  if (fs.existsSync(outputFileName)) {
    return Promise.resolve();
  }

  if (retryCount > 3) {
    throw new Error("Failed to convert text to speech, will exit");
  }

  try {
    return zx.$`curl \
      -X POST http://localhost:5000/text-to-speech/v2 \
      -H 'Content-Type: application/json' \
      -d ${request} \
      -o ${outputFileName}`;
  } catch (e) {
    console.error("Failed to convert text to speech, will retry");
    return textToSpeech(
      translation,
      file,
      inputFolder,
      outputFolder,
      retryCount + 1
    );
  }
};

export const createAudioTrack = async (
  translationChunks: TranslationChunk[],
  file: InputVideoWithSrt,
  inputFolder: string,
  outputFolder: string
): Promise<void> => {
  const outputAudioFolder = getOutputFolder(
    "audio",
    inputFolder,
    outputFolder,
    file
  );

  const audioInputs = translationChunks.flatMap(tc => {
    return [
      "-i",
      `${outputAudioFolder}${path.sep}${tc.start.format(
        periodFormat
      )}-${tc.end.format(periodFormat)}.wav`,
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
  // const command = ``;

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

  const resultAudioFile = getOutputAudioFilename(
    inputFolder,
    outputFolder,
    file
  );

  await zx.$`ffmpeg \
  -i ${file.videoPath} \
  ${audioInputs} \
  ${filterComplex} \
  -map [mixout] \
  ${resultAudioFile}`;
};

export const createVideo = async (
  inputFolder: string,
  outputFolder: string,
  file: InputVideoWithSrt
) => {
  const outputVideoFile = getOutputVideoFilename(
    inputFolder,
    outputFolder,
    file
  );
  const audioTrackFile = getOutputAudioFilename(
    inputFolder,
    outputFolder,
    file
  );
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

export function getOutputVideoFilename(
  inputFolder: string,
  outputFolder: string,
  file: InputVideoWithSrt
) {
  return (
    getOutputFolder("root", inputFolder, outputFolder, file) +
    path.sep +
    path.basename(file.videoPath)
  );
}

export function getOutputAudioFilename(
  inputFolder: string,
  outputFolder: string,
  file: InputVideoWithSrt
) {
  return (
    getOutputFolder("audio", inputFolder, outputFolder, file) +
    path.sep +
    "audio-tts.mp3"
  );
}

export function getOutputFolder(
  type: "audio" | "root",
  inputFolder: string,
  outputFolder: string,
  file: InputVideoWithSrt
) {
  const root =
    outputFolder +
    path.sep +
    path.relative(inputFolder, path.dirname(file.subtitlesPath));
  if (type === "root") {
    return root;
  }
  return (
    root +
    path.sep +
    "audio_" +
    path.basename(file.videoPath, path.extname(file.videoPath))
  );
}
