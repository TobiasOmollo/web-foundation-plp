//const paragraph1 = document.querySelector("#paragraph");
//const paragraph2 = document.querySelector(".paragraph");

//const button1 = document.querySelector("button");

const noteText = document.getElementById("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeToggle = document.getElementById("theme-toggle");

function updateCounts() {
  const text = noteText.value;
  const chars = text.length;

  // Count words (ignores multiple consecutive spaces and empty inputs)
  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;

  charCount.textContent = `${chars} / 200 characters`;
  wordCount.textContent = `${words} words`;

  // Threshold classes
  charCount.classList.remove("warning", "over");
  if (chars > 200) {
    charCount.classList.add("over");
  } else if (chars > 180) {
    charCount.classList.add("warning");
  }
}

function clearAll() {
  noteText.value = "";
  localStorage.removeItem("draft_note");
  updateCounts();
}

function applyTheme(isDark) {
  if (isDark) {
    document.body.classList.add("dark");
    themeToggle.textContent = "Light mode";
  } else {
    document.body.classList.remove("dark");
    themeToggle.textContent = "Dark mode";
  }
}

// Live typing updates
noteText.addEventListener("input", () => {
  updateCounts();
  localStorage.setItem("draft_note", noteText.value);
});

// Clear button
clearBtn.addEventListener("click", clearAll);

// Escape key clears when inside textarea
noteText.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearAll();
  }
});

// Theme switch
themeToggle.addEventListener("click", () => {
  const isDark = !document.body.classList.contains("dark");
  applyTheme(isDark);
  localStorage.setItem("theme", isDark ? "dark" : "light");
});

// Restore saved state on page load
const savedDraft = localStorage.getItem("draft_note");
if (savedDraft) {
  noteText.value = savedDraft;
}

const savedTheme = localStorage.getItem("theme");
applyTheme(savedTheme === "dark");

updateCounts();
