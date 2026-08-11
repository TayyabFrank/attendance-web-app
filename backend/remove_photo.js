const fs = require('fs');

let content = fs.readFileSync('server.js', 'utf8');

// The lines we found using findstr:
// 590:        photo: employeePhoto
// 711:        photo: log.photo,
// 805:        photo: employee.facePhoto
// 957:        photo: photo || employee.facePhoto,
// 1710:        photo: employee.facePhoto || 'data:image/svg+xml;utf8,<svg></svg>'
// 1789:        photo: employee.facePhoto || 'data:image/svg+xml;utf8,<svg></svg>'
// 2381:            photo: emp.facePhoto || 'data:image/svg+xml;utf8,<svg></svg>',
// 2615:        photo: employee.facePhoto
// 2738:      photo: emp.facePhoto,

// Replace all these lines with empty string or comment out.
content = content.replace(/photo: employeePhoto,?/g, '');
content = content.replace(/photo: log\.photo,/g, '');
content = content.replace(/photo: employee\.facePhoto,?/g, '');
content = content.replace(/photo: photo \|\| employee\.facePhoto,/g, '');
content = content.replace(/photo: employee\.facePhoto \|\| 'data:image\/svg\+xml;utf8,<svg><\/svg>',?/g, '');
content = content.replace(/photo: emp\.facePhoto \|\| 'data:image\/svg\+xml;utf8,<svg><\/svg>',?/g, '');
content = content.replace(/photo: emp\.facePhoto,?/g, '');

// Fix any dangling commas if needed, though JS objects are fine with trailing commas and double commas inside object literal usually cause syntax errors, but we should just replace "photo: ..., \n"
// Let's use a safer regex:
// match `\n\s*photo: [^\n]+,` and replace with empty string
let newContent = fs.readFileSync('server.js', 'utf8');
newContent = newContent.replace(/\n\s*photo: [^\n]+/g, (match) => {
  if (match.includes('face_photo:')) return match; // exclude supabase face_photo
  return '';
});

// Since we replaced the line, we might have left a trailing comma on the previous line.
// In JS, `obj = { a: 1, }` is perfectly valid.
// Wait, if it was `{ a: 1, photo: '...', }` it becomes `{ a: 1, }`. Valid.
// What if it was `{ photo: '...', a: 1 }` it becomes `{ a: 1 }`.
// But what if it left `, ,` ? `replace` of just the line doesn't leave double commas if the comma was ON the photo line.
// Usually it's `\n        photo: something,` -> replaced with `\n` or empty.
// Let's write the modified content back.

fs.writeFileSync('server.js', newContent);
console.log('Modified server.js');
