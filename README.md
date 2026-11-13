# Backdrop Closet

**Pack from what you own.**

Photograph your clothes, tell Closet where you're going and when, and it styles every top photo spot of your trip using only the clothes you already have, for the real weather on your dates.

Built for **CRC Hacks** (November 9–17, 2026).

## The problem

The night before a trip, most of us stand in front of the wardrobe and guess. Then we come home with photos where the shirt matches the wall, or we're cold in a dress chosen for "summer". Packing apps make generic lists, and style apps push you to buy new clothes. Nobody tells you which of *your* clothes will look good *at that place*, in *that weather*.

## Who it helps

Everyday travellers who care about their photos but don't want to shop for a trip: students, friends on a group trip, couples on a honeymoon, anyone packing a carry-on.

## How it works

1. **Your trip.** Type a destination and pick it from real places (Open-Meteo Geocoding). Choose your dates, who's dressing, and a style or two.
2. **Real weather.** Closet fetches the daily forecast for trips within 16 days (Open-Meteo Forecast). For trips further ahead, it averages the same dates over the last 3 years (Open-Meteo Historical Weather) and labels it clearly as *typical*, not a forecast.
3. **Your clothes.** Upload photos. Each photo is shrunk and turned upright in the browser, then **NVIDIA Nemotron 3.5 Super VL** (a vision-language model) names every piece, its type, colour and fabric. You can fix anything it gets wrong, or add pieces by hand.
4. **Your outfits.** **NVIDIA Nemotron 3 Ultra** receives the trip, the weather and your closet, and returns 4 photo spots. For each one:
   - the backdrop's colours (walls, sea, stone, sky),
   - an outfit made **only from your pieces**, chosen to stand out against that backdrop,
   - which of your pieces would blend in there,
   - the best time of day for the light,
   - a weather tip, and any local dress rule.
5. **Your suitcase.** A packing list of the pieces you'll actually wear, extras worth bringing, and gaps you could fill by packing or borrowing something similar. Closet never tells you to buy anything.

Each outfit is shown as a **flat-lay**: your own clothing photos laid out on a table painted in that spot's backdrop colours.

No clothes to hand? **Try a sample closet** loads 12 stock photos, which go through the same NVIDIA calls as a real upload.

## APIs, AI and technologies

| What | Used for |
|---|---|
| **NVIDIA API Catalog** (build.nvidia.com) | Hosted AI models |
| NVIDIA **Nemotron 3.5 Super VL** (`nvidia/nemotron-3.5-super-vl-120b-a12b`) | Reading clothes from photos; backup stylist |
| NVIDIA **Nemotron 3 Ultra** (`nvidia/nemotron-3-ultra-550b-a55b`) | The stylist: photo spots, outfits, tips |
| **Open-Meteo** Geocoding, Forecast and Historical Weather APIs | Real places and weather (free, no key) |
| Plain HTML, CSS and JavaScript | The page (no framework) |
| Node.js serverless functions on **Vercel** | The backend that holds the API key |
| **Pexels** | Sample closet photos (see [CREDITS.md](CREDITS.md)) |

## Making the AI trustworthy

- **Only your clothes.** The server checks every piece the model returns against your closet and drops anything invented.
- **Complete outfits.** If the model forgets shoes, the app adds a pair from your closet.
- **Honest weather.** Real data from Open-Meteo, never the model's guess, and "typical" is labelled as typical.
- **Respectful.** The stylist never comments on bodies and never pushes shopping. Dress rules are worded as "usually required; check signs on the day".
- **Resilient.** If NVIDIA is busy, photo reading retries, and styling falls back from Ultra to the faster Super model.
- **Private.** Nothing is saved. Your photos stay in your browser; only the names and colours of your pieces are sent for styling.

## Run it yourself

You need [Node.js](https://nodejs.org) 20 or newer and a free NVIDIA API key from [build.nvidia.com](https://build.nvidia.com) (sign in, then **Get API Key**).

```bash
cp .env.example .env.local     # then paste your key after NVIDIA_API_KEY=
npm run dev                    # open http://localhost:3000
```

There are no packages to install. To check your key and see which vision models your account can use:

```bash
npm run check
npm run check -- path/to/photo.jpg    # also asks the model to read one photo
```

## Project layout

```
public/            the page: index.html, styles.css, app.js, sample-closet/ photos
api/               backend functions
  read-clothes.js    photo -> list of pieces (NVIDIA vision)
  places.js          search text -> matching places (Open-Meteo)
  weather.js         place + dates -> forecast or typical weather (Open-Meteo)
  style-trip.js      trip + weather + closet -> outfit postcards (NVIDIA)
lib/               shared code: nvidia.js, weather.js, stylist.js, rate-limit.js
scripts/           check-nvidia.js
dev-server.js      local server for npm run dev
```

## Limits

- This is a proof of concept. It styles 4 photo spots per trip and takes 20–40 seconds.
- The AI can misread a photo (for example, a folded ribbed T-shirt read as a corduroy jacket), so the list is editable.
- "Typical" weather is an average of past years. Check the forecast closer to your trip.
- Dress rules come from the model's knowledge. Always check signs on the day.
- Each visitor is limited to a number of photos and stylings per hour online, to protect the free API quota.

## What's next

Saving your closet between trips, couples' and group outfits, cut-out clothing photos for the flat-lays, and sharing a trip's postcards.
