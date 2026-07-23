const NOTES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function moveNote(note, steps) {
  const useFlats = note.includes("b");
  const notes = useFlats ? NOTES_FLAT : NOTES_SHARP;
  let index = NOTES_SHARP.indexOf(note);
  if (index < 0) index = NOTES_FLAT.indexOf(note);
  if (index < 0) return note;
  return notes[(index + steps % 12 + 12) % 12];
}

export function transposeChord(chord, steps) {
  if (!chord || !steps) return chord;
  return chord.replace(/^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?))?$/, (_all, root, suffix, bass) =>
    `${moveNote(root, steps)}${suffix}${bass ? `/${moveNote(bass, steps)}` : ""}`);
}

export function transposeSong(data, steps) {
  return { ...data, sections: (data.sections || []).map(section => ({ ...section, lines: (section.lines || []).map(line => ({ ...line, chords: (line.chords || []).map(item => ({ ...item, chord: transposeChord(item.chord, steps) })) })) })) };
}
