# Õpi targalt

Learning a rare language that does not have enough audio content of your basic level?

Make use of modern text to speech technologies that are able to generate hiqh quality speech from subtitles.

Use this project to generate a dubbed video file in any language with a half muted original audio track and your language of choice dubbed over it.

All you need is original video file (`mkv`, `mp4`) and an subtitles (`srt`) file.

## Only Estonian as of now

As of now only Estonian language is supported by means of https://github.com/TartuNLP/text-to-speech-api

But it is trivial to make the project extensible so that it supports any TTS API available.

## Usage

Proper instructions on how to use are to follow but if you are eager to try then follow these steps:

You need `docker`, `docker-compose`, `node`, `pnpm`, `ffmpeg`, `curl`.

1. Download and unpack TTS models to `./models` from https://github.com/TartuNLP/text-to-speech-worker/releases
2. `pnpm install`
3. `env RABBITMQ_USER=guest RABBITMQ_PASS=guest docker-compose -f docker-compose-tts-est.yaml up`
4. Put your video files into `./input` along with subtitles (srt).
5. `pnpm run start -- -i ./input -o ./output`

If everything goes ok then you'll find similarly named video files in the `./output` folder but with an audio track and subtitles embedded.

## What's going on under the hood when you run the converter

- it tries to find video and matching subtitle files in `input` folder (so for each `X.mkv` there should be `X.srt`)
- if original video file contains subtitles then it automatically will try to find better subtitles shift (TODO will fail if original file has no subtitles)
- it creates `tmp_` folder in the `output` folder that will contain intermediate files: chunks of speech generated from `srt` source
- in case something goes wrong (as speech generation is a lengthy process) you may just restart and already generated chunks will not be generated twice
- when all chunks are ready then the final audio track is composed by joining original audio track volumed down to 40% and all the generated chunks
- every chunk is checked whether it fits within required range and if it does not then special `ffmpeg` parameter is used to speed up the chunk
- generated audio track is merged along with (probably shifted) subtitles into the source video file
- the result is a single file in `output` folder with the same path as in input folder

Original video files are not touched in any way. Original subtitles files are shifted inplace (should change that?).

## TODOs

- add simpler running within docker
- make it possible to add other languages easily
- make it possible to set base language to any custom language, not only English (which is used to shift subtitles and in the final dubbed audio at low volume)
- TECH DEBT: add better logging
- TECH DEBT: init as a class so that input/output folder are not passed in every function

## What a weird name?!

`Õpi targalt` means `learn the smart way` in Estonian.
