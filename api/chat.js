import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { history } = await req.json();

    if (!history || !Array.isArray(history)) {
      return new Response('Bad Request: Missing or invalid history array', { status: 400 });
    }

    // Initialize Gemini API
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

    // Format history for Gemini (excluding the very last message which is the current prompt)
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

    return new Response(JSON.stringify({ text: responseText }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Optional: Configure CORS if extension is not using background proxy
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Error in Gemini API route:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
