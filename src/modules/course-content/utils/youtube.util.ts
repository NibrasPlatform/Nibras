import { BadRequestException } from '@nestjs/common';

const YOUTUBE_WATCH_REGEX =
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/;
const YOUTUBE_SHORT_REGEX = /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/;
const YOUTUBE_EMBED_REGEX =
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/;
const RAW_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export function extractYouTubeId(input: string): string | null {
  let match = input.match(YOUTUBE_WATCH_REGEX);
  if (match) return match[1];

  match = input.match(YOUTUBE_SHORT_REGEX);
  if (match) return match[1];

  match = input.match(YOUTUBE_EMBED_REGEX);
  if (match) return match[1];

  if (RAW_ID_REGEX.test(input.trim())) return input.trim();

  return null;
}

export function normalizeYouTubeEmbedUrl(input: string): string {
  const id = extractYouTubeId(input);
  if (!id) {
    throw new BadRequestException({
      code: 'INVALID_EMBED_URL',
      message:
        'embedUrl must be a valid YouTube URL (youtube.com/watch, youtu.be, or youtube.com/embed) or a raw 11-character video ID',
    });
  }
  return `https://www.youtube-nocookie.com/embed/${id}`;
}
