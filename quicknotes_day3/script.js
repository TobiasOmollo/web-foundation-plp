// Our data
let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

// 1. Find notes containing a word (ignores upper/lower case)
function searchNotes(word) {
  return notes.filter((note) =>
    note.text.toLowerCase().includes(word.toLowerCase())
  );
}

// 2. The note with the most characters (null if no notes)
function longestNote() {
  if (notes.length === 0) return null;
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) longest = note;
  }
  return longest;
}

// 3. Count notes per category
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    counts[note.category] = (counts[note.category] || 0) + 1;
  }
  return counts;
}

// 4. A friendly summary sentence
function getSummary() {
  const counts = countByCategory();
  const word = notes.length === 1 ? "note" : "notes";
  return `${notes.length} ${word}: ${counts.personal || 0} personal, ${counts.work || 0} work, ${counts.study || 0} study.`;
}

// 5. Does this text already exist?
function isDuplicate(text) {
  const cleaned = text.trim().toLowerCase();
  return notes.some((note) => note.text.toLowerCase() === cleaned);
}

// 6. Add a note (true if added, false if rejected)
function addNote(text, category) {
  const cleaned = text.trim();
  if (cleaned.length < 1 || cleaned.length > 200) {
    console.log("❌ Rejected: must be 1-200 characters.");
    return false;
  }
  if (isDuplicate(cleaned)) {
    console.log("❌ Rejected: duplicate note.");
    return false;
  }
  if (!["personal", "work", "study"].includes(category)) {
    console.log("❌ Rejected: category must be personal, work or study.");
    return false;
  }
  notes.push({ id: notes.length + 1, text: cleaned, category });
  return true;
}

// --- Test it ---
console.log(searchNotes("milk"));   // [{ id: 1, text: "Buy milk and bread", category: "personal" }]
console.log(searchNotes("zebra"));  // []

console.log(longestNote());         // { id: 3, text: "Email the project report to Grace", category: "work" }
console.log(countByCategory());     // { personal: 2, study: 2, work: 1 }
console.log(getSummary());          // "5 notes: 2 personal, 1 work, 2 study."

// Edge cases with an empty list
let saved = notes;
notes = [];
console.log(longestNote());         // null
console.log(countByCategory());     // {}
console.log(getSummary());          // "0 notes: 0 personal, 0 work, 0 study."
notes = saved;

console.log(isDuplicate("  CALL MUM "));  // true
console.log(isDuplicate("Call dad"));     // false

console.log(addNote("Read chapter 4", "study"));   // true
console.log(addNote("read chapter 4", "study"));   // false (duplicate)
console.log(addNote("", "work"));                  // false (1-200 characters)
console.log(addNote("a".repeat(201), "work"));     // false (1-200 characters)
console.log(addNote("Plan trip", "hobby"));        // false (bad category)
console.log(getSummary());          // "6 notes: 2 personal, 1 work, 3 study."
