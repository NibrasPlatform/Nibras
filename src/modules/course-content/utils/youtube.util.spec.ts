import { extractYouTubeId, normalizeYouTubeEmbedUrl } from './youtube.util';
import { BadRequestException } from '@nestjs/common';

describe('extractYouTubeId', () => {
  it('extracts from youtube.com/watch?v= URL', () => {
    expect(
      extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBe('dQw4w9WgXcQ');
  });

  it('extracts from youtu.be short URL', () => {
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    );
  });

  it('extracts from youtube.com/embed/ URL', () => {
    expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    );
  });

  it('accepts raw 11-char video ID', () => {
    expect(extractYouTubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('returns null for invalid input', () => {
    expect(extractYouTubeId('not-a-valid-id!')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractYouTubeId('')).toBeNull();
  });

  it('handles URLs without protocol', () => {
    expect(extractYouTubeId('youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    );
  });

  it('returns null for javascript: URLs', () => {
    expect(extractYouTubeId('javascript:alert(1)')).toBeNull();
  });

  it('returns null for data: URLs', () => {
    expect(
      extractYouTubeId('data:text/html,<script>alert(1)</script>'),
    ).toBeNull();
  });

  it('returns null for vbscript: URLs', () => {
    expect(extractYouTubeId('vbscript:msgbox("xss")')).toBeNull();
  });
});

describe('normalizeYouTubeEmbedUrl', () => {
  it('converts watch URL to youtube-nocookie embed', () => {
    expect(
      normalizeYouTubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  it('converts short URL to youtube-nocookie embed', () => {
    expect(normalizeYouTubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });

  it('converts raw ID to youtube-nocookie embed', () => {
    expect(normalizeYouTubeEmbedUrl('dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });

  it('throws BadRequestException for non-YouTube URLs', () => {
    expect(() =>
      normalizeYouTubeEmbedUrl('https://vimeo.com/123456789'),
    ).toThrow(BadRequestException);
  });

  it('throws BadRequestException for javascript: URLs', () => {
    expect(() => normalizeYouTubeEmbedUrl('javascript:alert(1)')).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for data: URLs', () => {
    expect(() =>
      normalizeYouTubeEmbedUrl('data:text/html,<script>alert(1)</script>'),
    ).toThrow(BadRequestException);
  });

  it('throws BadRequestException for vbscript: URLs', () => {
    expect(() => normalizeYouTubeEmbedUrl('vbscript:msgbox("xss")')).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for empty string', () => {
    expect(() => normalizeYouTubeEmbedUrl('')).toThrow(BadRequestException);
  });

  it('throws BadRequestException for random text', () => {
    expect(() => normalizeYouTubeEmbedUrl('not-a-video')).toThrow(
      BadRequestException,
    );
  });
});
