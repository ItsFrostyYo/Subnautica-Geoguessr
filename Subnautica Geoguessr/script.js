// script.js — calibrated coordinates + smooth scoring + timers + UI

let locations = [];
let currentLocation = null;
let guessMarker = null;
let actualMarker = null;
let guessCoords = null;

let round = 0;
let totalRounds = 5;
let totalScore = 0;

let elapsedTime = 0;
let timerInterval = null;

let totalElapsedTime = 0;
let totalTimerInterval = null;

// Load locations
fetch("data/locations.json")
  .then((res) => res.json())
  .then((data) => {
    locations = data;
    startTotalTimer();
    newRound();
  })
  .catch((err) => {
    console.error("Failed to load locations.json:", err);
    alert("Failed to load locations.json. Check path and Live Server.");
  });

// ---------- LEAFLET MAP SETUP + CALIBRATION ----------
const IMAGE_SIZE = 4096;

// Create map (Simple CRS)
const map = L.map("map", {
  crs: L.CRS.Simple,
  minZoom: -3.7,
  maxZoom: 3,
  zoomSnap: 0.1,
  attributionControl: false,
  zoomControl: true,
});

// overlay bounds expressed in image pixel units
const overlayBounds = [[0, 0], [IMAGE_SIZE, IMAGE_SIZE]];
const mapImage = L.imageOverlay("images/map.png", overlayBounds).addTo(map);

// Fit and lock view so entire image is visible initially
map.fitBounds(overlayBounds, { animate: false, padding: [5, 5] });
map.setMaxBounds(overlayBounds);
// set an initial zoom out so the whole image is visible inside the small minimap
map.setView([IMAGE_SIZE / 2, IMAGE_SIZE / 2], map.getBoundsZoom(overlayBounds, true) - 1);

// --- CALIBRATION: compute linear transform Leaflet(lat,lng) <-> game (x,z) ---
// We want top-left (Leaflet NW) -> game (-2000, 2000)
// and bottom-right (Leaflet SE) -> game (2000, -2000)
const usedBounds = mapImage.getBounds();
const nw = usedBounds.getNorthWest(); // top-left lat/lng
const se = usedBounds.getSouthEast(); // bottom-right lat/lng

// Solve linear transforms: x = A * lng + B ; z = C * lat + D
const A = (2000 - -2000) / (se.lng - nw.lng); // 4000 / (se.lng - nw.lng)
const B = -2000 - A * nw.lng;
const C = (-2000 - 2000) / (se.lat - nw.lat); // -4000 / (se.lat - nw.lat)
const D = 2000 - C * nw.lat;

console.log("Map calibration:", { nw, se, A, B, C, D });

// Convert Leaflet latlng -> game coords {x, z}
function leafletLatLngToGameCoords(latlng) {
  const x = A * latlng.lng + B;
  const z = C * latlng.lat + D;
  return { x, z };
}

// Convert game coords (x,z) -> Leaflet latlng [lat, lng] for markers
function gameCoordsToLeafletLatLng(x, z) {
  const lng = (x - B) / A;
  const lat = (z - D) / C;
  return [lat, lng];
}

// Optional: Uncomment to draw calibration markers once for visual check
// (red top-left, blue center, green bottom-right)
/*
(function drawCalibrationMarkers() {
  const g = L.layerGroup().addTo(map);
  const tl = gameCoordsToLeafletLatLng(-2000, 2000);
  const center = gameCoordsToLeafletLatLng(0, 0);
  const br = gameCoordsToLeafletLatLng(2000, -2000);
  L.circleMarker(tl, { radius: 5, color: "red" }).addTo(g).bindPopup("TL -2000,2000");
  L.circleMarker(center, { radius: 5, color: "blue" }).addTo(g).bindPopup("Center 0,0");
  L.circleMarker(br, { radius: 5, color: "green" }).addTo(g).bindPopup("BR 2000,-2000");
})();
*/

// ---------- GAME LOGIC ----------
function newRound() {
  round++;
  if (round > totalRounds) {
    endGame();
    return;
  }

  updateHUD();

  document.getElementById("results").style.display = "none";
  document.getElementById("nextBtn").disabled = true;
  document.getElementById("submitBtn").disabled = false;

  // choose random location
  currentLocation = locations[Math.floor(Math.random() * locations.length)];
  // set fullscreen photo
  document.getElementById("photo").style.backgroundImage = `url(${currentLocation.image})`;

  // clear previous markers
  if (guessMarker) {
    try { map.removeLayer(guessMarker); } catch(e){}
  }
  if (actualMarker) {
    try { map.removeLayer(actualMarker); } catch(e){}
  }
  guessMarker = null;
  actualMarker = null;
  guessCoords = null;

  // reset and start per-round timer
  elapsedTime = 0;
  document.getElementById("elapsedTime").textContent = formatTime(elapsedTime);
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    elapsedTime++;
    document.getElementById("elapsedTime").textContent = formatTime(elapsedTime);
  }, 1000);
}

function updateHUD() {
  document.getElementById("roundNum").textContent = round;
  document.getElementById("totalRounds").textContent = totalRounds;
  document.getElementById("totalScore").textContent = totalScore;
}

// Map click handler — uses calibrated transform
map.on("click", (e) => {
  if (guessMarker) {
    try { map.removeLayer(guessMarker); } catch(e){}
  }

  const { x, z } = leafletLatLngToGameCoords(e.latlng);
  guessCoords = { x, z };

  guessMarker = L.circleMarker(e.latlng, {
    radius: 6,
    color: "cyan",
    fillColor: "cyan",
    fillOpacity: 0.9,
  }).addTo(map);
});

// Submit guess
document.getElementById("submitBtn").addEventListener("click", () => {
  if (!guessCoords) {
    alert("Click on the map to make a guess!");
    return;
  }

  const dist = distance(
    guessCoords.x,
    guessCoords.z,
    currentLocation.coords.x,
    currentLocation.coords.z
  );

  const score = getScore(dist);
  totalScore += score;
  updateHUD();

  // stop round timer
  clearInterval(timerInterval);

  // show actual marker (convert game coords -> leaflet latlng)
  const latlng = gameCoordsToLeafletLatLng(
    currentLocation.coords.x,
    currentLocation.coords.z
  );
  actualMarker = L.circleMarker(latlng, {
    radius: 6,
    color: "red",
    fillColor: "red",
    fillOpacity: 0.9,
  }).addTo(map);

  const accuracy = ((score / 5000) * 100).toFixed(1);

  const results = document.getElementById("results");
  results.style.display = "block";
  results.innerHTML = `
    <strong>${currentLocation.biome || "Unknown"}</strong><br>
    Distance: ${Math.round(dist)} m<br>
    Score this round: ${score}<br>
    Accuracy: ${accuracy}%
  `;

  document.getElementById("submitBtn").disabled = true;
  document.getElementById("nextBtn").disabled = false;
});

// Next round
document.getElementById("nextBtn").addEventListener("click", newRound);

// Spacebar = submit guess
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !document.getElementById("submitBtn").disabled) {
    e.preventDefault();
    document.getElementById("submitBtn").click();
  }
});

// Distance and scoring
function distance(x1, z1, x2, z2) {
  return Math.sqrt((x1 - x2) ** 2 + (z1 - z2) ** 2);
}

// Smooth scoring: full 5000 up to 10m, then exponential decay
function getScore(d) {
  if (d <= 10) return 5000;
  const k = 400; // tweak for generosity; larger = gentler decay
  const adjusted = d - 10;
  const score = 5000 * Math.exp(-adjusted / k);
  return Math.round(score);
}

// Time formatting
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Total game timer
function startTotalTimer() {
  totalElapsedTime = 0;
  clearInterval(totalTimerInterval);
  document.getElementById("totalElapsedTime").textContent = formatTime(totalElapsedTime);
  totalTimerInterval = setInterval(() => {
    totalElapsedTime++;
    document.getElementById("totalElapsedTime").textContent = formatTime(totalElapsedTime);
  }, 1000);
}

function endGame() {
  clearInterval(timerInterval);
  clearInterval(totalTimerInterval);

  document.getElementById("results").style.display = "block";
  document.getElementById("results").innerHTML = `
    <h2>Game Over!</h2>
    <p>Your total score: <strong>${totalScore}</strong> / ${totalRounds * 5000}</p>
    <p>Total Time: ${formatTime(totalElapsedTime)}</p>
    <button onclick="restartGame()">Play Again</button>
  `;
  document.getElementById("nextBtn").disabled = true;
  document.getElementById("submitBtn").disabled = true;
}

function restartGame() {
  totalScore = 0;
  round = 0;
  newRound();
  startTotalTimer();
}
