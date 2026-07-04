import { GoogleGenerativeAI } from '@google/generative-ai';

// The Edge config block has been completely removed.
// Vercel will automatically use the full Node.js Serverless runtime.

export default async function handler(req, res) {
  // Allow cross-origin requests from the Chrome extension
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Vercel's Node.js runtime automatically parses JSON into req.body
    const { history } = req.body;

    if (!history || !Array.isArray(history)) {
      return res.status(400).json({ error: 'Bad Request: Missing or invalid history array' });
    }

    // Initialize Gemini API
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

    // Format history for Gemini (excluding the very last message)
    const geminiHistory = history.slice(0, -1).map(msg => ({
      role: msg.role === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const currentMessage = history[history.length - 1].content;

    // Start chat with history
    const chat = model.startChat({
      history: geminiHistory,
    });

    // Send the current message
    const result = await chat.sendMessage(currentMessage);
    const responseText = result.response.text();

    return res.status(200).json({ text: responseText });

  } catch (error) {
    console.error('Error in Gemini API route:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
