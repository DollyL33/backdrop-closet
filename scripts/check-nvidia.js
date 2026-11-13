// Checks your NVIDIA key, lists the vision models you can use,
// and (if you pass a photo) asks one to describe the clothes in it.
//   npm run check                         -> key check + model list
//   npm run check -- samples/shirt.jpg    -> also test a photo
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const key = process.env.NVIDIA_API_KEY;
if (!key || !key.startsWith("nvapi-")) {
  console.error("No NVIDIA key found. Paste it into .env.local after NVIDIA_API_KEY= (it starts with nvapi-).");
  process.exit(1);
}
const BASE = "https://integrate.api.nvidia.com/v1";
const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const res = await fetch(`${BASE}/models`, { headers });
if (!res.ok) { console.error("Key check failed:", res.status, await res.text()); process.exit(1); }
const ids = (await res.json()).data.map((m) => m.id);
const vision = ids.filter((id) => /vision|vl|multimodal|maverick|scout|gemma-3|nemotron-nano.*vl/i.test(id));
console.log(`Key works. ${ids.length} models available.`);
console.log("Likely vision models:\n  " + (vision.join("\n  ") || "(none matched)"));

const photo = process.argv[2];
if (!photo) process.exit(0);

const model = process.argv[3] || vision[0];
const mime = { ".png": "image/png", ".webp": "image/webp" }[extname(photo).toLowerCase()] || "image/jpeg";
const b64 = (await readFile(photo)).toString("base64");
console.log(`\nAsking ${model} about ${photo}...`);
const t0 = Date.now();
const r = await fetch(`${BASE}/chat/completions`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    model,
    max_tokens: 600,
    temperature: 0.2,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "List every clothing item, pair of shoes and bag in this photo. For each give: type, main colour (plain words like 'rust orange'), a hex colour code, fabric if visible. Answer as a JSON array only." },
        { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
      ],
    }],
  }),
});
if (!r.ok) { console.error("Vision call failed:", r.status, await r.text()); process.exit(1); }
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)}s)\n` + (await r.json()).choices[0].message.content);
