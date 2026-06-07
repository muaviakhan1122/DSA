import fs from 'fs/promises';
import path from 'path';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { DATA_DIR } from './config.js';

async function parseFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.pdf') {
      const buffer = await fs.readFile(filePath);
      const data = await pdf(buffer);
      return data.text;
    } else if (ext === '.txt' || ext === '.md' || ext === '.json') {
      return await fs.readFile(filePath, 'utf-8');
    }
  } catch (error) {
    console.warn(`Could not parse file at ${filePath}:`, error.message);
  }
  return '';
}

export async function getFolderContent(subFolder) {
  const folderPath = path.join(DATA_DIR, subFolder);
  let aggregatedContent = '';

  try {
    await fs.mkdir(folderPath, { recursive: true });
    const files = await fs.readdir(folderPath);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const stat = await fs.stat(filePath);
      
      if (stat.isFile()) {
        const fileContent = await parseFile(filePath);
        aggregatedContent += `\n--- Source: ${file} ---\n${fileContent}\n`;
      }
    }
  } catch (error) {
    console.error(`Error reading ${subFolder} folder:`, error);
  }

  return aggregatedContent;
}

export async function getTopicSlides(topic) {
  return await getFolderContent('slides');
}

/**
 * Parses slide files and extracts page-level chunks containing the topic
 * keyword to serve as visual slide card previews on the frontend.
 * @param {string} topic - Current target topic
 */
export async function getSlidePreviews(topic) {
  const folderPath = path.join(DATA_DIR, 'slides');
  const previews = [];

  try {
    await fs.mkdir(folderPath, { recursive: true });
    const files = await fs.readdir(folderPath);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.pdf') {
        const buffer = await fs.readFile(filePath);
        const data = await pdf(buffer);
        // split PDF content into pages based on standard form-feed characters
        const pages = data.text.split('\f');

        pages.forEach((pageText, index) => {
          if (pageText.toLowerCase().includes(topic.toLowerCase())) {
            previews.push({
              source: file,
              pageNumber: index + 1,
              content: pageText.trim()
            });
          }
        });
      } else if (ext === '.txt' || ext === '.md') {
        const text = await fs.readFile(filePath, 'utf-8');
        // split text files by empty lines to build card segments
        const blocks = text.split(/\n\s*\n/);
        
        blocks.forEach((block, index) => {
          if (block.toLowerCase().includes(topic.toLowerCase())) {
            previews.push({
              source: file,
              pageNumber: index + 1,
              content: block.trim()
            });
          }
        });
      }
    }
  } catch (error) {
    console.error('Error fetching slide previews:', error);
  }

  // Return a maximum of 4 highly relevant slide extracts to avoid layout overflow
  return previews.slice(0, 4);
}