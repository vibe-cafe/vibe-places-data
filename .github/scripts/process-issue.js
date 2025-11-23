#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');
const { encode, decode } = require('@toon-format/toon');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'x-ai/grok-4.1-fast';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ISSUE_NUMBER = process.env.ISSUE_NUMBER;
const ISSUE_BODY = process.env.ISSUE_BODY;
const ISSUE_TITLE = process.env.ISSUE_TITLE;
const ISSUE_AUTHOR_LOGIN = process.env.ISSUE_AUTHOR_LOGIN;
const ISSUE_AUTHOR_NAME = process.env.ISSUE_AUTHOR_NAME;
const ISSUE_AUTHOR_EMAIL = process.env.ISSUE_AUTHOR_EMAIL;
const ISSUE_LABELS = process.env.ISSUE_LABELS || '[]';
const IS_SCREENSHOT = process.env.IS_SCREENSHOT === 'true';
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;

// Use OpenRouter if available, otherwise fall back to OpenAI
const USE_OPENROUTER = !!OPENROUTER_API_KEY;
const AI_API_KEY = USE_OPENROUTER ? OPENROUTER_API_KEY : OPENAI_API_KEY;

if (!AI_API_KEY) {
  console.error('Neither OPENROUTER_API_KEY nor OPENAI_API_KEY is set');
  console.error('Please set one of them in repository secrets');
  process.exit(1);
}

if (!GITHUB_TOKEN) {
  console.error('GITHUB_TOKEN is not set');
  process.exit(1);
}

if (USE_OPENROUTER) {
  console.log(`Using OpenRouter API with model: ${OPENROUTER_MODEL}`);
} else {
  console.log('Using OpenAI API');
}

// Helper function to make GitHub API requests
async function githubRequest(endpoint, method = 'GET', data = null) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}${endpoint}`;
  const config = {
    method,
    url,
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitHub-Actions'
    }
  };
  if (data) {
    config.data = data;
  }
  return axios(config);
}

// Generate UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Generate unique UUID (check for duplicates, though extremely unlikely)
function generateUniqueID(places) {
  let id = generateUUID();
  // Check for duplicates (very unlikely but safe)
  while (places.some(p => p.id === id)) {
    id = generateUUID();
  }
  return id;
}

// Parse issue body to extract form data (especially amenities checkboxes)
function parseIssueBody(body) {
  const data = {};
  const lines = body.split('\n');
  let currentField = null;
  let inAmenitiesSection = false;
  
  // Map of checkbox labels to amenity values
  const amenityMap = {
    '有稳定的 WiFi 网络': '有稳定的 WiFi 网络',
    '桌子、座椅舒适': '桌子、座椅舒适',
    '允许长时间停留工作': '允许长时间停留工作',
    '有电源插座可用': '有电源插座可用',
    '环境相对安静': '环境相对安静',
    '店内有洗手间': '店内有洗手间'
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Match field labels (### or **)
    const fieldMatch = line.match(/^(?:###|\*\*)\s*(.+?)(?:\*\*)?$/);
    if (fieldMatch) {
      const fieldName = fieldMatch[1].trim();
      // Map Chinese labels to field names
      if (fieldName.includes('地点名称') || fieldName.includes('名称')) {
        currentField = 'title';
        inAmenitiesSection = false;
      } else if (fieldName.includes('描述')) {
        currentField = 'description';
        inAmenitiesSection = false;
      } else if (fieldName.includes('地址')) {
        currentField = 'address_text';
        inAmenitiesSection = false;
      } else if (fieldName.includes('纬度')) {
        currentField = 'latitude';
        inAmenitiesSection = false;
      } else if (fieldName.includes('经度')) {
        currentField = 'longitude';
        inAmenitiesSection = false;
      } else if (fieldName.includes('人均消费') || fieldName.includes('消费')) {
        currentField = 'cost_per_person';
        inAmenitiesSection = false;
      } else if (fieldName.includes('营业时间') || fieldName.includes('时间')) {
        currentField = 'opening_hours';
        inAmenitiesSection = false;
      } else if (fieldName.includes('链接') || fieldName.includes('link')) {
        currentField = 'link';
        inAmenitiesSection = false;
      } else if (fieldName.includes('截图') || fieldName.includes('screenshot')) {
        currentField = 'screenshot';
        inAmenitiesSection = false;
      } else if (fieldName.includes('照片') || fieldName.includes('图片') || fieldName.includes('image')) {
        currentField = 'image';
        inAmenitiesSection = false;
      } else if (fieldName.includes('设施') || fieldName.includes('amenities')) {
        currentField = 'amenities';
        inAmenitiesSection = true;
        if (!data.amenities) {
          data.amenities = [];
        }
      } else {
        currentField = null;
        inAmenitiesSection = false;
      }
      continue;
    }
    
    // Extract checkbox values (for amenities)
    if (inAmenitiesSection && line.startsWith('- [x]')) {
      const checkboxText = line.replace(/^- \[x\]\s*/, '').trim();
      if (amenityMap[checkboxText] && !data.amenities.includes(amenityMap[checkboxText])) {
        data.amenities.push(amenityMap[checkboxText]);
      }
    }
    
    // Extract other field values
    if (currentField && !inAmenitiesSection && line && !line.startsWith('###') && !line.startsWith('**') && !line.startsWith('-')) {
      if (!data[currentField]) {
        data[currentField] = line;
      } else {
        data[currentField] += '\n' + line;
      }
    }
  }
  
  return data;
}

// Extract place data from screenshot using vision API
async function extractPlaceDataFromScreenshot(imagePath) {
  console.log('Extracting place data from screenshot using vision API...');
  
  // Read image and convert to base64
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');
  
  // Detect image MIME type from file extension
  const ext = path.extname(imagePath).toLowerCase();
  let mimeType = 'image/jpeg';
  if (ext === '.png') {
    mimeType = 'image/png';
  } else if (ext === '.jpg' || ext === '.jpeg') {
    mimeType = 'image/jpeg';
  }
  
  const systemPrompt = `You are a data extraction assistant specialized in reading Chinese place information from screenshots.
Extract place information from screenshots of Chinese mapping/review apps like 大众点评, 高德地图, 百度地图, etc.

Return a JSON object with the following structure:
{
  "title": "place name (required, extract from Chinese text)",
  "description": "description or empty string",
  "address_text": "full address in Chinese (required)",
  "latitude": number or null (if visible in screenshot),
  "longitude": number or null (if visible in screenshot),
  "cost_per_person": number or null (extract from 人均消费 or similar),
  "opening_hours": "HH:MM-HH:MM format or null (extract from 营业时间 or similar)",
  "link": "url or empty string (if visible)",
  "amenities": ["array of amenities inferred from visible information"]
}

IMPORTANT:
- Read all Chinese text carefully from the screenshot
- Extract coordinates if visible, otherwise leave as null
- For opening hours, convert to HH:MM-HH:MM format (e.g., "09:00-22:00")
- For cost_per_person, extract the number only (e.g., if you see "人均消费：45元", return 45)
- For amenities, infer from visible information (WiFi, power outlets, quiet environment, etc.)
- Return only valid JSON.`;

  const userPrompt = `Extract place information from this screenshot. Read all Chinese text carefully and extract all available details.`;

  try {
    // Use OpenRouter with grok-4.1-fast for screenshot extraction
    const apiUrl = USE_OPENROUTER 
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
    
    // Use OPENROUTER_MODEL (defaults to x-ai/grok-4.1-fast)
    const visionModel = USE_OPENROUTER 
      ? (OPENROUTER_MODEL || 'x-ai/grok-4.1-fast')
      : 'gpt-4o-mini'; // Fallback for OpenAI direct (shouldn't happen in practice)
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_API_KEY}`
    };
    
    // OpenRouter recommends HTTP-Referer header
    if (USE_OPENROUTER) {
      headers['HTTP-Referer'] = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
      headers['X-Title'] = 'Vibe Places Data Auto Resolver';
    }
    
    const response = await axios.post(
      apiUrl,
      {
        model: visionModel,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      },
      { headers }
    );

    if (response.data.error) {
      const apiName = USE_OPENROUTER ? 'OpenRouter' : 'OpenAI';
      throw new Error(`${apiName} API error: ${response.data.error.message}`);
    }

    const content = response.data.choices[0].message.content;
    const extractedData = JSON.parse(content);
    
    console.log('Successfully extracted data from screenshot:', JSON.stringify(extractedData, null, 2));
    return extractedData;
  } catch (error) {
    if (error.response) {
      const apiName = USE_OPENROUTER ? 'OpenRouter' : 'OpenAI';
      throw new Error(`${apiName} API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

// Use AI to extract and validate place data
async function extractPlaceDataWithAI(issueBody, issueTitle, isUpdate) {
  const systemPrompt = isUpdate 
    ? `You are a data extraction assistant. Extract place update information from a GitHub issue form.
Return a JSON object with the following structure:
{
  "place_name": "name of the place to update",
  "updates": {
    "description": "updated description if provided",
    "address_text": "updated address if provided",
    "latitude": number or null,
    "longitude": number or null,
    "cost_per_person": number or null,
    "opening_hours": "HH:MM-HH:MM format or null",
    "link": "url or empty string",
    "amenities": ["array of amenities if provided"]
  }
}
Only include fields that are being updated. Validate coordinates are numbers. Return only valid JSON.`
    : `You are a data extraction assistant. Extract place information from a GitHub issue form.
Return a JSON object with the following structure:
{
  "title": "place name (required)",
  "description": "description or empty string",
  "address_text": "full address (required)",
  "latitude": number or null,
  "longitude": number or null,
  "cost_per_person": number or null,
  "opening_hours": "HH:MM-HH:MM format or null",
  "link": "url or empty string",
  "amenities": ["array of selected amenities"]
}
IMPORTANT: Do NOT extract image data - images are handled separately by downloading from issue attachments.
Validate that required fields are present. Validate coordinates are numbers. Return only valid JSON.`;

  const userPrompt = `Extract place data from this GitHub issue:\n\nTitle: ${issueTitle}\n\nBody:\n${issueBody}`;

  try {
    // Choose API endpoint and model
    const apiUrl = USE_OPENROUTER 
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
    
    const model = USE_OPENROUTER ? OPENROUTER_MODEL : 'gpt-4o-mini';
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_API_KEY}`
    };
    
    // OpenRouter recommends HTTP-Referer header
    if (USE_OPENROUTER) {
      headers['HTTP-Referer'] = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
      headers['X-Title'] = 'Vibe Places Data Auto Resolver';
    }
    
    const response = await axios.post(
      apiUrl,
      {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      },
      { headers }
    );

    if (response.data.error) {
      const apiName = USE_OPENROUTER ? 'OpenRouter' : 'OpenAI';
      throw new Error(`${apiName} API error: ${response.data.error.message}`);
    }

    const content = response.data.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    if (error.response) {
      const apiName = USE_OPENROUTER ? 'OpenRouter' : 'OpenAI';
      throw new Error(`${apiName} API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

function sanitizeUrl(url) {
  if (!url) return url;
  return url.trim().replace(/^[<"'`]+/, '').replace(/[>"'`]+$/, '');
}

// Download image from issue and return the actual file extension
async function downloadImageFromIssue(imageUrl, imagePath) {
  try {
    const sanitizedUrl = sanitizeUrl(imageUrl);
    const response = await axios({
      method: 'GET',
      url: sanitizedUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'GitHub-Actions'
      }
    });
    
    // Detect content type from response headers
    const contentType = response.headers['content-type'] || '';
    let extension = 'jpg'; // default
    
    if (contentType.includes('png')) {
      extension = 'png';
    } else if (contentType.includes('jpeg') || contentType.includes('jpg')) {
      extension = 'jpg';
    } else {
      // Try to detect from URL
      const urlMatch = imageUrl.match(/\.(jpg|jpeg|png)(\?|$)/i);
      if (urlMatch) {
        extension = urlMatch[1].toLowerCase() === 'jpeg' ? 'jpg' : urlMatch[1].toLowerCase();
      }
    }
    
    // Update image path with correct extension
    const dir = path.dirname(imagePath);
    const baseName = path.basename(imagePath, path.extname(imagePath));
    const finalPath = path.join(dir, `${baseName}.${extension}`);
    
    const writer = fs.createWriteStream(finalPath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(extension));
      writer.on('error', reject);
    });
  } catch (error) {
    throw new Error(`Failed to download image: ${error.message}`);
  }
}

// Get all image URLs from issue (returns array)
async function getAllImagesFromIssue() {
  const images = [];
  try {
    // Get issue comments to find image attachments
    const commentsResponse = await githubRequest(`/issues/${ISSUE_NUMBER}/comments`);
    const comments = commentsResponse.data;
    
    const attachmentPattern = /https:\/\/github\.com\/user-attachments\/assets\/[^\s\)\]]+/g;
    const userImagesPattern = /https:\/\/user-images\.githubusercontent\.com\/[^\s\)\]]+/g;

    // Check all comments for image URLs
    for (const comment of comments) {
      const body = comment.body;
      // Match all GitHub attachment URLs
      const attachmentMatches = body.match(attachmentPattern);
      if (attachmentMatches) {
        attachmentMatches.forEach(match => {
          const url = sanitizeUrl(match);
          if (!images.includes(url)) images.push(url);
        });
      }

      // Match all legacy GitHub image URLs
      const imageMatches = body.match(userImagesPattern);
      if (imageMatches) {
        imageMatches.forEach(match => {
          const url = sanitizeUrl(match);
          if (!images.includes(url)) images.push(url);
        });
      }
    }
    
    // Check issue body for images
    const bodyAttachmentMatches = ISSUE_BODY.match(attachmentPattern);
    if (bodyAttachmentMatches) {
      bodyAttachmentMatches.forEach(match => {
        const url = sanitizeUrl(match);
        if (!images.includes(url)) images.push(url);
      });
    }

    const bodyImageMatches = ISSUE_BODY.match(userImagesPattern);
    if (bodyImageMatches) {
      bodyImageMatches.forEach(match => {
        const url = sanitizeUrl(match);
        if (!images.includes(url)) images.push(url);
      });
    }
    
    // Try markdown image syntax
    const markdownMatches = ISSUE_BODY.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/g);
    if (markdownMatches) {
      markdownMatches.forEach(match => {
        const urlMatch = match.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
        if (urlMatch) {
          const url = sanitizeUrl(urlMatch[1]);
          if (!images.includes(url)) images.push(url);
        }
      });
    }
    
    // Try GitHub raw content URLs
    const rawMatches = ISSUE_BODY.match(/https:\/\/.*?github\.com\/.*?\/raw\/.*?\/(.+\.(jpg|jpeg|png))(\?|$)/gi);
    if (rawMatches) {
      rawMatches.forEach(match => {
        const url = sanitizeUrl(match);
        if (!images.includes(url)) images.push(url);
      });
    }
    
    // Try to find any image URL in issue body
    const anyImageMatches = ISSUE_BODY.match(/(https?:\/\/[^\s\)]+\.(jpg|jpeg|png|gif|webp)(\?[^\s\)]*)?)/gi);
    if (anyImageMatches) {
      anyImageMatches.forEach(match => {
        const url = sanitizeUrl(match);
        if (!images.includes(url)) images.push(url);
      });
    }
    
    if (images.length === 0) {
      console.warn('No image URLs found in issue body or comments');
    } else {
      console.log(`Found ${images.length} image(s) in issue`);
    }
  } catch (error) {
    console.warn('Error fetching issue comments:', error.message);
  }
  
  return images;
}

// Get image URL from issue (returns first image for backward compatibility)
async function getImageFromIssue() {
  const images = await getAllImagesFromIssue();
  return images.length > 0 ? images[0] : null;
}

// Find place by name
function findPlaceByName(name, places) {
  const matches = places.filter(p => 
    p.title.toLowerCase().trim() === name.toLowerCase().trim()
  );
  return matches;
}

// Update places.json
function updatePlacesJson(places, newPlace, isUpdate, existingPlace) {
  if (isUpdate && existingPlace) {
    // Update existing place - only update fields that are provided
    const index = places.findIndex(p => p.id === existingPlace.id);
    if (index !== -1) {
      const updates = newPlace.updates || {};
      const updatedPlace = { ...places[index] };
      
      // Only update fields that are explicitly provided (not null/undefined)
      if (updates.description !== undefined && updates.description !== null) {
        updatedPlace.description = updates.description;
      }
      if (updates.address_text !== undefined && updates.address_text !== null) {
        updatedPlace.address_text = updates.address_text;
      }
      if (updates.latitude !== undefined && updates.latitude !== null) {
        updatedPlace.latitude = parseFloat(updates.latitude);
      }
      if (updates.longitude !== undefined && updates.longitude !== null) {
        updatedPlace.longitude = parseFloat(updates.longitude);
      }
      if (updates.cost_per_person !== undefined && updates.cost_per_person !== null) {
        updatedPlace.cost_per_person = parseInt(updates.cost_per_person);
      }
      if (updates.opening_hours !== undefined && updates.opening_hours !== null) {
        updatedPlace.opening_hours = updates.opening_hours;
      }
      if (updates.link !== undefined && updates.link !== null) {
        updatedPlace.link = updates.link;
      }
      if (updates.amenities !== undefined && Array.isArray(updates.amenities)) {
        updatedPlace.amenities = updates.amenities;
      } else if (!updatedPlace.amenities) {
        updatedPlace.amenities = [];
      }
      
      places[index] = updatedPlace;
    }
    return places[index];
  } else {
    // Add new place
    const place = {
      id: generateUniqueID(places),
      title: newPlace.title,
      description: newPlace.description || '',
      address_text: newPlace.address_text,
      latitude: newPlace.latitude ? parseFloat(newPlace.latitude) : undefined,
      longitude: newPlace.longitude ? parseFloat(newPlace.longitude) : undefined,
      cost_per_person: newPlace.cost_per_person ? parseInt(newPlace.cost_per_person) : undefined,
      opening_hours: newPlace.opening_hours || undefined,
      link: newPlace.link || '',
      image: '',
      amenities: newPlace.amenities || []
    };
    places.push(place);
    return place;
  }
}

// PR creation is now handled by GitHub Actions workflow step (better permissions)

// Main execution
async function main() {
  try {
    const isUpdate = ISSUE_TITLE.includes('[更新]') || ISSUE_BODY.includes('更新地点');
    
    // Screenshot mode: extract data from screenshot image
    let extractedData;
    let screenshotPath = null;
    let screenshotExtension = null;
    let placeImageUrl = null;
    
    if (IS_SCREENSHOT) {
      console.log('Screenshot mode detected. Extracting data from screenshot...');
      
      // Screenshot mode only supports new places (not updates)
      if (isUpdate) {
        throw new Error('Screenshot mode is only supported for new places, not updates');
      }
      
      // Get all images from issue
      console.log('Downloading images from issue...');
      const allImages = await getAllImagesFromIssue();
      if (allImages.length === 0) {
        throw new Error('No images found in issue. Please upload a screenshot and place photo, or use the "添加新地点" template if you prefer to fill in fields manually.');
      }
      
      if (allImages.length < 2) {
        throw new Error('Please upload both a screenshot (for AI extraction) and a place photo (for display).');
      }
      
      // First image is screenshot (for extraction)
      const screenshotUrl = allImages[0];
      // Second image is place photo (for storage)
      placeImageUrl = allImages[1];
      
      console.log(`Found ${allImages.length} image(s). Using first as screenshot, second as place photo.`);
      
      // Create temporary directory for screenshot
      const tempDir = path.join(process.cwd(), 'temp');
      fs.mkdirSync(tempDir, { recursive: true });
      const tempImagePath = path.join(tempDir, 'screenshot.jpg');
      
      // Download screenshot (will detect correct extension)
      screenshotExtension = await downloadImageFromIssue(screenshotUrl, tempImagePath);
      screenshotPath = path.join(tempDir, `screenshot.${screenshotExtension}`);
      if (screenshotPath !== tempImagePath) {
        // Rename if extension was corrected
        if (fs.existsSync(tempImagePath)) {
          fs.renameSync(tempImagePath, screenshotPath);
        }
      }
      
      console.log(`Screenshot downloaded: ${screenshotPath}`);
      
      // Extract data from screenshot using vision API
      extractedData = await extractPlaceDataFromScreenshot(screenshotPath);
      
      // Merge with manual form fields (especially amenities)
      console.log('Checking for manual form field overrides...');
      const manualFields = parseIssueBody(ISSUE_BODY);
      
      // Merge amenities: manual overrides AI
      if (manualFields.amenities && Array.isArray(manualFields.amenities) && manualFields.amenities.length > 0) {
        console.log(`Found manual amenities: ${manualFields.amenities.join(', ')}`);
        extractedData.amenities = manualFields.amenities;
      }
      
      console.log('Final extracted data:', JSON.stringify(extractedData, null, 2));
    } else {
      // Text mode: extract data from issue form text
      console.log('Extracting place data with AI from text...');
      extractedData = await extractPlaceDataWithAI(ISSUE_BODY, ISSUE_TITLE, isUpdate);
    }
    
    // Load existing places (TOON format)
    const toonPath = path.join(process.cwd(), 'data', 'places.toon');
    if (!fs.existsSync(toonPath)) {
      throw new Error('places.toon not found');
    }
    const toonContent = fs.readFileSync(toonPath, 'utf-8');
    const places = decode(toonContent);
    
    let place;
    let existingPlace = null;
    
    if (isUpdate) {
      // Find existing place
      const matches = findPlaceByName(extractedData.place_name, places);
      if (matches.length === 0) {
        throw new Error(`Place "${extractedData.place_name}" not found`);
      }
      if (matches.length > 1) {
        throw new Error(`Multiple places found with name "${extractedData.place_name}". Please be more specific.`);
      }
      existingPlace = matches[0];
    }
    
    // Update places.json
    place = updatePlacesJson(places, extractedData, isUpdate, existingPlace);
    
    // Handle image (only for new places)
    if (!isUpdate && place.image === '') {
      if (IS_SCREENSHOT && placeImageUrl) {
        // In screenshot mode, download place photo (second image)
        console.log('Downloading place photo (second image)...');
        const imageDir = path.join(process.cwd(), 'images', place.id);
        fs.mkdirSync(imageDir, { recursive: true });
        const imagePath = path.join(imageDir, 'main.jpg'); // Will be updated with correct extension
        
        const extension = await downloadImageFromIssue(placeImageUrl, imagePath);
        place.image = `${place.id}/main.${extension}`;
        console.log(`Place photo saved successfully: ${place.image}`);
        
        // Clean up temporary screenshot file
        if (screenshotPath && fs.existsSync(screenshotPath)) {
          fs.unlinkSync(screenshotPath);
        }
        const tempDir = path.dirname(screenshotPath);
        if (fs.existsSync(tempDir)) {
          try {
            fs.rmdirSync(tempDir);
          } catch (e) {
            // Ignore if directory not empty
          }
        }
      } else {
        // Text mode: download image from issue
        console.log('Attempting to download image from issue...');
        const imageUrl = await getImageFromIssue();
        if (imageUrl) {
          const imageDir = path.join(process.cwd(), 'images', place.id);
          const imagePath = path.join(imageDir, 'main.jpg'); // Will be updated with correct extension
          
          fs.mkdirSync(imageDir, { recursive: true });
          const extension = await downloadImageFromIssue(imageUrl, imagePath);
          place.image = `${place.id}/main.${extension}`;
          console.log(`Image downloaded successfully: ${place.image}`);
        } else {
          console.warn('No image found in issue. Place will be added without image.');
        }
      }
    }
    
    // Save places.toon (TOON format)
    const encodedToonContent = encode(places);
    fs.writeFileSync(toonPath, encodedToonContent, 'utf-8');
    
    // Create branch and commit
    const branchName = `auto-${isUpdate ? 'update' : 'add'}-${place.id}-${Date.now()}`;
    
    // Use contributor's info for commit author if available, otherwise fallback to bot
    // Use login as fallback for name if name is not available
    const commitAuthorName = ISSUE_AUTHOR_NAME || ISSUE_AUTHOR_LOGIN || 'github-actions[bot]';
    const commitAuthorEmail = ISSUE_AUTHOR_EMAIL || (ISSUE_AUTHOR_LOGIN ? `${ISSUE_AUTHOR_LOGIN}@users.noreply.github.com` : 'github-actions[bot]@users.noreply.github.com');
    
    // Escape author name and email for git command (replace quotes and backslashes)
    const escapedAuthorName = commitAuthorName.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
    const escapedAuthorEmail = commitAuthorEmail.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
    
    // Configure git with contributor's info
    execSync(`git config user.name "${escapedAuthorName}"`, { stdio: 'inherit' });
    execSync(`git config user.email "${escapedAuthorEmail}"`, { stdio: 'inherit' });
    execSync(`git checkout -b ${branchName}`, { stdio: 'inherit' });
    execSync(`git add data/places.toon`, { stdio: 'inherit' });
    
    if (!isUpdate && place.image) {
      execSync(`git add images/${place.id}/`, { stdio: 'inherit' });
    }
    
    // Create commit with contributor as author
    const commitMessage = `${isUpdate ? 'Update' : 'Add'}: ${place.title}`;
    const authorString = `${escapedAuthorName} <${escapedAuthorEmail}>`;
    execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}" --author="${authorString}"`, { stdio: 'inherit' });
    execSync(`git push origin ${branchName}`, { stdio: 'inherit' });
    
    // Set outputs for GitHub Actions (PR will be created by workflow step)
    const outputFile = process.env.GITHUB_OUTPUT;
    if (outputFile) {
      fs.appendFileSync(outputFile, `branch_name=${branchName}\n`);
      fs.appendFileSync(outputFile, `place_title=${place.title.replace(/\n/g, ' ')}\n`);
      fs.appendFileSync(outputFile, `is_update=${isUpdate}\n`);
      fs.appendFileSync(outputFile, `error=false\n`);
    } else {
      // Fallback for local testing
      console.log(`::set-output name=branch_name::${branchName}`);
      console.log(`::set-output name=place_title::${place.title}`);
      console.log(`::set-output name=is_update::${isUpdate}`);
      console.log(`::set-output name=error::false`);
    }
    
    console.log(`✅ Successfully created branch: ${branchName}`);
    console.log(`✅ PR will be created by workflow step`);
    
  } catch (error) {
    console.error('Error:', error.message);
    const outputFile = process.env.GITHUB_OUTPUT;
    if (outputFile) {
      fs.appendFileSync(outputFile, `error=true\n`);
      fs.appendFileSync(outputFile, `error_message=${error.message.replace(/\n/g, ' ')}\n`);
    } else {
      console.log(`::set-output name=error::true`);
      console.log(`::set-output name=error_message::${error.message.replace(/\n/g, ' ')}`);
    }
    process.exit(1);
  }
}

main();

