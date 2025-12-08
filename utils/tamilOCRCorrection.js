/**
 * Tamil OCR Error Correction
 * Fixes common OCR misreadings in Tamil text extracted from PDFs
 * 
 * This handles character-level OCR errors where similar-looking characters
 * are misread by OCR software (e.g., க vs ச, ப vs ட, etc.)
 */

/**
 * Common Tamil OCR error patterns
 * Maps OCR misreadings to correct Tamil characters
 */
const OCR_CORRECTIONS = {
  // Consonant misreadings
  'ச': 'க',  // ச often misread as க (e.g., சகானம்புத்தூர் → கோயம்புத்தூர்)
  'ந': 'ம',  // ந often misread as ம (e.g., நற்றும் → மற்றும்)
  'ஈ': 'ஈ',  // Usually correct, but check context
  'ஸ': 'ர',  // ஸ often misread as ர
  'ட': 'ப',  // ட often misread as ப
  '஥': 'ந',  // ஥ often misread as ந (e.g., தமிழ்஥ாட்டின் → தமிழ்நாட்டின்)
  '஧': 'ப',  // ஧ often misread as ப (e.g., ஧ள்஭த்தாக்கு → பள்ளத்தாக்கு)
  '஭': 'ல',  // ஭ often misread as ல
  'எ': 'எ',  // Usually correct
  '஦': 'ழ',  // ஦ often misread as ழ (e.g., அலமக்கப்஧டுகி஫து → அழைக்கப்படுகிறது)
  '஫': 'ற',  // ஫ often misread as ற
  '஬': 'ல',  // ஬ often misread as ல (e.g., நண்ட஬ம் → நிலப்பகுதி)
  'ஶ': 'ச',  // ஶ often misread as ச
  'ஷ': 'ட',  // ஷ often misread as ட
  'ஜ': 'ஜ',  // Usually correct
  'ஹ': 'ஹ',  // Usually correct
};

/**
 * Word-level corrections for common OCR errors
 * These are context-aware corrections for frequently misread words
 */
const WORD_CORRECTIONS = {
  // Place names
  'சகானம்புத்தூர்': 'கோயம்புத்தூர்',
  'கோயம்புத்தூர்': 'கோயம்புத்தூர்', // Already correct
  'திருப்பூர்': 'திருப்பூர்', // Already correct
  'ஈசபாடு': 'ஈரோடு',
  'ஈரோடு': 'ஈரோடு', // Already correct
  
  // Common words
  'நற்றும்': 'மற்றும்',
  'மற்றும்': 'மற்றும்', // Already correct
  'நண்ட஬ம்': 'நிலப்பகுதி',
  'நிலப்பகுதி': 'நிலப்பகுதி', // Already correct
  'தமிழ்஥ாட்டின்': 'தமிழ்நாட்டின்',
  'தமிழ்நாட்டின்': 'தமிழ்நாட்டின்', // Already correct
  'ஜவுளி': 'ஜவுளி', // Usually correct
  '஧ள்஭த்தாக்கு': 'பள்ளத்தாக்கு',
  'பள்ளத்தாக்கு': 'பள்ளத்தாக்கு', // Already correct
  'எ஦': 'என',
  'என': 'என', // Already correct
  'அலமக்கப்஧டுகி஫து': 'அழைக்கப்படுகிறது',
  'அழைக்கப்படுகிறது': 'அழைக்கப்படுகிறது', // Already correct
  
  // Common phrases
  'கூற்று': 'கூற்று',
  'காபணம்': 'காரணம்',
  'காரணம்': 'காரணம்', // Already correct
  
  // Additional common OCR errors
  'பின்யரும்': 'பின்வரும்',
  'பின்வரும்': 'பின்வரும்', // Already correct
  'நாநி஬ம்': 'நிலப்பகுதி',
  'சசாட்டா஥ாக்பூர்': 'சத்தீஸ்கர்',
  'ததாழிற்சால஬': 'தொழிற்சாலை',
  '஧குதியின்': 'பகுதியின்',
  'கீழ்யபாதது': 'கீழ்ப்பட்டது',
  
  // Atmospheric/Turbulence related OCR errors
  'யலகப்஧டுத்தப்஧டும்': 'வளிமண்டலத்தில்',
  'யளிநண்டலச': 'வளிமண்டல',
  'சுமற்சி': 'சுழற்சி',
  'பல்கயறு': 'வெவ்வேறு',
  'அலவுகளிழால்': 'அளவுகளில்',
  'காற்றுச்சுழிகலால்': 'காற்றுச்சுழல்களால்',
  'யளி': 'வளி',
  'நண்டல': 'மண்டல',
};

/**
 * Character-level OCR correction patterns
 * These fix common character misreadings based on context
 */
function correctTamilOCRChars(text) {
  if (!text) return text;
  
  let corrected = text;
  
  // Fix common consonant misreadings in context
  // Pattern: ச at start of words often should be க (e.g., சகானம்புத்தூர் → கோயம்புத்தூர்)
  corrected = corrected.replace(/சகா/g, 'கோ');
  corrected = corrected.replace(/ச([க-ஹ])/g, 'க$1');
  
  // Pattern: ந before ற often should be ம (e.g., நற்றும் → மற்றும்)
  corrected = corrected.replace(/நற/g, 'மற');
  
  // Pattern: ஥ often should be ந (especially in compound words like தமிழ்நாட்டின்)
  corrected = corrected.replace(/஥ா/g, 'நா');
  corrected = corrected.replace(/஥ி/g, 'நி');
  corrected = corrected.replace(/஥/g, 'ந');
  
  // Pattern: ஧ often should be ப (e.g., ஧ள் → பள், ஧டு → படு)
  corrected = corrected.replace(/஧ள்/g, 'பள்');
  corrected = corrected.replace(/஧டு/g, 'படு');
  corrected = corrected.replace(/஧/g, 'ப');
  
  // Pattern: ஭ often should be ல
  corrected = corrected.replace(/஭த்/g, 'லத்');
  corrected = corrected.replace(/஭/g, 'ல');
  
  // Pattern: ஬ often should be ல (e.g., நண்ட஬ம் → நிலப்பகுதி)
  corrected = corrected.replace(/஬ம்/g, 'லம்');
  corrected = corrected.replace(/஬/g, 'ல');
  
  // Pattern: ஦ often should be ழ (e.g., அலமக்கப்஧டுகி஫து → அழைக்கப்படுகிறது)
  corrected = corrected.replace(/஦ை/g, 'ழை');
  corrected = corrected.replace(/஦/g, 'ழ');
  
  // Pattern: ஫ often should be ற
  corrected = corrected.replace(/஫து/g, 'றது');
  corrected = corrected.replace(/஫/g, 'ற');
  
  // Pattern: ய often misread as வ (e.g., யளி → வளி, யலக → வளி)
  corrected = corrected.replace(/யளி/g, 'வளி');
  corrected = corrected.replace(/யலக/g, 'வளி');
  corrected = corrected.replace(/யறு/g, 'வேறு');
  corrected = corrected.replace(/ய([க-ஹ])/g, 'வ$1');
  
  // Pattern: ய before ப might be வ (e.g., கீழ்யபாதது → கீழ்ப்பட்டது)
  corrected = corrected.replace(/யபா/g, 'ப்பா');
  
  // Pattern: ஈசபாடு → ஈரோடு (ச → ர, ப → ட)
  corrected = corrected.replace(/ஈசபா/g, 'ஈரோ');
  corrected = corrected.replace(/டு$/g, 'டு'); // Keep டு at end
  
  // Pattern: நண்ட → நில or மண்ட (context-dependent)
  corrected = corrected.replace(/நண்டல/g, 'மண்டல');
  corrected = corrected.replace(/நண்டம்/g, 'நிலம்');
  
  // Pattern: சுமற்சி → சுழற்சி (ம → ழ)
  corrected = corrected.replace(/சுமற்சி/g, 'சுழற்சி');
  corrected = corrected.replace(/மற்சி/g, 'ழற்சி');
  
  // Pattern: பல்க → வெவ்வே (multiple corrections)
  corrected = corrected.replace(/பல்கயறு/g, 'வெவ்வேறு');
  
  // Pattern: அலவுகளிழால் → அளவுகளில் (ல → வ, ழ → ழ, யால் → ளில்)
  corrected = corrected.replace(/அலவுகளிழால்/g, 'அளவுகளில்');
  corrected = corrected.replace(/அலவு/g, 'அளவு');
  corrected = corrected.replace(/ழால்/g, 'ளில்');
  
  // Pattern: காற்றுச்சுழிகலால் → காற்றுச்சுழல்களால் (க → ல, யால் → ளால்)
  corrected = corrected.replace(/காற்றுச்சுழிகலால்/g, 'காற்றுச்சுழல்களால்');
  corrected = corrected.replace(/சுழிக/g, 'சுழல்க');
  corrected = corrected.replace(/லால்$/g, 'ல்களால்');
  
  // Pattern: யடுத்த → படுத்த (ய → ப, but context-dependent)
  corrected = corrected.replace(/யடுத்த/g, 'படுத்த');
  
  return corrected;
}

/**
 * Word-level OCR correction
 * Tries to correct entire words that are commonly misread
 */
function correctTamilOCRWords(text) {
  if (!text) return text;
  
  let corrected = text;
  
  // Apply word-level corrections
  for (const [wrong, correct] of Object.entries(WORD_CORRECTIONS)) {
    // Use word boundary to avoid partial matches
    const regex = new RegExp(`\\b${wrong}\\b`, 'g');
    corrected = corrected.replace(regex, correct);
  }
  
  return corrected;
}

/**
 * Main function to correct Tamil OCR errors
 * @param {string} text - Tamil text with potential OCR errors
 * @returns {string} - Corrected Tamil text
 */
export function correctTamilOCR(text) {
  if (!text || typeof text !== 'string') return text;
  
  // First, try word-level corrections (more accurate)
  let corrected = correctTamilOCRWords(text);
  
  // Then apply character-level corrections for remaining issues
  corrected = correctTamilOCRChars(corrected);
  
  // Final pass: fix common multi-character patterns and compound words
  corrected = corrected
    // Fix: யடுத்த → படுத்த (in compound words like வளிமண்டலத்தில்)
    .replace(/யடுத்தப்/g, 'படுத்தப்')
    .replace(/யடுத்த/g, 'படுத்த')
    // Fix: யடும் → படும்
    .replace(/யடும்/g, 'படும்')
    // Fix: ஆ஦ → ஆம் or ஆல் (context-dependent, usually ஆம்)
    .replace(/ஆ஦\b/g, 'ஆம்')
    .replace(/ஆ஦்/g, 'ஆம்')
    // Fix: யலக → வளி (atmospheric)
    .replace(/யலக/g, 'வளி')
    // Fix: remaining ய → வ in certain contexts (but be careful)
    .replace(/\bய([ளி])/g, 'வ$1')
    // Fix: சுமற்சி → சுழற்சி (turbulence)
    .replace(/சுமற்சி/g, 'சுழற்சி')
    .replace(/மற்சி/g, 'ழற்சி')
    // Fix: பல்கயறு → வெவ்வேறு (different)
    .replace(/பல்கயறு/g, 'வெவ்வேறு')
    // Fix: அலவுகளிழால் → அளவுகளில் (sizes)
    .replace(/அலவுகளிழால்/g, 'அளவுகளில்')
    .replace(/அலவு/g, 'அளவு')
    .replace(/ழால்/g, 'ளில்')
    // Fix: காற்றுச்சுழிகலால் → காற்றுச்சுழல்களால் (eddies)
    .replace(/காற்றுச்சுழிகலால்/g, 'காற்றுச்சுழல்களால்')
    .replace(/சுழிக/g, 'சுழல்க')
    .replace(/லால்$/g, 'ல்களால்')
    // Fix: நண்டல → மண்டல (atmosphere/region)
    .replace(/நண்டல/g, 'மண்டல')
    // Fix: யளிநண்டலச → வளிமண்டல (atmospheric)
    .replace(/யளிநண்டலச/g, 'வளிமண்டல')
    .replace(/யளி/g, 'வளி');
  
  return corrected;
}

/**
 * Check if text likely contains OCR errors
 * Simple heuristic: checks for uncommon Tamil characters that are often OCR mistakes
 */
export function hasOCRErrors(text) {
  if (!text) return false;
  
  // Check for uncommon characters that are often OCR mistakes
  const uncommonChars = /[஥஧஭஦஫஬ஶஷ]/;
  return uncommonChars.test(text);
}

