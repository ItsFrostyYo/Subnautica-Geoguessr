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

// Load location data
fetch("data/locations.json")
  .then((res) => res.json())
  .then((data) => {
    locations = data;
    startTotalTimer();
    newRound();
  });

// Map setup
const map = L.map("map", {
  crs: L.CRS.Simple,
  minZoom: -3.7,
  maxZoom: 3,
  attributionControl: false,
  zoomControl: true,
});

const mapBounds = [[0, 0], [4096, 4096]];
L.imageOverlay("./images/Map.png", mapBounds).addTo(map);

map.fitBounds(mapBounds);
map.setMaxBounds(mapBounds);
map.setView([2048, 2048], -3);

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

  currentLocation = locations[Math.floor(Math.random() * locations.length)];
  document.getElementById("photo").style.backgroundImage = `url(${currentLocation.image})`;

  if (guessMarker) map.removeLayer(guessMarker);
  if (actualMarker) map.removeLayer(actualMarker);
  guessMarker = null;
  actualMarker = null;
  guessCoords = null;

  // Reset round timer
  elapsedTime = 0;
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

// Coordinate conversion
function pixelToCoords(x, y) {
  const X = (x / 4096) * 4000 - 2000;
  const Z = 2000 - (y / 4096) * 4000;
  return { X, Z };
}

function coordsToPixel(X, Z) {
  const x = ((X + 2000) / 4000) * 4096;
  const y = ((2000 - Z) / 4000) * 4096;
  return [y, x];
}

// Map click
map.on("click", (e) => {
  if (guessMarker) map.removeLayer(guessMarker);
  const { X, Z } = pixelToCoords(e.latlng.lng, e.latlng.lat);
  guessCoords = { X, Z };

  guessMarker = L.circleMarker(e.latlng, {
    radius: 6,
    color: "cyan",
    fillColor: "cyan",
    fillOpacity: 0.8,
  }).addTo(map);
});

// Submit
document.getElementById("submitBtn").addEventListener("click", () => {
  if (!guessCoords) {
    alert("Click on the map to make a guess!");
    return;
  }

  const dist = distance(
    guessCoords.X,
    guessCoords.Z,
    currentLocation.coords.x,
    currentLocation.coords.z
  );

  const score = getScore(dist);
  totalScore += score;
  updateHUD();
  clearInterval(timerInterval);

  const [y, x] = coordsToPixel(
    currentLocation.coords.x,
    currentLocation.coords.z
  );
  actualMarker = L.circleMarker([y, x], {
    radius: 6,
    color: "red",
    fillColor: "red",
    fillOpacity: 0.8,
  }).addTo(map);

  const results = document.getElementById("results");
  results.style.display = "block";
  results.innerHTML = `
    <strong>${currentLocation.biome}</strong><br>
    Distance: ${Math.round(dist)}m<br>
    Score this round: ${score}
  `;

  document.getElementById("submitBtn").disabled = true;
  document.getElementById("nextBtn").disabled = false;
});

document.getElementById("nextBtn").addEventListener("click", newRound);

// Spacebar to submit
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !document.getElementById("submitBtn").disabled) {
    e.preventDefault();
    document.getElementById("submitBtn").click();
  }
});

// Distance + smooth scoring
function distance(x1, z1, x2, z2) {
  return Math.sqrt((x1 - x2) ** 2 + (z1 - z2) ** 2);
}

function getScore(d) {
  if (d <= 10) return 5000;
  const score = Math.max(0, 5000 - (d - 10) * 4);
  return Math.round(score);
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Total timer
function startTotalTimer() {
  totalElapsedTime = 0;
  clearInterval(totalTimerInterval);
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

