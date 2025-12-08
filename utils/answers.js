
export function extractAnswers(text) {
  const tamilToEnglishMap = {
    'அ': 'A',
    'ஆ': 'B',
    'இ': 'C',
    'ஈ': 'D'
  };

  const answers = [];
  const lines = text.split(/\r?\n/);
  for (let line of lines) {
    const match = line.match(/^\s*(\d+)[.)]?\s*([A-Dஅஆஇஈ])\b/);
    if (match) {
      const char = match[2];
      const mapped = tamilToEnglishMap[char] || char;
      answers[parseInt(match[1], 10) - 1] = ['A', 'B', 'C', 'D'].includes(mapped) ? mapped : 'A';
    }
  }

  if (answers.length === 0) {
    const fallbackMatches = (text.match(/\b[A-Dஅஆஇஈ]\b/g) || []).slice(0, 1000);
    return fallbackMatches.map(c => tamilToEnglishMap[c] || c);
  }

  return answers;
}
