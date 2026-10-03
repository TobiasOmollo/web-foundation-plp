let notes = [];
 
//Check that a note's text is acceptable
function isValidNote(text) {
  const cleaned = text.trim();
  return cleaned.length > 0 && cleaned.length <= 200;
}
 
//returns true if added, false if rejected
function addNote(text) {
  if (!isValidNote(text)) {
    console.log("❌ Note rejected: must be 1-200 characters.");
    return false;
  }
  const newNote = {
    id: Date.now(),       
    text: text.trim(),
    createdAt: new Date().toLocaleString(),
  };
  notes.push(newNote);
  console.log(`✅ Added: "${newNote.text}"`);
  return true;
}
 
function deleteNote(id) {
  notes = notes.filter((note) => note.id !== id);
}
  
function countMessage() {
  if (notes.length === 0) return "You have no notes yet.";
  if (notes.length === 1) return "You have 1 note.";
  return `You have ${notes.length} notes.`;
}
 
function listNotes() {
  notes.forEach((note, index) => {
    console.log(`${index + 1}. ${note.text} (${note.createdAt})`);
  });
  console.log(countMessage());
}

addNote("Revise HTML forms");
addNote("   ");              
addNote("Practise Flexbox");
listNotes();