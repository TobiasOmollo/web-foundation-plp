const STORAGE_KEY = "quicknotes";

// Elements (these are null on about.html)
const form = document.querySelector("#note-form");
const input = document.querySelector("#note-input");
const list = document.querySelector("#notes-list");
const count = document.querySelector("#note-count");

let notes = loadNotes();

function loadNotes() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveNotes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function render() {
  if (!list || !count) return; // not on the notes page

  list.innerHTML = "";

  notes.forEach((note) => {
    const li = document.createElement("li");
    li.classList.add("note");

    const text = document.createElement("span");
    text.textContent = note.text;

    const del = document.createElement("button");
    del.textContent = "Delete";
    del.classList.add("delete-btn");
    del.addEventListener("click", () => deleteNote(note.id));

    li.appendChild(text);
    li.appendChild(del);
    list.appendChild(li);
  });

  count.textContent =
    notes.length === 1 ? "You have 1 note." : `You have ${notes.length} notes.`;
}

function addNote(text) {
  notes.push({ id: Date.now(), text });
  saveNotes();
  render();
}

function deleteNote(id) {
  notes = notes.filter((note) => note.id !== id);
  saveNotes();
  render();
}

if (form && input) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (text === "") return;
    addNote(text);
    input.value = "";
    input.focus();
  });

  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.key.toLowerCase() === "n") {
      e.preventDefault();
      input.focus();
    }
  });
}

// About page lists
const steps = [
  "Type your note in the input field.",
  "Press Enter or click Add Note.",
  "Delete a note with its Delete button."
];
const features = [
  "Notes saved in your browser",
  "Instant add and delete",
  "Works on mobile"
];

function fillList(selector, items) {
  const target = document.querySelector(selector);
  if (!target) return;
  items.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    target.appendChild(li);
  });
}

fillList("#steps-list", steps);
fillList("#features-list", features);

render();