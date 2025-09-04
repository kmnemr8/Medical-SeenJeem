
/* script.js
   Full game logic: loads 5 JSON banks from ./questions/
   Features: teams, lifelines (50:50, pass, consult), timer, difficulty filter,
   shuffle questions & answers, no repeats, explanation, next button, theme toggle.
*/

const QUESTION_FILES = [
  "./questions/questions_medicine.json",
  "./questions/questions_surgery.json",
  "./questions/questions_pediatrics.json",
  "./questions/questions_obgyn.json",
  "./questions/questions_misc.json",
  "./questions/questions_medicine_2.json",
  "./questions/questions_surgery_2.json",
  "./questions/questions_pediatrics_2.json",
  "./questions/questions_obgyn_2.json",
  "./questions/questions_misc_2.json",
  //"./questions/Academic/questions_pathology.json",
  "./questions/Academic/questions_pharmacology.json",
  "./questions/Academic/questions_ethics.json",
  "./questions/Academic/questions_microbiology.json",
  "./questions/Academic/questions_physiology.json",
  
];

// UI refs
const setupEl = document.getElementById("setup");
const gameEl = document.getElementById("game");
const gameOverEl = document.getElementById("gameOver");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const teamAInput = document.getElementById("teamA");
const teamBInput = document.getElementById("teamB");
const difficultySelect = document.getElementById("difficulty");
const timeLimitInput = document.getElementById("timeLimit");
const numQuestionsInput = document.getElementById("numQuestions");
const themeBtn = document.getElementById("themeBtn");

const teamANameEl = document.getElementById("teamAName");
const teamBNameEl = document.getElementById("teamBName");
const scoreAEl = document.getElementById("scoreA");
const scoreBEl = document.getElementById("scoreB");
const lifelinesAEl = document.getElementById("lifelinesA");
const lifelinesBEl = document.getElementById("lifelinesB");

const turnLabel = document.getElementById("turnLabel");
const progressEl = document.getElementById("progress");
const timerEl = document.getElementById("timer");
const qCategoryEl = document.getElementById("qCategory");
const qDifficultyEl = document.getElementById("qDifficulty");
const questionTextEl = document.getElementById("questionText");
const choicesEl = document.getElementById("choices");
const feedbackEl = document.getElementById("feedback");
const nextBtn = document.getElementById("nextBtn");
const use50Btn = document.getElementById("use50");
const usePassBtn = document.getElementById("usePass");
const useConsultBtn = document.getElementById("useConsult");
const finalText = document.getElementById("finalText");

const soundCorrect = document.getElementById("soundCorrect");
const soundWrong = document.getElementById("soundWrong");

// state
let allQuestions = [];
let gamePool = [];
let currentIndex = 0;
let currentQuestion = null;
let currentChoices = []; // {text,isCorrect,origIndex}
let timer = null;
let timeLeft = 0;
let timeLimit = 30;
let teamA = "Team A";
let teamB = "Team B";
let scores = { A: 0, B: 0 };
let turn = "A"; // 'A' or 'B'
let lifelines = { A: { fifty: true, pass: true, consult: true }, B: { fifty: true, pass: true, consult: true } };
let selectedCount = 0;

// helpers
function $(sel){ return document.querySelector(sel); }
function shuffle(arr){ const a = arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]] } return a; }
function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }

// load all JSON files and combine
async function loadAllBanks(){
  let combined = [];
  for(const f of QUESTION_FILES){
    try{
      const res = await fetch(f);
      if(!res.ok) throw new Error("HTTP "+res.status);
      const data = await res.json();
      // normalize fields if needed: accept either (choices, answerIndex, explanation, difficulty, category)
      const normalized = data.map(q=>({
        question: q.question || q.q || q.text,
        choices: q.choices || q.options || q.answers,
        answerIndex: (q.answerIndex !== undefined ? q.answerIndex : (q.correctIndex !== undefined ? q.correctIndex : 0)),
        explanation: q.explanation || q.explain || q.expl || "",
        difficulty: (q.difficulty || "medium").toLowerCase(),
        category: q.category || q.topic || "General"
      }));
      combined = combined.concat(normalized);
    } catch(err){
      console.error("Failed to load",f,err);
    }
  }
  return combined;
}

// UI updates
function updateScoreboard(){
  teamANameEl.textContent = teamA;
  teamBNameEl.textContent = teamB;
  scoreAEl.textContent = scores.A;
  scoreBEl.textContent = scores.B;
  lifelinesAEl.innerHTML = `50:50 ${lifelines.A.fifty? '●':'✕'} · Pass ${lifelines.A.pass? '●':'✕'} · Consult ${lifelines.A.consult? '●':'✕'}`;
  lifelinesBEl.innerHTML = `50:50 ${lifelines.B.fifty? '●':'✕'} · Pass ${lifelines.B.pass? '●':'✕'} · Consult ${lifelines.B.consult? '●':'✕'}`;
  turnLabel.textContent = `Turn: ${turn==='A'? teamA : teamB}`;
  progressEl.textContent = `Q ${currentIndex+1} / ${gamePool.length}`;
}

function startTimer(){
  if(timer) clearInterval(timer);
  if(timeLimit <= 0){ timerEl.textContent = `⏱ —`; return; }
  timeLeft = timeLimit;
  timerEl.textContent = `⏱ ${timeLeft}s`;
  timer = setInterval(()=>{
    timeLeft--;
    if(timeLeft<=0){
      clearInterval(timer);
      onTimeUp();
    } else {
      timerEl.textContent = `⏱ ${timeLeft}s`;
    }
  },1000);
}

function stopTimer(){ if(timer){ clearInterval(timer); timer=null; } timerEl.textContent = `⏱ —`; }

// question flow
function prepareGamePool(numQuestions, difficulty){
  let pool = allQuestions.slice();
  if(difficulty && difficulty !== "mixed"){
    pool = pool.filter(q => q.difficulty === difficulty);
  }
  pool = shuffle(pool);
  // ensure we don't ask more than exist
  numQuestions = Math.min(numQuestions, pool.length);
  return pool.slice(0, numQuestions);
}

function mapAndShuffleChoices(q){
  // create array of {text,isCorrect,origIndex}
  const arr = q.choices.map((c,i)=>({ text:c, isCorrect: i === q.answerIndex, origIndex:i }));
  return shuffle(arr);
}

function renderQuestion(){
  if(!currentQuestion){
    // game over
    gameEl.classList.add("hidden");
    gameOverEl.classList.remove("hidden");
    let winner = "Draw";
    if(scores.A > scores.B) winner = teamA;
    else if(scores.B > scores.A) winner = teamB;
    finalText.textContent = `${teamA} ${scores.A} — ${teamB} ${scores.B}. Winner: ${winner}`;
    return;
  }

  updateScoreboard();
  qCategoryEl.textContent = currentQuestion.category || "";
  qDifficultyEl.textContent = currentQuestion.difficulty ? currentQuestion.difficulty.toUpperCase() : "";
  questionTextEl.textContent = currentQuestion.question || "—";
  choicesEl.innerHTML = "";
  feedbackEl.textContent = "";
  nextBtn.classList.add("hidden");

  currentChoices.forEach((c, idx) => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.innerText = c.text;
    btn.dataset.idx = idx;
    btn.addEventListener("click", ()=> onChoiceClick(idx));
    choicesEl.appendChild(btn);
  });

  // lifeline availability
  use50Btn.disabled = !lifelines[turn].fifty || !!selectedCount;
  usePassBtn.disabled = !lifelines[turn].pass || !!selectedCount;
  useConsultBtn.disabled = !lifelines[turn].consult || !!selectedCount;

  // start timer
  if(timeLimit>0) startTimer(); else stopTimer();
}

// handlers
function onChoiceClick(idx){
  if(selectedCount) return; // already answered
  selectedCount = 1;
  stopTimer();

  const chosen = currentChoices[idx];
  // disable all choice buttons
  const buttons = choicesEl.querySelectorAll("button");
  buttons.forEach(b=> b.classList.add("disabled"));

  // highlight correct/wrong
  buttons.forEach((b)=>{
    const i = Number(b.dataset.idx);
    if(currentChoices[i].isCorrect){
      b.classList.add("correct");
    }
    if(i === idx && !currentChoices[i].isCorrect){
      b.classList.add("wrong");
    }
  });

  // feedback & scoring
  if(chosen.isCorrect){
    feedbackEl.style.color = "green";
    feedbackEl.textContent = "✅ Correct!";
    if(soundCorrect) { try{ soundCorrect.play().catch(()=>{}); }catch(e){} }
    if(turn==='A') scores.A += pointsFor(currentQuestion.difficulty);
    else scores.B += pointsFor(currentQuestion.difficulty);
  } else {
    feedbackEl.style.color = "red";
    const corr = currentChoices.find(c=>c.isCorrect)?.text || "—";
    feedbackEl.textContent = `❌ Wrong! Correct: ${corr}`;
    if(soundWrong){ try{ soundWrong.play().catch(()=>{}); }catch(e){} }
  }

  // show explanation if exists
  if(currentQuestion.explanation){
    const ex = document.createElement("div");
    ex.className = "explanation";
    ex.style.marginTop = "10px";
    ex.style.padding = "10px";
    ex.style.background = "rgba(0,0,0,0.03)";
    ex.innerHTML = `<strong>Explanation:</strong> ${currentQuestion.explanation}`;
    feedbackEl.appendChild(ex);
  }

  // show next button
  nextBtn.classList.remove("hidden");
  updateScoreboard();
}

function pointsFor(diff){
  if(diff==="easy") return 10;
  if(diff==="medium") return 20;
  if(diff==="hard") return 30;
  return 20;
}

function onTimeUp(){
  selectedCount = 1;
  // mark correct
  const buttons = choicesEl.querySelectorAll("button");
  buttons.forEach((b)=>{
    const i = Number(b.dataset.idx);
    if(currentChoices[i].isCorrect) b.classList.add("correct");
    b.classList.add("disabled");
  });
  const corr = currentChoices.find(c=>c.isCorrect)?.text || "—";
  feedbackEl.style.color = "red";
  feedbackEl.textContent = `⏰ Time's up! Correct: ${corr}`;
  // show explanation if exists
  if(currentQuestion.explanation){
    const ex = document.createElement("div");
    ex.className = "explanation";
    ex.style.marginTop = "10px";
    ex.style.padding = "10px";
    ex.style.background = "rgba(0,0,0,0.03)";
    ex.innerHTML = `<strong>Explanation:</strong> ${currentQuestion.explanation}`;
    feedbackEl.appendChild(ex);
  }
  nextBtn.classList.remove("hidden");
  updateScoreboard();
}

// lifelines actions
function use50(){
  if(!lifelines[turn].fifty) return;
  lifelines[turn].fifty = false;
  // remove (disable/hide) up to 2 incorrect buttons (prefer not to remove correct)
  let wrongIndices = currentChoices.map((c,i)=> c.isCorrect? -1:i).filter(i=>i>=0);
  wrongIndices = shuffle(wrongIndices);
  const toRemove = wrongIndices.slice(0, Math.min(2, wrongIndices.length));
  toRemove.forEach(idx=>{
    const b = choicesEl.querySelector(`button[data-idx='${idx}']`);
    if(b){ b.style.visibility = "hidden"; }
  });
  updateScoreboard();
  use50Btn.disabled = true;
}

function usePass(){
  if(!lifelines[turn].pass) return;
  lifelines[turn].pass = false;
  // mark as passed — no points, move to next question and switch turn
  feedbackEl.style.color = "orange";
  feedbackEl.textContent = "➡️ Pass used. No points awarded.";
  if(currentQuestion.explanation){
    const ex = document.createElement("div");
    ex.className = "explanation";
    ex.style.marginTop = "10px";
    ex.style.padding = "10px";
    ex.style.background = "rgba(0,0,0,0.03)";
    ex.innerHTML = `<strong>Explanation:</strong> ${currentQuestion.explanation}`;
    feedbackEl.appendChild(ex);
  }
  stopTimer();
  lifelines[turn].pass = false;
  usePassBtn.disabled = true;
  nextBtn.classList.remove("hidden");
}

function useConsult(){
  if(!lifelines[turn].consult) return;
  lifelines[turn].consult = false;
  // reveal 2 choices (one must be correct): hide the other two
  const correctIdx = currentChoices.findIndex(c=>c.isCorrect);
  const others = currentChoices.map((c,i)=>i).filter(i=>i!==correctIdx);
  const pickOne = shuffle(others)[0];
  const keep = [correctIdx, pickOne];
  currentChoices.forEach((c,i)=>{
    const b = choicesEl.querySelector(`button[data-idx='${i}']`);
    if(b && !keep.includes(i)) b.style.visibility = "hidden";
  });
  feedbackEl.style.color = "blue";
  feedbackEl.textContent = "💬 Consult used: choices narrowed to 2.";
  stopTimer();
  useConsultBtn.disabled = true;
  updateScoreboard();
}

// next question handler
function nextQuestion(){
  // advance index, switch turn
  currentIndex++;
  turn = turn === "A" ? "B" : "A";
  selectedCount = 0;
  if(currentIndex >= gamePool.length){
    // end
    currentQuestion = null;
    renderQuestion();
    return;
  }
  currentQuestion = gamePool[currentIndex];
  currentChoices = mapAndShuffleChoices(currentQuestion);
  renderQuestion();
}

// start game
async function startGame(){
  // read inputs
  teamA = (teamAInput.value || "Team A").trim();
  teamB = (teamBInput.value || "Team B").trim();
  const difficulty = difficultySelect.value;
  timeLimit = clamp(parseInt(timeLimitInput.value || "30",10), 0, 600);
  const numQuestions = clamp(parseInt(numQuestionsInput.value || "50",10), 1, 500);

  // load banks if not loaded
  if(allQuestions.length === 0){
    allQuestions = await loadAllBanks();
  }
  // prepare pool
  gamePool = prepareGamePool(numQuestions, difficulty);
  currentIndex = 0;
  currentQuestion = gamePool[0];
  currentChoices = mapAndShuffleChoices(currentQuestion);
  scores = { A: 0, B: 0 };
  lifelines = { A: { fifty: true, pass: true, consult: true }, B: { fifty: true, pass: true, consult: true } };
  turn = "A";
  selectedCount = 0;

  // switch UI
  setupEl.classList.add("hidden");
  gameOverEl.classList.add("hidden");
  gameEl.classList.remove("hidden");

  renderQuestion();
}

// restart
function restart(){
  setupEl.classList.remove("hidden");
  gameEl.classList.add("hidden");
  gameOverEl.classList.add("hidden");
}

// events
startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", restart);
nextBtn.addEventListener("click", ()=>{
  nextBtn.classList.add("hidden");
  nextQuestion();
});
use50Btn.addEventListener("click", use50);
usePassBtn.addEventListener("click", usePass);
useConsultBtn.addEventListener("click", useConsult);
themeBtn.addEventListener("click", ()=>{
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  if(isDark){
    document.documentElement.removeAttribute("data-theme");
    themeBtn.textContent = "🌙 Dark";
  } else {
    document.documentElement.setAttribute("data-theme","dark");
    themeBtn.textContent = "☀️ Light";
  }
});

// initialize: load banks in background
loadAllBanks().then(data=>{
  allQuestions = data;
  console.log("Loaded questions:", allQuestions.length);
}).catch(err=> console.error(err));

// لو عندك بنك أسئلة في ملف JSON مستورد
// مثال: import questions from './questions.json' assert { type: "json" };

function removeDuplicates(questions) {
  const seen = new Set();
  return questions.filter(q => {
    if (seen.has(q.question)) {
      return false; // مكرر → يتشال
    }
    seen.add(q.question);
    return true; // فريد → يتخزن
  });
}
// load all JSON files and combine
async function loadAllBanks(){
  let combined = [];
  for(const f of QUESTION_FILES){
    try{
      const res = await fetch(f);
      if(!res.ok) throw new Error("HTTP "+res.status);
      const data = await res.json();
      // normalize fields if needed: accept either (choices, answerIndex, explanation, difficulty, category)
      const normalized = data.map(q=>({
        question: q.question || q.q || q.text,
        choices: q.choices || q.options || q.answers,
        answerIndex: (q.answerIndex !== undefined ? q.answerIndex : (q.correctIndex !== undefined ? q.correctIndex : 0)),
        explanation: q.explanation || q.explain || q.expl || "",
        difficulty: (q.difficulty || "medium").toLowerCase(),
        category: q.category || q.topic || "General"
      }));
      combined = combined.concat(normalized);
    } catch(err){
      console.error("Failed to load",f,err);
    }
  }
  // 🟢 هنا بقى
  return removeDuplicates(combined);
}


