// Talks to NVIDIA's AI models (build.nvidia.com). The key stays on the server.
const BASE = "https://integrate.api.nvidia.com/v1";

export const VISION_MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b";

// Sends messages to a model and returns its reply as parsed JSON.
export async function askForJson({ model, messages, maxTokens = 1500, temperature = 0.2 }) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY is missing. Add it to .env.local (or Vercel's settings).");

  const response = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      // Nemotron is a "thinking" model. Thinking makes it slow and can use up
      // every token before it answers, so we switch it off.
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(55_000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`NVIDIA returned ${response.status}: ${detail.slice(0, 300)}`);
  }
  const text = (await response.json()).choices?.[0]?.message?.content;
  if (!text) throw new Error("NVIDIA sent back an empty answer.");
  return parseJson(text);
}

// Models sometimes wrap JSON in ```json fences, add a sentence around it,
// or even repeat it. Read just the first complete JSON object or array.
function parseJson(text) {
  const start = text.search(/[[{]/);
  if (start === -1) throw new Error("The model's answer wasn't JSON.");
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      if (--depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("The model's answer was cut off before the JSON finished.");
}
