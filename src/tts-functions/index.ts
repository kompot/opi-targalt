import { SupportedLanguages } from "..";
import { InputVideoWithSrt, TranslationChunk } from "../converter";

import { textToSpeech as textToSpeechEst } from "./est";

type TextToSpeechFunction = (
  outputFileName: string,
  translation: TranslationChunk,
  file: InputVideoWithSrt,
  retryCount?: number
) => Promise<void>;

export const ttsFunctions: Record<
  SupportedLanguages,
  TextToSpeechFunction
> = {
  est: textToSpeechEst,
};
