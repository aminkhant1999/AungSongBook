const sharps=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"],flats=["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
const note=(n,s)=>{const set=n.includes("b")?flats:sharps;let i=sharps.indexOf(n);if(i<0)i=flats.indexOf(n);return i<0?n:set[(i+s%12+12)%12]};
export const transposeChord=(chord,steps)=>!steps?chord:chord.replace(/^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?))?$/,(_,root,suffix,bass)=>`${note(root,steps)}${suffix}${bass?`/${note(bass,steps)}`:""}`);
export const chordLine=(line,steps)=>{const chars=[];(line.chords||[]).forEach(({chord,position})=>{const value=transposeChord(chord,steps);for(let i=0;i<value.length;i++)chars[Math.max(0,position)+i]=value[i]});return chars.map(x=>x||" ").join("")};
