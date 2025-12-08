import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function extractQAWithAI(qText, aText) {
  const prompt = `
You are an exam parser.
Extract questions and answers from the following text.

Return as JSON array with this format:

[
  {
    "questionNumber": 1,
    "questionText": "...",
    "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
    "correctOption": "A",
    "hasImage": false,
    "questionType": "mcq"
  }
]

Question PDF Text:
${qText}

Answer PDF Text:
${aText}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
  });

  const content = response.choices[0].message.content;

  try {
    return JSON.parse(content);
  } catch (err) {
    console.error("❌ AI JSON parsing failed:", err);
    return [];
  }
}
