import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
  runtime: 'edge',
};

function parseDataUrlImage(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    return null;
  }

  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    data: match[2],
  };
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { history, screenshotDataUrl } = await req.json();

    if (!history || !Array.isArray(history)) {
      return new Response('Bad Request: Missing or invalid history array', { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY is not set in environment variables');
      return new Response(JSON.stringify({ error: 'Server configuration error: Missing API key' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const geminiHistory = history.slice(0, -1).map((msg) => ({
      role: msg.role === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const currentMessage = history[history.length - 1].content;
    const screenshotImage = parseDataUrlImage(screenshotDataUrl);

    const chat = model.startChat({
      history: geminiHistory,
    });

    const messageParts = [{ text: currentMessage }];
    if (screenshotImage) {
      messageParts.push({
        inlineData: {
          mimeType: screenshotImage.mimeType,
          data: screenshotImage.data,
        },
      });
      messageParts.push({
        text: 'The attached image is the current shared screen snapshot. Use it as live visual context.',
      });
    }

    const result = await chat.sendMessage(messageParts);
    const responseText = result.response.text();

    return new Response(JSON.stringify({ text: responseText }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Error in Gemini API route:', error);
    console.error('Error details:', error.message, error.stack);
    return new Response(JSON.stringify({ error: 'Internal Server Error: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
