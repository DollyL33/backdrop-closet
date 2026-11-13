// POST { image: "data:image/jpeg;base64,..." }
// Asks NVIDIA's vision model to list the clothes, shoes and bags in one photo.
import { askForJson, VISION_MODEL } from "../lib/nvidia.js";
import { tooManyRequests } from "../lib/rate-limit.js";

const CATEGORIES = ["top", "bottom", "dress", "outerwear", "shoes", "bag", "accessory"];

const PROMPT = `This is a photo of clothes that someone owns and might pack for a trip.
List only the clothing, shoes, bags and accessories that are the clear subject of the photo.
Ignore anything in the background, half out of frame, furniture, or people's bodies.
A pair of shoes is ONE item.
Choosing the category: "outerwear" is only for coats, jackets, blazers and cardigans that open all the way down the front and are worn over other clothes. A pullover with just a few buttons at the neck (t-shirt, henley, polo, sweater) is a "top".
Fabric: soft stretchy knit with fine vertical ribs is "rib knit", not corduroy (corduroy is stiff woven fabric with raised velvety cords).

Answer with JSON only, in exactly this shape:
{"items":[{"name":"short everyday name, e.g. 'black ribbed henley'","category":"one of ${CATEGORIES.join(", ")}","colour":"main colour in plain words, e.g. 'dusty mauve'","hex":"#RRGGBB for the main colour as it really looks","accent":"accent colour in plain words, or empty string","fabric":"likely fabric, or empty string"}]}
If there is no clothing in the photo, answer {"items":[]}.`;

export async function POST(request) {
  if (tooManyRequests(request, { limit: 60 })) {
    return Response.json({ error: "You've read a lot of photos this hour. Please try again a bit later." }, { status: 429 });
  }
  const { image } = await request.json().catch(() => ({}));
  if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(image)) {
    return Response.json({ error: "Please send one photo as a JPEG, PNG or WebP." }, { status: 400 });
  }
  if (image.length > 3_000_000) {
    return Response.json({ error: "That photo is too large." }, { status: 413 });
  }

  try {
    const answer = await askForJson({
      model: VISION_MODEL,
      maxTokens: 800,
      messages: [{ role: "user", content: [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: image } },
      ] }],
    });
    return Response.json({ items: cleanItems(answer.items ?? answer) });
  } catch (err) {
    console.error("read-clothes:", err.message);
    return Response.json({ error: "We couldn't read that photo. Please try again." }, { status: 502 });
  }
}

// Never trust the model's shape blindly: keep only well-formed fields.
function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  const text = (v, max = 60) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  return items.slice(0, 8).map((it) => ({
    name: text(it.name) || "clothing item",
    category: CATEGORIES.includes(it.category) ? it.category : "top",
    colour: text(it.colour ?? it.color, 40),
    hex: /^#[0-9a-f]{6}$/i.test(it.hex) ? it.hex.toUpperCase() : "#999999",
    accent: text(it.accent, 40),
    fabric: text(it.fabric, 30),
  }));
}
