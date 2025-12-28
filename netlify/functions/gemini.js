exports.handler = async function (event, context) {
  // 1. Setup CORS Headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // 2. Handle Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "ok" };
  }

  try {
    // 3. Parse Body
    if (!event.body) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "No data received" }) };
    }
    
    const requestBody = JSON.parse(event.body);
    const { prompt, history } = requestBody;

    if (!prompt && !history) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Prompt is missing" }) };
    }

    // 4. Get Key
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Server API Key missing" }) };
    }

    const finalContent = history 
      ? `${history}\nUser: ${prompt}\nAssistant:` 
      : prompt;

    // --- FIX: Use Stable v1 Endpoint + gemini-1.5-flash ---
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: finalContent }] }],
        }),
      }
    );

    const data = await response.json();

    // 5. Handle Errors
    if (!response.ok) {
      console.error("Gemini API Error:", data);
      
      // Fallback: If 1.5-flash fails, suggest gemini-pro (older but reliable)
      const errorMsg = data.error?.message || "API Error";
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: `Google API Error: ${errorMsg}` }),
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
