// Backdrop Closet, in the browser: the trip form, photo upload, and the
// editable list of clothes. Nothing is saved; it all lives in this tab.

const WHO = ["Woman", "Man", "Anyone"];
const STYLES = ["Colourful", "Classic", "Minimal", "Boho", "Street", "Smart"];
const MAX_SIDE = 1024;       // shrink photos to this before sending
const AT_ONCE = 3;           // read up to 3 photos in parallel

const state = {
  place: null,               // { name, region, country, lat, lon }
  weather: null,             // from /api/weather
  who: null,
  styles: [],
  items: [],                 // { id, name, category, colour, hex, accent, fabric }
};
let nextId = 1;

const $ = (id) => document.getElementById(id);

// ---------- Step 1: trip ----------

function makeChips(container, labels, { multi, max, onChange }) {
  for (const label of labels) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = label;
    chip.setAttribute(multi ? "aria-pressed" : "aria-checked", "false");
    if (!multi) chip.setAttribute("role", "radio");
    chip.addEventListener("click", () => onChange(label, chip));
    container.append(chip);
  }
}

makeChips($("who-chips"), WHO, {
  onChange(label) {
    state.who = label;
    for (const c of $("who-chips").children) c.setAttribute("aria-checked", String(c.textContent === label));
    refresh();
  },
});

makeChips($("style-chips"), STYLES, {
  multi: true,
  onChange(label, chip) {
    if (state.styles.includes(label)) state.styles = state.styles.filter((s) => s !== label);
    else state.styles = [...state.styles, label].slice(-2); // keep the latest two
    for (const c of $("style-chips").children) c.setAttribute("aria-pressed", String(state.styles.includes(c.textContent)));
    refresh();
  },
});

// Dates: default to a trip starting in two weeks; "to" can't be before "from".
const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date();
$("start-date").min = iso(today);
$("start-date").value = iso(new Date(Date.now() + 14 * 864e5));
$("end-date").value = iso(new Date(Date.now() + 18 * 864e5));
$("end-date").min = $("start-date").value;
$("start-date").addEventListener("change", () => {
  $("end-date").min = $("start-date").value;
  if ($("end-date").value < $("start-date").value) $("end-date").value = $("start-date").value;
  loadWeather();
});
$("end-date").addEventListener("change", loadWeather);

// ---------- Place: search as you type, then pick the right one ----------

let searchTimer;
let searchId = 0;
$("destination").addEventListener("input", () => {
  state.place = null;
  state.weather = null;
  $("weather").hidden = true;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchPlaces, 400);
  refresh();
});

const placeLabel = (p) => [p.region, p.country].filter(Boolean).join(", ");

async function searchPlaces() {
  const q = $("destination").value.trim();
  const id = ++searchId;
  $("place-message").hidden = true;
  if (q.length < 2) { $("place-options").hidden = true; return; }

  let places = [];
  try {
    const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`);
    places = (await res.json()).places ?? [];
  } catch { /* shown as "not found" below */ }
  if (id !== searchId) return; // a newer search has started

  const chips = $("place-chips");
  chips.replaceChildren();
  if (!places.length) {
    $("place-options").hidden = true;
    $("place-message").textContent = "We can't find that place. Try the nearest town or city, e.g. \"Göreme\" for Cappadocia.";
    $("place-message").hidden = false;
    return;
  }
  for (const place of places) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.setAttribute("role", "radio");
    chip.innerHTML = `${escapeHtml(place.name)} <small>${escapeHtml(placeLabel(place))}</small>`;
    chip.addEventListener("click", () => choosePlace(place, chip));
    chips.append(chip);
  }
  $("place-options").hidden = places.length === 1;
  choosePlace(places[0], chips.firstElementChild); // best guess; one tap to change
}

function choosePlace(place, chip) {
  state.place = place;
  for (const c of $("place-chips").children) c.setAttribute("aria-checked", String(c === chip));
  loadWeather();
}

// ---------- Weather for the chosen place and dates ----------

const SKY_ICONS = { clear: "☀️", "partly cloudy": "⛅", overcast: "☁️", foggy: "🌫️", drizzle: "🌦️", rain: "🌧️",
  showers: "🌦️", snow: "❄️", "snow showers": "🌨️", thunderstorms: "⛈️" };
let weatherId = 0;

async function loadWeather() {
  state.weather = null;
  refresh();
  const box = $("weather");
  if (!state.place) { box.hidden = true; return; }
  const id = ++weatherId;
  box.hidden = false;
  box.className = "weather loading";
  box.textContent = `Checking the weather in ${state.place.name}…`;

  const { lat, lon } = state.place;
  const q = new URLSearchParams({ lat, lon, from: $("start-date").value, to: $("end-date").value });
  try {
    const res = await fetch(`/api/weather?${q}`);
    const data = await res.json();
    if (id !== weatherId) return;
    if (!res.ok) throw new Error(data.error);
    state.weather = data;
    showWeather(data);
  } catch (err) {
    if (id !== weatherId) return;
    box.className = "weather loading";
    box.textContent = err.message || "We couldn't get the weather right now.";
  }
  refresh();
}

function showWeather(w) {
  const s = w.summary;
  const label = w.kind === "forecast"
    ? "Forecast"
    : `Typical for these dates · ${Math.min(...w.basedOn)}–${Math.max(...w.basedOn)}`;
  const rain = s.rainyDays === 0 ? "Dry" : `Rain likely on ${s.rainyDays} of ${s.totalDays} days`;
  const wind = s.windyDays ? ` · windy on ${s.windyDays}` : "";
  const days = w.days.map((d) => {
    const date = new Date(d.date + "T12:00:00");
    return `<div class="day" title="${d.sky}, ${d.rainChance}% chance of rain">
      ${date.toLocaleDateString(undefined, { weekday: "short" })}
      <span class="day-icon">${SKY_ICONS[d.sky] ?? "·"}</span>
      <b>${d.high}°</b> ${d.low}°</div>`;
  }).join("");

  const box = $("weather");
  box.className = "weather";
  box.innerHTML = `
    <div class="weather-top">
      <span class="weather-label">${label}</span>
      <span class="weather-temps">${s.avgHigh}° <span>/ ${s.avgLow}°</span></span>
    </div>
    <p class="weather-line">${escapeHtml(state.place.name)}: highs up to ${s.high}°, nights down to ${s.low}°C. ${rain}${wind}.</p>
    <div class="weather-days">${days}</div>
    ${w.kind === "typical" ? `<p class="weather-note">Too far ahead for a forecast, so this is the average of the same dates in past years. Check again closer to your trip.</p>` : ""}`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------- Step 2: photos ----------

const queue = [];
let running = 0;

$("photo-input").addEventListener("change", (e) => {
  addPhotos(e.target.files);
  e.target.value = ""; // allow picking the same photo again
});

const zone = $("drop-zone");
zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("dragging"); });
zone.addEventListener("dragleave", () => zone.classList.remove("dragging"));
zone.addEventListener("drop", (e) => {
  e.preventDefault();
  zone.classList.remove("dragging");
  addPhotos(e.dataTransfer.files);
});

// A ready-made closet so judges can try the app without photographing
// their own clothes. The photos still go through NVIDIA like any upload.
// (Photos from Pexels; see CREDITS.md.)
const SAMPLE_CLOSET = ["pink-tshirt", "blue-shirt", "pink-hoodie", "denim-top-and-jeans",
  "yellow-dress-and-hat", "floral-dress", "green-slip-dress", "mint-blazer", "camel-coat",
  "white-sneakers", "blue-tote", "straw-hat"];

$("sample-button").addEventListener("click", async () => {
  const button = $("sample-button");
  button.disabled = true;
  button.textContent = "Loading the sample closet…";
  try {
    const files = await Promise.all(SAMPLE_CLOSET.map(async (name) => {
      const res = await fetch(`sample-closet/${name}.jpg`);
      if (!res.ok) throw new Error(name);
      return new File([await res.blob()], `${name}.jpg`, { type: "image/jpeg" });
    }));
    addPhotos(files);
    button.closest(".sample-line").hidden = true;
  } catch {
    button.disabled = false;
    button.textContent = "Couldn't load the samples. Try again";
  }
});

function addPhotos(files) {
  for (const file of files) {
    if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) continue;
    const tile = document.createElement("div");
    tile.className = "photo reading";
    tile.innerHTML = `<img alt=""><span class="photo-status">Reading</span>`;
    $("photo-strip").append(tile);
    queue.push({ file, tile });
  }
  pump();
}

function pump() {
  while (running < AT_ONCE && queue.length) {
    const job = queue.shift();
    running++;
    readPhoto(job).finally(() => { running--; pump(); });
  }
}

async function readPhoto({ file, tile }) {
  const status = tile.querySelector(".photo-status");
  try {
    const image = await shrink(file);
    tile.querySelector("img").src = image;
    const res = await fetch("/api/read-clothes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    if (!data.items.length) throw new Error("No clothes found");
    for (const item of data.items) addItem({ ...item, photo: image }); // keep the photo for the postcards
    tile.className = "photo done";
  } catch (err) {
    const noClothes = err.message.startsWith("No clothes");
    tile.className = "photo failed";
    status.textContent = noClothes ? "No clothes" : "Tap to retry";
    tile.title = err.message;
    if (!noClothes) {
      // Tap a failed photo to try it again.
      tile.tabIndex = 0;
      tile.setAttribute("role", "button");
      tile.onclick = () => {
        tile.onclick = null;
        tile.className = "photo reading";
        status.textContent = "Reading";
        queue.push({ file, tile });
        pump();
      };
    }
  }
}

// Phone photos are huge (5–12 MP) and often stored sideways. Draw them onto a
// canvas, upright and at most 1024px, and send that small JPEG instead.
async function shrink(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This browser can't open that photo type. Try a JPEG or PNG.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}

// ---------- The closet list ----------

function addItem(item) {
  const full = { id: nextId++, name: "", category: "top", colour: "", hex: "#999999", accent: "", fabric: "", ...item };
  state.items.push(full);

  const li = $("item-template").content.firstElementChild.cloneNode(true);
  const swatch = li.querySelector(".swatch");
  const hex = li.querySelector(".item-hex");
  const name = li.querySelector(".item-name");
  const category = li.querySelector(".item-category");
  const colour = li.querySelector(".item-colour");

  hex.value = full.hex;
  swatch.style.background = full.hex;
  name.value = full.name;
  category.value = full.category;
  colour.value = full.colour;

  hex.addEventListener("input", () => { full.hex = hex.value.toUpperCase(); swatch.style.background = hex.value; });
  name.addEventListener("input", () => { full.name = name.value; });
  category.addEventListener("change", () => { full.category = category.value; });
  colour.addEventListener("input", () => { full.colour = colour.value; });
  li.querySelector(".item-remove").addEventListener("click", () => {
    state.items = state.items.filter((i) => i !== full);
    li.remove();
    refresh();
  });

  $("closet-list").append(li);
  refresh();
  return name;
}

$("add-item").addEventListener("click", () => {
  const nameInput = addItem({ name: "", colour: "" });
  nameInput.placeholder = "e.g. navy linen trousers";
  nameInput.focus();
});

// ---------- Ready to style? ----------

function refresh() {
  const n = state.items.length;
  $("item-count").textContent = n ? `· ${n} piece${n === 1 ? "" : "s"}` : "";
  $("closet-empty").hidden = n > 0;

  const missing = [];
  if (!state.place) missing.push("where you're going");
  else if (!state.weather) missing.push("the weather (loading)");
  if (!state.who) missing.push("who's dressing");
  if (n < 3) missing.push(`${3 - n} more piece${3 - n === 1 ? "" : "s"}`);
  $("style-button").disabled = missing.length > 0;
  $("action-note").textContent = missing.length ? `Still need: ${missing.join(", ")}.` : "Ready when you are.";
}

// ---------- Step 3: style the trip ----------

const LOADING_LINES = [
  "Reading the backdrops…",
  "Finding colours that pop…",
  "Checking dress rules…",
  "Planning for the weather…",
  "Laying out your outfits…",
];

async function styleTrip() {
  const pieces = state.items.filter((i) => i.name.trim());
  const body = {
    place: state.place,
    from: $("start-date").value,
    to: $("end-date").value,
    who: state.who,
    styles: state.styles,
    // Photos stay in the browser; only the words and colours are sent.
    items: pieces.map(({ photo, ...rest }) => rest),
  };

  show("loading");
  let line = 0;
  $("loading-text").textContent = LOADING_LINES[0];
  const ticker = setInterval(() => {
    line = (line + 1) % LOADING_LINES.length;
    $("loading-text").textContent = LOADING_LINES[line];
  }, 3500);

  try {
    const res = await fetch("/api/style-trip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    showResults(data);
    show("results");
  } catch (err) {
    show("planner");
    showError(err.message);
  } finally {
    clearInterval(ticker);
  }
}

function show(id) {
  for (const s of ["planner", "loading", "results"]) $(s).hidden = s !== id;
  window.scrollTo({ top: 0, behavior: "instant" });
}

function showError(message) {
  let box = document.querySelector(".error-box");
  if (!box) {
    box = document.createElement("p");
    box.className = "error-box";
    $("action-note").after(box);
  }
  box.textContent = message;
}

const byId = (id) => state.items.find((i) => String(i.id) === String(id));

// A piece of clothing: its photo if we have one, otherwise its colour.
function pieceHtml(item) {
  const look = item.photo ? `background-image:url(${item.photo});` : `background:${item.hex};`;
  return `<div class="piece">
    <div class="piece-img" style="${look}--piece-colour:${item.hex}"></div>
    ${escapeHtml(item.name)}
  </div>`;
}

// The outfit as a flat-lay: the person's own photos laid out like prints
// on a table painted in the spot's backdrop colours.
const LAY_ORDER = ["outerwear", "top", "dress", "bottom", "shoes", "bag", "accessory"];
const TILTS = [-5, 4, -2, 6, -4, 3, -6];

function flatLayHtml(pieces, colours) {
  const sorted = [...pieces].sort((a, b) => LAY_ORDER.indexOf(a.category) - LAY_ORDER.indexOf(b.category));
  const hexes = colours.map((c) => c.hex);
  const table = hexes.length > 1
    ? `linear-gradient(135deg, ${hexes.map((h, i) => `${h} ${Math.round((i / (hexes.length - 1)) * 100)}%`).join(", ")})`
    : hexes[0] || "var(--faint)";
  const prints = sorted.map((item, i) => {
    const look = item.photo
      ? `<img src="${item.photo}" alt="">`
      : `<span class="print-swatch" style="background:${item.hex}"><span>${escapeHtml(item.colour || item.name)}</span></span>`;
    return `<figure class="print print-${item.category}" style="--tilt:${TILTS[i % TILTS.length]}deg">
      ${look}
      <figcaption>${escapeHtml(item.name)}</figcaption>
    </figure>`;
  }).join("");
  return `<div class="flatlay" style="background:${table}" role="img"
    aria-label="Outfit: ${escapeHtml(sorted.map((p) => p.name).join(", "))}">${prints}</div>`;
}

// Dark text on light colours, light text on dark ones.
function labelColour(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? "#1F2A37" : "#FFFFFF";
}

function showResults(r) {
  const s = r.weather.summary;
  $("results-title").textContent = state.place.name;
  $("results-summary").innerHTML = `${escapeHtml(r.summary)}<br><span class="results-weather">${
    r.weather.kind === "forecast" ? "Forecast" : "Typical"}: ${s.avgHigh}° / ${s.avgLow}°C · ${
    s.rainyDays ? `rain on ${s.rainyDays} of ${s.totalDays} days` : "dry"}</span>`;

  $("postcards").innerHTML = r.spots.map((spot, i) => {
    const strip = spot.backdropColours.map((c) =>
      `<span style="background:${c.hex};--label:${labelColour(c.hex)}" data-name="${escapeHtml(c.name)}"></span>`).join("");
    const outfit = flatLayHtml(spot.outfit.map(byId).filter(Boolean), spot.backdropColours);
    const blend = spot.blendIn.map(byId).filter(Boolean);
    const tips = [
      spot.bestTime && `<li><span aria-hidden="true">🕰️</span><span><b>Best light:</b> ${escapeHtml(spot.bestTime)}</span></li>`,
      spot.weatherTip && `<li><span aria-hidden="true">🌤️</span><span>${escapeHtml(spot.weatherTip)}</span></li>`,
      spot.dressRule && `<li class="rule"><span aria-hidden="true">🙏</span><span><b>Dress rule:</b> ${escapeHtml(spot.dressRule)}</span></li>`,
    ].filter(Boolean).join("");

    return `<article class="postcard" style="animation-delay:${i * 0.08}s">
      <div class="backdrop-strip" role="img" aria-label="Backdrop colours: ${escapeHtml(spot.backdropColours.map((c) => c.name).join(", "))}">${strip}</div>
      <div class="postcard-body">
        <p class="postcard-number">Spot ${i + 1}</p>
        <h3 class="postcard-title">${escapeHtml(spot.name)}</h3>
        <p class="postcard-backdrop">${escapeHtml(spot.backdrop)}</p>
        ${outfit}
        <p class="why">${escapeHtml(spot.why)}</p>
        ${blend.length ? `<p class="blend">Would blend in here: ${blend.map((b) =>
          `<span class="blend-chip"><i style="background:${b.hex}"></i>${escapeHtml(b.name)}</span>`).join("")}</p>` : ""}
        <ul class="tips">${tips}</ul>
      </div>
    </article>`;
  }).join("");

  const packed = r.packing.map(byId).filter(Boolean);
  const extras = r.extras.map(byId).filter(Boolean);
  $("pack").innerHTML = `
    <h3>Pack these ${packed.length} piece${packed.length === 1 ? "" : "s"}</h3>
    <div class="outfit">${packed.map(pieceHtml).join("")}</div>
    ${extras.length ? `<h4>Also worth bringing</h4><div class="outfit">${extras.map(pieceHtml).join("")}</div>` : ""}
    ${r.gaps.length ? `<h4>Not in your closet: pack or borrow something similar</h4>
      <ul class="gap-list">${r.gaps.map((g) => `<li><b>${escapeHtml(g.need)}</b> <span>${escapeHtml(g.why)}</span></li>`).join("")}</ul>` : ""}
    <p class="model-note">Styled by ${escapeHtml(r.model)} · weather from Open-Meteo</p>`;
}

$("style-button").addEventListener("click", styleTrip);
$("restyle-button").addEventListener("click", styleTrip);
$("edit-button").addEventListener("click", () => show("planner"));

refresh();
