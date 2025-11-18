#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');
const { encode, decode } = require('@toon-format/toon');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'x-ai/grok-4-fast';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ISSUE_NUMBER = process.env.ISSUE_NUMBER;
const ISSUE_BODY = process.env.ISSUE_BODY;
const ISSUE_TITLE = process.env.ISSUE_TITLE;
const ISSUE_AUTHOR_LOGIN = process.env.ISSUE_AUTHOR_LOGIN;
const ISSUE_AUTHOR_NAME = process.env.ISSUE_AUTHOR_NAME;
const ISSUE_AUTHOR_EMAIL = process.env.ISSUE_AUTHOR_EMAIL;
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

// Parse issue body to extract form data
function parseIssueBody(body) {
  const data = {};
  const lines = body.split('\n');
  let currentField = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Match field labels (### or **)
    const fieldMatch = line.match(/^(?:###|\*\*)\s*(.+?)(?:\*\*)?$/);
    if (fieldMatch) {
      const fieldName = fieldMatch[1].trim();
      // Map Chinese labels to field names
      if (fieldName.includes('地点名称') || fieldName.includes('名称')) {
        currentField = 'title';
      } else if (fieldName.includes('描述')) {
        currentField = 'description';
      } else if (fieldName.includes('地址')) {
        currentField = 'address_text';
      } else if (fieldName.includes('纬度')) {
        currentField = 'latitude';
      } else if (fieldName.includes('经度')) {
        currentField = 'longitude';
      } else if (fieldName.includes('人均消费') || fieldName.includes('消费')) {
        currentField = 'cost_per_person';
      } else if (fieldName.includes('营业时间') || fieldName.includes('时间')) {
        currentField = 'opening_hours';
      } else if (fieldName.includes('链接') || fieldName.includes('link')) {
        currentField = 'link';
      } else if (fieldName.includes('照片') || fieldName.includes('图片') || fieldName.includes('image')) {
        currentField = 'image';
      } else if (fieldName.includes('设施') || fieldName.includes('amenities')) {
        currentField = 'amenities';
      } else {
        currentField = null;
      }
      continue;
    }
    
    // Extract value
    if (currentField && line && !line.startsWith('###') && !line.startsWith('**')) {
      if (!data[currentField]) {
        data[currentField] = line;
      } else {
        data[currentField] += '\n' + line;
      }
    }
  }
  
  return data;
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

// Get image URL from issue
async function getImageFromIssue() {
  try {
    // Get issue comments to find image attachments
    const commentsResponse = await githubRequest(`/issues/${ISSUE_NUMBER}/comments`);
    const comments = commentsResponse.data;
    
    const attachmentPattern = /https:\/\/github\.com\/user-attachments\/assets\/[^\s\)\]]+/;
    const userImagesPattern = /https:\/\/user-images\.githubusercontent\.com\/[^\s\)\]]+/;

    // Check all comments for image URLs
    for (const comment of comments) {
      const body = comment.body;
      // Match GitHub attachment URLs (new drag-and-drop format)
      const attachmentMatch = body.match(attachmentPattern);
      if (attachmentMatch) {
        const url = sanitizeUrl(attachmentMatch[0]);
        console.log(`Found GitHub attachment URL in comment: ${url}`);
        return url;
      }

      // Match legacy GitHub image URLs (user-images.githubusercontent.com)
      const imageMatch = body.match(userImagesPattern);
      if (imageMatch) {
        const url = sanitizeUrl(imageMatch[0]);
        console.log(`Found image URL in comment: ${url}`);
        return url;
      }
    }
    
    // Check issue body for images (GitHub user-images URLs)
    const bodyAttachmentMatch = ISSUE_BODY.match(attachmentPattern);
    if (bodyAttachmentMatch) {
      const url = sanitizeUrl(bodyAttachmentMatch[0]);
      console.log(`Found GitHub attachment URL in issue body: ${url}`);
      return url;
    }

    const bodyImageMatch = ISSUE_BODY.match(userImagesPattern);
    if (bodyImageMatch) {
      const url = sanitizeUrl(bodyImageMatch[0]);
      console.log(`Found image URL in issue body: ${url}`);
      return url;
    }
    
    // Try markdown image syntax
    const markdownMatch = ISSUE_BODY.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
    if (markdownMatch) {
      const url = sanitizeUrl(markdownMatch[1]);
      console.log(`Found image URL in markdown: ${url}`);
      return url;
    }
    
    // Try GitHub raw content URLs
    const rawMatch = ISSUE_BODY.match(/https:\/\/.*?github\.com\/.*?\/raw\/.*?\/(.+\.(jpg|jpeg|png))(\?|$)/i);
    if (rawMatch) {
      const url = sanitizeUrl(rawMatch[0]);
      console.log(`Found image URL in raw content: ${url}`);
      return url;
    }
    
    // Try to find any image URL in issue body or comments
    const anyImageMatch = ISSUE_BODY.match(/(https?:\/\/[^\s\)]+\.(jpg|jpeg|png|gif|webp)(\?[^\s\)]*)?)/i);
    if (anyImageMatch) {
      const url = sanitizeUrl(anyImageMatch[1]);
      console.log(`Found image URL (any format): ${url}`);
      return url;
    }
    
    console.warn('No image URL found in issue body or comments');
  } catch (error) {
    console.warn('Error fetching issue comments:', error.message);
  }
  
  return null;
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
    
    // Extract data with AI
    console.log('Extracting place data with AI...');
    const extractedData = await extractPlaceDataWithAI(ISSUE_BODY, ISSUE_TITLE, isUpdate);
    
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

