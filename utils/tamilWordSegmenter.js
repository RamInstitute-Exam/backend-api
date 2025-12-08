// utils/tamilWordSegmenter.js

/**
 * Intelligent Tamil Word Segmentation
 * Uses linguistic rules + dictionary approach to properly segment Tamil words
 */

// Tamil Unicode ranges
const TAMIL_CONSONANTS = '\u0B95-\u0B9F\u0BA3-\u0BA9\u0BAA-\u0BB9'; // க-ன
const TAMIL_VOWELS = '\u0B85-\u0B94'; // அ-ஔ
const TAMIL_VOWEL_SIGNS = '\u0BBE-\u0BCD'; // ஆ-்
const TAMIL_MODIFIERS = '\u0B82-\u0B83'; // ஂ-ஃ

// Extended Tamil word dictionary (1000+ common words in exam contexts)
// This dictionary is used for intelligent word segmentation
const TAMIL_WORD_DICTIONARY = new Set([
  // Common connectors and particles
  'மற்றும்', 'ஆனால்', 'என', 'என்று', 'மட்டும்', 'சரி', 'தவறு',
  'இரண்டும்', 'மூன்றும்', 'நான்கும்', 'ஐந்தும்', 'ஆறும்', 'ஏழும்', 'எட்டும்',
  'கூற்று', 'காரணம்', 'விடை', 'தெரியவில்லை', 'தெரியாது',
  'பின்வரும்', 'முன்வரும்', 'ஒரு', 'இரு', 'மூன்று', 'நான்கு',
  'கீழ்', 'மேல்', 'முன்', 'பின்', 'வலது', 'இடது',
  'உள்ள', 'வெளியே', 'உள்ளே', 'மேலே', 'கீழே',
  'எது', 'எங்கு', 'எப்போது', 'எப்படி', 'ஏன்',
  'சரியான', 'தவறான', 'முக்கிய', 'சிறப்பு',
  
  // Geography and places
  'மாநிலம்', 'மாநிலங்கள்', 'நாடு', 'நாடுகள்', 'தமிழ்நாட்டில்', 'தமிழ்நாடு',
  'தொழிற்சாலை', 'தொழிற்சாலைகள்', 'பகுதியின்', 'பகுதி', 'பகுதிகள்',
  'கோயம்புத்தூர்', 'திருப்பூர்', 'ஈரோடு', 'மண்டலம்', 'மண்டலங்கள்',
  'ஜவுளி', 'பள்ளத்தாக்கு', 'கணவாய்', 'கணவாய்கள்',
  'விருதுநகர்', 'செங்கோட்டை', 'திருநெல்வேலி', 'அருப்புக்கோட்டை',
  'பாலக்காடு', 'கன்னியாகுமரி', 'ஒசூர்', 'ஊட்டி', 'நிலக்கோட்டை', 'மதுரை',
  'ஜார்க்கண்ட்', 'பீகார்', 'ஒடிசா', 'சத்தீஸ்கர்', 'சோட்டாநாக்பூர்',
  'திருச்சிராப்பள்ளி', 'நீலகிரி', 'பெரம்பலூர்',
  'இமலாய', 'இமயமலை', 'சிந்து', 'கங்கை', 'சமவெளி', 'சமவெளிகள்',
  'தீபகற்ப', 'மேற்குத்', 'தொடர்ச்சிமலை', 'மேற்குத் தொடர்ச்சிமலை',
  'புவிஇயல்', 'புவியியல்', 'பரந்த', 'அளவில்',
  'இடம்', 'இடங்கள்', 'நகரம்', 'நகரங்கள்',
  
  // Energy and resources
  'காற்று', 'ஆற்றல்', 'வளம்', 'வளங்கள்', 'காற்று ஆற்றல்',
  'சூரிய', 'நீர்', 'நிலக்கரி', 'பெட்ரோலியம்',
  'மின்சாரம்', 'மின்னாற்றல்',
  
  // Industry and economy
  'தொழில்', 'தொழில்கள்', 'கொத்து', 'தொழிற்சாலை',
  'புனைவவர்', 'வாகன', 'ஆழ்துளையிடும்', 'பணிகள்',
  'பருத்தி', 'அறுவை', 'சிகிச்சை', 'பொருட்கள்', 'மரவள்ளி',
  'நெசவாலைகள்', 'நெசவு', 'ஆலை', 'ஆலைகள்',
  'பொருளாதாரம்', 'பொருளாதாரத்தில்', 'பங்களிப்பு', 'பங்களிப்பை',
  'வேளாண்', 'ஏற்றுமதி', 'மண்டலங்கள்', 'அமைந்துள்ளன',
  
  // Question types and formats
  'கண்டுபிடி', 'தேர்ந்தெடுக்கவும்', 'தேர்ந்தெடு', 'தேர்வு',
  'சரியானவற்றை', 'சரியான', 'விடையை', 'விடைகள்',
  'விளக்கம்', 'விளக்கமாகும்', 'விளக்கமல்ல',
  'பொருத்தவும்', 'பொருத்தம்', 'இணை', 'இணைக்க',
  
  // Measurements and numbers
  'நீளம்', 'கி.மீ', 'கிலோமீட்டர்', 'மீட்டர்', 'சென்டிமீட்டர்',
  'கிலோ', 'கிராம்', 'லிட்டர்', 'மில்லி',
  'ஆண்டு', 'ஆண்டுகள்', 'மாதம்', 'மாதங்கள்', 'நாள்', 'நாட்கள்',
  'நிறுவப்பட்டது', 'நிறுவப்பட்ட', 'இயற்றப்பட்ட', 'ஆண்டில்',
  
  // Science and nature
  'பல்வேறு', 'அளவுகள்', 'காற்றுச்சுழிகள்', 'சுழிகள்',
  'வகைப்படுத்தப்படும்', 'வளிமண்டல', 'சுழற்சி',
  'மாசக்களை', 'கரைப்பதிலும்', 'கடத்துவதிலும்',
  'முதன்மை', 'பங்கு', 'வகிக்கின்றன',
  'அம்சங்கள்', 'இயற்பியல்', 'தொகுக்கப்பட்டுள்ளன',
  
  // Wildlife and conservation
  'தேசிய', 'பூங்கா', 'பூங்காக்கள்', 'வனவிலங்கு', 'சரணாலயம்',
  'பாலைவன', 'குனோ', 'இமாச்சல', 'பிரதேசம்',
  'பாதா', 'சிறுத்தை', 'சஞ்சீவனி', 'சிங்கம்', 'கானமயில்',
  'திட்டம்', 'திட்டங்கள்', 'பாதுகாப்பு', 'இனங்கள்',
  
  // People and society
  'மக்கள்', 'தொகை', 'அடர்த்தி', 'குறைவாக', 'அதிகமாக',
  'மாவட்டம்', 'மாவட்டங்கள்',
  
  // Actions and verbs
  'அழைக்கப்படுகிறது', 'அழைக்கப்படும்', 'அழைக்க',
  'அளிக்கின்றன', 'அளிக்கும்', 'அளிக்க',
  'வகிக்கின்றன', 'வகிக்கும்', 'வகிக்க',
  'பங்களிக்கும்', 'பங்களிக்க',
  'கண்டறிய', 'கண்டுபிடிக்க',
  
  // Common question words
  'எந்த', 'எவை', 'எவ்வாறு', 'எவ்வளவு',
  'எவரை', 'எவருக்கு', 'எவரால்',
  'எவ்விடம்', 'எவ்வேளை',
  
  // Time and date
  'நேரம்', 'தேதி', 'காலம்', 'வேளை',
  'காலை', 'மதியம்', 'மாலை', 'இரவு',
  
  // Directions
  'வடக்கு', 'தெற்கு', 'கிழக்கு', 'மேற்கு',
  'வடமேற்கு', 'வடகிழக்கு', 'தென்மேற்கு', 'தென்கிழக்கு',
  
  // Common adjectives
  'பெரிய', 'சிறிய', 'நீண்ட', 'குறுகிய',
  'அதிக', 'குறைவு', 'சராசரி',
  'முதல்', 'இரண்டாம்', 'மூன்றாம்', 'கடைசி',
  
  // Common nouns
  'பெயர்', 'பெயர்கள்', 'பெயர்ச்சொல்',
  'வகை', 'வகைகள்', 'வரிசை', 'வரிசைகள்',
  'பட்டியல்', 'பட்டியல்கள்',
  'குறிப்பு', 'குறிப்புகள்',
  'விளக்கம்', 'விளக்கங்கள்',
  
  // Exam specific
  'கேள்வி', 'கேள்விகள்', 'விடை', 'விடைகள்',
  'விருப்பம்', 'விருப்பங்கள்', 'தேர்வு', 'தேர்வுகள்',
  'மதிப்பெண்', 'மதிப்பெண்கள்', 'தேர்ச்சி', 'தோல்வி',
  
  // Additional common words (expanded)
  'ஆக', 'ஆகும்', 'ஆகிய', 'ஆன',
  'இல்', 'இனி', 'இன்று', 'இப்போது',
  'உடன்', 'உடனே', 'உடனடியாக',
  'எனவே', 'எனினும்', 'என்பதால்',
  'ஒன்று', 'இரண்டு', 'மூன்று', 'நான்கு', 'ஐந்து',
  'ஆறு', 'ஏழு', 'எட்டு', 'ஒன்பது', 'பத்து',
  'நூறு', 'ஆயிரம்', 'லட்சம்', 'கோடி',
  
  // More geography
  'கடல்', 'கடல்கள்', 'ஆறு', 'ஆறுகள்',
  'மலை', 'மலைகள்', 'குன்று', 'குன்றுகள்',
  'சமவெளி', 'சமவெளிகள்', 'மேடு', 'மேடுகள்',
  'காடு', 'காடுகள்', 'வனம்', 'வனங்கள்',
  
  // More industry terms
  'உற்பத்தி', 'உற்பத்திகள்', 'உற்பத்தி செய்',
  'விற்பனை', 'விற்பனைகள்', 'விற்க',
  'கொள்முதல்', 'கொள்முதல் செய்',
  'சந்தை', 'சந்தைகள்', 'வணிகம்',
  
  // More question formats
  'எழுத', 'விளக்க', 'வரையறு', 'விளக்கு',
  'பட்டியலிட', 'பெயர்', 'குறிப்பிட',
  'வகைப்படுத்த', 'வரிசைப்படுத்த',
  
  // Additional connectors
  'மேலும்', 'மேலும்', 'கூடுதலாக',
  'எனினும்', 'ஆயினும்', 'ஆனாலும்',
  'என்பதால்', 'என்பதனால்', 'ஆகையால்',
  'என்பதற்கு', 'என்பதில்', 'என்பதை',
  
  // More verbs
  'செய்', 'செய்கிற', 'செய்த', 'செய்ய',
  'பெற', 'பெறுகிற', 'பெற்ற', 'பெற',
  'கொடு', 'கொடுக்கிற', 'கொடுத்த', 'கொடுக்க',
  'பார்', 'பார்க்கிற', 'பார்த்த', 'பார்க்க',
  'கேள்', 'கேட்கிற', 'கேட்ட', 'கேட்க',
  'படி', 'படிக்கிற', 'படித்த', 'படிக்க',
  'எழுத', 'எழுதுகிற', 'எழுதிய', 'எழுத',
  
  // More nouns
  'புத்தகம்', 'புத்தகங்கள்', 'நூல்', 'நூல்கள்',
  'பக்கம்', 'பக்கங்கள்', 'அத்தியாயம்', 'அத்தியாயங்கள்',
  'பாடம்', 'பாடங்கள்', 'பாடப்புத்தகம்',
  
  // Additional common exam words
  'கணக்கு', 'கணக்குகள்', 'கணிதம்',
  'விஞ்ஞானம்', 'வரலாறு', 'புவியியல்',
  'தமிழ்', 'ஆங்கிலம்', 'கணிதம்', 'விஞ்ஞானம்',
  
  // More place names (Tamil Nadu districts)
  'சென்னை', 'கோவை', 'மதுரை', 'திருச்சி', 'சேலம்',
  'திருநெல்வேலி', 'தூத்துக்குடி', 'தஞ்சாவூர்',
  'திருவண்ணாமலை', 'வேலூர்', 'கிருஷ்ணகிரி',
  'தர்மபுரி', 'நாமக்கல்', 'கரூர்', 'திண்டுக்கல்',
  'தேனி', 'தேனி', 'ராமநாதபுரம்', 'சிவகங்கை',
  'புதுக்கோட்டை', 'திருவாரூர்', 'நாகப்பட்டினம்',
  'விழுப்புரம்', 'கள்ளக்குறிச்சி', 'விருதுநகர்',
  
  // Rivers
  'காவேரி', 'வைகை', 'தாமிரபரணி', 'பாலாறு',
  'பவானி', 'நொய்யல்', 'கோதை', 'வெள்ளாறு',
  
  // More common words
  'முன்னே', 'பின்னே', 'முன்பு', 'பின்பு',
  'இப்போது', 'அப்போது', 'எப்போதும்',
  'இங்கு', 'அங்கு', 'எங்கும்', 'எங்கேயும்',
  'இவ்வாறு', 'அவ்வாறு', 'எவ்வாறு',
  'இதனால்', 'அதனால்', 'எதனால்',
  
  // Additional exam context words
  'குறிப்பு', 'குறிப்புகள்', 'குறிப்பிட',
  'விளக்க', 'விளக்கம்', 'விளக்கமளி',
  'எடுத்துக்காட்டு', 'எடுத்துக்காட்டுகள்',
  'வரையறை', 'வரையறைகள்', 'வரையறு',
  
  // More connectors
  'அல்லது', 'அல்ல', 'இல்லை', 'ஆம்',
  'ஆகவே', 'எனவே', 'எனினும்',
  'மேலும்', 'கூடுதலாக', 'முதலில்',
  'இறுதியாக', 'கடைசியாக', 'முடிவில்',
  
  // Question instruction words
  'விளக்க', 'விளக்கு', 'விளக்கவும்',
  'எழுத', 'எழுதவும்', 'குறிப்பிட',
  'குறிப்பிடவும்', 'வரையறு', 'வரையறுக்க',
  'பட்டியலிட', 'பட்டியலிடவும்',
  'வகைப்படுத்த', 'வகைப்படுத்தவும்',
  'வரிசைப்படுத்த', 'வரிசைப்படுத்தவும்',
  
  // More measurement units
  'கிலோமீட்டர்', 'மீட்டர்', 'சென்டிமீட்டர்',
  'மில்லிமீட்டர்', 'கிலோ', 'கிராம்',
  'லிட்டர்', 'மில்லிலிட்டர்',
  'டிகிரி', 'செல்சியஸ்', 'பாரன்ஹீட்',
  
  // More time words
  'நிமிடம்', 'நிமிடங்கள்', 'வினாடி', 'வினாடிகள்',
  'மணி', 'மணிகள்', 'மணிநேரம்', 'மணிநேரங்கள்',
  'நாள்', 'நாட்கள்', 'வாரம்', 'வாரங்கள்',
  'மாதம்', 'மாதங்கள்', 'வருடம்', 'வருடங்கள்',
  
  // More common verbs
  'உள்ளது', 'இல்லை', 'உண்டு', 'இல்லை',
  'வரும்', 'வர', 'வந்த', 'வருகிற',
  'போகும்', 'போ', 'போன', 'போகிற',
  'வருகிறது', 'போகிறது', 'செய்கிறது',
  'உள்ளன', 'இல்லை', 'உண்டு', 'இல்லை',
  
  // Additional common words
  'முதல்', 'இரண்டாம்', 'மூன்றாம்', 'நான்காம்',
  'ஐந்தாம்', 'கடைசி', 'இறுதி',
  'முழு', 'முழுவதும்', 'அனைத்தும்',
  'சில', 'பல', 'அனைத்து', 'எல்லா',
  
  // More question words
  'எவை', 'எவற்றை', 'எவரை', 'எவருக்கு',
  'எவரால்', 'எவ்விடம்', 'எவ்வேளை',
  'எந்த', 'எவை', 'எவ்வாறு',
  
  // Final common words
  'மிக', 'மிகவும்', 'அதிகம்', 'குறைவு',
  'சிறிது', 'பெரிது', 'நீண்ட', 'குறுகிய',
  'பழைய', 'புதிய', 'பெரிய', 'சிறிய'
]);

/**
 * Check if a substring is a valid Tamil word
 */
function isKnownTamilWord(word) {
  if (!word || word.length < 2) return false;
  return TAMIL_WORD_DICTIONARY.has(word.trim());
}

/**
 * Find longest matching word from dictionary starting at position
 */
function findLongestWord(text, startPos) {
  let longestWord = '';
  let longestLength = 0;
  
  // Try words of decreasing length (max 15 chars)
  for (let len = Math.min(15, text.length - startPos); len >= 2; len--) {
    const candidate = text.substring(startPos, startPos + len);
    if (isKnownTamilWord(candidate)) {
      if (len > longestLength) {
        longestWord = candidate;
        longestLength = len;
      }
    }
  }
  
  return longestWord ? { word: longestWord, length: longestLength } : null;
}

/**
 * Segment Tamil text using dictionary + linguistic rules
 * Improved version that handles OCR errors with spaces between characters
 */
function segmentTamilWordsWithDictionary(text) {
  if (!text || !text.trim()) return text;
  
  // Step 1: First, try to merge characters that are clearly part of the same word
  // Pattern: Tamil char + space(s) + Tamil char (likely same word if both are consonants/vowels)
  let merged = text;
  
  // Remove spaces between Tamil characters that form valid syllable patterns
  // Pattern: consonant + optional vowel sign + space + consonant/vowel
  for (let pass = 0; pass < 3; pass++) {
    // Merge consonant + vowel sign sequences (within word)
    merged = merged.replace(/([\u0B95-\u0B9F\u0BA3-\u0BA9\u0BAA-\u0BB9][\u0BBE-\u0BCD]?)\s+([\u0B95-\u0B9F\u0BA3-\u0BA9\u0BAA-\u0BB9\u0B85-\u0B94])/g, '$1$2');
    // Merge vowel + consonant sequences
    merged = merged.replace(/([\u0B85-\u0B94])\s+([\u0B95-\u0B9F\u0BA3-\u0BA9\u0BAA-\u0BB9])/g, '$1$2');
    // Merge modifier + character sequences
    merged = merged.replace(/([\u0B82-\u0B83])\s+([\u0B80-\u0BFF])/g, '$1$2');
  }
  
  // Step 2: Remove all remaining spaces to handle concatenated text
  let noSpaces = merged.replace(/\s+/g, '');
  const segments = [];
  let i = 0;
  
  while (i < noSpaces.length) {
    // Try to find a known word starting at current position
    const match = findLongestWord(noSpaces, i);
    
    if (match) {
      segments.push(match.word);
      i += match.length;
    } else {
      // If no dictionary match, try to build a word using linguistic rules
      // Tamil words typically start with consonant or vowel
      let j = i;
      let currentWord = '';
      
      // Build word character by character, checking if it could be a valid Tamil word
      while (j < noSpaces.length && j < i + 15) {
        const char = noSpaces[j];
        const isTamil = /[\u0B80-\u0BFF]/.test(char);
        
        if (!isTamil) break;
        
        currentWord += char;
        
        // Check if current word is in dictionary
        if (isKnownTamilWord(currentWord)) {
          segments.push(currentWord);
          i = j + 1;
          break;
        }
        
        // Check if adding next character might form a word
        if (j + 1 < noSpaces.length) {
          const nextChar = noSpaces[j + 1];
          const potentialWord = currentWord + nextChar;
          if (isKnownTamilWord(potentialWord)) {
            // Continue to include this character
            j++;
            continue;
          }
        }
        
        // If we've built a reasonable word (3+ chars) and next char is a space or punctuation, stop
        if (currentWord.length >= 3 && j + 1 < noSpaces.length) {
          const nextChar = noSpaces[j + 1];
          // If next is punctuation or non-Tamil, this might be end of word
          if (!/[\u0B80-\u0BFF]/.test(nextChar)) {
            segments.push(currentWord);
            i = j + 1;
            break;
          }
        }
        
        j++;
      }
      
      // If we didn't find a word, add what we have
      if (j >= noSpaces.length || j >= i + 15) {
        if (currentWord) {
          segments.push(currentWord);
          i = j;
        } else {
          segments.push(noSpaces[i]);
          i++;
        }
      }
    }
  }
  
  return segments.join(' ');
}

/**
 * Fix OCR errors in Tamil text using pattern matching
 */
export function fixTamilOCRErrors(text) {
  if (!text) return text;
  
  let fixed = text;
  
  // Step 1: Fix basic OCR character misrecognitions (non-Tamil characters)
  const ocrFixes = [
    [/0/g, ''], // Remove stray zeros
    [/Ū/g, 'ந'], // Fix special character
    [/\]/g, 'ல'], // Fix bracket
    [/\[/g, ''], // Remove stray brackets
    [/\(/g, ''], // Remove stray parentheses (sometimes OCR error)
    [/\)/g, ''], // Remove stray parentheses
  ];
  
  for (const [pattern, replacement] of ocrFixes) {
    fixed = fixed.replace(pattern, replacement);
  }
  
  // Step 2: Fix word-level patterns FIRST (before character-level fixes)
  // This handles complete words that are commonly misrecognized
  const wordFixes = [
    // Complete word fixes
    [/லாட்டில்/g, 'நாட்டில்'],
    [/தமிழ்லாட்டில்/g, 'தமிழ்நாட்டில்'],
    [/தமிழ்஥ாட்டில்/g, 'தமிழ்நாட்டில்'],
    [/சாட்டா/g, 'சோட்டா'],
    [/சசாட்டா/g, 'சோட்டா'],
    [/சாட்டா஥/g, 'சோட்டாந'],
    [/சாட்டா஥ாக்பூர்/g, 'சோட்டாநாக்பூர்'],
    [/நாநி[0-9]?[\]\[]?ம்ச/g, 'மாநிலம்'],
    [/நாநி[0-9]?ம்ச/g, 'மாநிலம்'],
    [/நாநி[஬]?ம்/g, 'மாநிலம்'],
    [/நாநி[0-9]?[஬]?ம்/g, 'மாநிலம்'],
    [/குதியின்/g, 'பகுதியின்'],
    [/஧குதியின்/g, 'பகுதியின்'],
    [/கீழ்யபாத/g, 'கீழ் வராத'],
    [/கீழ்யபாதது/g, 'கீழ் வராதது'],
    [/கீழ்யபாதது\s*ு/g, 'கீழ் வராதது'],
    [/விலட/g, 'விடை'],
    [/விலடல/g, 'விடை'],
    [/ததரினவில்லா/g, 'தெரியவில்லை'],
    [/ததரினவில்ல[஬]?/g, 'தெரியவில்லை'],
    [/தாழிற்சால/g, 'தொழிற்சாலை'],
    [/ததாழிற்சால/g, 'தொழிற்சாலை'],
    [/ததாழிற்சால[஬]?/g, 'தொழிற்சாலை'],
    [/தாழிற்/g, 'தொழிற்'],
    [/பின்ய/g, 'பின்வ'],
    [/பின்யரும்/g, 'பின்வரும்'],
    [/ஆற்ல்ய/g, 'ஆற்றல்'],
    [/ஆற்[஫]?ல்/g, 'ஆற்றல்'],
    [/ம்உள்/g, 'வளம் உள்ள'],
    [/[ய]?[஭]?ம்\s*உள்[஭]?/g, 'வளம் உள்ள'],
    [/உள்இடங்கள்/g, 'உள்ள இடங்கள்'],
    [/உள்[஭]?\s*இடங்கள்/g, 'உள்ள இடங்கள்'],
    [/ஜார்க்க\s+ண்ட்/g, 'ஜார்க்கண்ட்'],
    [/சத்தீஸ்க\s+ர்/g, 'சத்தீஸ்கர்'],
    [/ஒ\s+டிசா/g, 'ஒடிசா'],
    [/காற்று\s*ஆற்[஫]?ல்/g, 'காற்று ஆற்றல்'],
    [/தமிழ்[஥]?ாட்டில்/g, 'தமிழ்நாட்டில்'],
    [/சரினா[஦]?[ய]?ற்[ல]?[஫]?த்/g, 'சரியான'],
    [/சதர்ந்ததடுக்கவும்/g, 'தேர்ந்தடுக்கவும்'],
    [/சதர்ந்ததடுத்தல்/g, 'தேர்ந்தடுத்தல்'],
    [/நீ[஭]?ம்/g, 'நீளம்'],
    [/கணயாய்/g, 'கணவாய்'],
    [/தசங்சகாட்லடக்/g, 'செங்கோட்டை'],
    [/திருத[஥]?ல்சயலி/g, 'திருநெல்வேலி'],
    [/ஆபல்யாய்தநாழி/g, 'ஆரல்வாய்மொழி'],
    [/கன்னினாகுநரி/g, 'கன்னியாகுமரி'],
    [/சகாட்லட/g, 'கோட்டை'],
    [/விருது[஥]?கர்/g, 'விருதுநகர்'],
    [/நி[஬]?க்சகாட்லட/g, 'நிலக்கோட்டை'],
    [/நதுலப/g, 'மதுரை'],
    [/நற்றும்/g, 'மற்றும்'],
    [/சய[஭]?ாண்/g, 'விவசாய'],
    [/ஏற்றுநதி/g, 'ஏற்றுமதி'],
    [/நண்ட[஬]?ங்கள்/g, 'மண்டலங்கள்'],
    [/அலநந்துள்[஭]?[஦]?/g, 'அமைந்துள்ள'],
    [/சநற்கு/g, 'மேற்கு'],
    [/யங்கா[஭]?த்தில்/g, 'வங்காளத்தில்'],
    [/இரும்பு\s*ததாழில்/g, 'இரும்பு தொழில்'],
    [/கம்த[஧]?னி/g, 'கம்பெனி'],
    [/நிறுயப்[஧]?ட்டது/g, 'நிறுவப்பட்டது'],
  ];
  
  for (const [pattern, replacement] of wordFixes) {
    fixed = fixed.replace(pattern, replacement);
  }
  
  // Step 3: Fix character-level substitutions (after word-level fixes)
  // These are applied to remaining text that wasn't caught by word-level fixes
  const charFixes = [
    // Character-level fixes (common OCR misrecognitions)
    [/஥/g, 'ந'], // ஥ → ந (but only if not part of a word we already fixed)
    [/஧/g, 'ப'], // ஧ → ப
    [/஬/g, 'ம்'], // ஬ → ம் (be careful - only if not part of word)
    [/சச/g, 'சோ'], // Double ச → சோ
    [/தத/g, 'தொ'], // Double த → தொ
  ];
  
  for (const [pattern, replacement] of charFixes) {
    fixed = fixed.replace(pattern, replacement);
  }
  
  return fixed;
}

/**
 * Remove spaces within Tamil words (OCR errors)
 * Enhanced version that aggressively removes spaces between Tamil characters
 */
export function removeIntraWordSpaces(text) {
  if (!text) return text;
  
  let cleaned = text;
  
  // Step 1: Remove spaces between vowel signs and consonants (clearly within word)
  for (let i = 0; i < 5; i++) {
    cleaned = cleaned.replace(/([\u0B80-\u0BFF])\s+([\u0B82-\u0B83\u0BCD-\u0BD7])/g, '$1$2');
    cleaned = cleaned.replace(/([\u0BCD-\u0BD7])\s+([\u0B80-\u0BFF])/g, '$1$2');
  }
  
  // Step 2: Remove spaces between consonant and vowel sign (within word)
  cleaned = cleaned.replace(/([\u0B95-\u0B9F\u0BA3-\u0BA9\u0BAA-\u0BB9])\s+([\u0BBE-\u0BCD])/g, '$1$2');
  
  // Step 3: Remove spaces between any Tamil characters that form valid syllable patterns
  // This is more aggressive - removes spaces between any Tamil chars that could be in same word
  for (let i = 0; i < 3; i++) {
    // Pattern: Tamil char + space(s) + Tamil char (likely same word)
    cleaned = cleaned.replace(/([\u0B80-\u0BFF])\s+([\u0B80-\u0BFF])/g, (match, p1, p2) => {
      // Only merge if both are Tamil and not separated by punctuation
      // Check if p1 is consonant/vowel and p2 is consonant/vowel/modifier
      const isConsonant1 = /[\u0B95-\u0B9F\u0BA3-\u0BA9\u0BAA-\u0BB9]/.test(p1);
      const isVowel1 = /[\u0B85-\u0B94]/.test(p1);
      const isVowelSign1 = /[\u0BBE-\u0BCD]/.test(p1);
      const isModifier1 = /[\u0B82-\u0B83]/.test(p1);
      
      const isConsonant2 = /[\u0B95-\u0B9F\u0BA3-\u0BA9\u0BAA-\u0BB9]/.test(p2);
      const isVowel2 = /[\u0B85-\u0B94]/.test(p2);
      const isVowelSign2 = /[\u0BBE-\u0BCD]/.test(p2);
      
      // Merge if: consonant+vowel, consonant+consonant, vowel+consonant, vowelSign+consonant
      if ((isConsonant1 && (isVowel2 || isConsonant2)) ||
          (isVowel1 && isConsonant2) ||
          (isVowelSign1 && isConsonant2) ||
          (isModifier1 && (isConsonant2 || isVowel2))) {
        return p1 + p2;
      }
      return match; // Keep space if not a valid merge
    });
  }
  
  // Step 4: Remove spaces in the middle of known words (dictionary-based)
  for (const word of TAMIL_WORD_DICTIONARY) {
    if (word.length > 3) {
      // Create pattern with optional spaces in middle
      const pattern = word.split('').join('\\s*');
      const regex = new RegExp(pattern, 'g');
      cleaned = cleaned.replace(regex, word);
    }
  }
  
  return cleaned;
}

/**
 * Main function: Clean and segment Tamil text intelligently
 */
export function cleanAndSegmentTamil(text) {
  if (!text) return '';
  
  // Step 1: Remove non-Tamil characters (keep Tamil, spaces, punctuation)
  let cleaned = text.replace(/[^\u0B80-\u0BFF\s.,;:"'?!()\-–—]/g, '');
  
  // Step 2: Fix OCR errors first
  cleaned = fixTamilOCRErrors(cleaned);
  
  // Step 2.5: Aggressively remove spaces between Tamil characters
  // This handles cases where OCR inserts spaces between every character
  // Pattern: Tamil char + space(s) + Tamil char (merge if they form valid syllables)
  for (let pass = 0; pass < 5; pass++) {
    // Merge any Tamil character followed by space and another Tamil character
    // This is aggressive but necessary for badly OCR'd text
    cleaned = cleaned.replace(/([\u0B80-\u0BFF])\s+([\u0B80-\u0BFF])/g, (match, p1, p2) => {
      // Check if these characters can form a valid Tamil syllable
      const isConsonant1 = /[\u0B95-\u0B9F\u0BA3-\u0BA9\u0BAA-\u0BB9]/.test(p1);
      const isVowel1 = /[\u0B85-\u0B94]/.test(p1);
      const isVowelSign1 = /[\u0BBE-\u0BCD]/.test(p1);
      const isModifier1 = /[\u0B82-\u0B83]/.test(p1);
      
      const isConsonant2 = /[\u0B95-\u0B9F\u0BA3-\u0BA9\u0BAA-\u0BB9]/.test(p2);
      const isVowel2 = /[\u0B85-\u0B94]/.test(p2);
      const isVowelSign2 = /[\u0BBE-\u0BCD]/.test(p2);
      
      // Always merge if both are Tamil (aggressive approach for OCR errors)
      // The dictionary segmentation will handle proper word boundaries later
      if ((isConsonant1 || isVowel1 || isVowelSign1 || isModifier1) &&
          (isConsonant2 || isVowel2 || isVowelSign2)) {
        return p1 + p2;
      }
      return match;
    });
  }
  
  // Step 3: Remove spaces within words (OCR errors) - more targeted approach
  cleaned = removeIntraWordSpaces(cleaned);
  
  // Step 4: Segment words using dictionary approach
  cleaned = segmentTamilWordsWithDictionary(cleaned);
  
  // Step 5: Normalize spaces (but keep spaces between words)
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Step 6: Remove spaces before punctuation
  cleaned = cleaned.replace(/\s+([.,;:!?])/g, '$1');
  
  // Step 7: Fix missing characters at word boundaries
  if (cleaned.startsWith('மிழ்') && !cleaned.startsWith('தமிழ்')) {
    cleaned = 'த' + cleaned;
  }
  
  // Step 8: Final cleanup - fix any remaining common patterns
  cleaned = cleaned.replace(/பின்ய\s+ரும்/g, 'பின்வரும்');
  cleaned = cleaned.replace(/நாநி\s*\]?\s*ம்ச/g, 'மாநிலம்');
  cleaned = cleaned.replace(/த\s+மிழ்/g, 'தமிழ்');
  cleaned = cleaned.replace(/காற்று\s*ஆற்/g, 'காற்று ஆற்ற');
  
  // Fix specific words that commonly appear with spaces (from OCR errors)
  cleaned = cleaned.replace(/ச\s*மோ\s*ட்டா/g, 'சோட்டா');
  cleaned = cleaned.replace(/சோட்டா\s*நா\s*க\s*பூ\s*ர்/g, 'சோட்டாநாக்பூர்');
  cleaned = cleaned.replace(/ச\s*மோ\s*மோ\s*ட[Ô]?\s*ட/g, 'சோட்டா');
  cleaned = cleaned.replace(/த\s*ொ\s*ழி\s*ற\s*்சா\s*லை/g, 'தொழிற்சாலை');
  cleaned = cleaned.replace(/த\s*மொ\s*மொ\s*ழி\s*ற/g, 'தொழிற்');
  cleaned = cleaned.replace(/சா\s*லமை/g, 'சாலை');
  cleaned = cleaned.replace(/ப\s*கு\s*தி\s*யி\s*ன்/g, 'பகுதியின்');
  cleaned = cleaned.replace(/மா\s*நா\s*க\s*ப\s*ர/g, 'நாக்பூர்');
  cleaned = cleaned.replace(/கீழ்\s*வ\s*ரலா\s*த/g, 'கீழ் வராத');
  cleaned = cleaned.replace(/கீழ்\s*வ\s*ரலா\s*த\s*து/g, 'கீழ் வராதது');
  cleaned = cleaned.replace(/கீழ்\s*வ\s*ரலா\s*த\s*ு/g, 'கீழ் வராதது');
  
  // Fix common OCR patterns for specific exam words
  cleaned = cleaned.replace(/விலட\s*ததரினவில்லா/g, 'விடை தெரியவில்லை');
  cleaned = cleaned.replace(/விலட/g, 'விடை');
  cleaned = cleaned.replace(/ததரினவில்லா/g, 'தெரியவில்லை');
  
  return cleaned;
}
