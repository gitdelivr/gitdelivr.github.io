exports.handler = async function (event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "ok" };
  }

  try {
    if (!event.body) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "No data received" }) };
    }
    
    const requestBody = JSON.parse(event.body);
    const { prompt, history } = requestBody;

    if (!prompt && !history) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Prompt is missing" }) };
    }

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Server API Key missing" }) };
    }

    const finalContent = history 
      ? `${history}\nUser: ${prompt}\nAssistant:` 
      : prompt;

    // --- CHANGE IS HERE: Switched to gemini-1.5-flash ---
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: finalContent }] }],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API Error:", data);
      // Pass the specific error message back to the frontend
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: data.error?.message || "Quota exceeded or API Error" }),
      };
    }

    const aiText = data.candidates[0].content.parts[0].text;
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ response: aiText }),
    };

  } catch (error) {
    console.error("Function Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
