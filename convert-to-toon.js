const fs = require('fs');
const path = require('path');
const { encode } = require('@toon-format/toon');

// Read places.json
const jsonPath = path.join(__dirname, 'data', 'places.json');
const places = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

// Convert to TOON format
const toonData = encode(places);

// Write to places.toon
const toonPath = path.join(__dirname, 'data', 'places.toon');
fs.writeFileSync(toonPath, toonData, 'utf-8');

console.log(`✅ Converted ${places.length} places from JSON to TOON format`);
console.log(`📄 Output: ${toonPath}`);

