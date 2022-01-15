import zx from "zx";

import { InputVideoWithSrt, TranslationChunk } from "../converter";

const cleanTagsRegex = /(<([^>]+)>)/gi;

// TODO should make this universal for other speech generators?
function normalizeText(input: string): string {
  return input.replace(cleanTagsRegex, "");
}

export const textToSpeech = async (
  outputFileName: string,
  translation: TranslationChunk,
  file: InputVideoWithSrt,
  retryCount: number = 0
): Promise<void> => {
  if (retryCount > 3) {
    throw new Error("Failed to convert text to speech, will exit");
  }

  const request = JSON.stringify({
    text: normalizeText(translation.text),
    speaker: "mari",
    speed: 0.8,
  });

  try {
    await zx.$`curl \
        --fail \
        -X POST http://localhost:5000/text-to-speech/v2 \
        -H 'Content-Type: application/json' \
        -d ${request} \
        -o ${outputFileName}`;
  } catch (e) {
    console.error("Failed to convert text to speech, will retry");
    return textToSpeech(outputFileName, translation, file, retryCount + 1);
  }
};
