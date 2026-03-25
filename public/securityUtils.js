/**
 * Safely strips HTML/Script tags from user input before saving to DB
 * or rendering to the DOM.
 */
export function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // Method 1: Use the browser's built-in text parser to strip HTML
    const div = document.createElement('div');
    div.textContent = input;
    let sanitized = div.innerHTML;

    // Method 2: Fallback Regex removal of potentially dangerous tags
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/onerror=/gi, '');
    sanitized = sanitized.replace(/onload=/gi, '');
    
    return sanitized.trim();
}

// Usage Example before saving to Firestore:
// const safeText = sanitizeInput(document.getElementById('reviewText').value);
