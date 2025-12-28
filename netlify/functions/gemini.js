exports.handler = async function (event, context) {
  // 1. Handle CORS (So your website can talk to this function)
  const headers = {
    "Access-Control-Allow-Origin": "*", // Allow all origins (or change to your specific URL)
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // 2. Handle Preflight Request (Browser security check)
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "ok" };
  }

  try {
    // 3. Parse the incoming request body safely
    if (!event.body) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "No data received" }) };
    }
    
    const requestBody = JSON.parse(event.body);
    const { prompt, history } = requestBody;

    if (!prompt && !history) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Prompt is missing" }) };
    }

    // 4. Get API Key securely
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
      console.error("Missing GEMINI_API_KEY env var");
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Server API Key missing" }) };
    }

    // 5. Build the content for Gemini
    const finalContent = history 
      ? `${history}\nUser: ${prompt}\nAssistant:` 
      : prompt;

    // 6. Call Google Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
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
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: data.error?.message || "Gemini API Error" }),
      };
    }

    // 7. Success
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
