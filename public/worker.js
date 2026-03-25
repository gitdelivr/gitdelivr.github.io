export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // 🔒 Security: Restrict Chat API access, but allow public CDN access
    const allowedOrigins = ['https://gitdelivr.in', 'https://gitdelivr.github.io', 'http://localhost:3000', 'http://127.0.0.1:5500'];
    
    // Determine the correct CORS origin based on the route
    let corsOrigin = '*'; // Default to open for CDN endpoints
    if (url.pathname === '/api/chat') {
      corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    // Handle the preflight OPTIONS request globally
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    let response;

    // Route the request to the proper handler
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      response = await handleChatRequest(request, env);
    } else if (url.pathname.match(/^\/(gh|gl|bb)\//)) {
      response = await handleCdnRequest(url, request);
    } else {
      // Pass all other requests to origin server (Firebase)
      response = await fetch(request);
    }

    // Ensure actual responses also contain the CORS headers
    const newResponse = new Response(response.body, response);
    Object.entries(corsHeaders).forEach(([key, value]) => newResponse.headers.set(key, value));
    
    return newResponse;
  }
};

async function handleChatRequest(request, env) {
  try {
    const { message, history = [] } = await request.json();

    // Construct the conversational history array required by Gemini
    const contents = history.map(msg => ({
        role: msg.role, // 'user' or 'model'
        parts: [{ text: msg.text }]
    }));
    
    // Append the current user message
    contents.push({ role: 'user', parts: [{ text: message }] });

    // Build the payload with the System Instruction
    const payload = {
      system_instruction: {
        parts: [{ text: "You are the official support assistant for GitDelivr V3.0. GitDelivr is a Native Edge CDN that allows developers to generate production-ready CDN links directly from GitHub, GitLab, and Bitbucket raw files. You must answer user queries politely, concisely, and only related to web development, CDN, or GitDelivr features. Do not write code unless asked." }]
      },
      contents: contents
    };

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
    
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!geminiResponse.ok) {
      const err = await geminiResponse.text();
      throw new Error(`Gemini API Error: ${err}`);
    }

    const data = await geminiResponse.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't process that.";

    return new Response(JSON.stringify({ reply: replyText }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

async function handleCdnRequest(url, request) {
  try {
    // Extract prefix (gh, gl, bb) and the remaining path
    const prefix = url.pathname.substring(1, 3);
    const path = url.pathname.substring(4);
    
    // Split into [user, repo@branch, ...filePath]
    const parts = path.split('/');
    if (parts.length < 3) {
      return new Response(`Invalid CDN URL format. Expected: /${prefix}/user/repo@branch/file`, { status: 400 });
    }

    const user = parts[0];
    const repoAndBranch = parts[1];
    
    // Handle the @ symbol for branch/version parsing
    let repo, branch;
    if (repoAndBranch.includes('@')) {
      const split = repoAndBranch.split('@');
      repo = split[0];
      branch = split.slice(1).join('@');
    } else {
      repo = repoAndBranch;
      branch = 'main'; // Fallback if no @branch is provided
    }

    const filePath = parts.slice(2).join('/');
    
    // Construct the raw URL based on the source provider
    let rawUrl = '';
    if (prefix === 'gh') {
        rawUrl = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${filePath}`;
    } else if (prefix === 'gl') {
        rawUrl = `https://gitlab.com/${user}/${repo}/-/raw/${branch}/${filePath}`;
    } else if (prefix === 'bb') {
        rawUrl = `https://bitbucket.org/${user}/${repo}/raw/${branch}/${filePath}`;
    }

    // Fetch the raw file from the chosen provider
    const ghResponse = await fetch(rawUrl, {
        headers: { 'User-Agent': 'GitDelivr-Worker' },
        // Instruct Cloudflare to cache this request at the Edge for 24 hours
        cf: {
            cacheEverything: true,
            cacheTtl: 86400
        }
    });

    if (!ghResponse.ok) {
        // Return custom File Not Found message instead of the default Cloudflare 404 page
        return new Response(
            `File Not Found\n\nWe could not find the requested file.\nPlease check the username, repository, branch, and file path.\n\nAttempted to fetch: ${rawUrl}`, 
            { 
                status: 404, 
                headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
            }
        );
    }

    // Map correct Content-Types so browsers execute the JS/CSS instead of downloading it
    const ext = filePath.split('.').pop().toLowerCase();
    const mimeTypes = {
      'js': 'application/javascript; charset=utf-8',
      'mjs': 'application/javascript; charset=utf-8',
      'css': 'text/css; charset=utf-8',
      'json': 'application/json; charset=utf-8',
      'svg': 'image/svg+xml',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'html': 'text/plain; charset=utf-8' // Serve HTML as plain text to prevent XSS
    };

    const contentType = mimeTypes[ext] || ghResponse.headers.get('Content-Type') || 'text/plain';

    // Duplicate the response headers so we can modify them
    const responseHeaders = new Headers(ghResponse.headers);
    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Cache-Control', 'public, max-age=86400'); // Cache at the Edge for 24 hours

    // Remove security headers GitHub sets that block script execution
    responseHeaders.delete('Content-Security-Policy');
    responseHeaders.delete('X-Content-Type-Options');

    return new Response(ghResponse.body, {
        status: 200,
        statusText: 'OK',
        headers: responseHeaders
    });

  } catch (err) {
    return new Response('CDN Worker Error: ' + err.message, { status: 500 });
  }
}