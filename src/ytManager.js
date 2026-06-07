import { YoutubeTranscript } from 'youtube-transcript';

/**
 * Extracts the 11-character video ID from standard or shortened YouTube URLs.
 * @param {string} url - YouTube link
 */
export function extractVideoId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

/**
 * Fetches and aggregates complete caption transcript from a YouTube URL.
 * @param {string} url - YouTube link
 */
export async function getYoutubeTranscriptText(url) {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL format.');
  }

  try {
    const transcriptArray = await YoutubeTranscript.fetchTranscript(videoId);
    // Join chunks of text into a unified passage
    const fullText = transcriptArray.map(item => item.text).join(' ');
    return fullText;
  } catch (error) {
    console.warn(`[YT Manager] Transcript retrieval failed for video ID ${videoId}:`, error.message);
    throw new Error(`Unable to fetch transcript. Please ensure the video has English subtitles/captions enabled.`);
  }
}