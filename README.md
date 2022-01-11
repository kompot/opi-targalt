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

## TODOs

- add simpler running within docker
- add ability to sync subtitles (shift sync), probably automatic based on other subtitles?
  right now this command could be used
  ```
  # this will move subtitle 0.8 seconds backward
  ffmpeg -itsoffset -0.8 -i ./input.srt -c copy output_with_shift.srt
  ```

## What a weird name?!

`Õpi targalt` means `learn the smart way` in Estonian.
