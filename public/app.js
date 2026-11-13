// Backdrop Closet, in the browser: the trip form, photo upload, and the
// editable list of clothes. Nothing is saved; it all lives in this tab.

const WHO = ["Woman", "Man", "Anyone"];
const STYLES = ["Colourful", "Classic", "Minimal", "Boho", "Street", "Smart"];
const MAX_SIDE = 1024;       // shrink photos to this before sending
const AT_ONCE = 3;           // read up to 3 photos in parallel

const state = {
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
  refresh();
});
for (const id of ["destination", "end-date"]) $(id).addEventListener("input", refresh);

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
    for (const item of data.items) addItem(item);
    tile.className = "photo done";
  } catch (err) {
    tile.className = "photo failed";
    status.textContent = err.message.startsWith("No clothes") ? "No clothes" : "Failed";
    tile.title = err.message;
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
  if (!$("destination").value.trim()) missing.push("where you're going");
  if (!state.who) missing.push("who's dressing");
  if (n < 3) missing.push(`${3 - n} more piece${3 - n === 1 ? "" : "s"}`);
  $("style-button").disabled = missing.length > 0;
  $("action-note").textContent = missing.length ? `Still need: ${missing.join(", ")}.` : "Ready when you are.";
}

$("style-button").addEventListener("click", () => {
  // Part 3 will send the trip, the weather and these pieces to NVIDIA.
  console.log("Trip:", { destination: $("destination").value, from: $("start-date").value, to: $("end-date").value, who: state.who, styles: state.styles });
  console.log("Closet:", state.items);
  alert("Styling comes in the next step of the build. Your trip and closet are ready!");
});

refresh();
