// Nested loops, functions, arrays, strings, and both loop directions.
function summarize(values) {
  let total = 0;
  const selected = [];
  for (const value of values) {
    if (value > 0 && value % 2 === 0) {
      selected.push(value);
      total += value;
    } else if (value === 0) {
      continue;
    } else {
      total -= 1;
    }
  }
  console.log(`Selected: ${selected.length}; total: ${total}`);
  return total;
}

const values = [0, 2, 3, 4, -1, 6];
const total = summarize(values);
console.log("true && false; {braces}; https://example.com", total);
for (let row = 1; row <= 3; row++) {
  for (let column = 3; column >= 1; column--) {
    console.log(`cell ${row}:${column}`);
  }
}
let countdown = 2;
while (countdown > 0) {
  console.log(countdown);
  countdown--;
}
